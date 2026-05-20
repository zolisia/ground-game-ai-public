"use client";

import { useEffect, useState } from "react";
import { GraduationCap, ExternalLink, Users, School } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

interface SchoolItem {
  name: string;
  type: "Primary" | "Secondary" | "Special" | "Other";
  ofstedRating: string;
  lat: number;
  lng: number;
  ageRange: string;
  pupils: number;
  address: string;
  urn: number;
}

interface Summary {
  total: number;
  primary: number;
  secondary: number;
  special?: number;
  outstanding: number;
  good: number;
  requiresImprovement: number;
  inadequate: number;
}

const OFSTED_BADGE: Record<string, { bg: string; text: string }> = {
  Outstanding: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  Good: { bg: "bg-blue-500/15", text: "text-blue-400" },
  "Requires Improvement": { bg: "bg-amber-500/15", text: "text-amber-400" },
  Inadequate: { bg: "bg-red-500/15", text: "text-red-400" },
  "Not inspected": { bg: "bg-zinc-700/30", text: "text-zinc-500" },
};

const TYPE_GROUPS: { key: SchoolItem["type"]; label: string; icon: string }[] = [
  { key: "Secondary", label: "Secondary Schools", icon: "border-purple-500/50" },
  { key: "Primary", label: "Primary Schools", icon: "border-blue-500/50" },
  { key: "Special", label: "Special Schools", icon: "border-amber-500/50" },
  { key: "Other", label: "Other Schools", icon: "border-zinc-500/50" },
];

export default function SchoolsPanel() {
  const { slug } = useConstituency();
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedType, setExpandedType] = useState<string | null>("Secondary");

  useEffect(() => {
    fetchSchools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function fetchSchools() {
    try {
      setLoading(true);
      const res = await fetch(withConstituency("/api/schools", slug));
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setSchools(data.schools || []);
      setSummary(data.summary || null);
    } catch {
      setSchools([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse space-y-2">
            <div className="h-3 bg-zinc-800 rounded w-4/5" />
            <div className="h-2.5 bg-zinc-800/50 rounded w-2/5" />
          </div>
        ))}
      </div>
    );
  }

  if (!summary || schools.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-zinc-600">
        No school data available
      </div>
    );
  }

  const ofstedTotal = summary.outstanding + summary.good + summary.requiresImprovement + summary.inadequate;

  return (
    <div>
      {/* Summary stats */}
      <div className="px-3 py-2.5 border-b border-zinc-800/50">
        <div className="grid grid-cols-3 gap-2 mb-2.5">
          <div className="text-center">
            <div className="text-lg font-bold text-zinc-200">{summary.total}</div>
            <div className="text-[10px] text-zinc-500">Total Schools</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-400">{summary.primary}</div>
            <div className="text-[10px] text-zinc-500">Primary</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-purple-400">{summary.secondary}</div>
            <div className="text-[10px] text-zinc-500">Secondary</div>
          </div>
        </div>

        {/* Ofsted ratings bar */}
        {ofstedTotal > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] text-zinc-500 font-medium">Ofsted Ratings</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800">
              {summary.outstanding > 0 && (
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${(summary.outstanding / ofstedTotal) * 100}%` }}
                  title={`Outstanding: ${summary.outstanding}`}
                />
              )}
              {summary.good > 0 && (
                <div
                  className="bg-blue-500 transition-all"
                  style={{ width: `${(summary.good / ofstedTotal) * 100}%` }}
                  title={`Good: ${summary.good}`}
                />
              )}
              {summary.requiresImprovement > 0 && (
                <div
                  className="bg-amber-500 transition-all"
                  style={{ width: `${(summary.requiresImprovement / ofstedTotal) * 100}%` }}
                  title={`Requires Improvement: ${summary.requiresImprovement}`}
                />
              )}
              {summary.inadequate > 0 && (
                <div
                  className="bg-red-500 transition-all"
                  style={{ width: `${(summary.inadequate / ofstedTotal) * 100}%` }}
                  title={`Inadequate: ${summary.inadequate}`}
                />
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {summary.outstanding > 0 && (
                <span className="flex items-center gap-1 text-[9px] text-zinc-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Outstanding ({summary.outstanding})
                </span>
              )}
              {summary.good > 0 && (
                <span className="flex items-center gap-1 text-[9px] text-zinc-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Good ({summary.good})
                </span>
              )}
              {summary.requiresImprovement > 0 && (
                <span className="flex items-center gap-1 text-[9px] text-zinc-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  RI ({summary.requiresImprovement})
                </span>
              )}
              {summary.inadequate > 0 && (
                <span className="flex items-center gap-1 text-[9px] text-zinc-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  Inadequate ({summary.inadequate})
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Schools grouped by type */}
      <div className="divide-y divide-zinc-800/30">
        {TYPE_GROUPS.map((group) => {
          const groupSchools = schools
            .filter((s) => s.type === group.key)
            .sort((a, b) => {
              const order = ["Outstanding", "Good", "Requires Improvement", "Inadequate", "Not inspected"];
              return order.indexOf(a.ofstedRating) - order.indexOf(b.ofstedRating);
            });
          if (groupSchools.length === 0) return null;
          const isExpanded = expandedType === group.key;
          return (
            <div key={group.key}>
              <button
                onClick={() => setExpandedType(isExpanded ? null : group.key)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-800/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full border ${group.icon}`} />
                  <span className="text-[11px] font-medium text-zinc-400">
                    {group.label}
                  </span>
                  <span className="text-[10px] text-zinc-600">({groupSchools.length})</span>
                </div>
                <span className="text-[10px] text-zinc-600">{isExpanded ? "\u25B2" : "\u25BC"}</span>
              </button>
              {isExpanded && (
                <div className="space-y-0.5 pb-1">
                  {groupSchools.map((school) => {
                    const badge = OFSTED_BADGE[school.ofstedRating] || OFSTED_BADGE["Not inspected"];
                    return (
                      <a
                        key={school.urn}
                        href={`https://www.google.com/search?q=${encodeURIComponent(school.name + " " + school.address + " Ofsted")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-3 py-1.5 hover:bg-zinc-800/20 transition-colors group mx-1"
                      >
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 p-1 rounded bg-zinc-800/50">
                            {school.type === "Secondary" ? (
                              <GraduationCap className="h-3 w-3 text-purple-400" />
                            ) : school.type === "Special" ? (
                              <Users className="h-3 w-3 text-amber-400" />
                            ) : (
                              <School className="h-3 w-3 text-blue-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[12px] text-zinc-300 leading-snug group-hover:text-zinc-100 truncate flex-1">
                                {school.name}
                              </p>
                              <ExternalLink className="h-2.5 w-2.5 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0" />
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] flex-wrap">
                              <span className={`px-1.5 py-0 rounded ${badge.bg} ${badge.text} font-medium`}>
                                {school.ofstedRating}
                              </span>
                              <span className="text-zinc-500">Ages {school.ageRange}</span>
                              {school.pupils > 0 && (
                                <span className="text-zinc-600">{school.pupils.toLocaleString()} pupils</span>
                              )}
                            </div>
                            <p className="text-[9px] text-zinc-600 mt-0.5 truncate">{school.address}</p>
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-zinc-800/50 text-center">
        <span className="text-[10px] text-zinc-600">
          {summary.total} schools in constituency · DfE GIAS
        </span>
      </div>
    </div>
  );
}
