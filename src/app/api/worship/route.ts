import { NextResponse } from "next/server";
import { isInsideConstituency } from "@/lib/geo";
import { getFullData } from "@/data";

// Force dynamic — fetches live external data
export const dynamic = "force-dynamic";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Braintree-only padded bbox (in Overpass's lat_min,lng_min,lat_max,lng_max
// format). Slightly padded vs. the actual extent (51.829–52.087 / 0.308–0.782)
// to catch edge places of worship. Used when slug === "braintree" to preserve
// the existing coverage. For other constituencies, see bboxArrayToOverpassString.
const BRAINTREE_OVERPASS_BBOX = "51.82,0.30,52.09,0.79";

function buildOverpassQuery(bboxStr: string): string {
  return `[out:json][timeout:25];
(
  node["amenity"="place_of_worship"](${bboxStr});
  way["amenity"="place_of_worship"](${bboxStr});
);
out center;`;
}

// Convert data-layer bbox [lng_min, lat_min, lng_max, lat_max] to Overpass's
// lat_min,lng_min,lat_max,lng_max format (note the pair swap).
function bboxArrayToOverpassString(
  bbox: [number, number, number, number]
): string {
  const [lngMin, latMin, lngMax, latMax] = bbox;
  return `${latMin.toFixed(4)},${lngMin.toFixed(4)},${latMax.toFixed(4)},${lngMax.toFixed(4)}`;
}

interface OverpassElement {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface WorshipPlace {
  id: number;
  name: string;
  religion: string;
  denomination: string;
  address: string;
  lat: number;
  lng: number;
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

  // Determine bbox: Braintree curated string, else convert from geo.bbox.
  // ~107 non-English constituencies have no geo data populated — return a
  // clean 400 for those (matches the crime/planning/floods pattern).
  let bboxStr: string;
  if (constituencySlug === "braintree") {
    bboxStr = BRAINTREE_OVERPASS_BBOX;
  } else if (constituencyData.geo?.bbox) {
    bboxStr = bboxArrayToOverpassString(constituencyData.geo.bbox);
  } else {
    return Response.json(
      {
        error: "Places of worship data not available",
        message: "Geographic bbox not yet sourced for this constituency",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }

  const overpassQuery = buildOverpassQuery(bboxStr);

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(overpassQuery)}`,
      next: { revalidate: 604800 }, // 7 days
    });

    if (!res.ok) {
      throw new Error(`Overpass API returned ${res.status}`);
    }

    const data = await res.json();
    const elements: OverpassElement[] = data.elements || [];

    const places: WorshipPlace[] = [];
    const summary: Record<string, number> = {};

    for (const el of elements) {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (!lat || !lng) continue;
      if (!isInsideConstituency(lng, lat, constituencySlug)) continue;

      const tags = el.tags || {};
      const religion = (tags.religion || "unknown").toLowerCase();
      const name = tags.name || "Unnamed place of worship";
      const denomination = (tags.denomination || "").replace(/_/g, " ");
      const address = tags["addr:street"] || "";

      places.push({
        id: el.id,
        name,
        religion,
        denomination,
        address,
        lat,
        lng,
      });

      summary[religion] = (summary[religion] || 0) + 1;
    }

    return NextResponse.json({
      places,
      summary,
      total: places.length,
    });
  } catch (err) {
    console.error("Worship API error:", err);
    return NextResponse.json(
      { places: [], summary: {}, total: 0, error: "Failed to fetch places of worship" },
      { status: 500 }
    );
  }
}
