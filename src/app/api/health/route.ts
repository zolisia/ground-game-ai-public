import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// PHE / OHID Fingertips API — free, no auth required
// https://fingertips.phe.org.uk/api/
//
// The /latest_data/* JSON endpoints have returned 500 since early 2026.
// The /all_data/csv/by_indicator_id endpoint still works — it returns all
// historical time periods as a CSV, which we stream-parse, filter to the
// district + England rows, and pick the latest period per indicator.
// The 30-day Firestore cache means this large fetch only happens once/month.

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const FINGERTIPS_CSV = "https://fingertips.phe.org.uk/api/all_data/csv/by_indicator_id";
const ENGLAND = "E92000001";

// Each spec selects one row from the CSV by indicator ID + Sex + Age.
// Significance comes directly from the "Compared to England" text column.
const INDICATOR_SPECS = [
  { id: 90366, name: "Life expectancy (male)",      unit: "years", sex: "Male",    age: "All ages",  invertSig: false },
  { id: 90366, name: "Life expectancy (female)",    unit: "years", sex: "Female",  age: "All ages",  invertSig: false },
  { id: 92443, name: "Smoking prevalence (adults)", unit: "%",     sex: "Persons", age: "18+ yrs",   invertSig: true  },
  { id: 93088, name: "Overweight or obese (adults)",unit: "%",     sex: "Persons", age: "18+ yrs",   invertSig: true  },
  { id: 92313, name: "Employment rate (16-64)",     unit: "%",     sex: "Persons", age: "16-64 yrs", invertSig: false },
];

const INDICATOR_IDS = "90366,92443,93088,92313";

interface HealthIndicator {
  id: number;
  name: string;
  value: number | null;
  unit: string;
  englandAvg: number | null;
  significance: "better" | "similar" | "worse" | "unknown";
  period: string;
}

interface HealthData {
  indicators: HealthIndicator[];
  areaName: string;
  areaCode: string;
  source: string;
  sourceUrl: string;
  note?: string;
}

// Minimal CSV line parser — handles double-quoted fields containing commas.
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      result.push(current); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function sigFromText(text: string, invert: boolean): "better" | "similar" | "worse" | "unknown" {
  const t = text.trim().toLowerCase();
  if (t === "better") return invert ? "worse" : "better";
  if (t === "worse")  return invert ? "better" : "worse";
  if (t === "similar") return "similar";
  return "unknown";
}

async function fetchFromCSV(districtCode: string): Promise<HealthIndicator[]> {
  const url = `${FINGERTIPS_CSV}?indicator_ids=${INDICATOR_IDS}&child_area_type_id=501&parent_area_type_id=15&parent_area_code=${ENGLAND}`;
  const res = await fetch(url, {
    headers: { Accept: "text/csv" },
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`Fingertips CSV ${res.status}`);

  const text = await res.text();
  const lines = text.split("\n");

  // CSV columns (0-indexed): 0=IndicatorId 4=AreaCode 7=Sex 8=Age
  // 9=CategoryType 11=TimePeriod 12=Value 21=ComparedToEngland 23=TimePeriodSortable
  type BestRow = { value: number; sig: string; period: string; sortable: number; englandAvg: number | null };
  const localBest = new Map<string, BestRow>(); // key = "id|sex|age"
  const englandBest = new Map<string, BestRow>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    if (cols.length < 24) continue;

    const areaCode    = cols[4].trim();
    const categoryType = cols[9].trim();
    if (categoryType !== "") continue; // skip breakdowns
    if (areaCode !== districtCode && areaCode !== ENGLAND) continue;

    const indicatorId = parseInt(cols[0], 10);
    const sex         = cols[7].trim();
    const age         = cols[8].trim();
    const sortable    = parseInt(cols[23], 10) || 0;
    const value       = parseFloat(cols[12]);
    const sig         = cols[21].trim();
    const period      = cols[11].trim();

    if (isNaN(value)) continue;

    const key = `${indicatorId}|${sex}|${age}`;
    const map = areaCode === ENGLAND ? englandBest : localBest;
    const existing = map.get(key);
    if (!existing || sortable > existing.sortable) {
      map.set(key, { value, sig, period, sortable, englandAvg: null });
    }
  }

  const indicators: HealthIndicator[] = [];
  for (const spec of INDICATOR_SPECS) {
    const key = `${spec.id}|${spec.sex}|${spec.age}`;
    const local   = localBest.get(key);
    const england = englandBest.get(key);
    if (!local) continue;
    indicators.push({
      id: spec.id,
      name: spec.name,
      value: local.value,
      unit: spec.unit,
      englandAvg: england?.value ?? null,
      significance: sigFromText(local.sig, spec.invertSig),
      period: local.period,
    });
  }
  return indicators;
}

async function generateFreshData(
  districtCode: string,
  districtName: string,
  constituencySlug: string
): Promise<HealthData> {
  try {
    const indicators = await fetchFromCSV(districtCode);
    if (indicators.length > 0) {
      return {
        indicators,
        areaName: districtName,
        areaCode: districtCode,
        source: "PHE Fingertips",
        sourceUrl: "https://fingertips.phe.org.uk",
      };
    }
  } catch (err) {
    console.error("Health CSV fetch failed:", err);
  }
  return getFallbackData(districtCode, districtName);
}

function getFallbackData(
  districtCode: string,
  districtName: string,
): HealthData {
  return {
    indicators: [],
    areaName: districtName,
    areaCode: districtCode,
    source: "PHE Fingertips (unavailable)",
    sourceUrl: "https://fingertips.phe.org.uk",
    note: "Health data temporarily unavailable.",
  };
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

  // Pick the primary LAD/LTLA for Fingertips. Some constituencies span
  // multiple districts (Braintree itself covers Braintree + Uttlesford);
  // Fingertips doesn't aggregate across them, so we use the first LAD as
  // primary. ~107 non-English constituencies have no areas data — return a
  // clean 400 for those, matching the other multi-constituency routes.
  const primaryLad = constituencyData.areas?.lads?.[0];
  if (!primaryLad) {
    return Response.json(
      {
        error: "Health data not available",
        message: "Local authority district not yet sourced for this constituency",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }
  const districtCode = primaryLad.code;
  const districtName = primaryLad.name;

  const cacheDocRef = adminDb.collection("health_cache").doc(constituencySlug);

  type CacheDoc = { data: Record<string, unknown>; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await cacheDocRef.get();
    if (snap.exists) {
      cached = snap.data() as CacheDoc;
    }
  } catch (err) {
    console.warn("Health cache read failed (continuing without cache):", err);
  }

  if (cached && !force) {
    const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
    if (cacheAge > TTL_MS) {
      (async () => {
        try {
          const fresh = await generateFreshData(districtCode, districtName, constituencySlug);
          await cacheDocRef.set({ data: fresh, updated_at: new Date().toISOString() });
        } catch (err) {
          console.warn("Health background refresh failed:", err);
        }
      })();
    }
    return NextResponse.json({ ...cached.data, source: "cache", _cachedAt: new Date(cached.updated_at).getTime() });
  }

  try {
    const fresh = await generateFreshData(districtCode, districtName, constituencySlug);

    const cachedAt = Date.now();
    try {
      await cacheDocRef.set({
        data: fresh,
        updated_at: new Date(cachedAt).toISOString(),
      });
    } catch (err) {
      console.warn("Health cache write failed (returning fresh anyway):", err);
    }

    return NextResponse.json({ ...fresh, _cachedAt: cachedAt });
  } catch (err) {
    console.error("Health route error:", err);
    return NextResponse.json(getFallbackData(districtCode, districtName));
  }
}

