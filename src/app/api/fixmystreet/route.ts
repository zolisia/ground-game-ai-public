import { NextResponse } from "next/server";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { isInsideConstituency } from "@/lib/geo";
import { db } from "@/lib/firebase";

export const dynamic = "force-dynamic";

// FixMyStreet API for Braintree constituency area
// Uses the /around endpoint with bounding box covering the constituency

const TTL_MS = 30 * 60 * 1000;
const cacheDoc = doc(db, "fixmystreet_cache", "braintree");

interface FMSPin {
  0: number; // lat
  1: number; // lon
  2: string; // color/status
  3: number; // report ID
  4: string; // title
  5: string; // description
  6: boolean;
}

interface FixMyStreetIssue {
  id: string;
  title: string;
  category: string;
  state: string;
  created: string;
  latitude: number;
  longitude: number;
  url: string;
}

interface FixMyStreetData {
  issues: FixMyStreetIssue[];
  total?: number;
}

async function generateFreshData(): Promise<FixMyStreetData | null> {
  try {
    // Split constituency into quadrant zones for full coverage
    // Actual GeoJSON extent: lng 0.308–0.782, lat 51.829–52.087
    // Must cover the FAR NORTH (Sturmer/Kedington to lat 52.087)
    const bboxes = [
      // Far north-west (Great Bardfield, Ridgewell — lat 52.00–52.09)
      "0.30,52.00,0.56,52.09",
      // Far north-east (Steeple Bumpstead, Sturmer — lat 52.00–52.09)
      "0.56,52.00,0.79,52.09",
      // North-west (Yeldham, Gosfield, Halstead west, Stour Valley)
      "0.30,51.92,0.56,52.00",
      // North-east (Bumpstead, Hedingham, Halstead east)
      "0.56,51.92,0.79,52.00",
      // Central-west (Rayne, Braintree west, Panfield, Great Notley)
      "0.30,51.83,0.56,51.92",
      // Central-east (Coggeshall, Kelvedon, Tiptree, Feering)
      "0.56,51.83,0.79,51.92",
      // South-west (southern and western extensions)
      "0.30,51.75,0.56,51.83",
      // South-east (Tiptree south, Wickham Bishops)
      "0.56,51.75,0.79,51.83",
    ];

    const allPins: FMSPin[] = [];
    const seenIds = new Set<number>();

    const results = await Promise.allSettled(
      bboxes.map((bbox) =>
        fetch(`https://www.fixmystreet.com/around?ajax=1&bbox=${bbox}&status=open`, {
          next: { revalidate: 1800 },
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; GroundGameAI/1.0)",
            Accept: "application/json",
          },
        }).then((res) => (res.ok ? res.json() : { pins: [] }))
      )
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const pins: FMSPin[] = result.value.pins || [];
        for (const pin of pins) {
          if (!seenIds.has(pin[3])) {
            seenIds.add(pin[3]);
            allPins.push(pin);
          }
        }
      }
    }

    if (allPins.length === 0) {
      return { issues: [] };
    }

    // Filter to constituency boundary
    const filteredPins = allPins.filter((pin) => isInsideConstituency(pin[1], pin[0]));

    const issues: FixMyStreetIssue[] = filteredPins.slice(0, 60).map((pin: FMSPin) => ({
      id: String(pin[3]),
      title: pin[4] || "Reported issue",
      category: categoriseFromTitle(pin[4] || ""),
      state: pin[2] === "green" ? "fixed" : pin[2] === "orange" ? "investigating" : "open",
      created: new Date().toISOString(),
      latitude: pin[0],
      longitude: pin[1],
      url: `https://www.fixmystreet.com/report/${pin[3]}`,
    }));

    return { issues, total: filteredPins.length };
  } catch (err) {
    console.error("FixMyStreet data fetch failed:", err);
    return null;
  }
}

async function fetchAndUpdateCache() {
  try {
    const fresh = await generateFreshData();
    if (!fresh) return;

    const existing = await getDoc(cacheDoc);
    const existingData = existing.exists() ? existing.data().data : null;

    if (existingData && JSON.stringify(existingData) === JSON.stringify(fresh)) {
      return;
    }

    await setDoc(cacheDoc, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Background fixmystreet cache update failed:", err);
  }
}

export async function GET() {
  try {
    const snap = await getDoc(cacheDoc);
    const cached = snap.exists() ? snap.data() : null;

    if (cached) {
      const ageMs = Date.now() - new Date(cached.updated_at).getTime();
      if (ageMs > TTL_MS) {
        fetchAndUpdateCache();
      }
      return NextResponse.json({ ...cached.data, source: "cache" });
    }

    const fresh = await generateFreshData();
    if (!fresh) {
      return NextResponse.json({ issues: [] });
    }

    await setDoc(cacheDoc, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json(fresh);
  } catch {
    return NextResponse.json({ issues: [] });
  }
}

function categoriseFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("pothole") || t.includes("road")) return "Potholes";
  if (t.includes("parking") || t.includes("parked")) return "Parking";
  if (t.includes("litter") || t.includes("rubbish") || t.includes("waste") || t.includes("fly")) return "Flytipping";
  if (t.includes("light") || t.includes("lamp")) return "Street Lighting";
  if (t.includes("tree") || t.includes("hedge") || t.includes("overgrown")) return "Trees & Vegetation";
  if (t.includes("sign") || t.includes("nameplate")) return "Signs";
  if (t.includes("drain") || t.includes("flood")) return "Drainage";
  if (t.includes("pavement") || t.includes("footpath") || t.includes("paving")) return "Pavements";
  return "Other";
}
