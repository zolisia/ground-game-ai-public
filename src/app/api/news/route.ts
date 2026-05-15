import { NextResponse } from "next/server";
import { getFullData } from "@/data";

// Force dynamic — fetches live external data
export const dynamic = "force-dynamic";

// Braintree-only curated local news feeds. Used when slug === "braintree" to
// preserve the existing higher-coverage local-newspaper sources (Essex Live,
// Braintree & Witham Times, EADT) that aren't in the data layer. For other
// constituencies, the 3 standard feeds from constituencyData.newsFeeds
// (BBC regional + Google constituency search + Google MP search) are used.
// Per-constituency local-newspaper sources would be better follow-up work.
const BRAINTREE_FEEDS = [
  { name: "BBC Essex", url: "https://feeds.bbci.co.uk/news/england/essex/rss.xml" },
  { name: "Google News - Braintree", url: "https://news.google.com/rss/search?q=Braintree+Essex&hl=en-GB&gl=GB&ceid=GB:en" },
  { name: "Google News - Cleverly", url: "https://news.google.com/rss/search?q=James+Cleverly&hl=en-GB&gl=GB&ceid=GB:en" },
  { name: "Essex Live", url: "https://www.essexlive.news/news/?service=rss" },
  { name: "Braintree & Witham Times", url: "https://www.braintreeandwithamtimes.co.uk/news/rss/" },
  { name: "East Anglian Daily Times", url: "https://www.eadt.co.uk/rss" },
];

interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet: string;
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

  // Decide feed list: Braintree curated, else build from newsFeeds object.
  // ~107 non-English constituencies have no newsFeeds populated — return a
  // clean 400 for those.
  let feeds: Array<{ name: string; url: string }>;
  if (constituencySlug === "braintree") {
    feeds = BRAINTREE_FEEDS;
  } else if (constituencyData.newsFeeds) {
    const nf = constituencyData.newsFeeds;
    feeds = [
      { name: "BBC Regional", url: nf.bbcRegional },
      { name: "Google News - Constituency", url: nf.googleConstituency },
      { name: "Google News - MP", url: nf.googleMp },
    ];
  } else {
    return Response.json(
      {
        error: "News feeds not available",
        message: "News feed URLs not yet sourced for this constituency",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }

  const allItems: FeedItem[] = [];

  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, {
        next: { revalidate: 900 }, // Cache for 15 minutes
        headers: { "User-Agent": "GroundGameAI/1.0" },
      });

      if (!res.ok) continue;

      const text = await res.text();
      const items = parseRSS(text, feed.name);
      allItems.push(...items);
    } catch {
      // Skip failed feeds
    }
  }

  // Sort by date, newest first
  allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  // De-duplicate by link. Sort runs first so the newest entry for a given URL
  // wins; items without a link (link === "#") fall back to title-based dedup
  // so we don't collapse every link-less item into one.
  const seen = new Set<string>();
  const deduped = allItems.filter((item) => {
    const key = item.link && item.link !== "#" ? item.link : `title:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ items: deduped.slice(0, 20) });
}

function parseRSS(xml: string, source: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const pubDate = extractTag(itemXml, "pubDate");
    const description = extractTag(itemXml, "description");

    if (title) {
      items.push({
        title: cleanHtml(title),
        link: link || "#",
        pubDate: pubDate || new Date().toISOString(),
        source,
        snippet: cleanHtml(description || "").slice(0, 200),
      });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? (match[1] || match[2] || "").trim() : "";
}

function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}
