import { NextResponse } from "next/server";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getFullData } from "@/data";
import googleTrends from "google-trends-api";

export const dynamic = "force-dynamic";

// First API route to consume the @/data layer as the single source of truth
// for MP name and constituency name. Every other API route in this folder
// still hardcodes these values (e.g. parliament/route.ts has a literal MP_ID
// constant). Lifting all routes onto the data layer is tracked in TODO.md
// under "Constituency config refactor."
//
// google-trends-api scrapes Google's private Trends endpoints and was last
// published 2020-12-28, so any of the three section calls below can break
// without notice if Google rotates their internal API. Each section is
// wrapped to fail independently — a partial result still updates the cache;
// total failure preserves the previous cache. The `freshness` field on the
// response shows which sections succeeded on the most recent attempt.

const TTL_MS = 12 * 60 * 60 * 1000;
const CONSTITUENCY_SLUG = "braintree";
const cacheDoc = doc(db, "trends_cache", CONSTITUENCY_SLUG);

// Strip peerage/knighthood honorifics from the start of the MP name so that
// trends queries match how people actually search. Most people Google "James
// Cleverly," not "Sir James Cleverly." The data layer keeps the formal title;
// this stripping only affects what we send to Google Trends.
const HONORIFICS = ["Sir ", "Dame ", "Lord ", "Lady ", "Baroness ", "Baron "];
function stripHonorific(name: string): string {
  for (const h of HONORIFICS) {
    if (name.startsWith(h)) return name.slice(h.length);
  }
  return name;
}

const fullData = getFullData(CONSTITUENCY_SLUG);
const constituencyName = fullData?.constituency?.name ?? "the local constituency";
const mpNameRaw = fullData?.mp?.name ?? fullData?.constituency?.mp ?? "the local MP";
const mpName = stripHonorific(mpNameRaw);

const KEYWORDS = [
  mpName,
  constituencyName,
  "cost of living",
  "NHS",
  "immigration",
  "council tax",
  "Reform UK",
];

const GEO_GB = "GB";
const GEO_ENGLAND = "GB-ENG";
const EAST_OF_ENGLAND_NAME = "East of England";
const INTEREST_BY_REGION_DELAY_MS = 600;

interface TrendingSearch {
  title: string;
  traffic: string;
  articleCount: number;
  relatedQueries: string[];
}

interface InterestOverTimePoint {
  date: string;
  formattedDate: string;
  values: Record<string, number>;
}

interface RegionalComparison {
  keyword: string;
  eastOfEnglandValue: number | null;
  nationalAverage: number;
  rank: number | null;
  totalRegions: number;
}

type SectionStatus = "ok" | "failed";

interface FreshnessReport {
  trendingSearches: SectionStatus;
  interestOverTime: SectionStatus;
  regionalVsNational: SectionStatus;
}

interface TrendsData {
  trendingSearches: TrendingSearch[];
  interestOverTime: InterestOverTimePoint[];
  regionalVsNational: RegionalComparison[];
  fetched_at: string;
  source: string;
  sourceUrl: string;
  note: string;
  freshness: FreshnessReport;
  keywordsUsed: string[];
  mpName: string;
  constituencyName: string;
}

async function safeDailyTrends(): Promise<TrendingSearch[]> {
  try {
    const raw = await googleTrends.dailyTrends({ geo: GEO_GB });
    const parsed = JSON.parse(raw);
    const days = parsed?.default?.trendingSearchesDays ?? [];
    if (!days.length) return [];

    const today = days[0]?.trendingSearches ?? [];
    return today
      .slice(0, 20)
      .map((item: Record<string, unknown>) => {
        const title = (item?.title as { query?: string })?.query ?? "";
        const traffic = (item?.formattedTraffic as string) ?? "";
        const articles = (item?.articles as unknown[]) ?? [];
        const relatedQueries = ((item?.relatedQueries as Array<{ query?: string }>) ?? [])
          .map((q) => q?.query ?? "")
          .filter(Boolean);
        return {
          title,
          traffic,
          articleCount: articles.length,
          relatedQueries,
        };
      })
      .filter((t: TrendingSearch) => t.title);
  } catch (err) {
    console.error("Trends: dailyTrends failed:", err);
    return [];
  }
}

