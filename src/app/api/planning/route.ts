import { NextResponse } from "next/server";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { isInsideConstituency } from "@/lib/geo";
import { db } from "@/lib/firebase";

export const dynamic = "force-dynamic";

// PlanIt API for planning applications in the Braintree constituency area
// Free API, no auth required
// Bounding box covers the FULL parliamentary constituency with padding:
// Extends south to ~51.75 (Tiptree, Wickham Bishops) and west to ~0.30

const PLANIT_URL =
  "https://www.planit.org.uk/api/applics/json?bbox=0.30,51.75,0.79,52.09&recent=60&limit=100";

const TTL_MS = 60 * 60 * 1000;
const cacheDoc = doc(db, "planning_cache", "braintree");

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

async function generateFreshData(): Promise<PlanningData | null> {
  try {
    const res = await fetch(PLANIT_URL, {
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
      .filter((app) => isInsideConstituency(app.lng, app.lat));

    return { applications, total: applications.length };
  } catch (err) {
    console.error("Planning data fetch failed:", err);
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
    console.error("Background planning cache update failed:", err);
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
      return NextResponse.json({ applications: [], total: 0 });
    }

    await setDoc(cacheDoc, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json(fresh);
  } catch {
    return NextResponse.json({ applications: [], total: 0 });
  }
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
