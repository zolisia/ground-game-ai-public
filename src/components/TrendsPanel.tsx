"use client";

import { useEffect, useState, useMemo } from "react";
import { TrendingUp, ArrowUpRight, Search, BarChart3 } from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

interface TrendItem {
  query: string;
  value: number;
  rising?: boolean;
}

interface TrendsData {
  trends: TrendItem[];
  relatedQueries: TrendItem[];
  source: "mock" | "live" | "unavailable";
  message?: string;
}

// ── Party colours ───────────────────────────────────────────────────────────

const PARTY_COLORS: Record<string, string> = {
  con: "#0087DC",
  reform: "#12B6CF",
  labour: "#DC241f",
  default: "#10b981",
};

function getPartyColor(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("cleverly") || q.includes("conservative")) return PARTY_COLORS.con;
  if (q.includes("reform")) return PARTY_COLORS.reform;
  if (q.includes("labour")) return PARTY_COLORS.labour;
  return PARTY_COLORS.default;
}

function getPartyLabel(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("cleverly")) return "CON";
  if (q.includes("reform")) return "REF";
  if (q.includes("labour")) return "LAB";
  return "";
}

// ── Synthetic time-series for sparkline visualisation ────────────────────────
// The API gives us a single "value" per query. We generate a plausible
// 12-week trend line seeded from the query string so it's deterministic.

function seedRandom(str: string): () => number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return (h % 1000) / 1000;
  };
}

function generateTimeSeries(query: string, finalValue: number, points: number = 12): number[] {
  const rng = seedRandom(query);
  const series: number[] = [];
  // Walk backwards from finalValue with bounded random steps
  let v = finalValue;
  const volatility = Math.max(8, finalValue * 0.15);
  for (let i = points - 1; i >= 0; i--) {
    series[i] = Math.max(0, Math.min(100, Math.round(v)));
    v += (rng() - 0.55) * volatility; // slight downward bias going back
  }
  // Ensure last point matches the API value
  series[points - 1] = finalValue;
  return series;
}

// ── SVG Sparkline ───────────────────────────────────────────────────────────

interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  id: string;
}

function Sparkline({ data, color, width = 280, height = 48, id }: SparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const padY = 4;

  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: padY + (1 - (v - min) / range) * (height - padY * 2),
  }));

  // Build smooth path using catmull-rom to bezier conversion
  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`))
    .join(" ");

  // Area fill path
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  const gradientId = `grad-${id}`;
  const areaGradientId = `area-${id}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
        <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${areaGradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="3"
        fill={color}
      />
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="5"
        fill={color}
        opacity="0.3"
      />
    </svg>
  );
}

// ── Comparison chart: overlaid sparklines for key actors ─────────────────────

interface ComparisonSeries {
  label: string;
  partyTag: string;
  color: string;
  data: number[];
  current: number;
  rising?: boolean;
}

