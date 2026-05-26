import { NextResponse } from "next/server";
import { doc, getDoc, setDoc, type DocumentReference } from "firebase/firestore";
import { isInsideConstituency } from "@/lib/geo";
import { db } from "@/lib/firebase";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";

// PlanIt API for planning applications — free, no auth.
// Per request, sends a bounding box for the requested constituency, then
// filters results via isInsideConstituency() to drop anything outside the
// actual polygon.

const PLANIT_BASE = "https://www.planit.org.uk/api/applics/json";

// Braintree-only curated bbox. Slightly padded vs. the actual extent
// (extends south to ~51.75 to catch Tiptree/Wickham Bishops, west to ~0.30).
// Used when slug === "braintree" to preserve the existing coverage.
// For other constituencies, the data layer's `geo.bbox` is formatted to
// match PlanIt's expected lng,lat,lng,lat string.
const BRAINTREE_BBOX = "0.30,51.75,0.79,52.09";

function buildPlanItUrl(bbox: string): string {
  return `${PLANIT_BASE}?bbox=${bbox}&recent=60&limit=100`;
}

function bboxArrayToString(bbox: [number, number, number, number]): string {
  return bbox.map((n) => n.toFixed(4)).join(",");
}

const TTL_MS = 60 * 60 * 1000;

interface PlanItRecord {
  uid?: string;
  name?: string;
  description: string;
  address: string;
  lat?: number;
  lng?: number;
  location_x?: number;
  location_y?: number;
  app_state: string;
  start_date?: string;
  last_changed?: string;
  url?: string;
  link?: string;
  authority_name?: string;
  area_name?: string;
  app_type?: string;
  [key: string]: unknown;
}

interface PlanItResponse {
  records: PlanItRecord[];
}

interface NormalisedApplication {
  id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  status: string;
  date: string;
  url: string;
  local_authority: string;
}

interface PlanningData {
  applications: NormalisedApplication[];
  total: number;
}

async function generateFreshData(
  bbox: string,
  constituencySlug: string
): Promise<PlanningData | null> {
  try {
    const res = await fetch(buildPlanItUrl(bbox), {
      next: { revalidate: 86400 },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GroundGameAI/1.0)",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return { applications: [], total: 0 };
    }

    const data: PlanItResponse = await res.json();
    const records = data.records || [];

    if (records.length === 0) {
      return { applications: [], total: 0 };
    }

    const applications: NormalisedApplication[] = records
      .map((record) => ({
        id: record.uid || record.name || "",
        title: record.description || "Planning application",
        address: record.address || "",
        // PlanIt uses location_x (lng) and location_y (lat), or lat/lng directly
        lat: record.location_y || record.lat || 0,
        lng: record.location_x || record.lng || 0,
        type: categoriseApplication(record.description || ""),
        status: normaliseStatus(record.app_state || ""),
        date: record.start_date || record.last_changed || "",
        url: record.link || record.url || "",
        local_authority: record.area_name || record.authority_name || "",
      }))
      .filter((app) => app.lat !== 0 && app.lng !== 0)
      .filter((app) => isInsideConstituency(app.lng, app.lat, constituencySlug));

    return { applications, total: applications.length };
  } catch (err) {
    console.error("Planning data fetch failed:", err);
    return null;
  }
}

