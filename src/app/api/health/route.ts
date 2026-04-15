import { NextResponse } from "next/server";

// Force dynamic — fetches live external data
export const dynamic = "force-dynamic";

// PHE Fingertips API — free, no auth required
// https://fingertips.phe.org.uk/api/
// Fetches public health indicators for Braintree district (E07000067)
//
// NOTE: As of early 2026, the Fingertips data endpoints (/latest_data/*, /all_data/*)
// are intermittently returning 500 errors. The metadata endpoints (/area_types,
// /available_data) still work. We try multiple API patterns and fall back to
// cached static data when the API is unavailable.

const FINGERTIPS_API = "https://fingertips.phe.org.uk/api";

// Area codes
const BRAINTREE_DISTRICT = "E07000067";
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

// Try fetching from Fingertips with multiple area type IDs
async function tryFingertipsFetch(): Promise<FingertipsDataPoint[] | null> {
  // Try each area type ID (newest first)
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
      const url = `${FINGERTIPS_API}/latest_data/by_area_code?area_code=${BRAINTREE_DISTRICT}&area_type_id=${areaTypeId}`;
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

export async function GET() {
  try {
    const data = await tryFingertipsFetch();

    if (data && data.length > 0) {
      // Filter to Braintree and England
      const braintreeData = data.filter(
        (d) => d.AreaCode === BRAINTREE_DISTRICT && !d.CategoryTypeId
      );
      const englandData = data.filter(
        (d) => d.AreaCode === ENGLAND && !d.CategoryTypeId
      );

      const indicators = processIndicators(
        braintreeData.length > 0 ? braintreeData : data.filter((d) => !d.CategoryTypeId),
        englandData.length > 0 ? englandData : null
      );

      if (indicators.length > 0) {
        return NextResponse.json({
          indicators,
          areaName: "Braintree",
          areaCode: BRAINTREE_DISTRICT,
          source: "PHE Fingertips",
          sourceUrl: "https://fingertips.phe.org.uk",
        });
      }
    }

    // API is unavailable or returned no usable data — use static fallback
    return NextResponse.json({
      indicators: FALLBACK_INDICATORS,
      areaName: "Braintree",
      areaCode: BRAINTREE_DISTRICT,
      source: "PHE Fingertips (cached)",
      sourceUrl: "https://fingertips.phe.org.uk",
    });
  } catch (err) {
    console.error("Health API error:", err);
    return NextResponse.json({
      indicators: FALLBACK_INDICATORS,
      areaName: "Braintree",
      areaCode: BRAINTREE_DISTRICT,
      source: "PHE Fingertips (cached)",
      sourceUrl: "https://fingertips.phe.org.uk",
    });
  }
}

function processIndicators(
  braintreeData: FingertipsDataPoint[],
  englandData: FingertipsDataPoint[] | null
): HealthIndicator[] {
  const indicators: HealthIndicator[] = [];

  const braintreeByIndicator = new Map<number, FingertipsDataPoint>();
  for (const d of braintreeData) {
    const indicatorMeta = INDICATORS[d.IndicatorId];
    if (!indicatorMeta) continue;
    const existing = braintreeByIndicator.get(d.IndicatorId);
    if (!existing || d.TimePeriodSortable > existing.TimePeriodSortable) {
      braintreeByIndicator.set(d.IndicatorId, d);
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
    const braintreePoint = braintreeByIndicator.get(id);
    const englandPoint = englandByIndicator.get(id);

    if (!braintreePoint) continue;

    indicators.push({
      id,
      name: meta.name,
      value: braintreePoint.Val,
      unit: meta.unit,
      englandAvg: englandPoint?.Val ?? null,
      significance: getSignificance(
        braintreePoint.Sig,
        meta.invertSignificance ?? false
      ),
      period: formatPeriod(braintreePoint.TimePeriod),
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
