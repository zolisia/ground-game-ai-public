import { NextResponse } from "next/server";
import { doc, getDoc, setDoc, type DocumentReference } from "firebase/firestore";
import { isInsideConstituency } from "@/lib/geo";
import { db } from "@/lib/firebase";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";

// DfE Get Information About Schools (GIAS) — Braintree only.
// Primary API: GIAS search by location.
// Fallback: static BRAINTREE_SCHOOLS list.
// Multi-constituency status: locked to Braintree until per-constituency school
// data is sourced. The GIAS URL still hardcodes Braintree's location coords
// (safely unreachable for other slugs because the GET handler returns 400
// before reaching the fetch). When expanding, replace the URL's Location/
// LocationCoords with per-constituency values and add per-constituency
// fallback arrays.

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface GIASSchool {
  URN: number;
  EstablishmentName: string;
  TypeOfEstablishment: string;
  PhaseOfEducation: string;
  StatutoryLowAge: string;
  StatutoryHighAge: string;
  OfstedRating: string;
  NumberOfPupils: string;
  Street: string;
  Town: string;
  Postcode: string;
  Latitude: string;
  Longitude: string;
}

interface School {
  name: string;
  type: "Primary" | "Secondary" | "Special" | "Other";
  ofstedRating: string;
  lat: number;
  lng: number;
  ageRange: string;
  pupils: number;
  address: string;
  urn: number;
}

interface SchoolsData {
  schools: School[];
  summary: ReturnType<typeof buildSummary>;
  source: string;
}

function classifyPhase(phase: string, typeName: string): School["type"] {
  const p = (phase || "").toLowerCase();
  const t = (typeName || "").toLowerCase();
  if (t.includes("special") || t.includes("pupil referral") || t.includes("alternative provision")) return "Special";
  if (p.includes("primary") || p.includes("infant") || p.includes("junior") || p.includes("first")) return "Primary";
  if (p.includes("secondary") || p.includes("middle") || p.includes("all-through") || p.includes("16 plus")) return "Secondary";
  if (p.includes("nursery")) return "Primary";
  return "Other";
}

function normaliseOfsted(rating: string): string {
  const r = (rating || "").trim();
  if (r === "1" || r.toLowerCase().includes("outstanding")) return "Outstanding";
  if (r === "2" || r.toLowerCase().includes("good")) return "Good";
  if (r === "3" || r.toLowerCase().includes("requires")) return "Requires Improvement";
  if (r === "4" || r.toLowerCase().includes("inadequate")) return "Inadequate";
  return "Not inspected";
}

