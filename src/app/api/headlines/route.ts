import { NextResponse } from "next/server";

// Force dynamic — fetches live external data
export const dynamic = "force-dynamic";

// Two categories of headlines:
// 1. Major headlines from top UK political news outlets
// 2. Daily briefings/newsletters from outlets that publish morning briefings

const NEWS_FEEDS = [
  { name: "BBC", url: "https://feeds.bbci.co.uk/news/politics/rss.xml" },
  { name: "Sky News", url: "https://feeds.skynews.com/feeds/rss/politics.xml" },
  { name: "Guardian", url: "https://www.theguardian.com/politics/rss" },
  { name: "Telegraph", url: "https://www.telegraph.co.uk/politics/rss.xml" },
  { name: "GB News", url: "https://www.gbnews.com/feeds/rss" },
];

const BRIEFING_FEEDS = [
  { name: "Politico", url: "https://www.politico.eu/feed/", briefingKeywords: ["playbook", "briefing", "westminster", "morning"] },
  { name: "BBC", url: "https://feeds.bbci.co.uk/news/politics/rss.xml", briefingKeywords: ["briefing", "round-up", "today in"] },
];

interface HeadlineItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

export async function GET() {
  const allHeadlines: HeadlineItem[] = [];
  const allBriefings: HeadlineItem[] = [];

  // Fetch all feeds in parallel
  const allFeeds = [...NEWS_FEEDS, ...BRIEFING_FEEDS];
  const uniqueUrls = Array.from(new Set(allFeeds.map(f => f.url)));

  const feedResults = await Promise.allSettled(
    uniqueUrls.map(async (url) => {
      try {
        const res = await fetch(url, {
          next: { revalidate: 600 },
          headers: { "User-Agent": "GroundGameAI/1.0" },
        });
        if (!res.ok) return { url, items: [] };
        const text = await res.text();
        return { url, items: parseRSS(text) };
      } catch {
        return { url, items: [] };
      }
    })
  );

  // Build a map of URL -> items
  const feedMap = new Map<string, { title: string; link: string; pubDate: string }[]>();
  for (const result of feedResults) {
    if (result.status === "fulfilled") {
      feedMap.set(result.value.url, result.value.items);
    }
  }

  // Process news headlines
  for (const feed of NEWS_FEEDS) {
    const items = feedMap.get(feed.url) || [];
    for (const item of items) {
      allHeadlines.push({ ...item, source: feed.name });
    }
  }

  // Process briefings — filter for daily briefing/newsletter items
  for (const feed of BRIEFING_FEEDS) {
    const items = feedMap.get(feed.url) || [];
    for (const item of items) {
      const titleLower = item.title.toLowerCase();
      const isBriefing = feed.briefingKeywords.some(kw => titleLower.includes(kw));
      if (isBriefing) {
        allBriefings.push({ ...item, source: feed.name });
      }
    }
  }

  // Sort by date, newest first
  allHeadlines.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );
  allBriefings.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  return NextResponse.json({
    headlines: allHeadlines.slice(0, 20),
    briefings: allBriefings.slice(0, 5),
  });
}

function parseRSS(xml: string): { title: string; link: string; pubDate: string }[] {
  const items: { title: string; link: string; pubDate: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const pubDate = extractTag(itemXml, "pubDate");

    if (title) {
      items.push({
        title: cleanHtml(title),
        link: link || "#",
        pubDate: pubDate || new Date().toISOString(),
      });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(
    new RegExp(
      `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`
    )
  );
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
