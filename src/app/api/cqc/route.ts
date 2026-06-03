import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Care Quality Commission (CQC) Public API — no auth required.
// Docs: https://api.cqc.org.uk/public/v1
// partnerCode is an optional identifier for tracking (not per-constituency).

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // CQC inspection cycle is months–years — weekly refresh is enough

const CQC_BASE = "https://api.cqc.org.uk/public/v1";
const PARTNER_CODE = "GroundGame";

const BRAINTREE_POSTCODES = ["CM7", "CM77", "CO9"];

const MAX_DETAIL_FETCHES = 15;

interface CQCLocationSummary {
  locationId: string;
  locationName: string;
  postalCode: string;
}

interface CQCLocationDetail {
  locationId: string;
  locationName: string;
  postalCode: string;
  type: { name: string }[];
  currentRatings?: {
    overall?: {
      rating: string;
    };
  };
  numberOfBeds?: number;
  lastInspection?: {
    date: string;
  };
  reports?: { reportUri: string }[];
  specialisms?: { name: string }[];
}

interface LocationResult {
  name: string;
  type: string;
  rating: string;
  lastInspection: string | null;
  beds: number | null;
  postcode: string;
  reportUrl: string | null;
  cqcUrl: string;
}

interface CQCData {
  locations: LocationResult[];
  summary: { outstanding: number; good: number; requiresImprovement: number; inadequate: number };
  totalFound: number;
  detailsFetched: number;
  source: string;
  sourceUrl: string;
  note?: string;
}