async function fetchAndUpdateCache(
  bbox: string,
  constituencySlug: string,
  cacheDocRef: DocumentReference
) {
  try {
    const fresh = await generateFreshData(bbox, constituencySlug);
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
    console.error("Background planning cache update failed:", err);
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

  // Determine bbox: curated Braintree fallback, else format constituency.geo.bbox
  // to PlanIt's lng,lat,lng,lat string. ~107 non-English constituencies have
  // no geo data populated — return a clean 400 for those.
  let bbox: string;
  if (constituencySlug === "braintree") {
    bbox = BRAINTREE_BBOX;
  } else if (constituencyData.geo?.bbox) {
    bbox = bboxArrayToString(constituencyData.geo.bbox);
  } else {
    return Response.json(
      {
        error: "Planning data not available",
        message: "Geographic bbox not yet sourced for this constituency",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }

  const cacheDocRef = doc(db, "planning_cache", constituencySlug);

  type CacheDoc = { data: { applications: unknown[]; total: number }; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await getDoc(cacheDocRef);
    if (snap.exists()) {
      cached = snap.data() as CacheDoc;
    }
  } catch (err) {
    console.warn("Planning cache read failed (continuing without cache):", err);
  }

  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs > TTL_MS) {
      fetchAndUpdateCache(bbox, constituencySlug, cacheDocRef);
    }
    return NextResponse.json({ ...cached.data, source: "cache" });
  }

  const fresh = await generateFreshData(bbox, constituencySlug);
  if (!fresh) {
    return NextResponse.json({ applications: [], total: 0 });
  }

  try {
    await setDoc(cacheDocRef, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Planning cache write failed (returning fresh anyway):", err);
  }

  return NextResponse.json(fresh);
}

function categoriseApplication(description: string): string {
  const d = description.toLowerCase();

  // Residential keywords
  if (
    d.includes("dwelling") ||
    d.includes("house") ||
    d.includes("bungalow") ||
    d.includes("flat") ||
    d.includes("apartment") ||
    d.includes("residential") ||
    d.includes("annexe") ||
    d.includes("garage") ||
    d.includes("conservatory") ||
    d.includes("extension") ||
    d.includes("loft conversion") ||
    d.includes("dormer") ||
    d.includes("porch") ||
    d.includes("outbuilding")
  ) {
    return "residential";
  }

  // Commercial keywords
  if (
    d.includes("commercial") ||
    d.includes("office") ||
    d.includes("shop") ||
    d.includes("retail") ||
    d.includes("industrial") ||
    d.includes("warehouse") ||
    d.includes("business") ||
    d.includes("hotel") ||
    d.includes("restaurant") ||
    d.includes("cafe") ||
    d.includes("pub")
  ) {
    return "commercial";
  }

  // Infrastructure keywords
  if (
    d.includes("highway") ||
    d.includes("road") ||
    d.includes("bridge") ||
    d.includes("telecoms") ||
    d.includes("mast") ||
    d.includes("solar") ||
    d.includes("wind") ||
    d.includes("energy") ||
    d.includes("substation") ||
    d.includes("drainage") ||
    d.includes("sewage") ||
    d.includes("pipeline") ||
    d.includes("5g") ||
    d.includes("broadband")
  ) {
    return "infrastructure";
  }

  // Change of use
  if (d.includes("change of use") || d.includes("conversion") || d.includes("convert")) {
    return "change of use";
  }

  // Trees and landscaping
  if (
    d.includes("tree") ||
    d.includes("hedge") ||
    d.includes("landscaping") ||
    d.includes("tpo")
  ) {
    return "trees/landscaping";
  }

  // Agricultural
  if (
    d.includes("agricultural") ||
    d.includes("farm") ||
    d.includes("barn") ||
    d.includes("stable") ||
    d.includes("equestrian")
  ) {
    return "agricultural";
  }

  // Signage and advertising
  if (d.includes("sign") || d.includes("advertisement") || d.includes("hoarding")) {
    return "signage";
  }

  // Demolition
  if (d.includes("demolition") || d.includes("demolish")) {
    return "demolition";
  }

  return "other";
}

function normaliseStatus(state: string): string {
  const s = state.toLowerCase();
  if (s.includes("pending") || s.includes("undecided") || s.includes("registered")) {
    return "pending";
  }
  if (s.includes("approved") || s.includes("permitted") || s.includes("granted")) {
    return "approved";
  }
  if (s.includes("refused") || s.includes("rejected") || s.includes("declined")) {
    return "refused";
  }
  if (s.includes("withdrawn")) {
    return "withdrawn";
  }
  if (s.includes("appeal")) {
    return "appeal";
  }
  return state || "unknown";
}
