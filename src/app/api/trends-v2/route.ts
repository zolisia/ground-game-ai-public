import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getFullData } from "@/data";
import googleTrends from "google-trends-api";

export const dynamic = "force-dynamic";

// google-trends-api scrapes Google's private Trends endpoints and was last
// published 2020-12-28, so any of the three section calls below can break
// without notice if Google rotates their internal API. Each section is
// wrapped to fail independently — a partial result still updates the cache;
// total failure preserves the previous cache. The `freshness` field on the
// response shows which sections succeeded on the most recent attempt.

const TTL_MS = 12 * 60 * 60 * 1000;

const GEO_GB = "GB";
const GEO_ENGLAND = "GB-ENG";
const INTEREST_BY_REGION_DELAY_MS = 600;

// Strip peerage/knighthood honorifics so trends queries match how people
// actually search. Most people Google "James Cleverly," not "Sir James Cleverly."
const HONORIFICS = ["Sir ", "Dame ", "Lord ", "Lady ", "Baroness ", "Baron "];
function stripHonorific(name: string): string {
  for (const h of HONORIFICS) {
    if (name.startsWith(h)) return name.slice(h.length);
  }
  return name;
}

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
  regionValue: number | null;
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
        return { title, traffic, articleCount: articles.length, relatedQueries };
      })
      .filter((t: TrendingSearch) => t.title);
  } catch (err) {
    console.error("Trends: dailyTrends failed:", err);
    return [];
  }
}

async function safeInterestOverTime(
  mpName: string,
  constituencyName: string
): Promise<InterestOverTimePoint[]> {
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

async function safeInterestByRegion(
  keywords: string[],
  regionName: string
): Promise<RegionalComparison[]> {
  const startTime = new Date();
  startTime.setDate(startTime.getDate() - 90);
  const results: RegionalComparison[] = [];

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
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

      const regionEntry = withData.find(
        (r) => r.geoName?.toLowerCase() === regionName.toLowerCase()
      );
      const regionValue = regionEntry?.value?.[0] ?? null;

      let rank: number | null = null;
      if (regionValue !== null && withData.length > 0) {
        const sorted = [...withData].sort(
          (a, b) => (b.value?.[0] ?? 0) - (a.value?.[0] ?? 0)
        );
        const idx = sorted.findIndex(
          (r) => r.geoName?.toLowerCase() === regionName.toLowerCase()
        );
        rank = idx >= 0 ? idx + 1 : null;
      }

      results.push({
        keyword,
        regionValue,
        nationalAverage: Math.round(nationalAverage * 10) / 10,
        rank,
        totalRegions: withData.length,
      });
    } catch (err) {
      console.error(`Trends: interestByRegion failed for "${keyword}":`, err);
    }

    if (i < keywords.length - 1) {
      await new Promise((r) => setTimeout(r, INTEREST_BY_REGION_DELAY_MS));
    }
  }

  return results;
}

async function generateFreshData(
  mpName: string,
  constituencyName: string,
  region: string,
  keywords: string[]
): Promise<TrendsData | null> {
  const [trending, interest, regional] = await Promise.all([
    safeDailyTrends(),
    safeInterestOverTime(mpName, constituencyName),
    safeInterestByRegion(keywords, region),
  ]);

  if (!trending.length && !interest.length && !regional.length) return null;

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
    keywordsUsed: keywords,
    mpName,
    constituencyName,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const constituencySlug = searchParams.get("constituency") || "braintree";
  const force = searchParams.get("force") === "1";

  const fullData = getFullData(constituencySlug);
  if (!fullData) {
    return Response.json({ error: "Invalid constituency slug" }, { status: 400 });
  }

  const constituencyName = fullData.constituency.name;
  const mpNameRaw = fullData.mp?.name ?? fullData.constituency.mp;
  const mpName = stripHonorific(mpNameRaw);
  const region = fullData.constituency.region;

  const keywords = [
    mpName,
    constituencyName,
    "cost of living",
    "NHS",
    "immigration",
    "council tax",
    "Reform UK",
  ];

  const cacheDocRef = adminDb.collection("trends_cache").doc(constituencySlug);

  type CacheDoc = { data: Record<string, unknown>; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await cacheDocRef.get();
    if (snap.exists) cached = snap.data() as CacheDoc;
  } catch (err) {
    console.warn("Trends cache read failed (continuing without cache):", err);
  }

  if (cached && !force) {
    const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
    if (cacheAge > TTL_MS) {
      (async () => {
        try {
          const fresh = await generateFreshData(mpName, constituencyName, region, keywords);
          if (fresh) await cacheDocRef.set({ data: fresh, updated_at: new Date().toISOString() });
        } catch (err) {
          console.warn("Trends v2 background refresh failed:", err);
        }
      })();
    }
    return NextResponse.json({ ...cached.data, cached: true, _cachedAt: new Date(cached.updated_at).getTime() });
  }

  const fresh = await generateFreshData(mpName, constituencyName, region, keywords);
  if (!fresh) {
    return NextResponse.json(
      {
        trendingSearches: [],
        interestOverTime: [],
        regionalVsNational: [],
        source: "Google Trends (via google-trends-api, last published 2020-12-28)",
        sourceUrl: "https://trends.google.com",
        note: "No cached data available and upstream fetch failed.",
        keywordsUsed: keywords,
        mpName,
        constituencyName,
        error: "Failed to fetch",
      },
      { status: 500 }
    );
  }

  const cachedAt = Date.now();
  try {
    await cacheDocRef.set({ data: fresh, updated_at: new Date(cachedAt).toISOString() });
  } catch (err) {
    console.warn("Trends cache write failed (returning fresh anyway):", err);
  }

  return NextResponse.json({ ...fresh, _cachedAt: cachedAt });
}
