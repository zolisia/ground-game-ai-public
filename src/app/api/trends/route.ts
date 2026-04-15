import { NextResponse } from "next/server";

// Force dynamic — needs runtime env vars (SERPAPI_KEY)
export const dynamic = "force-dynamic";

// Google Trends data via SerpAPI
// Returns trending searches and interest over time for constituency-relevant terms

interface TrendItem {
  query: string;
  value: number;
  rising?: boolean;
}

export async function GET() {
  const apiKey = process.env.SERPAPI_KEY;

  // If no API key, return unavailable state (no fake data)
  if (!apiKey) {
    return NextResponse.json({
      trends: [],
      relatedQueries: [],
      source: "unavailable",
      message: "Search trends require SerpAPI configuration",
    });
  }

  try {
    // Use Google Trends comparison mode — one API call returns relative interest for all terms
    // This is more efficient (1 call vs N) and gives properly comparable values
    const comparisonTerms = ["James Cleverly", "Reform UK", "Labour Party"];
    const localTerms = ["Braintree Essex", "Braintree council"];

    const results: TrendItem[] = [];

    // Comparison query — all terms in one call gives relative interest scores
    const compQ = comparisonTerms.join(",");
    const compUrl = `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(compQ)}&geo=GB&date=today+3-m&api_key=${apiKey}`;
    const compRes = await fetch(compUrl, { next: { revalidate: 3600 } });

    if (compRes.ok) {
      const compData = await compRes.json();
      const timeline = compData.interest_over_time?.timeline_data || [];
      if (timeline.length > 0) {
        const latest = timeline[timeline.length - 1];
        const values = latest.values || [];
        for (let i = 0; i < comparisonTerms.length; i++) {
          const val = values[i]?.extracted_value;
          if (val !== undefined) {
            results.push({
              query: comparisonTerms[i],
              value: val,
            });
          }
        }
      }
    }

    // Local interest queries — separate calls
    for (const q of localTerms) {
      try {
        const url = `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(q)}&geo=GB&date=today+3-m&api_key=${apiKey}`;
        const res = await fetch(url, { next: { revalidate: 3600 } });
        if (res.ok) {
          const data = await res.json();
          const timeline = data.interest_over_time?.timeline_data || [];
          if (timeline.length > 0) {
            const latest = timeline[timeline.length - 1];
            results.push({
              query: q,
              value: latest.values?.[0]?.extracted_value || 0,
            });
          }
        }
      } catch {
        // Skip failed individual queries
      }
    }

    // Fetch related queries for the constituency
    const relatedUrl = `https://serpapi.com/search.json?engine=google_trends&q=Braintree+Essex&geo=GB&data_type=RELATED_QUERIES&api_key=${apiKey}`;
    const relatedRes = await fetch(relatedUrl, { next: { revalidate: 3600 } });
    let relatedQueries: TrendItem[] = [];

    if (relatedRes.ok) {
      const relatedData = await relatedRes.json();
      const rising = relatedData.related_queries?.rising || [];
      relatedQueries = rising.slice(0, 8).map((item: Record<string, string>) => ({
        query: item.query,
        value: parseInt(item.value) || 0,
        rising: true,
      }));
    }

    return NextResponse.json({
      trends: results,
      relatedQueries,
      source: results.length > 0 ? "live" : "unavailable",
      ...(results.length === 0 && { message: "No trend data returned from SerpAPI" }),
    });
  } catch {
    return NextResponse.json({
      trends: [],
      relatedQueries: [],
      source: "unavailable",
      message: "Failed to fetch trend data from SerpAPI",
    });
  }
}

