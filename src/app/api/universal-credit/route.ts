import { NextResponse } from "next/server";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const dynamic = "force-dynamic";

// Nomis / ONS Claimant Count — free, no auth required
// Dataset NM_162_1: Claimant count by constituency
// NOMIS geography code 721420347 = Braintree (wpca24 constituency type)

const TTL_MS = 24 * 60 * 60 * 1000;
const cacheDoc = doc(db, "universal_credit_cache", "braintree");

const CONSTITUENCY_CODE = "721420347";
const BASE_URL = "https://www.nomisweb.co.uk/api/v01/dataset/NM_162_1.data.json";

interface NomisNestedField {
  value: string | number;
  description?: string;
}

interface NomisObs {
  time: NomisNestedField;
  obs_value: NomisNestedField;
  measures: NomisNestedField;
  gender: NomisNestedField;
  age: NomisNestedField;
  unit: NomisNestedField;
  obs_status: NomisNestedField;
}

interface UniversalCreditData {
  current: { count: number | null; rate: number | null; date: string | null };
  trend: { date: string; count: number }[];
  byAge: { label: string; count: number; percentage: number }[];
  source: string;
  sourceUrl: string;
}

function getVal(field: NomisNestedField | undefined): number {
  if (!field) return 0;
  const v = field.value;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function getStr(field: NomisNestedField | undefined): string {
  if (!field) return "";
  return field.description || String(field.value);
}

// Build explicit month list: last 12 months as YYYY-MM
function buildMonthRange(n: number): string {
  const months: string[] = [];
  const now = new Date();
  for (let i = n; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    months.push(`${yyyy}-${mm}`);
  }
  return months.join(",");
}

async function generateFreshData(): Promise<UniversalCreditData | null> {
  try {
    const timeRange = buildMonthRange(12);

    // Fetch current + trend + age breakdown in parallel
    const [currentRes, trendRes, ageRes] = await Promise.allSettled([
      // Latest count + rate
      fetch(
        `${BASE_URL}?geography=${CONSTITUENCY_CODE}&time=latestMINUS2&measures=20100,20201&gender=0&age=0`,
        { next: { revalidate: 86400 } }
      ),
      // Last 12 months trend — count only
      fetch(
        `${BASE_URL}?geography=${CONSTITUENCY_CODE}&time=${timeRange}&measures=20100&gender=0&age=0`,
        { next: { revalidate: 86400 } }
      ),
      // Age breakdown — latest month, all age bands
      fetch(
        `${BASE_URL}?geography=${CONSTITUENCY_CODE}&time=latestMINUS2&measures=20100&gender=0&c_age=1...10`,
        { next: { revalidate: 86400 } }
      ),
    ]);

    // Parse current count
    const current: { count: number | null; rate: number | null; date: string | null } = {
      count: null,
      rate: null,
      date: null,
    };
    if (currentRes.status === "fulfilled" && currentRes.value.ok) {
      const data = await currentRes.value.json();
      const obs: NomisObs[] = data?.obs ?? [];
      for (const o of obs) {
        const measuresVal = String(o.measures?.value);
        const obsVal = getVal(o.obs_value);
        const date = getStr(o.time);
        if (measuresVal === "20100" && obsVal > 10) {
          current.count = obsVal;
          current.date = date;
        } else if (measuresVal === "20201" && obsVal > 0 && obsVal < 100) {
          current.rate = obsVal;
        }
      }
    }

    // If count still null, try latestMINUS3
    if (!current.count) {
      try {
        const fb = await fetch(
          `${BASE_URL}?geography=${CONSTITUENCY_CODE}&time=latestMINUS3&measures=20100&gender=0&age=0`,
          { next: { revalidate: 86400 } }
        );
        if (fb.ok) {
          const d = await fb.json();
          for (const o of (d?.obs ?? []) as NomisObs[]) {
            const v = getVal(o.obs_value);
            if (v > 100) {
              current.count = v;
              current.date = getStr(o.time);
              break;
            }
          }
        }
      } catch { /* ignore */ }
    }

    // Parse trend — only keep actual counts (> 100)
    let trend: { date: string; count: number }[] = [];
    if (trendRes.status === "fulfilled" && trendRes.value.ok) {
      const data = await trendRes.value.json();
      const obs: NomisObs[] = data?.obs ?? [];
      trend = obs
        .map((o) => ({
          date: getStr(o.time),
          count: getVal(o.obs_value),
        }))
        .filter((t) => t.count > 100); // Real counts are always > 100, rates are < 100
    }

    // Parse age breakdown
    const byAge: { label: string; count: number; percentage: number }[] = [];
    if (ageRes.status === "fulfilled" && ageRes.value.ok) {
      const data = await ageRes.value.json();
      const obs: NomisObs[] = data?.obs ?? [];
      let total = 0;
      const raw: { label: string; count: number }[] = [];
      for (const o of obs) {
        const count = getVal(o.obs_value);
        const label = getStr(o.age);
        if (count > 0 && label) {
          raw.push({ label, count });
          total += count;
        }
      }
      for (const r of raw) {
        byAge.push({
          label: r.label,
          count: r.count,
          percentage: total > 0 ? (r.count / total) * 100 : 0,
        });
      }
    }

    return {
      current,
      trend,
      byAge,
      source: current.count !== null ? "live" : "empty",
      sourceUrl: "https://www.nomisweb.co.uk/",
    };
  } catch (err) {
    console.error("Universal Credit API error:", err);
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
    console.error("Background universal credit cache update failed:", err);
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
      return NextResponse.json(
        { current: null, trend: [], byAge: [], error: "Failed to fetch claimant count data" },
        { status: 500 }
      );
    }

    await setDoc(cacheDoc, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json(fresh);
  } catch {
    return NextResponse.json(
      { current: null, trend: [], byAge: [], error: "Failed to fetch claimant count data" },
      { status: 500 }
    );
  }
}
