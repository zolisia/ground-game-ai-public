"use client";

import { useEffect, useState } from "react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

interface PetitionItem {
  title: string;
  totalSignatures: number;
  localSignatures: number;
  salience: number;
  overIndexed: boolean;
  url: string;
}

interface PetitionsData {
  petitions: PetitionItem[];
  source: string;
  error?: string;
}

function heatIcon(salience: number, median: number): string {
  if (salience > median * 3) return "\uD83D\uDD25";
  if (salience > median * 2) return "\u26A1";
  return "";
}

export default function PetitionsPanel() {
  const { slug } = useConstituency();
  const [data, setData] = useState<PetitionsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(withConstituency("/api/petitions", slug))
      .then((res) => res.json())
      .then((d: PetitionsData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-zinc-800 rounded w-40 mb-4" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-zinc-900 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.error || !data.petitions?.length) {
    return <p className="text-zinc-500 text-xs">No petition data available</p>;
  }

  const petitions = data.petitions;
  const totalLocalSigs = petitions.reduce((s, p) => s + (p.localSignatures ?? 0), 0);

  // Median salience for heat thresholds
  const sorted = [...petitions].sort((a, b) => a.salience - b.salience);
  const medianSalience =
    sorted.length > 0
      ? sorted[Math.floor(sorted.length / 2)].salience
      : 1;

  // Most over-indexed topic (highest salience)
  const topPetition = petitions[0];

  // Top 8 for bar chart
  const chartPetitions = petitions.slice(0, 8);
  const maxSalience = chartPetitions.length > 0 ? chartPetitions[0].salience : 1;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 rounded-xl p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Local Signatures
          </div>
          <div className="text-xl font-bold text-zinc-100 mt-0.5">
            {totalLocalSigs.toLocaleString()}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">
            Across {petitions.length} petitions
          </div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Most Over-indexed
          </div>
          <div className="text-sm font-bold text-purple-400 mt-0.5 line-clamp-2 leading-tight">
            {topPetition.title.length > 60
              ? topPetition.title.slice(0, 57) + "..."
              : topPetition.title}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">
            {topPetition.salience.toFixed(1)}x local salience
          </div>
        </div>
      </div>

      {/* Horizontal bar chart — top 8 by salience */}
      <div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
          Top Petitions by Local Salience
        </div>
        <div className="space-y-1">
          {chartPetitions.map((p, i) => {
            const pct = maxSalience > 0 ? (p.salience / maxSalience) * 100 : 0;
            const heat = heatIcon(p.salience, medianSalience);
            return (
              <a
                key={i}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <div className="flex items-center gap-2">
                  {/* Title — truncated */}
                  <div className="w-[45%] min-w-0 text-[11px] text-zinc-300 truncate group-hover:text-zinc-100 transition-colors">
                    {heat && <span className="mr-1">{heat}</span>}
                    {p.title}
                  </div>
                  {/* Bar */}
                  <div className="flex-1 h-5 bg-zinc-900 rounded overflow-hidden">
                    <div
                      className="h-full bg-purple-600/70 rounded transition-all duration-500"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  {/* Score */}
                  <div className="w-12 text-right text-xs font-mono font-bold text-purple-400 shrink-0">
                    {p.salience.toFixed(1)}x
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>

      {/* Full scrollable list */}
      <div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
          All Petitions
        </div>
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
          {petitions.map((p, i) => {
            const heat = heatIcon(p.salience, medianSalience);
            return (
              <a
                key={i}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-zinc-900 rounded-xl px-3 py-2 hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-zinc-200 line-clamp-2">
                      {heat && <span className="mr-1">{heat}</span>}
                      {p.title}
                    </div>
                    <div className="text-[10px] text-zinc-500 flex items-center gap-2 mt-1">
                      <span>{(p.localSignatures ?? 0).toLocaleString()} local sigs</span>
                      <span className="text-zinc-700">&middot;</span>
                      <span>{(p.totalSignatures ?? 0).toLocaleString()} total</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={`text-sm font-bold ${
                        p.salience >= 2
                          ? "text-purple-400"
                          : p.salience >= 1
                          ? "text-emerald-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {p.salience.toFixed(1)}x
                    </div>
                    {p.overIndexed && (
                      <div className="text-[9px] text-purple-400/80 mt-0.5">
                        over-indexed
                      </div>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>

      {/* Link to parliament */}
      <div className="text-center">
        <a
          href="https://petition.parliament.uk/petitions?state=open"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          View all open petitions on parliament.uk &#8599;
        </a>
      </div>
    </div>
  );
}
