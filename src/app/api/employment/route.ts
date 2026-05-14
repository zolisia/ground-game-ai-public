import { NextResponse } from "next/server";
import { doc, getDoc, setDoc, type DocumentReference } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";

// NOMIS (ONS) Labour Market Statistics — free, no auth required
// Docs: https://www.nomisweb.co.uk/api/v01/
// NM_127_1: Model-based unemployment estimates (available at district level)
// NM_162_1: Claimant count (JSA + UC) (available at district level)
// NM_17_5: Annual Population Survey (country-level only — NOT available at district level)
//
// Geography: NOMIS accepts multiple geography-type codes for the same district
// (e.g. TYPE434 "1820328091" and the older-type "1778384987" both resolve to
// Braintree / geogcode E07000067 for NM_127_1). We use the data-layer
// `nomisCode` (1778…) where available; the BRAINTREE_LAD_NOMIS fallback below
// is the TYPE434 form that predates the data layer.

const TTL_MS = 24 * 60 * 60 * 1000;

const BRAINTREE_LAD_NOMIS = "1820328091";

// GB-level geography code for NM_127_1
const GB_GEO = "2092957699";

interface UnemploymentObs {
  item: { value: number; description: string };
  obs_value: { value: number | string; description: string };
  time: { value: string; description: string };
  unit: { description: string };
}

interface UnemploymentResponse {
  obs?: UnemploymentObs[];
  error?: string;
}

interface ClaimantObs {
  obs_value: { value: number | string; description: string };
  time: { value: string; description: string };
  date?: { description: string };
}

interface ClaimantDataResponse {
  obs?: ClaimantObs[];
  error?: string;
}

interface EmploymentData {
  indicators: {
    name: string;
    value: number;
    unit: string;
    gbAvg: number | null;
    period: string;
  }[];
  claimantCount: {
    rate: number | null;
    count: number | null;
    trend: string;
    period: string;
  };
  source: string;
  sourceUrl: string;
}

