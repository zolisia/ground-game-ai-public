"use client";

import { demographics, wardDemographics, type DemographicSet } from "@/data/braintree";
import { useEffect, useState } from "react";
import { useConstituency } from "@/hooks/useConstituency";
import { getFullData } from "@/data";

type Category = "age" | "ethnicity" | "housing" | "education";

const categoryColors: Record<Category, string[]> = {
  age: ["#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"],
  ethnicity: ["#3b82f6", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899"],
  housing: ["#10b981", "#ef4444", "#f59e0b", "#8b5cf6"],
  education: ["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"],
};

export default function Demographics() {
  const { slug, name: constituencyName } = useConstituency();
  const fullData = getFullData(slug);
  const isBraintree = slug === "braintree";

  // Ward dropdown is populated from the data layer for the active
  // constituency. Per-ward demographic data is currently only sourced for
  // Braintree — for other constituencies we still show the dropdown but
  // selecting a ward falls back to the constituency-level (Braintree static)
  // demographic chart, and we flag the gap in the UI.
  const wardNames = (fullData?.areas?.wards ?? []).map((w) => w.name);

  const [selectedWard, setSelectedWard] = useState<string>("all");

  // Reset selection when switching constituencies (so a stale ward name from
  // the previous constituency doesn't carry over).
  useEffect(() => {
    setSelectedWard("all");
  }, [slug]);

  const currentData: DemographicSet =
    isBraintree && selectedWard !== "all"
      ? (wardDemographics[selectedWard] || demographics)
      : demographics;

  const categories: { key: Category; label: string }[] = [
    { key: "age", label: "Age" },
    { key: "ethnicity", label: "Ethnicity" },
    { key: "housing", label: "Housing" },
    { key: "education", label: "Education" },
  ];

  const getLabel = (item: Record<string, unknown>) => {
    return (item.group || item.type || item.level || "") as string;
  };

  return (
    <div className="p-4 space-y-4">
      {/* Ward selector */}
      <select
        value={selectedWard}
        onChange={(e) => setSelectedWard(e.target.value)}
        className="w-full bg-muted border border-border text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      >
        <option value="all">All {constituencyName} (Constituency Average)</option>
        {wardNames.map((wn) => (
          <option key={wn} value={wn}>{wn}</option>
        ))}
      </select>

      {!isBraintree && (
        <div className="text-[10px] text-zinc-500 -mt-2">
          Per-ward demographic breakdowns not yet sourced for {constituencyName} — the chart below shows Braintree constituency averages as a placeholder.
        </div>
      )}

      {/* 4-column grid of categories */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {categories.map((cat) => {
          const data = currentData[cat.key];
          const colors = categoryColors[cat.key];
          const avgData = demographics[cat.key];

          return (
            <div key={cat.key}>
              <div className="text-xs font-medium text-zinc-400 mb-2">{cat.label}</div>

              {/* Stacked horizontal bar */}
              <div className="h-5 rounded-full overflow-hidden flex mb-2">
                {data.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: colors[i % colors.length],
                    }}
                    title={`${getLabel(item as Record<string, unknown>)}: ${item.percentage}%`}
                  />
                ))}
              </div>

              {/* Legend items */}
              <div className="space-y-1">
                {data.map((item, i) => {
                  const label = getLabel(item as Record<string, unknown>);
                  const avgItem = avgData.find(
                    (a) => getLabel(a as Record<string, unknown>) === label
                  );
                  const diff = selectedWard !== "all" && avgItem
                    ? item.percentage - avgItem.percentage
                    : 0;

                  return (
                    <div key={label} className="flex items-center gap-1.5 text-[11px]">
                      <div
                        className="w-2 h-2 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: colors[i % colors.length] }}
                      />
                      <span className="text-zinc-400 flex-1 truncate">{label}</span>
                      <span className="text-zinc-300 font-medium tabular-nums">{item.percentage}%</span>
                      {diff !== 0 && (
                        <span className={`text-[9px] tabular-nums ${diff > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selectedWard !== "all" && (
        <div className="text-[10px] text-zinc-600 text-center">
          +/- shows difference from constituency average
        </div>
      )}
    </div>
  );
}
