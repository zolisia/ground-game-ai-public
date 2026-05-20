"use client";

import { useEffect, useState } from "react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

// Match the actual API response shape from /api/universal-credit
interface UCData {
  current: {
    count: number | null;
    rate: number | null;
    date: string | null;
  };
  trend: { date: string; count: number }[];
  byAge: { label: string; count: number; percentage: number }[];
  source: string;
  sourceUrl: string;
  error?: string;
}

const AGE_COLORS = [
  "bg-emerald-500",
  "bg-emerald-400",
  "bg-teal-400",
  "bg-cyan-400",
  "bg-sky-400",
  "bg-blue-400",
  "bg-indigo-400",
  "bg-violet-400",
];

export default function UniversalCreditPanel() {
  const { slug } = useConstituency();
  const [data, setData] = useState<UCData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(withConstituency("/api/universal-credit", slug))
      .then((res) => res.json())
      .then((d: UCData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-zinc-800 rounded w-40 mb-4" />
        <div className="h-16 bg-zinc-900 rounded-xl mb-3" />
        <div className="h-24 bg-zinc-900 rounded-xl mb-3" />
        <div className="h-20 bg-zinc-900 rounded-xl" />
      </div>
    );
  }

  if (!data || data.error) {
    return <p className="text-zinc-500 text-xs">Universal Credit data unavailable</p>;
  }

  const trend = data.trend ?? [];

  // If current count is 0 or null, fall back to the most recent non-zero trend value
  let claimantCount = data.current?.count;
  const claimantRate = data.current?.rate;
  let period = data.current?.date ?? "";

  if (!claimantCount || claimantCount === 0) {
    const lastNonZero = [...trend].reverse().find((t) => t.count > 0);
    if (lastNonZero) {
      claimantCount = lastNonZero.count;
      period = lastNonZero.date;
    }
  }
  const ageBreakdown = data.byAge ?? [];

  // Sparkline helpers — guard against empty arrays
  const trendValues = trend.map((t) => t.count).filter((v) => v > 0);
  const trendMin = trendValues.length > 0 ? Math.min(...trendValues) : 0;
  const trendMax = trendValues.length > 0 ? Math.max(...trendValues) : 1;
  const trendRange = trendMax - trendMin || 1;

  return (
    <div className="space-y-4">
      {/* Headline figures */}
      <div className="bg-zinc-900 rounded-xl p-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Claimant Count
          </div>
          <div className="text-xl font-bold text-zinc-100 mt-0.5">
            {claimantCount != null && claimantCount > 0
              ? Number(claimantCount).toLocaleString()
              : "—"}
          </div>
        </div>
        <div className="text-right">
          {claimantRate != null && claimantRate > 0 && (
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Rate
              </div>
              <div className="text-lg font-bold text-zinc-100 mt-0.5">
                {Number(claimantRate).toFixed(1)}%
              </div>
            </div>
          )}
          {period && (
            <div className="text-[10px] text-zinc-600 mt-1">{period}</div>
          )}
        </div>
      </div>

      {/* 12-month trend sparkline */}
      {trendValues.length > 1 && (
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
            12-Month Trend
          </div>
          <div className="bg-zinc-900 rounded-xl p-3">
            <svg
              viewBox={`0 0 ${trend.length * 10} 40`}
              className="w-full h-10"
              preserveAspectRatio="none"
            >
              <polyline
                fill="none"
                stroke="#34d399"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={trend
                  .filter((t) => t.count > 0)
                  .map((t, i) => {
                    const x = i * 10;
                    const y = 38 - ((t.count - trendMin) / trendRange) * 36;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            </svg>
            <div className="flex justify-between text-[9px] text-zinc-600 mt-1">
              <span>{trend[0]?.date}</span>
              <span>{trend[trend.length - 1]?.date}</span>
            </div>
          </div>
        </div>
      )}

      {/* Age breakdown stacked bar */}
      {ageBreakdown.length > 0 && (
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
            Age Breakdown
          </div>
          <div className="bg-zinc-900 rounded-xl p-3">
            <div className="flex h-4 rounded-full overflow-hidden">
              {ageBreakdown.map((seg, i) => (
                <div
                  key={seg.label}
                  className={`${AGE_COLORS[i % AGE_COLORS.length]} transition-all`}
                  style={{ width: `${seg.percentage}%` }}
                  title={`${seg.label}: ${seg.percentage.toFixed(1)}%`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {ageBreakdown.map((seg, i) => (
                <div key={seg.label} className="flex items-center gap-1">
                  <div
                    className={`h-2 w-2 rounded-full ${AGE_COLORS[i % AGE_COLORS.length]}`}
                  />
                  <span className="text-[9px] text-zinc-400">
                    {seg.label} ({seg.percentage.toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
