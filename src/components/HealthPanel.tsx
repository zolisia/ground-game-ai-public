"use client";

import { useEffect, useState } from "react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

interface HealthIndicator {
  id: number;
  name: string;
  value: number | null;
  unit: string;
  englandAvg: number | null;
  significance: "better" | "similar" | "worse" | "unknown";
  period: string;
}

interface HealthData {
  indicators: HealthIndicator[];
  areaName: string;
  source: string;
  sourceUrl: string;
  error?: string;
}

const significanceConfig = {
  better: { color: "text-emerald-400", bg: "bg-emerald-400", badge: "bg-emerald-500/20 text-emerald-400", label: "Better" },
  similar: { color: "text-amber-400", bg: "bg-amber-400", badge: "bg-amber-500/20 text-amber-400", label: "Similar" },
  worse: { color: "text-red-400", bg: "bg-red-400", badge: "bg-red-500/20 text-red-400", label: "Worse" },
  unknown: { color: "text-zinc-500", bg: "bg-zinc-500", badge: "bg-zinc-500/20 text-zinc-500", label: "N/A" },
};

function ProgressBar({ value, englandAvg, unit, significance, constituencyName }: {
  value: number | null;
  englandAvg: number | null;
  unit: string;
  significance: HealthIndicator["significance"];
  constituencyName: string;
}) {
  if (value === null) return null;

  const config = significanceConfig[significance];

  // Determine the scale for the progress bar
  // For percentages, max is 100. For rates/years, scale relative to England avg
  let max: number;
  let localVal = value;
  let avgVal = englandAvg ?? value;

  if (unit === "%") {
    max = Math.max(localVal, avgVal, 50) * 1.3;
  } else if (unit === "years") {
    // Life expectancy: show range 70-90
    const minScale = 70;
    max = 90;
    localVal = localVal - minScale;
    avgVal = avgVal - minScale;
    max = max - minScale;
  } else {
    // Rates per 100,000 etc
    max = Math.max(localVal, avgVal) * 1.4;
  }

  const localPct = Math.min((localVal / max) * 100, 100);
  const avgPct = englandAvg !== null ? Math.min((avgVal / max) * 100, 100) : null;

  return (
    <div className="mt-1.5 space-y-1">
      {/* Bar */}
      <div className="relative h-2 bg-muted rounded-full overflow-visible">
        <div
          className={`absolute top-0 left-0 h-full rounded-full ${config.bg} opacity-80`}
          style={{ width: `${localPct}%` }}
        />
        {/* England average marker */}
        {avgPct !== null && (
          <div
            className="absolute top-[-2px] h-[12px] w-[2px] bg-zinc-300 rounded-full"
            style={{ left: `${avgPct}%` }}
            title={`England avg: ${englandAvg}${unit === "%" ? "%" : ""}`}
          />
        )}
      </div>
      {/* Labels under bar */}
      {englandAvg !== null && (
        <div className="flex justify-between text-[10px] text-zinc-500">
          <span>{constituencyName}: {value}{unit === "%" ? "%" : ""}</span>
          <span>England: {englandAvg}{unit === "%" ? "%" : ""}</span>
        </div>
      )}
    </div>
  );
}

export default function HealthPanel() {
  const { slug, name: constituencyName } = useConstituency();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch(withConstituency("/api/health", slug));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: HealthData = await res.json();
        if (json.error) throw new Error(json.error);
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch health data");
      } finally {
        setLoading(false);
      }
    }
    fetchHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-xs text-zinc-500">Loading health data...</div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <div className="text-xs text-red-400 font-medium">Health data unavailable</div>
          <div className="text-[11px] text-red-400/70 mt-1">{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.indicators.length === 0) {
    return (
      <div className="p-4">
        <div className="text-xs text-zinc-500">No health indicators available.</div>
      </div>
    );
  }

  // Count by significance for summary
  const counts = { better: 0, similar: 0, worse: 0, unknown: 0 };
  data.indicators.forEach((ind) => counts[ind.significance]++);

  return (
    <div className="p-4 space-y-3">
      {/* Summary badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {counts.better > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {counts.better} better than avg
          </span>
        )}
        {counts.similar > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            {counts.similar} similar
          </span>
        )}
        {counts.worse > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            {counts.worse} worse than avg
          </span>
        )}
      </div>

      {/* Indicator cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {data.indicators.map((indicator) => {
          const config = significanceConfig[indicator.significance];
          const diff =
            indicator.value !== null && indicator.englandAvg !== null
              ? indicator.value - indicator.englandAvg
              : null;

          return (
            <div
              key={indicator.id}
              className="bg-muted border border-border rounded-lg p-3"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="text-[11px] text-zinc-400 leading-tight">
                  {indicator.name}
                </div>
                <span
                  className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${config.badge}`}
                >
                  {config.label}
                </span>
              </div>

              {/* Value */}
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className={`text-lg font-semibold tabular-nums ${config.color}`}>
                  {indicator.value !== null
                    ? indicator.unit === "%"
                      ? `${indicator.value}%`
                      : indicator.value.toLocaleString("en-GB", { maximumFractionDigits: 1 })
                    : "N/A"}
                </span>
                <span className="text-[10px] text-zinc-600">{indicator.unit !== "%" ? indicator.unit : ""}</span>
                {diff !== null && (
                  <span
                    className={`text-[10px] tabular-nums ml-auto ${
                      diff > 0 ? "text-zinc-500" : diff < 0 ? "text-zinc-500" : "text-zinc-600"
                    }`}
                  >
                    {diff > 0 ? "+" : ""}
                    {diff.toFixed(1)} vs England
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <ProgressBar
                value={indicator.value}
                englandAvg={indicator.englandAvg}
                unit={indicator.unit}
                significance={indicator.significance}
                constituencyName={constituencyName}
              />

              {/* Period */}
              <div className="mt-1.5 text-[10px] text-zinc-600">{indicator.period}</div>
            </div>
          );
        })}
      </div>

      {/* Source attribution */}
      <div className="text-[10px] text-zinc-600 text-center pt-1">
        Source:{" "}
        <a
          href={data.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-zinc-400"
        >
          {data.source}
        </a>{" "}
        | Compared to England average
      </div>
    </div>
  );
}