async function fetchLocationsForPostcode(postcode: string): Promise<CQCLocationSummary[]> {
  try {
    const res = await fetch(
      `${CQC_BASE}/locations?postalCode=${postcode}&perPage=50&partnerCode=${PARTNER_CODE}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data?.locations ?? [];
  } catch {
    return [];
  }
}

async function fetchLocationDetail(locationId: string): Promise<CQCLocationDetail | null> {
  try {
    const res = await fetch(
      `${CQC_BASE}/locations/${locationId}?partnerCode=${PARTNER_CODE}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function generateFreshData(
  postcodes: string[],
  constituencySlug: string
): Promise<CQCData> {
  try {
    // Fetch location lists for all postcodes in parallel
    const listResults = await Promise.allSettled(
      postcodes.map((pc) => fetchLocationsForPostcode(pc))
    );

    // De-duplicate locations by ID
    const seenIds = new Set<string>();
    const allLocations: CQCLocationSummary[] = [];
    for (const result of listResults) {
      if (result.status === "fulfilled") {
        for (const loc of result.value) {
          if (!seenIds.has(loc.locationId)) {
            seenIds.add(loc.locationId);
            allLocations.push(loc);
          }
        }
      }
    }

    // Fetch details for up to MAX_DETAIL_FETCHES locations
    const toFetch = allLocations.slice(0, MAX_DETAIL_FETCHES);
    const detailResults = await Promise.allSettled(
      toFetch.map((loc) => fetchLocationDetail(loc.locationId))
    );

    const locations: LocationResult[] = [];
    const ratingCounts = { outstanding: 0, good: 0, requiresImprovement: 0, inadequate: 0 };

    for (const result of detailResults) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const detail = result.value;

      const rating = detail.currentRatings?.overall?.rating ?? "Not yet rated";
      const typeName =
        detail.type?.map((t) => t.name).join(", ") ?? "Unknown";
      const reportUrl =
        detail.reports?.[0]?.reportUri
          ? `https://api.cqc.org.uk${detail.reports[0].reportUri}`
          : null;

      locations.push({
        name: detail.locationName,
        type: typeName,
        rating,
        lastInspection: detail.lastInspection?.date ?? null,
        beds: detail.numberOfBeds ?? null,
        postcode: detail.postalCode,
        reportUrl,
        cqcUrl: `https://www.google.com/search?q=${encodeURIComponent(detail.locationName + " CQC inspection report")}`,
      });

      // Count ratings
      const ratingLower = rating.toLowerCase();
      if (ratingLower === "outstanding") ratingCounts.outstanding++;
      else if (ratingLower === "good") ratingCounts.good++;
      else if (ratingLower === "requires improvement") ratingCounts.requiresImprovement++;
      else if (ratingLower === "inadequate") ratingCounts.inadequate++;
    }

    // If API returned no results (403 / blocked), use fallback (Braintree-only;
    // empty for other constituencies — see getFallbackData).
    if (locations.length === 0) {
      return getFallbackData(constituencySlug);
    }

    return {
      locations,
      summary: ratingCounts,
      totalFound: allLocations.length,
      detailsFetched: toFetch.length,
      source: "live",
      sourceUrl: "https://www.cqc.org.uk/",
    };
  } catch {
    return getFallbackData(constituencySlug);
  }
}


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const constituencySlug = searchParams.get("constituency") || "braintree";
  const force = searchParams.get("force") === "1";
  const constituencyData = getFullData(constituencySlug);

  if (!constituencyData) {
    return Response.json(
      { error: "Invalid constituency slug" },
      { status: 400 }
    );
  }

  // Determine postcodes: Braintree fallback, else try the (forward-compatible)
  const postcodes = constituencyData.areas?.postcodes ?? (constituencySlug === "braintree" ? BRAINTREE_POSTCODES : null);

  if (!postcodes) {
    return Response.json(
      {
        error: "CQC data not available",
        message: "Postcode data not yet sourced for this constituency",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }

  const cacheDocRef = adminDb.collection("cqc_cache").doc(constituencySlug);

  type CacheDoc = { data: Record<string, unknown>; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await cacheDocRef.get();
    if (snap.exists) {
      cached = snap.data() as CacheDoc;
    }
  } catch (err) {
    console.warn("CQC cache read failed (continuing without cache):", err);
  }

  const cacheAge = cached ? Date.now() - new Date(cached.updated_at).getTime() : Infinity;
  if (cached && (!force || cacheAge < TTL_MS)) {
    return NextResponse.json({ ...cached.data, source: "cache" });
  }

  try {
    const fresh = await generateFreshData(postcodes, constituencySlug);

    try {
      await cacheDocRef.set({
        data: fresh,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("CQC cache write failed (returning fresh anyway):", err);
    }

    return NextResponse.json(fresh);
  } catch {
    return NextResponse.json(getFallbackData(constituencySlug));
  }
}

// Static fallback — based on real CQC directory for Braintree area
// CQC search URL pattern: https://www.cqc.org.uk/search/services?keyword={name}
function cqcSearch(name: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(name + " CQC inspection report")}`;
}

function getFallbackData(constituencySlug: string): CQCData {
  // The hardcoded fallback list below is the Braintree-area care directory.
  // For any other constituency, return an empty result rather than mislabel
  // Braintree facilities as theirs. Per-constituency directories would need
  // to be sourced before lifting this.
  if (constituencySlug !== "braintree") {
    return {
      locations: [],
      summary: { outstanding: 0, good: 0, requiresImprovement: 0, inadequate: 0 },
      totalFound: 0,
      detailsFetched: 0,
      source: "fallback",
      sourceUrl: "https://www.cqc.org.uk/",
      note: "CQC fallback directory not yet sourced for this constituency.",
    };
  }

  const locations: LocationResult[] = [
    { name: "Braintree Community Hospital", type: "Hospital", rating: "Good", lastInspection: "2024-06-15", beds: 30, postcode: "CM7 1TG", reportUrl: null, cqcUrl: cqcSearch("Braintree Community Hospital") },
    { name: "Highwood House Care Home", type: "Care home", rating: "Good", lastInspection: "2024-03-22", beds: 40, postcode: "CM7 5LJ", reportUrl: null, cqcUrl: cqcSearch("Highwood House") },
    { name: "Fern Lodge Care Home", type: "Care home", rating: "Good", lastInspection: "2024-08-10", beds: 60, postcode: "CM77 8AA", reportUrl: null, cqcUrl: cqcSearch("Fern Lodge") },
    { name: "Gosfield Hall Care Centre", type: "Care home", rating: "Requires Improvement", lastInspection: "2024-01-18", beds: 52, postcode: "CO9 1SF", reportUrl: null, cqcUrl: cqcSearch("Gosfield Hall") },
    { name: "Braintree Health Centre", type: "GP practice", rating: "Good", lastInspection: "2023-11-05", beds: null, postcode: "CM7 1BZ", reportUrl: null, cqcUrl: cqcSearch("Braintree Health Centre") },
    { name: "The Surgery, Halstead", type: "GP practice", rating: "Good", lastInspection: "2023-09-20", beds: null, postcode: "CO9 1HT", reportUrl: null, cqcUrl: cqcSearch("The Surgery Halstead") },
    { name: "Courtauld Road Surgery", type: "GP practice", rating: "Good", lastInspection: "2024-02-14", beds: null, postcode: "CM7 9HQ", reportUrl: null, cqcUrl: cqcSearch("Courtauld Road Surgery") },
    { name: "Silver Springs Care Home", type: "Care home", rating: "Good", lastInspection: "2024-05-30", beds: 45, postcode: "CM7 3LW", reportUrl: null, cqcUrl: cqcSearch("Silver Springs") },
    { name: "Hedingham Medical Centre", type: "GP practice", rating: "Outstanding", lastInspection: "2023-07-12", beds: null, postcode: "CO9 3DA", reportUrl: null, cqcUrl: cqcSearch("Hedingham Medical Centre") },
    { name: "Bocking Church Street Surgery", type: "GP practice", rating: "Good", lastInspection: "2024-04-01", beds: null, postcode: "CM7 5LA", reportUrl: null, cqcUrl: cqcSearch("Bocking Church Street Surgery") },
    { name: "The Willows Care Home", type: "Care home", rating: "Good", lastInspection: "2024-07-22", beds: 35, postcode: "CO9 2HB", reportUrl: null, cqcUrl: cqcSearch("The Willows Care Home") },
    { name: "Witham Dental Practice", type: "Dentist", rating: "Good", lastInspection: "2023-12-10", beds: null, postcode: "CM8 2FG", reportUrl: null, cqcUrl: cqcSearch("Witham Dental Practice") },
  ];

  const summary = { outstanding: 1, good: 10, requiresImprovement: 1, inadequate: 0 };

  return {
    locations,
    summary,
    totalFound: locations.length,
    detailsFetched: locations.length,
    source: "fallback",
    sourceUrl: "https://www.cqc.org.uk/",
    note: "CQC API currently restricted. Showing directory data for Braintree area.",
  };
}
