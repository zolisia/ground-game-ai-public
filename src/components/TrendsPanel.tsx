"use client";

import { useEffect, useState, useMemo } from "react";
import { TrendingUp, Search, BarChart3 } from "lucide-react";

// ── Types — match /api/trends-v2 response shape ─────────────────────────────

interface TrendingSearch {
  title: string;
  traffic: string;
  articleCount: number;
  relatedQueries: string[];
}

interface InterestOverTimePoint {
  date: string;
  formattedDate: string;
  values: Record<string, number>;
}

interface RegionalComparison {
  keyword: string;
  eastOfEnglandValue: number | null;
  nationalAverage: number;
  rank: number | null;
  totalRegions: number;
}

interface FreshnessReport {
  trendingSearches: "ok" | "failed";
  interestOverTime: "ok" | "failed";
  regionalVsNational: "ok" | "failed";
}

interface TrendsV2Data {
  trendingSearches: TrendingSearch[];
  interestOverTime: InterestOverTimePoint[];
  regionalVsNational: RegionalComparison[];
  fetched_at?: string;
  source?: string;
  sourceUrl?: string;
  note?: string;
  freshness?: FreshnessReport;
  keywordsUsed?: string[];
  mpName?: string;
  constituencyName?: string;
  cached?: boolean;
  error?: string;
}

// ── Party colours (dead-coded — retained for future use) ────────────────────
// Kept available for when /api/trends-v2's regionalVsNational populates with
// party-tagged keywords. The current rewrite uses only PARTY_COLORS.con
// (for the MP series) and PARTY_COLORS.default (for the constituency series).

const PARTY_COLORS: Record<string, string> = {
  con: "#0087DC",
  reform: "#12B6CF",
  labour: "#DC241f",
  default: "#10b981",
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getPartyColor(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("cleverly") || q.includes("conservative")) return PARTY_COLORS.con;
  if (q.includes("reform")) return PARTY_COLORS.reform;
  if (q.includes("labour")) return PARTY_COLORS.labour;
  return PARTY_COLORS.default;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getPartyLabel(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("cleverly")) return "CON";
  if (q.includes("reform")) return "REF";
  if (q.includes("labour")) return "LAB";
  return "";
}

// ── SVG Sparkline (unchanged from previous version) ─────────────────────────

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

  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`))
    .join(" ");

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

// ── Comparison chart: overlaid sparklines for the time-series ───────────────

interface ComparisonSeries {
  label: string;
  partyTag: string;
  color: string;
  data: number[];
  current: number;
}

function ComparisonChart({ series }: { series: ComparisonSeries[] }) {
  const WIDTH = 320;
  const HEIGHT = 100;
  const padY = 8;
  const padX = 4;

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

  const tickIndices = series[0]?.data.length
    ? [0, Math.floor(series[0].data.length / 4), Math.floor(series[0].data.length / 2), Math.floor(3 * series[0].data.length / 4), series[0].data.length - 1]
    : [];

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

        {series.map((s, idx) => {
          const pts = toPoints(s.data);
          const area =
            pts.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`)).join(" ") +
            ` L ${pts[pts.length - 1].x},${HEIGHT} L ${pts[0].x},${HEIGHT} Z`;
          return <path key={`area-${idx}`} d={area} fill={`url(#comp-area-${idx})`} />;
        })}

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

        {tickIndices.map((ti, i) => {
          if (series[0]?.data.length <= 1) return null;
          const x = padX + (ti / (series[0].data.length - 1)) * (WIDTH - padX * 2);
          const labels = ["90d", "60d", "45d", "15d", "now"];
          return (
            <text
              key={i}
              x={x}
              y={HEIGHT + 12}
              textAnchor="middle"
              fill="#52525b"
              fontSize="8"
              fontFamily="system-ui, sans-serif"
            >
              {labels[i]}
            </text>
          );
        })}
      </svg>

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
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Inline empty-state placeholder ──────────────────────────────────────────

