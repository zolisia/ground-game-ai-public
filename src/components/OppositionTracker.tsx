"use client";

import { useEffect, useState } from "react";
import { ExternalLink, AlertCircle, RefreshCw } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

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

interface OppositionData {
  opponents: Opponent[];
  lastUpdated: string;
  source: "apify" | "static" | "candidates_only";
  message?: string;
}

const ACTIVITY_INDICATORS: Record<string, { dot: string; label: string }> = {
  high: { dot: "\uD83D\uDD34", label: "High" },
  medium: { dot: "\uD83D\uDFE1", label: "Medium" },
  low: { dot: "\uD83D\uDFE2", label: "Low" },
  unknown: { dot: "\u26AA", label: "Not monitored" },
};

export default function OppositionTracker() {
  const { slug } = useConstituency();
  const [data, setData] = useState<OppositionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedParty, setExpandedParty] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withConstituency("/api/opposition", slug));
      if (!res.ok) throw new Error("Failed to fetch opposition data");
      const json: OppositionData = await res.json();
      setData(json);
    } catch {
      setError("Unable to load opposition data");
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
      <div className="p-4 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-8 bg-muted rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-muted rounded w-1/3" />
                <div className="h-2.5 bg-muted/50 rounded w-1/4" />
              </div>
            </div>
            <div className="h-2.5 bg-muted/30 rounded w-full mt-2" />
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

  if (!data) return null;

  return (
    <div>
      {data.source === "candidates_only" && (
        <div className="px-4 py-2 bg-muted/40 border-b border-border/30 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">
            Showing 2024 election candidates — social activity monitoring not yet configured
          </span>
        </div>
      )}

      <div className="divide-y divide-zinc-800/50">
        {data.opponents.map((opponent) => {
          const activity = ACTIVITY_INDICATORS[opponent.activityLevel];
          const isExpanded = expandedParty === opponent.party;

          return (
            <div key={opponent.party}>
              <button
                onClick={() => setExpandedParty(isExpanded ? null : opponent.party)}
                className="w-full px-4 py-3 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {/* Party color badge */}
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ backgroundColor: opponent.color }}
                  >
                    {opponent.party
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200">
                        {opponent.party}
                      </span>
                      <span className="text-[11px]" title={`Activity: ${activity.label}`}>
                        {activity.dot}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <span>{opponent.candidate}</span>
                      <span>&middot;</span>
                      <span className="text-emerald-500/70">{opponent.handle}</span>
                      <span>&middot;</span>
                      <span>{opponent.followers}</span>
                    </div>
                  </div>

                  <svg
                    className={`h-4 w-4 text-zinc-600 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded post list */}
              {isExpanded && opponent.recentPosts.length > 0 && (
                <div className="px-4 pb-3 space-y-2">
                  {opponent.recentPosts.map((post, i) => (
                    <div
                      key={i}
                      className="ml-11 p-2.5 bg-muted/40 rounded-md border border-border/60"
                    >
                      <p className="text-xs text-zinc-300 leading-relaxed line-clamp-3">
                        {post.text}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-600">
                        <span>{formatDate(post.date)}</span>
                        <span>{post.likes} likes</span>
                        <span>{post.retweets} RTs</span>
                        {post.url && post.url !== "#" && (
                          <a
                            href={post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-500/70 hover:text-emerald-400 flex items-center gap-0.5"
                          >
                            <ExternalLink className="h-2.5 w-2.5" /> View
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isExpanded && opponent.recentPosts.length === 0 && (
                <div className="ml-11 px-4 pb-3">
                  <p className="text-xs text-zinc-600 italic">
                    {data.source === "candidates_only"
                      ? "Social activity tracking requires Apify API configuration"
                      : "No recent posts found"}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border/50 flex items-center justify-between text-[11px] text-zinc-600">
        <span>
          Updated {formatDate(data.lastUpdated)}
        </span>
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
