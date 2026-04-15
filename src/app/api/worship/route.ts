import { NextResponse } from "next/server";
import { isInsideConstituency } from "@/lib/geo";

// Force dynamic — fetches live external data
export const dynamic = "force-dynamic";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Bounding box covers FULL parliamentary constituency
// Actual GeoJSON extent: lat 51.829–52.087, lng 0.308–0.782
const OVERPASS_QUERY = `[out:json][timeout:25];
(
  node["amenity"="place_of_worship"](51.82,0.30,52.09,0.79);
  way["amenity"="place_of_worship"](51.82,0.30,52.09,0.79);
);
out center;`;

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

export async function GET() {
  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
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
      if (!isInsideConstituency(lng, lat)) continue;

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
