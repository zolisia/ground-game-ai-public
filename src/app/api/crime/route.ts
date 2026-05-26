import { NextResponse } from "next/server";
import { doc, getDoc, setDoc, type DocumentReference } from "firebase/firestore";
import { isInsideConstituency } from "@/lib/geo";
import { db } from "@/lib/firebase";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";

// UK Police API — free, no auth required
// Docs: https://data.police.uk/docs/
// Per request, samples a grid of geographic points across the requested
// constituency (police.uk returns crimes within ~1 mi of each point), then
// filters the union via isInsideConstituency() to drop anything outside the
// boundary.
// IMPORTANT: API rate-limits at ~15 concurrent requests, so we batch in groups.

const TTL_MS = 15 * 60 * 1000;

interface CrimeRecord {
  category: string;
  location: {
    latitude: string;
    longitude: string;
    street: { name: string };
  };
  month: string;
  outcome_status: { category: string } | null;
  persistent_id?: string;
}

interface CrimeData {
  crimes: Array<{
    category: string;
    lat: number;
    lng: number;
    street: string;
    month: string;
    outcome: string | null;
  }>;
  summary: Array<{ category: string; count: number }>;
  total: number;
  month: string;
  source: string;
  sourceUrl: string;
}

// Braintree-only curated fallback. Hand-tuned 28 points across the actual
// boundary extent (lat 51.829–52.087, lng 0.308–0.782). Used when slug ===
// "braintree" to preserve the existing high-quality coverage. For other
// constituencies, see generateSamplePointsFromBbox() below.
// UK Police API returns crimes within ~1 mile of each point.
const BRAINTREE_SAMPLE_POINTS: Array<{ lat: number; lng: number }> = [
  // === FAR NORTH (constituency extends to lat 52.087) ===
  { lat: 52.080, lng: 0.590 }, // Sturmer / Kedington (extreme north)
  { lat: 52.060, lng: 0.660 }, // Bumpstead north
  { lat: 52.040, lng: 0.640 }, // Steeple Bumpstead village
  { lat: 52.050, lng: 0.530 }, // Ridgewell / Tilbury
  { lat: 52.030, lng: 0.580 }, // Ashen / Clare border
  { lat: 52.010, lng: 0.490 }, // Great Yeldham north

  // === NORTHERN WARDS ===
  { lat: 51.990, lng: 0.650 }, // Bumpstead ward
  { lat: 51.985, lng: 0.570 }, // Stour Valley / Sturmer
  { lat: 51.970, lng: 0.440 }, // Finchingfield area
  { lat: 51.975, lng: 0.500 }, // Yeldham
  { lat: 51.968, lng: 0.590 }, // Sible Hedingham
  { lat: 51.955, lng: 0.610 }, // Castle Hedingham
  { lat: 51.945, lng: 0.639 }, // Halstead

  // === CENTRAL WARDS ===
  { lat: 51.930, lng: 0.490 }, // Wethersfield
  { lat: 51.930, lng: 0.575 }, // Between Halstead and Earls Colne
  { lat: 51.921, lng: 0.548 }, // Earls Colne / White Colne
  { lat: 51.912, lng: 0.440 }, // Gosfield / Greenstead Green
  { lat: 51.900, lng: 0.566 }, // Bocking
  { lat: 51.878, lng: 0.556 }, // Braintree town center
  { lat: 51.868, lng: 0.685 }, // Coggeshall
  { lat: 51.860, lng: 0.590 }, // Cressing

  // === SOUTHERN WARDS ===
  { lat: 51.847, lng: 0.535 }, // Great Notley / Black Notley
  { lat: 51.845, lng: 0.620 }, // Between Great Notley and Kelvedon
  { lat: 51.838, lng: 0.701 }, // Kelvedon
  { lat: 51.835, lng: 0.565 }, // Silver End / Rivenhall
  { lat: 51.840, lng: 0.600 }, // Hatfield Peverel
  { lat: 51.830, lng: 0.640 }, // Witham-adjacent south

  // === FAR WEST (constituency extends to lng 0.308) ===
  { lat: 51.860, lng: 0.340 }, // Felsted west edge
  { lat: 51.860, lng: 0.395 }, // Felsted village
  { lat: 51.875, lng: 0.400 }, // Rayne
  { lat: 51.895, lng: 0.460 }, // Stisted / Panfield
  { lat: 51.960, lng: 0.370 }, // Great Bardfield

  // === FAR EAST ===
  { lat: 51.835, lng: 0.750 }, // Tiptree
];

// Heuristic 5×5 grid (25 points) for any non-Braintree constituency. Coverage
// is uniform across the bbox rather than ward-tuned, so large rural
// constituencies may have gaps and small urban ones may have redundant
// fetches. Adequate as a first cut; per-constituency curated points would be
// better follow-up work.
function generateSamplePointsFromBbox(
  bbox: [number, number, number, number]
): Array<{ lat: number; lng: number }> {
  const [lngMin, latMin, lngMax, latMax] = bbox;
  const GRID = 5;
  const points: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const lng = lngMin + ((lngMax - lngMin) * (i + 0.5)) / GRID;
      const lat = latMin + ((latMax - latMin) * (j + 0.5)) / GRID;
      points.push({ lat, lng });
    }
  }
  return points;
}