async function safeInterestOverTime(): Promise<InterestOverTimePoint[]> {
  try {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - 90);
    const raw = await googleTrends.interestOverTime({
      keyword: [mpName, constituencyName],
      startTime,
      geo: GEO_ENGLAND,
    });
    const parsed = JSON.parse(raw);
    const timeline = (parsed?.default?.timelineData ?? []) as Array<{
      time?: string;
      formattedTime?: string;
      value?: number[];
    }>;
    return timeline.map((point) => ({
      date: point?.time ?? "",
      formattedDate: point?.formattedTime ?? "",
      values: {
        [mpName]: point?.value?.[0] ?? 0,
        [constituencyName]: point?.value?.[1] ?? 0,
      },
    }));
  } catch (err) {
    console.error("Trends: interestOverTime failed:", err);
    return [];
  }
}

async function safeInterestByRegion(): Promise<RegionalComparison[]> {
  const startTime = new Date();
  startTime.setDate(startTime.getDate() - 90);

  const results: RegionalComparison[] = [];

  for (let i = 0; i < KEYWORDS.length; i++) {
    const keyword = KEYWORDS[i];
    try {
      const raw = await googleTrends.interestByRegion({
        keyword,
        startTime,
        geo: GEO_ENGLAND,
        resolution: "REGION",
      });
      const parsed = JSON.parse(raw);
      const regions = (parsed?.default?.geoMapData ?? []) as Array<{
        geoName?: string;
        value?: number[];
        hasData?: boolean[];
      }>;

      const withData = regions.filter((r) => r.hasData?.[0]);
      const values = withData.map((r) => r.value?.[0] ?? 0);
      const nationalAverage = values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0;

      const eoe = withData.find((r) => r.geoName === EAST_OF_ENGLAND_NAME);
      const eastOfEnglandValue = eoe?.value?.[0] ?? null;

      let rank: number | null = null;
      if (eastOfEnglandValue !== null && withData.length > 0) {
        const sorted = [...withData].sort(
          (a, b) => (b.value?.[0] ?? 0) - (a.value?.[0] ?? 0)
        );
        const idx = sorted.findIndex((r) => r.geoName === EAST_OF_ENGLAND_NAME);
        rank = idx >= 0 ? idx + 1 : null;
      }

      results.push({
        keyword,
        eastOfEnglandValue,
        nationalAverage: Math.round(nationalAverage * 10) / 10,
        rank,
        totalRegions: withData.length,
      });
    } catch (err) {
      console.error(`Trends: interestByRegion failed for "${keyword}":`, err);
    }

    if (i < KEYWORDS.length - 1) {
      await new Promise((r) => setTimeout(r, INTEREST_BY_REGION_DELAY_MS));
    }
  }

  return results;
}

async function generateFreshData(): Promise<TrendsData | null> {
  const [trending, interest, regional] = await Promise.all([
    safeDailyTrends(),
    safeInterestOverTime(),
    safeInterestByRegion(),
  ]);

  if (!trending.length && !interest.length && !regional.length) {
    return null;
  }

  return {
    trendingSearches: trending,
    interestOverTime: interest,
    regionalVsNational: regional,
    fetched_at: new Date().toISOString(),
    source: "Google Trends (via google-trends-api, last published 2020-12-28)",
    sourceUrl: "https://trends.google.com",
    note: "Data may be stale if upstream scrape fails. Check fetched_at and the freshness object to see which sections succeeded on the most recent fetch.",
    freshness: {
      trendingSearches: trending.length ? "ok" : "failed",
      interestOverTime: interest.length ? "ok" : "failed",
      regionalVsNational: regional.length ? "ok" : "failed",
    },
    keywordsUsed: KEYWORDS,
    mpName,
    constituencyName,
  };
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
    console.error("Background trends cache update failed:", err);
  }
}

const EMPTY_PAYLOAD = {
  trendingSearches: [],
  interestOverTime: [],
  regionalVsNational: [],
  source: "Google Trends (via google-trends-api, last published 2020-12-28)",
  sourceUrl: "https://trends.google.com",
  note: "No cached data available and upstream fetch failed.",
  keywordsUsed: KEYWORDS,
  mpName,
  constituencyName,
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";

  try {
    const snap = await getDoc(cacheDoc);
    const cached = snap.exists() ? snap.data() : null;

    if (cached && !forceRefresh) {
      const ageMs = Date.now() - new Date(cached.updated_at).getTime();
      if (ageMs > TTL_MS) {
        fetchAndUpdateCache();
      }
      return NextResponse.json({ ...cached.data, cached: true });
    }

    const fresh = await generateFreshData();
    if (!fresh) {
      return NextResponse.json({ ...EMPTY_PAYLOAD, error: "Failed to fetch" }, { status: 500 });
    }

    await setDoc(cacheDoc, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json(fresh);
  } catch {
    return NextResponse.json({ ...EMPTY_PAYLOAD, error: "Failed to fetch" }, { status: 500 });
  }
}
