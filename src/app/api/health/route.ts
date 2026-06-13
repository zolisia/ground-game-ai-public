import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";

// PHE / OHID Fingertips API — free, no auth required
// https://fingertips.phe.org.uk/api/
//
// STATUS (early 2026): the Fingertips data endpoints (/latest_data/*,
// /all_data/*) are intermittently returning 500 errors. The metadata
// endpoints (/area_types, /available_data) still work. We try multiple API
// patterns and fall back to cached static data when the API is unavailable.
//
// The static fallback below is a Braintree-only snapshot from the last known
// good Fingertips response, so we only use it for slug === "braintree". For
// every other constituency the live API works when it works; when it fails,
// we return an empty indicator list with a note rather than misattribute
// Braintree's figures to another area.

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // Fingertips updates annually — monthly refresh is enough

const FINGERTIPS_API = "https://fingertips.phe.org.uk/api";

// England benchmark area (used to compare against).
const ENGLAND = "E92000001";

// Key health indicator IDs
const INDICATORS: Record<number, { name: string; unit: string; invertSignificance?: boolean }> = {
  90366: { name: "Life expectancy (male)", unit: "years" },
  90362: { name: "Life expectancy (female)", unit: "years" },
  92443: { name: "Smoking prevalence (adults)", unit: "%", invertSignificance: true },
  93088: { name: "Obesity prevalence (adults)", unit: "%", invertSignificance: true },
  93505: { name: "Child excess weight (Year 6)", unit: "%", invertSignificance: true },
  92313: { name: "Under-75 mortality (all causes)", unit: "per 100,000", invertSignificance: true },
  93495: { name: "Depression prevalence", unit: "%", invertSignificance: true },
  90630: { name: "Fuel poverty", unit: "%", invertSignificance: true },
};

const INDICATOR_IDS = Object.keys(INDICATORS).join(",");

// Area type IDs changed in 2023:
// 101 = old lower tier local authorities (pre-2020)
// 301 = lower tier local authorities (Apr 2020 - Mar 2021)
// 501 = lower tier local authorities (post Apr 2023, current)
const AREA_TYPE_IDS = [501, 301, 101];

interface FingertipsDataPoint {
  IndicatorId: number;
  AreaCode: string;
  Val: number | null;
  Count: number | null;
  Denom: number | null;
  Sig: Record<string, number> | null;
  TimePeriod: string;
  TimePeriodSortable: number;
  CategoryTypeId?: number;
}

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

function getSignificance(
  sig: Record<string, number> | null,
  inverted: boolean
): "better" | "similar" | "worse" | "unknown" {
  if (!sig) return "unknown";
  // Fingertips significance values: 1=worse, 2=similar, 3=better (vs England benchmark)
  const sigValue = Object.values(sig)[0];
  if (sigValue === undefined || sigValue === null) return "unknown";
  if (sigValue === 3) return inverted ? "worse" : "better";
  if (sigValue === 1) return inverted ? "better" : "worse";
  if (sigValue === 2) return "similar";
  return "unknown";
}

function formatPeriod(timePeriod: string): string {
  return timePeriod;
}

// Try fetching from Fingertips with multiple area type IDs / strategies.
async function tryFingertipsFetch(districtCode: string): Promise<FingertipsDataPoint[] | null> {
  for (const areaTypeId of AREA_TYPE_IDS) {
    // Strategy 1: specific indicators for child areas of England
    try {
      const url = `${FINGERTIPS_API}/latest_data/specific_indicators_for_child_areas?indicator_ids=${INDICATOR_IDS}&parent_area_code=${ENGLAND}&child_area_type_id=${areaTypeId}&parent_area_type_id=15`;
      const res = await fetch(url, {
        next: { revalidate: 86400 },
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("json")) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            return data;
          }
        }
      }
    } catch {
      // Try next strategy
    }

    // Strategy 2: by area code directly
    try {
      const url = `${FINGERTIPS_API}/latest_data/by_area_code?area_code=${districtCode}&area_type_id=${areaTypeId}`;
      const res = await fetch(url, {
        next: { revalidate: 86400 },
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("json")) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            return data;
          }
        }
      }
    } catch {
      // Try next area type
    }
  }

  return null;
}