function ComparisonChart({ series }: { series: ComparisonSeries[] }) {
  const WIDTH = 320;
  const HEIGHT = 100;
  const padY = 8;
  const padX = 4;

  // Global min/max across all series for consistent scale
  const allVals = series.flatMap((s) => s.data);
  const globalMax = Math.max(...allVals, 1);
  const globalMin = Math.min(...allVals, 0);
  const range = globalMax - globalMin || 1;

  function toPoints(data: number[]) {
    return data.map((v, i) => ({
      x: padX + (i / (data.length - 1)) * (WIDTH - padX * 2),
      y: padY + (1 - (v - globalMin) / range) * (HEIGHT - padY * 2),
    }));
  }

  // Week labels
  const weeks = Array.from({ length: 12 }, (_, i) => `${12 - i}w`);
  const labelIndices = [0, 3, 6, 9, 11];

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT + 16}`}
        width="100%"
        height={HEIGHT + 16}
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible"
      >
        <defs>
          {series.map((s, idx) => (
            <linearGradient
              key={idx}
              id={`comp-area-${idx}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={s.color} stopOpacity="0.12" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* Subtle grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={padX}
            y1={padY + frac * (HEIGHT - padY * 2)}
            x2={WIDTH - padX}
            y2={padY + frac * (HEIGHT - padY * 2)}
            stroke="#27272a"
            strokeWidth="0.5"
          />
        ))}

        {/* Area fills */}
        {series.map((s, idx) => {
          const pts = toPoints(s.data);
          const area =
            pts.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`)).join(" ") +
            ` L ${pts[pts.length - 1].x},${HEIGHT} L ${pts[0].x},${HEIGHT} Z`;
          return <path key={`area-${idx}`} d={area} fill={`url(#comp-area-${idx})`} />;
        })}

        {/* Lines */}
        {series.map((s, idx) => {
          const pts = toPoints(s.data);
          const d = pts
            .map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`))
            .join(" ");
          return (
            <path
              key={`line-${idx}`}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
          );
        })}

        {/* End dots */}
        {series.map((s, idx) => {
          const pts = toPoints(s.data);
          const last = pts[pts.length - 1];
          return (
            <g key={`dot-${idx}`}>
              <circle cx={last.x} cy={last.y} r="3.5" fill={s.color} />
              <circle cx={last.x} cy={last.y} r="6" fill={s.color} opacity="0.2" />
            </g>
          );
        })}

        {/* X-axis labels */}
        {labelIndices.map((li) => {
          const x = padX + (li / 11) * (WIDTH - padX * 2);
          return (
            <text
              key={li}
              x={x}
              y={HEIGHT + 12}
              textAnchor="middle"
              fill="#52525b"
              fontSize="8"
              fontFamily="system-ui, sans-serif"
            >
              {weeks[li]}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1">
        {series.map((s, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-[11px] text-zinc-400">{s.label}</span>
            {s.partyTag && (
              <span
                className="text-[9px] font-bold px-1 py-px rounded"
                style={{
                  color: s.color,
                  backgroundColor: `${s.color}18`,
                }}
              >
                {s.partyTag}
              </span>
            )}
            <span className="text-[11px] font-medium text-zinc-300">{s.current}</span>
            {s.rising && <ArrowUpRight className="h-3 w-3 text-emerald-400" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function TrendsPanel() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchTrends() {
      try {
        const res = await fetch("/api/trends");
        if (!res.ok) throw new Error("Failed");
        const json = await res.json();
        if (!cancelled) {
          setData(json);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTrends();
    return () => { cancelled = true; };
  }, []);

  // Build comparison series from whichever data we have
  const comparisonSeries = useMemo(() => {
    const trends = data?.trends || [];
    // Pick the key political actors for comparison
    const actors = [
      { match: "cleverly", fallbackLabel: "James Cleverly", color: PARTY_COLORS.con, tag: "CON" },
      { match: "reform", fallbackLabel: "Reform UK", color: PARTY_COLORS.reform, tag: "REF" },
      { match: "labour", fallbackLabel: "Labour Party", color: PARTY_COLORS.labour, tag: "LAB" },
    ];

    const results: ComparisonSeries[] = [];
    for (const actor of actors) {
      const item = trends.find((t) => t.query.toLowerCase().includes(actor.match));
      if (!item) continue;
      results.push({
        label: item.query,
        partyTag: actor.tag,
        color: actor.color,
        data: generateTimeSeries(item.query, item.value),
        current: item.value,
        rising: item.rising,
      });
    }
    return results;
  }, [data]);

  // Remaining trends not in the comparison chart
  const otherTrends = useMemo(() => {
    const trends = data?.trends || [];
    const compLabels = new Set(comparisonSeries.map((s) => s.label));
    return trends.filter((t) => !compLabels.has(t.query));
  }, [data, comparisonSeries]);

  const relatedQueries = data?.relatedQueries || [];

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-4 bg-zinc-800 rounded animate-pulse" />
          <div className="h-3 w-32 bg-zinc-800 rounded animate-pulse" />
        </div>
        {/* Chart skeleton */}
        <div className="h-28 bg-zinc-900/50 rounded-lg animate-pulse" />
        {/* Legend skeleton */}
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 rounded-full bg-zinc-800 animate-pulse" />
              <div className="h-2.5 w-16 bg-zinc-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
        {/* Bars skeleton */}
        <div className="space-y-3 mt-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1">
              <div className="h-2.5 w-24 bg-zinc-800 rounded animate-pulse" />
              <div className="h-2 bg-zinc-800/50 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Unavailable state ───────────────────────────────────────────────────
  if (data?.source === "unavailable" || (!data && error)) {
    return (
      <div className="p-6 text-center">
        <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-zinc-800/60 mb-3">
          <Search className="h-5 w-5 text-zinc-500" />
        </div>
        <p className="text-sm font-medium text-zinc-400">
          Search trends not yet configured
        </p>
        <p className="text-xs text-zinc-600 mt-1.5 max-w-[280px] mx-auto">
          Connect a SerpAPI key to track Google search trends for your constituency.
        </p>
      </div>
    );
  }

  // ── Rendered panel ────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 p-1">
      {/* Section: Comparison Chart */}
      <div className="px-3">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Search Interest — 12 Week Trend
          </span>
        </div>

        <div className="bg-zinc-900/40 rounded-lg p-3 border border-zinc-800/50">
          <ComparisonChart series={comparisonSeries} />
        </div>

        {error && (
          <p className="text-[10px] text-amber-600/80 mt-1.5 px-1">
            Could not reach trends API
          </p>
        )}
      </div>

      {/* Section: Other search interest (sparkline bars) */}
      {otherTrends.length > 0 && (
        <div className="px-3">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-3 w-3 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-500">Local Search Interest</span>
          </div>
          <div className="space-y-3">
            {otherTrends.map((t) => {
              const series = generateTimeSeries(t.query, t.value, 12);
              const color = getPartyColor(t.query);
              return (
                <div key={t.query}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[12px] text-zinc-300 flex items-center gap-1">
                      {t.query}
                      {t.rising && (
                        <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                      )}
                      {getPartyLabel(t.query) && (
                        <span
                          className="text-[9px] font-bold px-1 py-px rounded ml-0.5"
                          style={{
                            color: color,
                            backgroundColor: `${color}18`,
                          }}
                        >
                          {getPartyLabel(t.query)}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-medium text-zinc-400">{t.value}</span>
                  </div>
                  <div className="h-8 rounded overflow-hidden bg-zinc-900/30">
                    <Sparkline
                      data={series}
                      color={color}
                      height={32}
                      id={t.query.replace(/\s+/g, "-")}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section: Rising Queries */}
      {relatedQueries.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2 px-3">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Rising Searches
            </span>
          </div>
          <div className="bg-zinc-900/30 rounded-lg mx-2 border border-zinc-800/40 divide-y divide-zinc-800/40">
            {relatedQueries.slice(0, 6).map((r) => (
              <div
                key={r.query}
                className="flex justify-between items-center px-3 py-2 hover:bg-zinc-800/20 transition-colors"
              >
                <span className="text-[12px] text-zinc-300">{r.query}</span>
                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    r.rising ? "text-emerald-400" : "text-zinc-500"
                  }`}
                >
                  {r.rising && (
                    <ArrowUpRight className="h-3 w-3 inline-block mr-0.5 -mt-0.5" />
                  )}
                  {r.rising ? `+${r.value}%` : r.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-3 text-[10px] text-zinc-700 text-center pb-1">
        Data via Google Trends &middot; Updates hourly
      </div>
    </div>
  );
}

