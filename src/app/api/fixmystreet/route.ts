import { NextResponse } from "next/server";
import { doc, getDoc, setDoc, type DocumentReference } from "firebase/firestore";
import { isInsideConstituency } from "@/lib/geo";
import { db } from "@/lib/firebase";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";

// FixMyStreet /around endpoint — community-reported issues within a bounding
// box. Per request, queries a set of sub-bboxes covering the requested
// constituency (FixMyStreet caps results per call, so sub-bboxes increase
// total coverage capacity), then filters to the actual boundary polygon via
// isInsideConstituency().

const TTL_MS = 30 * 60 * 1000;

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

// Braintree-only curated bbox set. 8 hand-tuned sub-bboxes covering Braintree's
// actual extent (lng 0.308–0.782, lat 51.829–52.087) including the FAR NORTH
// (Sturmer/Kedington to lat 52.087). Used when slug === "braintree" to preserve
// the existing high-coverage behaviour. For other constituencies, see
// generateBboxesFromBbox() below.
const BRAINTREE_BBOXES: string[] = [
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

// Heuristic 2×2 = 4 sub-bbox grid for any non-Braintree constituency.
// FixMyStreet caps results per call; splitting into sub-bboxes increases the
// per-request coverage capacity vs. one large bbox. Per-constituency curated
// bboxes would be better follow-up work.
function generateBboxesFromBbox(
  bbox: [number, number, number, number]
): string[] {
  const [lngMin, latMin, lngMax, latMax] = bbox;
  const GRID = 2;
  const bboxes: string[] = [];
  const lngStep = (lngMax - lngMin) / GRID;
  const latStep = (latMax - latMin) / GRID;
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const subLngMin = lngMin + i * lngStep;
      const subLngMax = subLngMin + lngStep;
      const subLatMin = latMin + j * latStep;
      const subLatMax = subLatMin + latStep;
      bboxes.push(`${subLngMin.toFixed(4)},${subLatMin.toFixed(4)},${subLngMax.toFixed(4)},${subLatMax.toFixed(4)}`);
    }
  }
  return bboxes;
}

async function generateFreshData(
  bboxes: string[],
  constituencySlug: string
): Promise<FixMyStreetData | null> {
  try {
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

    // Filter to this constituency's boundary polygon
    const filteredPins = allPins.filter((pin) => isInsideConstituency(pin[1], pin[0], constituencySlug));

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

async function fetchAndUpdateCache(
  bboxes: string[],
  constituencySlug: string,
  cacheDocRef: DocumentReference
) {
  try {
    const fresh = await generateFreshData(bboxes, constituencySlug);
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
    console.error("Background fixmystreet cache update failed:", err);
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

  // Determine bboxes: curated Braintree fallback, else 2×2 grid derived from
  // the constituency's bbox. ~107 non-English constituencies have no geo data
  // populated — return a clean 400 for those (matches crime/census pattern).
  let bboxes: string[];
  if (constituencySlug === "braintree") {
    bboxes = BRAINTREE_BBOXES;
  } else if (constituencyData.geo?.bbox) {
    bboxes = generateBboxesFromBbox(constituencyData.geo.bbox);
  } else {
    return Response.json(
      {
        error: "FixMyStreet data not available",
        message: "Geographic bbox not yet sourced for this constituency",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }

  const cacheDocRef = doc(db, "fixmystreet_cache", constituencySlug);

  type CacheDoc = { data: { issues: unknown[] }; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await getDoc(cacheDocRef);
    if (snap.exists()) {
      cached = snap.data() as CacheDoc;
    }
  } catch (err) {
    console.warn("FixMyStreet cache read failed (continuing without cache):", err);
  }

  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs > TTL_MS) {
      fetchAndUpdateCache(bboxes, constituencySlug, cacheDocRef);
    }
    return NextResponse.json({ ...cached.data, source: "cache" });
  }

  const fresh = await generateFreshData(bboxes, constituencySlug);
  if (!fresh) {
    return NextResponse.json({ issues: [] });
  }

  try {
    await setDoc(cacheDocRef, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("FixMyStreet cache write failed (returning fresh anyway):", err);
  }

  return NextResponse.json(fresh);
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
