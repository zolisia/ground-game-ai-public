import { NextResponse } from "next/server";

// Force dynamic — needs runtime env vars (APIFY_API_TOKEN)
export const dynamic = "force-dynamic";

interface OpponentPost {
  text: string;
  date: string;
  likes: number;
  retweets: number;
  url: string;
}

interface Opponent {
  party: string;
  candidate: string;
  handle: string;
  followers: string;
  recentPosts: OpponentPost[];
  activityLevel: "high" | "medium" | "low" | "unknown";
  color: string;
}

interface ApifyTweet {
  full_text?: string;
  text?: string;
  created_at?: string;
  createdAt?: string;
  favorite_count?: number;
  favoriteCount?: number;
  retweet_count?: number;
  retweetCount?: number;
  url?: string;
  id_str?: string;
  id?: string;
  tweetUrl?: string;
  author?: { userName?: string };
}

// Real 2024 General Election candidates for Braintree constituency
// Source: Electoral Commission results
const CANDIDATES = [
  {
    party: "Reform UK",
    candidate: "Richard Thomson",
    handle: "",
    votes2024: 11346,
    votePct: "23.14%",
    color: "#12B6CF",
    searchTerms: ["Reform UK Braintree", "Reform Braintree Essex"],
    councilRep: "Nathan Robins", // First Reform councillor on Braintree DC
    councilHandle: "@NathanRobinsUK",
  },
  {
    party: "Labour",
    candidate: "Matthew Wright",
    handle: "@MatthewKWright",
    votes2024: 13744,
    votePct: "28.03%",
    color: "#DC241f",
    searchTerms: ["Labour Braintree", "MatthewKWright Braintree"],
    councilRep: "",
    councilHandle: "",
  },
  {
    party: "Liberal Democrats",
    candidate: "Kieron Franks",
    handle: "@k_afranks",
    votes2024: 2879,
    votePct: "5.87%",
    color: "#FAA61A",
    searchTerms: ["Lib Dems Braintree", "Liberal Democrats Braintree"],
    councilRep: "",
    councilHandle: "",
  },
  {
    party: "Green Party",
    candidate: "Paul Thorogood",
    handle: "",
    votes2024: 2878,
    votePct: "5.87%",
    color: "#6AB023",
    searchTerms: ["Green Party Braintree", "Green Braintree Essex"],
    councilRep: "Paul Thorogood", // Also a Braintree DC councillor (Eastern & Kelvedon/Feering)
    councilHandle: "",
  },
];

const APIFY_ACTOR = "apidojo/twitter-scraper-lite";
const APIFY_BASE = "https://api.apify.com/v2/acts";

async function fetchFromApify(): Promise<Opponent[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return [];

  const results: Opponent[] = [];

  for (const candidate of CANDIDATES) {
    try {
      // Search for each party's mentions separately
      const searchQuery = candidate.searchTerms[0];
      const res = await fetch(
        `${APIFY_BASE}/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            searchTerms: [searchQuery],
            maxItems: 5,
            sort: "Latest",
          }),
        }
      );

      let recentPosts: OpponentPost[] = [];
      let activityLevel: "high" | "medium" | "low" = "low";

      if (res.ok) {
        const tweets: ApifyTweet[] = await res.json();
        const validTweets = tweets.filter((t) => {
          const text = t.full_text || t.text || "";
          return text.length > 10; // filter out empty results
        });

        recentPosts = validTweets.slice(0, 3).map((t) => ({
          text: (t.full_text || t.text || "").slice(0, 280),
          date: t.created_at || t.createdAt || new Date().toISOString(),
          likes: t.favorite_count || t.favoriteCount || 0,
          retweets: t.retweet_count || t.retweetCount || 0,
          url: t.tweetUrl || t.url || `https://x.com/i/status/${t.id_str || t.id || ""}`,
        }));

        activityLevel = validTweets.length > 4 ? "high" : validTweets.length > 1 ? "medium" : "low";
      }

      results.push({
        party: candidate.party,
        candidate: candidate.candidate,
        handle: candidate.handle || candidate.councilHandle || "",
        followers: candidate.votePct ? `${candidate.votePct} (2024)` : "N/A",
        recentPosts,
        activityLevel,
        color: candidate.color,
      });
    } catch {
      // If Apify fails for this candidate, add them with static data
      results.push({
        party: candidate.party,
        candidate: candidate.candidate,
        handle: candidate.handle || candidate.councilHandle || "",
        followers: candidate.votePct ? `${candidate.votePct} (2024)` : "N/A",
        recentPosts: [],
        activityLevel: "low",
        color: candidate.color,
      });
    }
  }

  return results;
}

function getCandidateInfo(): Opponent[] {
  // Return real candidate data from the 2024 General Election — no fake social posts
  return CANDIDATES.map((c) => ({
    party: c.party,
    candidate: c.candidate,
    handle: c.handle || c.councilHandle || "",
    followers: c.votePct ? `${c.votePct} (2024)` : "N/A",
    recentPosts: [],
    activityLevel: "unknown" as "high" | "medium" | "low",
    color: c.color,
  }));
}

export async function GET() {
  // Try Apify first
  const apifyData = await fetchFromApify();

  // Check if Apify returned any actual posts
  const hasApifyPosts = apifyData.some((o) => o.recentPosts.length > 0);

  if (hasApifyPosts) {
    return NextResponse.json({
      opponents: apifyData,
      lastUpdated: new Date().toISOString(),
      source: "apify" as const,
    });
  }

  // No Apify data — return real candidate info without fake social posts
  return NextResponse.json({
    opponents: getCandidateInfo(),
    lastUpdated: new Date().toISOString(),
    source: "candidates_only" as const,
    message: "Social activity monitoring not yet configured",
  });
}
