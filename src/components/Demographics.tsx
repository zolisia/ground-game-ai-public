"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Home,
  Briefcase,
  GraduationCap,
  Heart,
  AlertTriangle,
} from "lucide-react";
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

const DEMO_KEYS = [
  "population",
  "housing",
  "economy",
  "education",
  "health",
  "deprivation",
];

const CATEGORY_META: Record<
  string,
  { title: string; icon: React.ReactNode; iconColor: string }
> = {
  population: {
    title: "Population & Demographics",
    icon: <Users className="h-3.5 w-3.5" />,
    iconColor: "text-blue-400",
  },
  housing: {
    title: "Housing",
    icon: <Home className="h-3.5 w-3.5" />,
    iconColor: "text-amber-400",
  },
  economy: {
    title: "Economy & Employment",
    icon: <Briefcase className="h-3.5 w-3.5" />,
    iconColor: "text-emerald-400",
  },
  education: {
    title: "Education",
    icon: <GraduationCap className="h-3.5 w-3.5" />,
    iconColor: "text-purple-400",
  },
  health: {
    title: "Health",
    icon: <Heart className="h-3.5 w-3.5" />,
    iconColor: "text-rose-400",
  },
  deprivation: {
    title: "Deprivation",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    iconColor: "text-orange-400",
  },
};

// Metrics where being below the England average is the better outcome
const LOWER_IS_BETTER_KEYWORDS = [
  "unemployment",
  "bad or very bad",
  "no qual",
  "fuel",
  "poverty",
  "deprivation",
  "social rented",
];

function lowerIsBetter(measure: string): boolean {
  const m = measure.toLowerCase();
  return LOWER_IS_BETTER_KEYWORDS.some((kw) => m.includes(kw));
}

function parseNum(val: string): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[^0-9.-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) || cleaned === "" ? null : n;
}

function ComparisonBar({
  value,
  england,
  measure,
}: {
  value: string;
  england: string;
  measure: string;
}) {
  const numVal = parseNum(value);
  const numEng = parseNum(england);

  if (numVal === null || numEng === null || numEng === 0) return null;

  const diff = numVal - numEng;
  // Scale: ±25% relative difference fills the bar fully
  const relativeDiff = diff / numEng;
  const pct = Math.min(Math.abs(relativeDiff) * 200, 50);

  if (pct < 1) return null;

  const lowerBetter = lowerIsBetter(measure);
  const isGood = lowerBetter ? diff < 0 : diff > 0;
  const barColor = isGood ? "bg-emerald-500" : "bg-rose-500";

  return (
    <div className="relative h-[3px] bg-muted/80 rounded-full mt-2">
      <div className="absolute left-1/2 top-0 h-full w-px bg-zinc-500/60" />
      <div
        className={`absolute top-0 h-full rounded-full ${barColor} opacity-75`}
        style={{
          left: diff > 0 ? "50%" : `${50 - pct}%`,
          width: `${pct}%`,
        }}
      />
    </div>
  );
}

function MetricRow({ row }: { row: SectionRow }) {
  const hasEngland = !!row.England;
  return (
    <div className="py-2 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[11px] text-zinc-500 truncate leading-tight min-w-0">
          {row.Measure}
        </span>
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="text-[13px] font-semibold text-zinc-100 tabular-nums leading-none">
            {row.Value}
          </span>
          {hasEngland && (
            <span className="text-[10px] text-zinc-600 tabular-nums">
              {row.England} eng
            </span>
          )}
        </div>
      </div>
      {hasEngland && (
        <ComparisonBar value={row.Value} england={row.England} measure={row.Measure} />
      )}
    </div>
  );
}

function CategoryCard({
  categoryKey,
  sections,
}: {
  categoryKey: string;
  sections: SectionData[];
}) {
  const meta = CATEGORY_META[categoryKey];
  if (!meta) return null;

  const allRows = sections.flatMap((s) => s.rows);
  if (!allRows.length) return null;

  return (
    <div className="bg-muted/40 border border-border/50 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/40">
        <span className={meta.iconColor}>{meta.icon}</span>
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
          {meta.title}
        </span>
      </div>
      <div>
        {allRows.map((row, i) => (
          <MetricRow key={i} row={row} />
        ))}
      </div>
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
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-44 bg-muted/40 rounded-xl animate-pulse" />
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

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DEMO_KEYS.map((key) => {
          const secs = sections![key];
          if (!secs?.length) return null;
          return <CategoryCard key={key} categoryKey={key} sections={secs} />;
        })}
      </div>
      <div className="text-[10px] text-zinc-600 text-center pt-1">
        Census 2021 via ONS · Commons Library
      </div>
    </div>
  );
}
