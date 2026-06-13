"use client";

import { useEffect, useState } from "react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

// Match the actual API response from /api/cqc
interface LocationResult {
  name: string;
  type: string;
  rating: string;
  lastInspection: string;
  beds?: number;
  reportUrl?: string;
  cqcUrl?: string;
}

interface RatingSummary {
  outstanding: number;
  good: number;
  requiresImprovement: number;
  inadequate: number;
}

interface CQCData {
  summary: RatingSummary;
  locations: LocationResult[];
  totalFound: number;
  detailsFetched?: number;
  source: string;
  sourceUrl: string;
  error?: string;
}

const RATING_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; badgeBg: string; badgeText: string }
> = {
  Outstanding: {
    label: "Outstanding",
    color: "text-teal-400",
    bgColor: "bg-teal-500/10",
    badgeBg: "bg-teal-500/20",
    badgeText: "text-teal-400",
  },
  Good: {
    label: "Good",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    badgeBg: "bg-green-500/20",
    badgeText: "text-green-400",
  },
  "Requires improvement": {
    label: "Req. Improvement",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    badgeBg: "bg-amber-500/20",
    badgeText: "text-amber-400",
  },
  Inadequate: {
    label: "Inadequate",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    badgeBg: "bg-red-500/20",
    badgeText: "text-red-400",
  },
};

function RatingBadge({ rating }: { rating: string }) {
  const config = RATING_CONFIG[rating] ?? {
    label: rating || "Not rated",
    badgeBg: "bg-zinc-700",
    badgeText: "text-zinc-300",
  };
  return (
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${config.badgeBg} ${config.badgeText}`}
    >
      {config.label}
    </span>
  );
}

function formatDate(d: string): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

export default function CQCPanel() {
  const { slug } = useConstituency();
  const [data, setData] = useState<CQCData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(withConstituency("/api/cqc", slug))
      .then((res) => res.json())
      .then((d: CQCData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-muted rounded w-40 mb-4" />
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-xl" />
          ))}
        </div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.error) {
    return <p className="text-zinc-500 text-xs">CQC data unavailable</p>;
  }

  const summary = data.summary ?? { outstanding: 0, good: 0, requiresImprovement: 0, inadequate: 0 };
  const locations = data.locations ?? [];
  const total = data.totalFound ?? locations.length;

  const summaryCards = [
    {
      key: "outstanding",
      ...RATING_CONFIG["Outstanding"],
      count: summary.outstanding,
    },
    {
      key: "good",
      ...RATING_CONFIG["Good"],
      count: summary.good,
    },
    {
      key: "requiresImprovement",
      ...RATING_CONFIG["Requires improvement"],
      count: summary.requiresImprovement,
    },
    {
      key: "inadequate",
      ...RATING_CONFIG["Inadequate"],
      count: summary.inadequate,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((card) => (
          <div
            key={card.key}
            className={`${card.bgColor} rounded-xl p-3 text-center`}
          >
            <div className={`text-2xl font-bold ${card.color}`}>
              {card.count}
            </div>
            <div className="text-[10px] text-zinc-400 uppercase tracking-wider mt-1">
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="text-[10px] text-zinc-500 text-center">
        {total} registered locations
      </div>

      {/* Locations list */}
      {locations.length > 0 && (
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
            Inspected Locations
          </div>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
            {locations.map((loc, i) => (
              <div
                key={i}
                className="bg-muted rounded-xl px-3 py-2 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-zinc-200 truncate">
                    {loc.cqcUrl ? (
                      <a
                        href={loc.cqcUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-emerald-400 transition-colors inline-flex items-center gap-1"
                      >
                        {loc.name}
                        <svg
                          className="w-3 h-3 shrink-0 text-zinc-500"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"
                          />
                        </svg>
                      </a>
                    ) : (
                      loc.name
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 flex items-center gap-2 mt-0.5">
                    <span>{loc.type}</span>
                    {loc.lastInspection && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span>Inspected {formatDate(loc.lastInspection)}</span>
                      </>
                    )}
                  </div>
                </div>
                <RatingBadge rating={loc.rating} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
