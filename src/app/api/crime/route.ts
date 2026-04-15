import { NextResponse } from "next/server";
import { isInsideConstituency } from "@/lib/geo";

// Force dynamic — fetches live external data
export const dynamic = "force-dynamic";

// UK Police API — free, no auth required
// Docs: https://data.police.uk/docs/
// Uses multiple sample points across Braintree constituency for full coverage
// IMPORTANT: API rate-limits at ~15 concurrent requests, so we batch in groups

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

// Grid of points covering the FULL Braintree Parliamentary Constituency
// Actual GeoJSON boundary extent: lat 51.829–52.087, lng 0.308–0.782
// UK Police API returns crimes within ~1 mile of each point
const SAMPLE_POINTS = [
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

export async function GET() {
  try {
    // Get latest available month (usually 2 months behind)
    const now = new Date();
    now.setMonth(now.getMonth() - 2);
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const allCrimes: CrimeRecord[] = [];
    const seenIds = new Set<string>();

    // Batch requests in groups of 8 with delays to avoid 429 rate limits
    const BATCH_SIZE = 8;
    for (let i = 0; i < SAMPLE_POINTS.length; i += BATCH_SIZE) {
      const batch = SAMPLE_POINTS.slice(i, i + BATCH_SIZE);
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
      if (i + BATCH_SIZE < SAMPLE_POINTS.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Filter to only crimes inside constituency boundary
    const filteredCrimes = allCrimes.filter((c) => {
      const lat = parseFloat(c.location.latitude);
      const lng = parseFloat(c.location.longitude);
      return lat && lng && isInsideConstituency(lng, lat);
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

    return NextResponse.json({
      crimes,
      summary,
      total: filteredCrimes.length,
      month: dateStr,
      source: "data.police.uk",
      sourceUrl: "https://data.police.uk/",
    });
  } catch {
    return NextResponse.json({ crimes: [], error: "Failed to fetch" }, { status: 500 });
  }
}

function formatCategory(cat: string): string {
  return cat
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