// Static fallback list of schools in the Braintree constituency. Used both
// as the GIAS-API fallback (when the live call fails) and as the response
// for the Braintree code path. Other constituencies are rejected with a 400
// before reaching this point — per-constituency school lists would need to
// be sourced before lifting that restriction.
const BRAINTREE_SCHOOLS: School[] = [
  { name: "Alec Hunter Academy", type: "Secondary", ofstedRating: "Good", lat: 51.8773, lng: 0.5530, ageRange: "11-16", pupils: 1100, address: "Stubbs Lane, Braintree CM7 3NR", urn: 137270 },
  { name: "Tabor Academy", type: "Secondary", ofstedRating: "Good", lat: 51.8746, lng: 0.5480, ageRange: "11-18", pupils: 1200, address: "Panfield Lane, Braintree CM7 5XP", urn: 137186 },
  { name: "Notley High School & Braintree Sixth Form", type: "Secondary", ofstedRating: "Good", lat: 51.8572, lng: 0.5653, ageRange: "11-18", pupils: 1600, address: "Notley Road, Braintree CM7 1WY", urn: 137261 },
  { name: "The Ramsey Academy", type: "Secondary", ofstedRating: "Good", lat: 51.9437, lng: 0.6287, ageRange: "11-18", pupils: 820, address: "Croft Road, Halstead CO9 1HN", urn: 137530 },
  { name: "Honywood Community Science School", type: "Secondary", ofstedRating: "Good", lat: 51.8696, lng: 0.6856, ageRange: "11-16", pupils: 950, address: "Tilkey Road, Coggeshall CO6 1PZ", urn: 137191 },
  { name: "Great Bradfords Junior School", type: "Primary", ofstedRating: "Good", lat: 51.8770, lng: 0.5420, ageRange: "7-11", pupils: 360, address: "Marlborough Road, Braintree CM7 9LB", urn: 114883 },
  { name: "Great Bradfords Infant & Nursery School", type: "Primary", ofstedRating: "Good", lat: 51.8775, lng: 0.5410, ageRange: "3-7", pupils: 270, address: "Marlborough Road, Braintree CM7 9LB", urn: 114814 },
  { name: "John Bunyan Primary School & Nursery", type: "Primary", ofstedRating: "Good", lat: 51.8748, lng: 0.5618, ageRange: "3-11", pupils: 430, address: "Mile End, Braintree CM7 3JX", urn: 114844 },
  { name: "White Court School", type: "Primary", ofstedRating: "Outstanding", lat: 51.8526, lng: 0.5638, ageRange: "4-11", pupils: 420, address: "Roding Way, Great Notley CM77 7UX", urn: 115230 },
  { name: "Beckers Green Primary School", type: "Primary", ofstedRating: "Good", lat: 51.8825, lng: 0.5574, ageRange: "4-11", pupils: 280, address: "Beckers Green Road, Braintree CM7 3QR", urn: 114775 },
  { name: "St Michael's Primary School, Braintree", type: "Primary", ofstedRating: "Good", lat: 51.8790, lng: 0.5533, ageRange: "4-11", pupils: 210, address: "South Street, Braintree CM7 3QQ", urn: 115161 },
  { name: "Rayne Primary School", type: "Primary", ofstedRating: "Outstanding", lat: 51.8731, lng: 0.4990, ageRange: "4-11", pupils: 210, address: "Gore Road, Rayne CM77 6UJ", urn: 115065 },
  { name: "Black Notley CE Primary School", type: "Primary", ofstedRating: "Good", lat: 51.8622, lng: 0.5798, ageRange: "4-11", pupils: 210, address: "The Street, Black Notley CM77 8LQ", urn: 115195 },
  { name: "Cressing Primary School", type: "Primary", ofstedRating: "Good", lat: 51.8538, lng: 0.5887, ageRange: "4-11", pupils: 210, address: "Tye Green, Cressing CM77 8HX", urn: 114822 },
  { name: "Halstead St Andrew's CE Primary School", type: "Primary", ofstedRating: "Good", lat: 51.9440, lng: 0.6330, ageRange: "4-11", pupils: 350, address: "Colchester Road, Halstead CO9 2ET", urn: 114994 },
  { name: "St Andrew's CE Primary, Coggeshall", type: "Primary", ofstedRating: "Good", lat: 51.8719, lng: 0.6830, ageRange: "4-11", pupils: 210, address: "Stoneham Street, Coggeshall CO6 1UH", urn: 115150 },
  { name: "Hedingham School & Sixth Form", type: "Secondary", ofstedRating: "Good", lat: 51.9703, lng: 0.5979, ageRange: "11-18", pupils: 1000, address: "Yeldham Road, Sible Hedingham CO9 3QE", urn: 137253 },
  { name: "Earls Colne Primary School", type: "Primary", ofstedRating: "Good", lat: 51.9224, lng: 0.6918, ageRange: "4-11", pupils: 285, address: "Queens Road, Earls Colne CO6 2RB", urn: 114838 },
  { name: "Richard de Clare Community Primary School", type: "Primary", ofstedRating: "Good", lat: 51.9484, lng: 0.6294, ageRange: "3-11", pupils: 195, address: "Parsonage Street, Halstead CO9 2JT", urn: 115073 },
  { name: "Gosfield School", type: "Other", ofstedRating: "Good", lat: 51.9213, lng: 0.5760, ageRange: "4-18", pupils: 450, address: "Cut Hedge Park, Gosfield CO9 1PF", urn: 115346 },
  { name: "Southview School", type: "Special", ofstedRating: "Good", lat: 51.8697, lng: 0.5470, ageRange: "4-16", pupils: 85, address: "Clay Pit Avenue, Braintree CM7 1HX", urn: 115282 },
  { name: "Great Saling Primary School", type: "Primary", ofstedRating: "Good", lat: 51.8876, lng: 0.4577, ageRange: "4-11", pupils: 98, address: "The Street, Great Saling CM7 4RB", urn: 114919 },
];