// Fetch a single point with retry on 429
async function fetchPoint(lat: number, lng: number, dateStr: string, retries = 2): Promise<CrimeRecord[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(
        `https://data.police.uk/api/crimes-street/all-crime?lat=${lat}&lng=${lng}&date=${dateStr}`,
        {
          next: { revalidate: 86400 },
          headers: { Accept: "application/json" },
        }
      );
      if (res.status === 429) {
        // Rate limited — wait and retry
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }
  return [];
}

function formatCategory(cat: string): string {
  return cat
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function generateFreshData(
  samplePoints: Array<{ lat: number; lng: number }>,
  constituencySlug: string
): Promise<CrimeData | null> {
  try {
    // Get latest available month (usually 2 months behind)
    const now = new Date();
    now.setMonth(now.getMonth() - 2);
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const allCrimes: CrimeRecord[] = [];
    const seenIds = new Set<string>();

    // Batch requests in groups of 8 with delays to avoid 429 rate limits
    const BATCH_SIZE = 8;
    for (let i = 0; i < samplePoints.length; i += BATCH_SIZE) {
      const batch = samplePoints.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((point) => fetchPoint(point.lat, point.lng, dateStr))
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          const crimes: CrimeRecord[] = result.value;
          for (const crime of crimes) {
            const key = crime.persistent_id || `${crime.category}-${crime.location.latitude}-${crime.location.longitude}-${crime.location.street.name}`;
            if (!seenIds.has(key)) {
              seenIds.add(key);
              allCrimes.push(crime);
            }
          }
        }
      }

      // Wait between batches to respect rate limits
      if (i + BATCH_SIZE < samplePoints.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Filter to only crimes inside this constituency's boundary
    const filteredCrimes = allCrimes.filter((c) => {
      const lat = parseFloat(c.location.latitude);
      const lng = parseFloat(c.location.longitude);
      return lat && lng && isInsideConstituency(lng, lat, constituencySlug);
    });

    // Categorise and count
    const categoryCounts: Record<string, number> = {};
    const crimes = filteredCrimes.slice(0, 500).map((c) => {
      const cat = formatCategory(c.category);
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      return {
        category: cat,
        lat: parseFloat(c.location.latitude),
        lng: parseFloat(c.location.longitude),
        street: c.location.street.name,
        month: c.month,
        outcome: c.outcome_status?.category || null,
      };
    });

    // Sort categories by count
    const summary = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count }));

    return {
      crimes,
      summary,
      total: filteredCrimes.length,
      month: dateStr,
      source: "data.police.uk",
      sourceUrl: "https://data.police.uk/",
    };
  } catch (err) {
    console.error("Crime data fetch failed:", err);
    return null;
  }
}

async function fetchAndUpdateCache(
  samplePoints: Array<{ lat: number; lng: number }>,
  constituencySlug: string,
  cacheDocRef: DocumentReference
) {
  try {
    const fresh = await generateFreshData(samplePoints, constituencySlug);
    if (!fresh) return;

    const existing = await getDoc(cacheDocRef);
    const existingData = existing.exists() ? existing.data().data : null;

    if (existingData && JSON.stringify(existingData) === JSON.stringify(fresh)) {
      return;
    }

    await setDoc(cacheDocRef, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Background crime cache update failed:", err);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const constituencySlug = searchParams.get("constituency") || "braintree";
  const constituencyData = getFullData(constituencySlug);

  if (!constituencyData) {
    return Response.json(
      { error: "Invalid constituency slug" },
      { status: 400 }
    );
  }

  // Determine sample points: curated Braintree fallback, else bbox-derived
  // grid. ~107 non-English constituencies have no geo data populated — return
  // a clean 400 for those (matches the census/EPC pattern).
  let samplePoints: Array<{ lat: number; lng: number }>;
  if (constituencySlug === "braintree") {
    samplePoints = BRAINTREE_SAMPLE_POINTS;
  } else if (constituencyData.geo?.bbox) {
    samplePoints = generateSamplePointsFromBbox(constituencyData.geo.bbox);
  } else {
    return Response.json(
      {
        error: "Crime data not available",
        message: "Geographic bbox not yet sourced for this constituency",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }

  const cacheDocRef = doc(db, "crime_cache", constituencySlug);

  // Cache read is best-effort. If Firestore rules deny or it's unreachable,
  // we skip the cache rather than failing the route.
  let cached: { data: CrimeData; updated_at: string } | null = null;
  try {
    const snap = await getDoc(cacheDocRef);
    if (snap.exists()) {
      cached = snap.data() as { data: CrimeData; updated_at: string };
    }
  } catch (err) {
    console.warn("Crime cache read failed (continuing without cache):", err);
  }

  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs > TTL_MS) {
      fetchAndUpdateCache(samplePoints, constituencySlug, cacheDocRef);
    }
    return NextResponse.json({ ...cached.data, source: "cache" });
  }

  const fresh = await generateFreshData(samplePoints, constituencySlug);
  if (!fresh) {
    return NextResponse.json({ crimes: [], error: "Failed to fetch" }, { status: 500 });
  }

  // Cache write is also best-effort — return the fresh data regardless.
  try {
    await setDoc(cacheDocRef, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Crime cache write failed (returning fresh anyway):", err);
  }

  return NextResponse.json(fresh);
}
