import { NextResponse } from "next/server";

// Force dynamic — fetches live external data
export const dynamic = "force-dynamic";

const FEEDS = [
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

export async function GET() {
  const allItems: FeedItem[] = [];

  for (const feed of FEEDS) {
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

  return NextResponse.json({ items: allItems.slice(0, 20) });
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
