import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // EPC aggregate stats change quarterly — weekly refresh is enough

// Energy Performance Certificate (EPC) Open Data
// Requires free API key from https://epc.opendatacommunities.org/
// Auth: Basic base64(email:apiKey)
// Falls back to national average data if no key is configured

const EPC_BASE = "https://epc.opendatacommunities.org/api/v1/domestic/search";

// Braintree-only fallback. Used when the data layer doesn't yet have postcodes
// for the requested constituency. See REFACTOR_AUDIT.md §5 (missing data) for
// the per-constituency postcode sourcing task.
const BRAINTREE_POSTCODES = ["CM7", "CM77", "CO9"];

interface EPCRecord {
  address: string;
  postcode: string;
  "current-energy-rating": string;
  "current-energy-efficiency": string;
  "lodgement-date": string;
  "property-type": string;
  "total-floor-area": string;
}

type BandCounts = Record<string, number>;

// National average EPC distribution (England & Wales, 2023/24 data)
// Used as fallback when no API key is configured
const NATIONAL_FALLBACK: BandCounts = {
  A: 2,
  B: 15,
  C: 32,
  D: 30,
  E: 15,
  F: 5,
  G: 1,
};

async function fetchEPCPage(
  postcode: string,
  apiKey: string,
  email: string
): Promise<EPCRecord[]> {
  const auth = Buffer.from(`${email}:${apiKey}`).toString("base64");
  const url = `${EPC_BASE}?postcode=${postcode}&size=100`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${auth}`,
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) return [];

    const data = await res.json();
    return data?.rows ?? [];
  } catch {
    return [];
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

  // Try to get postcodes from data layer (forward-compatible: will be populated
  // when per-constituency postcodes are sourced — see REFACTOR_AUDIT.md §5).
  // Type cast because ConstituencyAreas doesn't yet declare a `postcodes` field;
  // when added, this cast becomes a no-op.
  const areasWithPostcodes = constituencyData.areas as
    | { postcodes?: string[] }
    | undefined;
  const POSTCODES =
    areasWithPostcodes?.postcodes ??
    (constituencySlug === "braintree" ? BRAINTREE_POSTCODES : null);

  if (!POSTCODES) {
    return Response.json(
      {
        error: "EPC data not available",
        message: "Postcode data not yet sourced for this constituency",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }

  const cacheDocRef = adminDb.collection("epc_cache").doc(constituencySlug);

  type CacheDoc = { data: Record<string, unknown>; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await cacheDocRef.get();
    if (snap.exists) cached = snap.data() as CacheDoc;
  } catch (err) {
    console.warn("EPC cache read failed (continuing without cache):", err);
  }

  const cacheAge = cached ? Date.now() - new Date(cached.updated_at).getTime() : Infinity;
  if (cached && (!force || cacheAge < TTL_MS)) {
    return NextResponse.json({ ...cached.data, source: "cache" });
  }

  const apiKey = process.env.EPC_API_KEY;
  const email = process.env.EPC_EMAIL ?? "";

  // If no API key, return a reasonable fallback
  if (!apiKey) {
    const totalFallback = Object.values(NATIONAL_FALLBACK).reduce((a, b) => a + b, 0);
    const poorlyRated =
      ((NATIONAL_FALLBACK.D + NATIONAL_FALLBACK.E + NATIONAL_FALLBACK.F + NATIONAL_FALLBACK.G) /
        totalFallback) *
      100;

    return NextResponse.json({
      ratings: NATIONAL_FALLBACK,
      totalAssessed: totalFallback,
      poorlyRated: Math.round(poorlyRated * 10) / 10,
      recentAssessments: [],
      source: "fallback",
      note: "No EPC API key configured. Showing national average distribution. Set EPC_API_KEY and EPC_EMAIL env vars to fetch live data.",
    });
  }

  try {
    // Fetch from all postcodes in parallel
    const results = await Promise.allSettled(
      POSTCODES.map((pc) => fetchEPCPage(pc, apiKey, email))
    );

    const allRecords: EPCRecord[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        allRecords.push(...result.value);
      }
    }

    // Aggregate by EPC band
    const ratings: BandCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
    for (const record of allRecords) {
      const band = record["current-energy-rating"]?.toUpperCase();
      if (band && band in ratings) {
        ratings[band]++;
      }
    }

    const totalAssessed = Object.values(ratings).reduce((a, b) => a + b, 0);
    const poorlyRatedCount = ratings.D + ratings.E + ratings.F + ratings.G;
    const poorlyRated =
      totalAssessed > 0
        ? Math.round((poorlyRatedCount / totalAssessed) * 1000) / 10
        : 0;

    // Recent assessments (last 10 sorted by date)
    const recentAssessments = allRecords
      .filter((r) => r["lodgement-date"])
      .sort((a, b) => b["lodgement-date"].localeCompare(a["lodgement-date"]))
      .slice(0, 10)
      .map((r) => ({
        address: r.address,
        postcode: r.postcode,
        rating: r["current-energy-rating"],
        efficiency: r["current-energy-efficiency"],
        date: r["lodgement-date"],
        propertyType: r["property-type"],
        floorArea: r["total-floor-area"],
      }));

    const fresh = { ratings, totalAssessed, poorlyRated, recentAssessments, sourceUrl: "https://epc.opendatacommunities.org/" };
    try {
      await cacheDocRef.set({ data: fresh, updated_at: new Date().toISOString() });
    } catch (err) {
      console.warn("EPC cache write failed (returning fresh anyway):", err);
    }

    return NextResponse.json({ ...fresh, source: "live" });
  } catch {
    return NextResponse.json(
      {
        ratings: NATIONAL_FALLBACK,
        totalAssessed: 0,
        poorlyRated: 0,
        recentAssessments: [],
        error: "Failed to fetch EPC data",
        source: "fallback",
      },
      { status: 500 }
    );
  }
}
