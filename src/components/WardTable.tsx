"use client";

import { useState } from "react";
import { wardData } from "@/data/braintree";
import { ChevronDown, ChevronUp } from "lucide-react";

type SortField = "name" | "population" | "conVote" | "refVote" | "labVote" | "deprivation";

export default function WardTable() {
  const [sortField, setSortField] = useState<SortField>("conVote");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...wardData].sort((a, b) => {
    const av = a[sortField];
    const bv = b[sortField];
    if (typeof av === "string" && typeof bv === "string") {
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
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
              onClick={() => toggleSort("conVote")}
            >
              CON <SortIcon field="conVote" />
            </th>
            <th
              className="text-right py-2 px-3 font-medium cursor-pointer hover:text-zinc-300"
              onClick={() => toggleSort("refVote")}
            >
              REF <SortIcon field="refVote" />
            </th>
            <th
              className="text-right py-2 px-3 font-medium cursor-pointer hover:text-zinc-300"
              onClick={() => toggleSort("labVote")}
            >
              LAB <SortIcon field="labVote" />
            </th>
            <th
              className="text-right py-2 px-3 font-medium cursor-pointer hover:text-zinc-300 hidden sm:table-cell"
              onClick={() => toggleSort("deprivation")}
            >
              Deprivation <SortIcon field="deprivation" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((ward) => (
            <tr
              key={ward.name}
              className="border-b border-border/50 hover:bg-muted/30 transition-colors"
            >
              <td className="py-2 px-3 text-zinc-300 font-medium">{ward.name}</td>
              <td className="py-2 px-3 text-right">
                <span className="text-blue-400">{ward.conVote}%</span>
              </td>
              <td className="py-2 px-3 text-right">
                <span className="text-cyan-400">{ward.refVote}%</span>
              </td>
              <td className="py-2 px-3 text-right">
                <span className="text-red-400">{ward.labVote}%</span>
              </td>
              <td className="py-2 px-3 text-right hidden sm:table-cell">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    ward.deprivation === "Low"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : ward.deprivation === "Medium"
                      ? "bg-yellow-500/10 text-yellow-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {ward.deprivation}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
