"use client";

import { useState } from "react";
import { WARD_DEPRIVATION } from "@/data/ward-deprivation";
import { useConstituency } from "@/hooks/useConstituency";
import { ChevronDown, ChevronUp } from "lucide-react";

type SortField = "name" | "imdScore";

const DEPRIVATION_COLORS: Record<string, string> = {
  Low: "bg-emerald-500/10 text-emerald-400",
  "Low-Medium": "bg-emerald-500/10 text-emerald-400",
  Medium: "bg-yellow-500/10 text-yellow-400",
  "Medium-High": "bg-orange-500/10 text-orange-400",
  High: "bg-red-500/10 text-red-400",
};

export default function WardTable() {
  const { slug } = useConstituency();
  const wards = WARD_DEPRIVATION[slug] ?? null;

  const [sortField, setSortField] = useState<SortField>("imdScore");
  const [sortAsc, setSortAsc] = useState(false);

  if (!wards) {
    return (
      <div className="p-4">
        <div className="text-xs text-zinc-500">Ward data not available for this constituency.</div>
      </div>
    );
  }

  const sorted = [...wards].sort((a, b) => {
    if (sortField === "name") {
      return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    }
    return sortAsc ? a.imdScore - b.imdScore : b.imdScore - a.imdScore;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortAsc ? (
      <ChevronUp className="h-3 w-3 inline ml-0.5" />
    ) : (
      <ChevronDown className="h-3 w-3 inline ml-0.5" />
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-zinc-500">
            <th
              className="text-left py-2 px-3 font-medium cursor-pointer hover:text-zinc-300"
              onClick={() => toggleSort("name")}
            >
              Ward <SortIcon field="name" />
            </th>
            <th
              className="text-right py-2 px-3 font-medium cursor-pointer hover:text-zinc-300"
              onClick={() => toggleSort("imdScore")}
            >
              IMD Score <SortIcon field="imdScore" />
            </th>
            <th className="text-right py-2 px-3 font-medium">Deprivation</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((ward) => (
            <tr
              key={ward.code}
              className="border-b border-border/50 hover:bg-muted/30 transition-colors"
            >
              <td className="py-2 px-3 text-zinc-300 font-medium">{ward.name}</td>
              <td className="py-2 px-3 text-right text-zinc-400 tabular-nums">
                {ward.imdScore.toFixed(1)}
              </td>
              <td className="py-2 px-3 text-right">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    DEPRIVATION_COLORS[ward.class] ?? "bg-zinc-500/10 text-zinc-400"
                  }`}
                >
                  {ward.class}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
