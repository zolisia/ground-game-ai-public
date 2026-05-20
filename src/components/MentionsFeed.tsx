"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, AlertCircle, Heart, Repeat2, CheckCircle2 } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

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

interface MentionsData {
  mentions: SocialMention[];
  total: number;
  source: string;
  message?: string;
}

export default function MentionsFeed() {
  const { slug } = useConstituency();
  const [data, setData] = useState<MentionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withConstituency("/api/mentions", slug));
      if (!res.ok) throw new Error("Failed to fetch mentions");
      const json: MentionsData = await res.json();
      setData(json);
    } catch {
      setError("Unable to load social mentions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-zinc-800" />
              <div className="h-3 bg-zinc-800 rounded w-28" />
            </div>
            <div className="h-3 bg-zinc-800/50 rounded w-full ml-9" />
            <div className="h-3 bg-zinc-800/50 rounded w-2/3 ml-9" />
          </div>
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-4 text-center">
        <AlertCircle className="h-5 w-5 text-zinc-500 mx-auto mb-2" />
        <p className="text-sm text-zinc-400">{error}</p>
        <button
          onClick={fetchData}
          className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 mx-auto"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  if (!data || data.mentions.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-zinc-800/60 mb-3">
          <AlertCircle className="h-5 w-5 text-zinc-500" />
        </div>
        <p className="text-sm font-medium text-zinc-400">
          Social monitoring not yet configured
        </p>
        <p className="text-xs text-zinc-600 mt-1.5 max-w-[280px] mx-auto">
          Connect an X API bearer token or Apify API token to track social mentions of your MP.
        </p>
      </div>
    );
  }

  return (
    <div>

      <div className="divide-y divide-zinc-800/30">
        {data.mentions.map((mention, i) => (
          <a
            key={i}
            href={mention.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-3 hover:bg-zinc-800/30 transition-colors group"
          >
            <div className="flex items-start gap-2.5">
              {/* Avatar placeholder */}
              <div className="mt-0.5 shrink-0 h-7 w-7 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                {mention.author.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                {/* Author line */}
                <div className="flex items-center gap-1.5 text-[12px]">
                  <span className="font-semibold text-zinc-200">
                    {mention.author}
                  </span>
                  {mention.isVerified && (
                    <CheckCircle2 className="h-3 w-3 text-blue-400 shrink-0" />
                  )}
                  <span className="text-zinc-600">
                    @{mention.authorHandle}
                  </span>
                  <span className="text-zinc-700">&middot;</span>
                  <span className="text-zinc-600">
                    {formatDate(mention.date)}
                  </span>
                </div>

                {/* Tweet text */}
                <p className="text-[12px] text-zinc-300 mt-0.5 leading-relaxed line-clamp-3">
                  {highlightMentions(mention.text)}
                </p>

                {/* Engagement metrics */}
                <div className="flex items-center gap-4 mt-1.5 text-[11px] text-zinc-600">
                  <span className="flex items-center gap-1 hover:text-red-400 transition-colors">
                    <Heart className="h-3 w-3" />
                    {formatNumber(mention.likes)}
                  </span>
                  <span className="flex items-center gap-1 hover:text-emerald-400 transition-colors">
                    <Repeat2 className="h-3 w-3" />
                    {formatNumber(mention.retweets)}
                  </span>
                  <span className="ml-auto">
                    <ExternalLink className="h-3 w-3 text-zinc-700 group-hover:text-emerald-400" />
                  </span>
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-zinc-800/50 flex items-center justify-between text-[11px] text-zinc-600">
        <span>{data.total} mentions</span>
        <button
          onClick={fetchData}
          className="text-emerald-500/70 hover:text-emerald-400 flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>
    </div>
  );
}

function highlightMentions(text: string): string {
  // Return as-is — React will render it. For rich highlighting we'd need
  // to split into spans, but for now line-clamp handles display.
  return text;
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffHours < 48) return "1d";
    return `${Math.floor(diffHours / 24)}d`;
  } catch {
    return dateStr;
  }
}
