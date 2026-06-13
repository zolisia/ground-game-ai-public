"use client";

import { useEffect, useState } from "react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

interface SectionRow {
  Measure: string;
  Value: string;
  England: string;
  Region: string;
}

interface SectionData {
  heading: string;
  rows: SectionRow[];
}

interface CLData {
  sections: Record<string, SectionData[]>;
  constituency: string;
}

const DEMO_KEYS = ["population", "housing", "economy", "education", "health", "deprivation"];

function StatRow({ row }: { row: SectionRow }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
      <span className="flex-1 text-[11px] text-zinc-400 truncate">{row.Measure}</span>
      <span className="text-[11px] text-zinc-200 font-medium tabular-nums">{row.Value}</span>
      {row.England && (
        <span className="text-[11px] text-zinc-600 tabular-nums w-16 text-right">{row.England}</span>
      )}
    </div>
  );
}

export default function Demographics() {
  const { slug } = useConstituency();
  const [data, setData] = useState<CLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setError(null);

    fetch(withConstituency("/api/commons-library", slug))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: CLData) => setData(json))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 bg-muted/50 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  const sections = data?.sections ?? null;
  const hasSections =
    sections !== null && DEMO_KEYS.some((k) => (sections[k]?.length ?? 0) > 0);

  if (error || !hasSections) {
    return (
      <div className="p-4">
        <div className="text-xs text-zinc-500">
          Demographic data not available for this constituency.
        </div>
      </div>
    );
  }

  const allSections: SectionData[] = DEMO_KEYS.flatMap((k) => sections![k] ?? []);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between text-[10px] text-zinc-600">
        <span>Constituency</span>
        <span>England avg</span>
      </div>

      {allSections.map((sec) => (
        <div key={sec.heading}>
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
            {sec.heading}
          </div>
          <div>
            {sec.rows.map((row, i) => (
              <StatRow key={i} row={row} />
            ))}
          </div>
        </div>
      ))}

      <div className="text-[10px] text-zinc-600 text-center pt-1">
        Census 2021 via ONS · Commons Library
      </div>
    </div>
  );
}