function UnavailableSection({ height = "py-4" }: { height?: string }) {
  return (
    <div className={`bg-zinc-900/40 rounded-lg border border-zinc-800/50 px-3 ${height}`}>
      <p className="text-xs text-zinc-500 text-center">Currently unavailable</p>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function TrendsPanel() {
  const [data, setData] = useState<TrendsV2Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchTrends() {
      try {
        const res = await fetch("/api/trends-v2");
        if (!res.ok && res.status !== 200) throw new Error("Failed");
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

  // Build the two-series time-series chart from interestOverTime.
  // MP series uses CON blue; constituency series uses default green.
  const comparisonSeries = useMemo<ComparisonSeries[]>(() => {
    const points = data?.interestOverTime ?? [];
    const mpName = data?.mpName;
    const constituencyName = data?.constituencyName;
    if (!points.length || !mpName || !constituencyName) return [];

    const mpValues = points.map((p) => p.values?.[mpName] ?? 0);
    const conValues = points.map((p) => p.values?.[constituencyName] ?? 0);

    return [
      {
        label: mpName,
        partyTag: "",
        color: PARTY_COLORS.con,
        data: mpValues,
        current: mpValues[mpValues.length - 1] ?? 0,
      },
      {
        label: constituencyName,
        partyTag: "",
        color: PARTY_COLORS.default,
        data: conValues,
        current: conValues[conValues.length - 1] ?? 0,
      },
    ];
  }, [data]);

  const interestOk = comparisonSeries.length > 0;
  const regionalOk = (data?.regionalVsNational?.length ?? 0) > 0;
  const trendingOk = (data?.trendingSearches?.length ?? 0) > 0;

  const fetchedTime = useMemo(() => {
    if (!data?.fetched_at) return "";
    try {
      return new Date(data.fetched_at).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }, [data?.fetched_at]);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-4 bg-zinc-800 rounded animate-pulse" />
          <div className="h-3 w-32 bg-zinc-800 rounded animate-pulse" />
        </div>
        <div className="h-28 bg-zinc-900/50 rounded-lg animate-pulse" />
        <div className="flex gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 rounded-full bg-zinc-800 animate-pulse" />
              <div className="h-2.5 w-16 bg-zinc-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
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

  // ── Total-failure fallback (network error AND no data) ────────────────────
  if (error && !data) {
    return (
      <div className="p-6 text-center">
        <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-zinc-800/60 mb-3">
          <Search className="h-5 w-5 text-zinc-500" />
        </div>
        <p className="text-sm font-medium text-zinc-400">
          Search trends data unavailable
        </p>
        <p className="text-[11px] text-zinc-600 mt-1.5 max-w-[280px] mx-auto">
          Could not reach the trends route.
        </p>
      </div>
    );
  }

  // ── Rendered panel ────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 p-1">
      {/* Section: 90-day time-series chart */}
      <div className="px-3">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            England-wide Search Interest — 90 days
          </span>
        </div>

        {interestOk ? (
          <>
            <div className="bg-zinc-900/40 rounded-lg p-3 border border-zinc-800/50">
              <ComparisonChart series={comparisonSeries} />
            </div>
            <p className="text-[10px] text-zinc-600 mt-1.5 px-1">
              Party comparison data currently unavailable.
            </p>
          </>
        ) : (
          <UnavailableSection />
        )}
      </div>

      {/* Section: Regional vs national */}
      <div className="px-3">
        <div className="flex items-center gap-2 mb-2">
          <Search className="h-3 w-3 text-zinc-500" />
          <span
            className="text-xs font-medium text-zinc-500"
            title="Google Trends doesn't expose East of England as a query target, so this compares the East of England's slot in the regional breakdown against the UK average."
          >
            East of England vs UK average
          </span>
        </div>

        {regionalOk && data?.regionalVsNational ? (
          <div className="bg-zinc-900/40 rounded-lg border border-zinc-800/50 divide-y divide-zinc-800/40">
            {data.regionalVsNational.map((r) => (
              <div key={r.keyword} className="px-3 py-2">
                <div className="flex justify-between items-center mb-0.5">
                  <span className="text-[12px] text-zinc-300">{r.keyword}</span>
                  <span className="text-[11px] text-zinc-400 tabular-nums">
                    EoE {r.eastOfEnglandValue ?? "—"} · avg {r.nationalAverage}
                  </span>
                </div>
                {r.rank != null && (
                  <p className="text-[10px] text-zinc-600">
                    Rank {r.rank} of {r.totalRegions} regions
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <UnavailableSection />
        )}
      </div>

      {/* Section: Trending in the UK */}
      <div>
        <div className="flex items-center gap-2 mb-2 px-3">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Trending in the UK
          </span>
        </div>

        {trendingOk && data?.trendingSearches ? (
          <div className="bg-zinc-900/30 rounded-lg mx-2 border border-zinc-800/40 divide-y divide-zinc-800/40">
            {data.trendingSearches.slice(0, 6).map((t) => (
              <div
                key={t.title}
                className="flex justify-between items-center px-3 py-2 hover:bg-zinc-800/20 transition-colors"
              >
                <span className="text-[12px] text-zinc-300">{t.title}</span>
                {t.traffic && (
                  <span className="text-[11px] font-semibold text-emerald-400 tabular-nums">
                    {t.traffic}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mx-2">
            <UnavailableSection />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 text-[10px] text-zinc-700 text-center pb-1">
        {fetchedTime ? `Updated ${fetchedTime} · ` : ""}Data via Google Trends
      </div>
    </div>
  );
}

// Re-export Sparkline to keep symbol available for potential future use.
export { Sparkline };
