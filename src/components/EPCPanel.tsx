"use client";

import { useEffect, useState } from "react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

// Match the actual API response shape from /api/epc
// ratings is a Record<string, number> like { A: 12, B: 34, C: 56, ... }
interface EPCData {
  ratings: Record<string, number>;
  totalAssessed: number;
  poorlyRated: number;
  recentAssessments: unknown[];
  source: string;
  sourceUrl?: string;
  note?: string;
  error?: string;
}

interface BandDisplay {
  band: string;
  count: number;
  percentage: number;
}

// EPC standard band colours
const BAND_COLORS: Record<string, string> = {
  A: "bg-green-700",
  B: "bg-green-500",
  C: "bg-lime-400",
  D: "bg-yellow-400",
  E: "bg-orange-400",
  F: "bg-orange-600",
  G: "bg-red-500",
};

const BAND_TEXT_COLORS: Record<string, string> = {
  A: "text-green-400",
  B: "text-green-400",
  C: "text-lime-400",
  D: "text-yellow-400",
  E: "text-orange-400",
  F: "text-orange-500",
  G: "text-red-400",
};

const BAND_ORDER = ["A", "B", "C", "D", "E", "F", "G"];

export default function EPCPanel() {
  const { slug } = useConstituency();
  const [data, setData] = useState<EPCData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(withConstituency("/api/epc", slug))
      .then((res) => res.json())
      .then((d: EPCData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-muted rounded w-40 mb-4" />
        <div className="h-16 bg-muted rounded-xl mb-3" />
        <div className="space-y-2">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-6 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.error) {
    return <p className="text-zinc-500 text-xs">EPC data unavailable</p>;
  }

  // Convert ratings Record to array of bands
  const ratings = data.ratings ?? {};
  const total = data.totalAssessed || Object.values(ratings).reduce((a, b) => a + b, 0) || 1;
  const bands: BandDisplay[] = BAND_ORDER.map((band) => ({
    band,
    count: ratings[band] ?? 0,
    percentage: total > 0 ? ((ratings[band] ?? 0) / total) * 100 : 0,
  }));

  const fuelPovertyRiskPct = data.poorlyRated ?? 0;
  const maxPct = Math.max(...bands.map((b) => b.percentage), 1);

  return (
    <div className="space-y-4">
      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted rounded-xl p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Homes Assessed
          </div>
          <div className="text-xl font-bold text-zinc-100 mt-0.5">
            {total.toLocaleString()}
          </div>
        </div>
        <div className="bg-muted rounded-xl p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Fuel Poverty Risk
          </div>
          <div className="text-xl font-bold text-red-400 mt-0.5">
            {fuelPovertyRiskPct.toFixed(1)}%
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Rated D or below</div>
        </div>
      </div>

      {/* Band distribution — horizontal bars */}
      <div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
          Band Distribution
        </div>
        <div className="space-y-1.5">
          {bands.map((b) => (
            <div key={b.band} className="flex items-center gap-2">
              <span
                className={`text-xs font-bold w-5 text-center ${
                  BAND_TEXT_COLORS[b.band] ?? "text-zinc-400"
                }`}
              >
                {b.band}
              </span>
              <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    BAND_COLORS[b.band] ?? "bg-zinc-500"
                  }`}
                  style={{
                    width: `${(b.percentage / maxPct) * 100}%`,
                  }}
                />
              </div>
              <span className="text-[10px] text-zinc-400 w-12 text-right">
                {b.percentage.toFixed(1)}%
              </span>
              <span className="text-[10px] text-zinc-600 w-14 text-right">
                {b.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Stacked bar summary */}
      <div className="bg-muted rounded-xl p-3">
        <div className="flex h-4 rounded-full overflow-hidden">
          {bands.map((b) => (
            <div
              key={b.band}
              className={`${BAND_COLORS[b.band] ?? "bg-zinc-500"} transition-all`}
              style={{ width: `${b.percentage}%` }}
              title={`${b.band}: ${b.percentage.toFixed(1)}%`}
            />
          ))}
        </div>
      </div>

      {/* Source note */}
      {data.note && (
        <p className="text-[10px] text-zinc-600 italic">{data.note}</p>
      )}
    </div>
  );
}