async function generateFreshData(
  districtCode: string,
  districtName: string,
  constituencySlug: string
): Promise<HealthData> {
  try {
    const data = await tryFingertipsFetch(districtCode);

    if (data && data.length > 0) {
      const localData = data.filter(
        (d) => d.AreaCode === districtCode && !d.CategoryTypeId
      );
      const englandData = data.filter(
        (d) => d.AreaCode === ENGLAND && !d.CategoryTypeId
      );

      const indicators = processIndicators(
        localData.length > 0 ? localData : data.filter((d) => !d.CategoryTypeId),
        englandData.length > 0 ? englandData : null
      );

      if (indicators.length > 0) {
        return {
          indicators,
          areaName: districtName,
          areaCode: districtCode,
          source: "PHE Fingertips",
          sourceUrl: "https://fingertips.phe.org.uk",
        };
      }
    }
  } catch (err) {
    console.error("Health API error:", err);
  }

  return getFallbackData(districtCode, districtName, constituencySlug);
}

function getFallbackData(
  districtCode: string,
  districtName: string,
  constituencySlug: string
): HealthData {
  // The static fallback below is a Braintree-only snapshot. For any other
  // constituency, return an empty result rather than mislabel Braintree's
  // stats as theirs.
  if (constituencySlug !== "braintree") {
    return {
      indicators: [],
      areaName: districtName,
      areaCode: districtCode,
      source: "PHE Fingertips (unavailable)",
      sourceUrl: "https://fingertips.phe.org.uk",
      note: "Fingertips data endpoints are currently unavailable. Static fallback not yet sourced for this constituency.",
    };
  }

  return {
    indicators: FALLBACK_INDICATORS,
    areaName: districtName,
    areaCode: districtCode,
    source: "PHE Fingertips (cached)",
    sourceUrl: "https://fingertips.phe.org.uk",
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
    return NextResponse.json(getFallbackData(districtCode, districtName, constituencySlug));
  }
}

function processIndicators(
  localData: FingertipsDataPoint[],
  englandData: FingertipsDataPoint[] | null
): HealthIndicator[] {
  const indicators: HealthIndicator[] = [];

  const localByIndicator = new Map<number, FingertipsDataPoint>();
  for (const d of localData) {
    const indicatorMeta = INDICATORS[d.IndicatorId];
    if (!indicatorMeta) continue;
    const existing = localByIndicator.get(d.IndicatorId);
    if (!existing || d.TimePeriodSortable > existing.TimePeriodSortable) {
      localByIndicator.set(d.IndicatorId, d);
    }
  }

  const englandByIndicator = new Map<number, FingertipsDataPoint>();
  if (englandData) {
    for (const d of englandData) {
      if (!INDICATORS[d.IndicatorId]) continue;
      const existing = englandByIndicator.get(d.IndicatorId);
      if (!existing || d.TimePeriodSortable > existing.TimePeriodSortable) {
        englandByIndicator.set(d.IndicatorId, d);
      }
    }
  }

  for (const [indicatorId, meta] of Object.entries(INDICATORS)) {
    const id = Number(indicatorId);
    const localPoint = localByIndicator.get(id);
    const englandPoint = englandByIndicator.get(id);

    if (!localPoint) continue;

    indicators.push({
      id,
      name: meta.name,
      value: localPoint.Val,
      unit: meta.unit,
      englandAvg: englandPoint?.Val ?? null,
      significance: getSignificance(
        localPoint.Sig,
        meta.invertSignificance ?? false
      ),
      period: formatPeriod(localPoint.TimePeriod),
    });
  }

  return indicators;
}

// Static fallback data from last known good Fingertips data for Braintree
const FALLBACK_INDICATORS: HealthIndicator[] = [
  { id: 90366, name: "Life expectancy (male)", value: 81.2, unit: "years", englandAvg: 79.4, significance: "better", period: "2020-22" },
  { id: 90362, name: "Life expectancy (female)", value: 84.1, unit: "years", englandAvg: 83.1, significance: "similar", period: "2020-22" },
  { id: 92443, name: "Smoking prevalence (adults)", value: 11.8, unit: "%", englandAvg: 12.7, significance: "similar", period: "2022" },
  { id: 93088, name: "Obesity prevalence (adults)", value: 24.3, unit: "%", englandAvg: 25.9, significance: "similar", period: "2021/22" },
  { id: 93505, name: "Child excess weight (Year 6)", value: 32.1, unit: "%", englandAvg: 37.8, significance: "better", period: "2022/23" },
  { id: 92313, name: "Under-75 mortality (all causes)", value: 285.4, unit: "per 100,000", englandAvg: 306.8, significance: "better", period: "2020-22" },
  { id: 93495, name: "Depression prevalence", value: 13.2, unit: "%", englandAvg: 12.7, significance: "similar", period: "2022/23" },
  { id: 90630, name: "Fuel poverty", value: 11.9, unit: "%", englandAvg: 13.1, significance: "similar", period: "2022" },
];
