"use client";

import { useEffect, useState } from "react";

interface Indicator {
  name: string;
  value: number;
  unit: string;
  gbAvg: number | null;
  period: string;
}

interface ClaimantCount {
  rate: number | null;
  count: number | null;
  trend: string;
  period: string;
}

interface EmploymentData {
  indicators: Indicator[];
  claimantCount: ClaimantCount | null;
  source: string;
  sourceUrl: string;
  error?: string;
}

// Friendly display names for NOMIS variable descriptions
const DISPLAY_NAMES: Record<string, string> = {
  "Employment rate - aged 16-64": "Employment Rate",
  "Unemployment rate - aged 16+": "Unemployment Rate",
  "Economic inactivity rate - aged 16-64": "Economic Inactivity",
  "Gross weekly pay - median": "Median Weekly Pay",
};

// For these indicators, higher local value = worse outcome
const HIGHER_IS_WORSE = new Set([
  "Unemployment rate - aged 16+",
  "Economic inactivity rate - aged 16-64",
]);

function TrendArrow({ trend }: { trend: string }) {
  if (trend === "rising") return <span className="text-red-400 text-xs ml-1">▲</span>;
  if (trend === "falling") return <span className="text-emerald-400 text-xs ml-1">▼</span>;
  return <span className="text-zinc-500 text-xs ml-1">—</span>;
}

function ComparisonBar({
  value,
  gbAvg,
  higherIsWorse,
}: {
  value: number;
  gbAvg: number;
  higherIsWorse: boolean;
}) {
  const max = Math.max(value, gbAvg) * 1.2;
  const localPct = (value / max) * 100;
  const avgPct = (gbAvg / max) * 100;

  const isBetter = higherIsWorse ? value < gbAvg : value > gbAvg;
  const barColor = isBetter ? "bg-emerald-500" : "bg-red-500";

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-zinc-500 w-14 shrink-0">Local</span>
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor}`}
            style={{ width: `${Math.min(localPct, 100)}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-zinc-500 w-14 shrink-0">GB Avg</span>
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-zinc-500"
            style={{ width: `${Math.min(avgPct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function EmploymentPanel() {
  const [data, setData] = useState<EmploymentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/employment")
      .then((res) => res.json())
      .then((d: EmploymentData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 animate-pulse">
        <div className="h-4 bg-zinc-800 rounded w-40 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-zinc-900 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
        <p className="text-zinc-500 text-xs">Employment data unavailable</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">Employment &amp; Economy</h3>
        <a
          href={data.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          {data.source}
        </a>
      </div>

      {/* Claimant count highlight */}
      {data.claimantCount && data.claimantCount.rate != null && (
        <div className="bg-zinc-900 rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
              Claimant Count
            </div>
            <div className="text-xl font-bold text-zinc-100 mt-0.5">
              {Number(data.claimantCount.rate).toFixed(1)}%
              <TrendArrow trend={data.claimantCount.trend} />
            </div>
            {data.claimantCount.count != null && (
              <div className="text-[10px] text-zinc-500">
                {Number(data.claimantCount.count).toLocaleString()} claimants
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[10px] text-zinc-600">{data.claimantCount.period}</div>
            <div className="text-[10px] text-zinc-600 mt-0.5">
              Trend: {data.claimantCount.trend}
            </div>
          </div>
        </div>
      )}

      {/* Key indicators grid */}
      <div className="grid grid-cols-2 gap-3">
        {data.indicators.map((ind) => {
          const displayName = DISPLAY_NAMES[ind.name] || ind.name;
          const higherIsWorse = HIGHER_IS_WORSE.has(ind.name);
          const val = Number(ind.value);
          const avg = ind.gbAvg != null ? Number(ind.gbAvg) : null;
          const formatted =
            ind.unit === "£"
              ? `£${val.toLocaleString()}`
              : `${val.toFixed(1)}%`;
          const gbFormatted =
            avg != null
              ? ind.unit === "£"
                ? `£${avg.toLocaleString()}`
                : `${avg.toFixed(1)}%`
              : null;

          const isBetter =
            avg != null
              ? higherIsWorse
                ? val < avg
                : val > avg
              : null;
          const valueColor =
            isBetter === null
              ? "text-zinc-100"
              : isBetter
              ? "text-emerald-400"
              : "text-red-400";

          return (
            <div key={ind.name} className="bg-zinc-900 rounded-xl p-3">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider leading-tight">
                {displayName}
              </div>
              <div className={`text-lg font-bold mt-1 ${valueColor}`}>{formatted}</div>
              {gbFormatted && (
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  GB avg: {gbFormatted}
                </div>
              )}
              {avg != null && (
                <ComparisonBar
                  value={val}
                  gbAvg={avg}
                  higherIsWorse={higherIsWorse}
                />
              )}
              <div className="text-[10px] text-zinc-600 mt-1">{ind.period}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