async function generateFreshData(constituencySlug: string): Promise<SchoolsData> {
  try {
    // Attempt GIAS API call
    const apiUrl =
      "https://get-information-schools.service.gov.uk/search/results/json?SearchType=Location&Location=Braintree&LocationCoords=51.878,0.556&OpenOnly=true&radius=15";

    const res = await fetch(apiUrl, {
      next: { revalidate: 86400 }, // Cache for 24 hours
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GroundGameAI/1.0)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`GIAS API ${res.status}`);

    const data = await res.json();
    const establishments: GIASSchool[] = data?.Establishments || data?.value || data || [];

    if (!Array.isArray(establishments) || establishments.length === 0) {
      throw new Error("No establishments returned");
    }

    const schools: School[] = establishments
      .filter((e) => {
        const lat = parseFloat(e.Latitude);
        const lng = parseFloat(e.Longitude);
        return !isNaN(lat) && !isNaN(lng) && isInsideConstituency(lng, lat, constituencySlug);
      })
      .map((e) => ({
        name: e.EstablishmentName,
        type: classifyPhase(e.PhaseOfEducation, e.TypeOfEstablishment),
        ofstedRating: normaliseOfsted(e.OfstedRating),
        lat: parseFloat(e.Latitude),
        lng: parseFloat(e.Longitude),
        ageRange: `${e.StatutoryLowAge || "?"}-${e.StatutoryHighAge || "?"}`,
        pupils: parseInt(e.NumberOfPupils) || 0,
        address: [e.Street, e.Town, e.Postcode].filter(Boolean).join(", "),
        urn: e.URN,
      }));

    if (schools.length < 5) throw new Error("Too few results, using fallback");

    return {
      schools,
      summary: buildSummary(schools),
      source: "gias",
    };
  } catch {
    return {
      schools: BRAINTREE_SCHOOLS,
      summary: buildSummary(BRAINTREE_SCHOOLS),
      source: "fallback",
    };
  }
}

async function fetchAndUpdateCache(
  constituencySlug: string,
  cacheDocRef: DocumentReference
) {
  try {
    const fresh = await generateFreshData(constituencySlug);

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
    console.error("Background schools cache update failed:", err);
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

  // Braintree-only constraint: school data hasn't been sourced for other
  // constituencies. Return a clean 400 rather than misleading Braintree data
  // labelled as another constituency's.
  if (constituencySlug !== "braintree") {
    return Response.json(
      {
        error: "Schools data not available",
        message: "School data not yet sourced for this constituency",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }

  const cacheDocRef = doc(db, "schools_cache", constituencySlug);

  type CacheDoc = { data: Record<string, unknown>; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await getDoc(cacheDocRef);
    if (snap.exists()) {
      cached = snap.data() as CacheDoc;
    }
  } catch (err) {
    console.warn("Schools cache read failed (continuing without cache):", err);
  }

  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs > TTL_MS) {
      fetchAndUpdateCache(constituencySlug, cacheDocRef);
    }
    return NextResponse.json({ ...cached.data, source: "cache" });
  }

  try {
    const fresh = await generateFreshData(constituencySlug);

    try {
      await setDoc(cacheDocRef, {
        data: fresh,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("Schools cache write failed (returning fresh anyway):", err);
    }

    return NextResponse.json(fresh);
  } catch {
    return NextResponse.json({
      schools: BRAINTREE_SCHOOLS,
      summary: buildSummary(BRAINTREE_SCHOOLS),
      source: "fallback",
    });
  }
}

function buildSummary(schools: School[]) {
  return {
    total: schools.length,
    primary: schools.filter((s) => s.type === "Primary").length,
    secondary: schools.filter((s) => s.type === "Secondary").length,
    special: schools.filter((s) => s.type === "Special").length,
    outstanding: schools.filter((s) => s.ofstedRating === "Outstanding").length,
    good: schools.filter((s) => s.ofstedRating === "Good").length,
    requiresImprovement: schools.filter((s) => s.ofstedRating === "Requires Improvement").length,
    inadequate: schools.filter((s) => s.ofstedRating === "Inadequate").length,
  };
}
