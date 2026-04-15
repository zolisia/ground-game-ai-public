import { NextResponse } from "next/server";

// Force dynamic — needs runtime env vars (APIFY_API_TOKEN)
export const dynamic = "force-dynamic";
export const maxDuration = 30; // Apify sync calls can take up to 25s

// Social media mentions feed for the MP
// Primary: X/Twitter API (when X_BEARER_TOKEN is configured)
// Fallback: Apify Twitter scraper (when APIFY_API_TOKEN is configured)
// Final fallback: static sample data

interface SocialMention {
  text: string;
  author: string;
  authorHandle: string;
  url: string;
  date: string;
  platform: "x" | "bluesky" | "other";
  likes: number;
  retweets: number;
  isVerified: boolean;
}

const MP_NAME = "James Cleverly";
const MP_HANDLE = "JamesCleverly";

export async function GET() {
  const hasXToken = !!process.env.X_BEARER_TOKEN;
  const hasApifyToken = !!process.env.APIFY_API_TOKEN;
  const apifyTokenPrefix = process.env.APIFY_API_TOKEN?.substring(0, 8) || "none";

  console.log(`[mentions] env check: X_BEARER_TOKEN=${hasXToken}, APIFY_API_TOKEN=${hasApifyToken} (prefix: ${apifyTokenPrefix}...)`);

  // Try X API first
  if (process.env.X_BEARER_TOKEN) {
    try {
      const mentions = await fetchFromXApi();
      if (mentions.length > 0) {
        return NextResponse.json({
          mentions,
          total: mentions.length,
          source: "x_api",
        });
      }
    } catch (err) {
      console.error("X API error:", err);
    }
  }

  // Try Apify Twitter scraper
  if (process.env.APIFY_API_TOKEN) {
    try {
      console.log("[mentions] Attempting Apify fetch...");
      const mentions = await fetchFromApify();
      console.log(`[mentions] Apify returned ${mentions.length} mentions`);
      if (mentions.length > 0) {
        return NextResponse.json({
          mentions,
          total: mentions.length,
          source: "apify",
        });
      }
      // Apify returned 0 results — still report it tried
      return NextResponse.json({
        mentions: [],
        total: 0,
        source: "apify_empty",
        message: "Apify connected but no recent mentions found",
      });
    } catch (err) {
      console.error("Apify error:", err);
      return NextResponse.json({
        mentions: [],
        total: 0,
        source: "apify_error",
        message: `Apify error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // No API keys configured — return unavailable state (no fake data)
  return NextResponse.json({
    mentions: [],
    total: 0,
    source: "unavailable",
    message: `Social monitoring requires API configuration. X=${hasXToken}, Apify=${hasApifyToken}`,
  });
}

async function fetchFromXApi(): Promise<SocialMention[]> {
  const query = encodeURIComponent(`@${MP_HANDLE} OR "${MP_NAME}" -is:retweet`);
  const url = `https://api.x.com/2/tweets/search/recent?query=${query}&max_results=20&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=name,username,verified`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.X_BEARER_TOKEN}`,
    },
    next: { revalidate: 900 },
  });

  if (!res.ok) throw new Error(`X API: ${res.status}`);

  const data = await res.json();
  const users = new Map<string, { name: string; username: string; verified: boolean }>();

  for (const user of data.includes?.users || []) {
    users.set(user.id, {
      name: user.name,
      username: user.username,
      verified: user.verified || false,
    });
  }

  return (data.data || []).map((tweet: {
    id: string;
    text: string;
    author_id: string;
    created_at: string;
    public_metrics: { like_count: number; retweet_count: number };
  }) => {
    const author = users.get(tweet.author_id);
    return {
      text: tweet.text,
      author: author?.name || "Unknown",
      authorHandle: author?.username || "",
      url: `https://x.com/${author?.username || "i"}/status/${tweet.id}`,
      date: tweet.created_at,
      platform: "x" as const,
      likes: tweet.public_metrics?.like_count || 0,
      retweets: tweet.public_metrics?.retweet_count || 0,
      isVerified: author?.verified || false,
    };
  });
}

async function fetchFromApify(): Promise<SocialMention[]> {
  const token = process.env.APIFY_API_TOKEN;

  // Try multiple actor configurations — different actors have different input schemas
  const actorConfigs = [
    {
      actor: "quacker/twitter-scraper",
      input: {
        searchTerms: [`@${MP_HANDLE}`, MP_NAME],
        maxTweets: 20,
        sort: "Latest",
      },
    },
    {
      actor: "apidojo/tweet-scraper",
      input: {
        startUrls: [{ url: `https://x.com/search?q=${encodeURIComponent(`@${MP_HANDLE} OR "${MP_NAME}"`)}&src=typed_query&f=live` }],
        maxItems: 20,
        sort: "Latest",
      },
    },
    {
      actor: "apify/twitter-scraper",
      input: {
        searchTerms: [`@${MP_HANDLE} OR "${MP_NAME}"`],
        maxTweets: 20,
        tweetLanguage: "en",
      },
    },
  ];

  for (const config of actorConfigs) {
    try {
      console.log(`[mentions] Trying Apify actor: ${config.actor}`);
      // Use run-sync with a timeout — Vercel functions have limited execution time
      const res = await fetch(
        `https://api.apify.com/v2/acts/${config.actor}/run-sync-get-dataset-items?token=${token}&timeout=20`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config.input),
          signal: AbortSignal.timeout(22000), // 22s client timeout
        }
      );

      console.log(`[mentions] ${config.actor} responded: ${res.status} ${res.statusText}`);
      if (!res.ok) continue;

      const tweets = await res.json();
      const validTweets = (tweets || []).filter((t: {
        full_text?: string;
        text?: string;
      }) => {
        const text = t.full_text || t.text || "";
        return text.length > 10;
      });

      if (validTweets.length === 0) continue;

      return validTweets.slice(0, 20).map((t: {
        full_text?: string;
        text?: string;
        user?: { name: string; screen_name: string; verified: boolean };
        author?: { userName?: string; name?: string; isVerified?: boolean };
        id_str?: string;
        id?: string;
        created_at?: string;
        createdAt?: string;
        favorite_count?: number;
        favoriteCount?: number;
        retweet_count?: number;
        retweetCount?: number;
        tweetUrl?: string;
        url?: string;
      }) => ({
        text: t.full_text || t.text || "",
        author: t.user?.name || t.author?.name || "Unknown",
        authorHandle: t.user?.screen_name || t.author?.userName || "",
        url: t.tweetUrl || t.url || `https://x.com/${t.user?.screen_name || t.author?.userName || "i"}/status/${t.id_str || t.id || ""}`,
        date: t.created_at || t.createdAt || new Date().toISOString(),
        platform: "x" as const,
        likes: t.favorite_count || t.favoriteCount || 0,
        retweets: t.retweet_count || t.retweetCount || 0,
        isVerified: t.user?.verified || t.author?.isVerified || false,
      }));
    } catch {
      continue;
    }
  }

  return [];
}