async function generateFreshData(ladNomis: string): Promise<EmploymentData | null> {
  try {
    // Fetch unemployment estimates, claimant count, and GB comparison in parallel
    const [unemploymentRes, claimantRes, gbUnemploymentRes] = await Promise.all([
      // NM_127_1: Model-based unemployment estimates for the LAD
      // item=1 (count), item=2 (rate)
      fetch(
        `https://www.nomisweb.co.uk/api/v01/dataset/NM_127_1.data.json?geography=${ladNomis}&date=latest&measures=20100`,
        { next: { revalidate: 86400 } }
      ),
      // NM_162_1: Claimant count (JSA + UC)
      // gender=0 (all), age=0 (all ages), measure=1 (count)
      // Use latestMINUS2 because the most recent month is often provisional/empty
      fetch(
        `https://www.nomisweb.co.uk/api/v01/dataset/NM_162_1.data.json?geography=${ladNomis}&date=latestMINUS2&gender=0&age=0&measure=1&measures=20100`,
        { next: { revalidate: 86400 } }
      ),
      // GB-level unemployment for comparison
      fetch(
        `https://www.nomisweb.co.uk/api/v01/dataset/NM_127_1.data.json?geography=${GB_GEO}&date=latest&measures=20100`,
        { next: { revalidate: 86400 } }
      ),
    ]);

    // Parse unemployment estimates
    const indicators: {
      name: string;
      value: number;
      unit: string;
      gbAvg: number | null;
      period: string;
    }[] = [];

    let gbUnemploymentRate: number | null = null;

    // Parse GB-level unemployment rate for comparison
    if (gbUnemploymentRes.ok) {
      const gbData: UnemploymentResponse = await gbUnemploymentRes.json();
      if (gbData.obs && Array.isArray(gbData.obs)) {
        for (const obs of gbData.obs) {
          // item 2 = unemployment rate
          if (obs.item?.value === 2) {
            const val = typeof obs.obs_value?.value === "number" ? obs.obs_value.value : parseFloat(String(obs.obs_value?.value));
            if (!isNaN(val)) gbUnemploymentRate = val;
          }
        }
      }
    }

    if (unemploymentRes.ok) {
      const data: UnemploymentResponse = await unemploymentRes.json();
      if (data.obs && Array.isArray(data.obs)) {
        for (const obs of data.obs) {
          const rawValue = obs.obs_value?.value;
          const value = typeof rawValue === "number" ? rawValue : parseFloat(String(rawValue));
          const period = obs.time?.description || "latest";

          if (isNaN(value)) continue;

          // Only include the unemployment rate, not the raw count
          if (obs.item?.value === 2) {
            indicators.push({
              name: "Unemployment rate (model-based)",
              value,
              unit: "%",
              gbAvg: gbUnemploymentRate,
              period,
            });
          }
        }
      }
    }

    // Parse claimant count
    let claimantCount: {
      rate: number | null;
      count: number | null;
      trend: string;
      period: string;
    } = { rate: null, count: null, trend: "stable", period: "latest" };

    if (claimantRes.ok) {
      const claimantData: ClaimantDataResponse = await claimantRes.json();
      if (claimantData.obs && Array.isArray(claimantData.obs)) {
        const obs = claimantData.obs[0];
        if (obs) {
          const rawValue = obs.obs_value?.value;
          const count = typeof rawValue === "number" ? rawValue : parseFloat(String(rawValue));
          claimantCount = {
            rate: null, // Rate not reliably available from NOMIS for districts
            count: isNaN(count) ? null : count,
            trend: "stable",
            period: obs.time?.description || obs.date?.description || "latest",
          };
        }
      }
    }

    // Fetch previous year claimant count for trend
    try {
      const prevRes = await fetch(
        `https://www.nomisweb.co.uk/api/v01/dataset/NM_162_1.data.json?geography=${ladNomis}&date=latestMINUS14&gender=0&age=0&measure=1&measures=20100`,
        { next: { revalidate: 86400 } }
      );
      if (prevRes.ok) {
        const prevData: ClaimantDataResponse = await prevRes.json();
        if (prevData.obs?.[0] && claimantCount.count != null) {
          const rawPrev = prevData.obs[0].obs_value?.value;
          const prevCount = typeof rawPrev === "number" ? rawPrev : parseFloat(String(rawPrev));
          if (!isNaN(prevCount) && prevCount > 0) {
            const changePercent = ((claimantCount.count - prevCount) / prevCount) * 100;
            if (changePercent > 5) claimantCount.trend = "rising";
            else if (changePercent < -5) claimantCount.trend = "falling";
            else claimantCount.trend = "stable";
          }
        }
      }
    } catch {
      // Non-critical
    }

    return {
      indicators,
      claimantCount,
      source: "NOMIS/ONS",
      sourceUrl: "https://www.nomisweb.co.uk/",
    };
  } catch (err) {
    console.error("Employment data fetch failed:", err);
    return null;
  }
}

async function fetchAndUpdateCache(
  ladNomis: string,
  cacheDocRef: DocumentReference
) {
  try {
    const fresh = await generateFreshData(ladNomis);
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
    console.error("Background employment cache update failed:", err);
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

  // Try data-layer LAD NOMIS code (first LAD for multi-LAD constituencies),
  // else Braintree-only fallback. Multi-LAD constituencies use the first LAD
  // only — acceptable approximation; aggregating across LADs would require
  // separate per-LAD requests and weighted recombination.
  const ladNomis =
    constituencyData.areas?.lads?.[0]?.nomisCode?.toString() ??
    (constituencySlug === "braintree" ? BRAINTREE_LAD_NOMIS : null);

  if (!ladNomis) {
    return Response.json(
      {
        error: "Employment data not available",
        message: "LAD NOMIS code not yet sourced for this constituency",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }

  const cacheDocRef = doc(db, "employment_cache", constituencySlug);

  try {
    const snap = await getDoc(cacheDocRef);
    const cached = snap.exists() ? snap.data() : null;

    if (cached) {
      const ageMs = Date.now() - new Date(cached.updated_at).getTime();
      if (ageMs > TTL_MS) {
        fetchAndUpdateCache(ladNomis, cacheDocRef);
      }
      return NextResponse.json({ ...cached.data, source: "cache" });
    }

    const fresh = await generateFreshData(ladNomis);
    if (!fresh) {
      return NextResponse.json(
        { indicators: [], claimantCount: null, error: "Failed to fetch employment data" },
        { status: 500 }
      );
    }

    await setDoc(cacheDocRef, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json(fresh);
  } catch {
    return NextResponse.json(
      { indicators: [], claimantCount: null, error: "Failed to fetch employment data" },
      { status: 500 }
    );
  }
}
