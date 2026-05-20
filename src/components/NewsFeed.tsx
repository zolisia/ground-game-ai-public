"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet: string;
}

export default function NewsFeed() {
  const { slug } = useConstituency();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withConstituency("/api/news", slug));
      if (!res.ok) throw new Error("Failed to fetch news");
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setError("Unable to load news feed");
      // Fall back to mock data
      setItems(getMockNews());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse space-y-2">
            <div className="h-3.5 bg-zinc-800 rounded w-3/4" />
            <div className="h-2.5 bg-zinc-800/50 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 text-xs text-yellow-400">
          {error} — showing sample data
        </div>
      )}
      <div className="divide-y divide-zinc-800/50">
        {items.map((item, i) => (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-4 py-3 hover:bg-zinc-800/30 transition-colors group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm text-zinc-200 font-medium leading-snug group-hover:text-emerald-400 transition-colors line-clamp-2">
                  {item.title}
                </h3>
                {item.snippet && (
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{item.snippet}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-zinc-600">
                  <span className="text-emerald-500/70 font-medium">{item.source}</span>
                  <span>&middot;</span>
                  <span>{formatDate(item.pubDate)}</span>
                </div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-zinc-600 group-hover:text-emerald-400 mt-0.5 flex-shrink-0" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return "Yesterday";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

function getMockNews(): NewsItem[] {
  return [
    {
      title: "Braintree District Council approves new housing development near Panfield",
      link: "#",
      pubDate: new Date(Date.now() - 2 * 3600000).toISOString(),
      source: "Braintree & Witham Times",
      snippet: "Plans for 250 new homes on the edge of Braintree have been approved by the planning committee despite local opposition.",
    },
    {
      title: "Essex Police report drop in anti-social behaviour across Braintree district",
      link: "#",
      pubDate: new Date(Date.now() - 5 * 3600000).toISOString(),
      source: "Essex Live",
      snippet: "Anti-social behaviour incidents have fallen by 12% compared to the same period last year.",
    },
    {
      title: "A120 roadworks cause delays for Braintree commuters",
      link: "#",
      pubDate: new Date(Date.now() - 8 * 3600000).toISOString(),
      source: "BBC Essex",
      snippet: "National Highways warns of significant delays as resurfacing work continues on the A120 between Braintree and Marks Tey.",
    },
    {
      title: "Local MP James Cleverly visits new apprenticeship scheme in Witham",
      link: "#",
      pubDate: new Date(Date.now() - 12 * 3600000).toISOString(),
      source: "Braintree & Witham Times",
      snippet: "The Braintree MP praised the initiative which aims to create 50 new apprenticeship places for young people.",
    },
    {
      title: "Halstead care home rated 'outstanding' by CQC inspectors",
      link: "#",
      pubDate: new Date(Date.now() - 18 * 3600000).toISOString(),
      source: "Halstead Gazette",
      snippet: "The care home received top marks in all five inspection categories.",
    },
    {
      title: "Essex County Council announces school funding boost for rural areas",
      link: "#",
      pubDate: new Date(Date.now() - 24 * 3600000).toISOString(),
      source: "Essex Chronicle",
      snippet: "Schools in the Braintree district will receive an additional £1.2m in funding for the next academic year.",
    },
    {
      title: "Coggeshall heritage festival draws record crowds",
      link: "#",
      pubDate: new Date(Date.now() - 30 * 3600000).toISOString(),
      source: "East Anglian Daily Times",
      snippet: "Over 5,000 visitors attended the annual celebration of the town's medieval wool trade history.",
    },
    {
      title: "Plans unveiled for new GP surgery to serve growing Braintree population",
      link: "#",
      pubDate: new Date(Date.now() - 36 * 3600000).toISOString(),
      source: "Essex Live",
      snippet: "The new facility aims to address growing patient numbers following recent housing developments in the area.",
    },
  ];
}
