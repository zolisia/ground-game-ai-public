"use client";

import { useState, useMemo } from "react";
import {
  wardData,
  wardElectoralCalc,
  wardDemographics,
  demographics,
  type DemographicSet,
} from "@/data/braintree";
import { useConstituency } from "@/hooks/useConstituency";

/* ── helpers ────────────────────────────────────────────────── */

const partyColor: Record<string, string> = {
  CON: "#0087DC",
  LAB: "#DC241f",
  Reform: "#12B6CF",
  LD: "#FAA61A",
  Green: "#6AB023",
};

const partyBg: Record<string, string> = {
  CON: "bg-blue-500/20 text-blue-400",
  LAB: "bg-red-500/20 text-red-400",
  Reform: "bg-cyan-500/20 text-cyan-400",
  LD: "bg-yellow-500/20 text-yellow-400",
  Green: "bg-green-500/20 text-green-400",
};

const depBg: Record<string, string> = {
  Low: "bg-emerald-500/20 text-emerald-400",
  "Low-Medium": "bg-emerald-500/10 text-emerald-500",
  Medium: "bg-yellow-500/20 text-yellow-400",
  "Medium-High": "bg-orange-500/20 text-orange-400",
  High: "bg-red-500/20 text-red-400",
};

type SortKey = "name" | "population" | "deprivation" | "conVote" | "refVote";
type SortDir = "asc" | "desc";

const depOrder: Record<string, number> = {
  Low: 1,
  "Low-Medium": 2,
  Medium: 3,
  "Medium-High": 4,
  High: 5,
};

/* ── enriched ward type ─────────────────────────────────────── */

interface EnrichedWard {
  name: string;
  population: number;
  deprivation: string;
  conVote: number;
  refVote: number;
  labVote: number;
  ldVote: number;
  grnVote: number;
  electorate: number;
  winner2024: string;
  predictedWinner: string;
  swing: boolean;
}

function buildWards(): EnrichedWard[] {
  return wardData.map((w) => {
    const ec = wardElectoralCalc[w.name];
    return {
      ...w,
      electorate: ec?.electorate ?? 0,
      winner2024: ec?.winner2024 ?? "—",
      predictedWinner: ec?.predictedWinner ?? "—",
      swing: ec ? ec.winner2024 !== ec.predictedWinner : false,
    };
  });
}

/* ── bar helper ──────────────────────────────────────────────── */

function VoteBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-10 text-zinc-500 text-right shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-zinc-300 font-medium tabular-nums">{pct}%</span>
    </div>
  );
}

/* ── demographic mini-section ─────────────────────────────── */

const catColors: Record<string, string[]> = {
  age: ["#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"],
  ethnicity: ["#3b82f6", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899"],
  housing: ["#10b981", "#ef4444", "#f59e0b", "#8b5cf6"],
  education: ["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"],
};

function getLabel(item: Record<string, unknown>) {
  return (item.group || item.type || item.level || "") as string;
}

function DemoSection({
  label,
  catKey,
  data,
  avg,
}: {
  label: string;
  catKey: string;
  data: { percentage: number; [k: string]: unknown }[];
  avg: { percentage: number; [k: string]: unknown }[];
}) {
  const colors = catColors[catKey] ?? catColors.age;
  return (
    <div>
      <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">{label}</div>
      <div className="h-4 rounded-full overflow-hidden flex mb-1.5">
        {data.map((item, i) => (
          <div
            key={i}
            style={{ width: `${item.percentage}%`, backgroundColor: colors[i % colors.length] }}
            title={`${getLabel(item as Record<string, unknown>)}: ${item.percentage}%`}
          />
        ))}
      </div>
      <div className="space-y-0.5">
        {data.map((item, i) => {
          const lbl = getLabel(item as Record<string, unknown>);
          const avgItem = avg.find((a) => getLabel(a as Record<string, unknown>) === lbl);
          const diff = avgItem ? item.percentage - avgItem.percentage : 0;
          return (
            <div key={lbl} className="flex items-center gap-1 text-[10px]">
              <div
                className="w-1.5 h-1.5 rounded-sm shrink-0"
                style={{ backgroundColor: colors[i % colors.length] }}
              />
              <span className="text-zinc-500 flex-1 truncate">{lbl}</span>
              <span className="text-zinc-300 tabular-nums">{item.percentage}%</span>
              {diff !== 0 && (
                <span
                  className={`text-[8px] tabular-nums ${diff > 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {diff > 0 ? "+" : ""}
                  {diff.toFixed(1)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function WardDataHub() {
  const { slug, name: constituencyName } = useConstituency();
  const wards = useMemo(buildWards, []);
  const [selected, setSelected] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  /* sorting */
  const sorted = useMemo(() => {
    const copy = [...wards];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "population") cmp = a.population - b.population;
      else if (sortKey === "deprivation") cmp = (depOrder[a.deprivation] ?? 0) - (depOrder[b.deprivation] ?? 0);
      else if (sortKey === "conVote") cmp = a.conVote - b.conVote;
      else if (sortKey === "refVote") cmp = a.refVote - b.refVote;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [wards, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : "";

  if (slug !== "braintree") {
    return (
      <div className="p-4 text-center">
        <div className="text-xs text-zinc-500">
          Ward-level data not yet available for {constituencyName}.
        </div>
      </div>
    );
  }

  const detail = selected ? wards.find((w) => w.name === selected) : null;
  const detailDemo: DemographicSet | null =
    selected && wardDemographics[selected] ? wardDemographics[selected] : null;

  return (
    <div className="p-3 space-y-3">
      {/* ── SUMMARY TABLE ──────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-muted/60 text-zinc-500 uppercase tracking-wider">
              <th
                className="text-left px-2 py-1.5 cursor-pointer hover:text-zinc-300 transition-colors"
                onClick={() => toggleSort("name")}
              >
                Ward{arrow("name")}
              </th>
              <th
                className="text-right px-2 py-1.5 cursor-pointer hover:text-zinc-300 transition-colors"
                onClick={() => toggleSort("population")}
              >
                Pop{arrow("population")}
              </th>
              <th
                className="text-center px-2 py-1.5 cursor-pointer hover:text-zinc-300 transition-colors"
                onClick={() => toggleSort("deprivation")}
              >
                Deprivation{arrow("deprivation")}
              </th>
              <th className="text-center px-2 py-1.5">2024</th>
              <th className="text-center px-2 py-1.5">Predicted</th>
              <th
                className="text-right px-2 py-1.5 cursor-pointer hover:text-zinc-300 transition-colors"
                onClick={() => toggleSort("conVote")}
              >
                CON{arrow("conVote")}
              </th>
              <th
                className="text-right px-2 py-1.5 cursor-pointer hover:text-zinc-300 transition-colors"
                onClick={() => toggleSort("refVote")}
              >
                REF{arrow("refVote")}
              </th>
              <th className="text-right px-2 py-1.5">LAB</th>
              <th className="text-right px-2 py-1.5">Electorate</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((w) => (
              <tr
                key={w.name}
                className={`border-t border-border/60 cursor-pointer transition-colors ${
                  selected === w.name
                    ? "bg-emerald-500/10"
                    : "hover:bg-muted/40"
                }`}
                onClick={() => setSelected(selected === w.name ? null : w.name)}
              >
                <td className="px-2 py-1.5 text-zinc-200 font-medium whitespace-nowrap">
                  {w.name}
                  {w.swing && (
                    <span className="ml-1 text-[8px] text-amber-400" title="Predicted to swing">
                      SWING
                    </span>
                  )}
                </td>
                <td className="text-right px-2 py-1.5 text-zinc-400 tabular-nums">
                  {w.population.toLocaleString()}
                </td>
                <td className="text-center px-2 py-1.5">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${
                      depBg[w.deprivation] ?? "bg-muted text-zinc-400"
                    }`}
                  >
                    {w.deprivation}
                  </span>
                </td>
                <td className="text-center px-2 py-1.5">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${
                      partyBg[w.winner2024] ?? "text-zinc-400"
                    }`}
                  >
                    {w.winner2024}
                  </span>
                </td>
                <td className="text-center px-2 py-1.5">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${
                      partyBg[w.predictedWinner] ?? "text-zinc-400"
                    }`}
                  >
                    {w.predictedWinner}
                  </span>
                </td>
                <td className="text-right px-2 py-1.5 text-zinc-400 tabular-nums">{w.conVote}%</td>
                <td className="text-right px-2 py-1.5 text-zinc-400 tabular-nums">{w.refVote}%</td>
                <td className="text-right px-2 py-1.5 text-zinc-400 tabular-nums">{w.labVote}%</td>
                <td className="text-right px-2 py-1.5 text-zinc-400 tabular-nums">
                  {w.electorate ? w.electorate.toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── DETAIL CARD ────────────────────────────────────── */}
      {detail && (
        <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-4">
          {/* header */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">{detail.name}</h3>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-500">
                <span>Pop {detail.population.toLocaleString()}</span>
                <span>Electorate {detail.electorate.toLocaleString()}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                    depBg[detail.deprivation] ?? ""
                  }`}
                >
                  {detail.deprivation} deprivation
                </span>
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-zinc-600 hover:text-zinc-300 text-xs transition-colors"
            >
              Close
            </button>
          </div>

          {/* swing indicator */}
          {detail.swing && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-amber-400 text-[11px] font-medium">Swing ward</span>
              <span className="text-[10px] text-zinc-400">
                {detail.winner2024} &rarr; {detail.predictedWinner}
              </span>
            </div>
          )}

          {/* electoral */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">2024 Winner</div>
              <span
                className={`text-sm font-bold ${
                  partyBg[detail.winner2024]?.split(" ")[1] ?? "text-zinc-300"
                }`}
              >
                {detail.winner2024}
              </span>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Predicted</div>
              <span
                className={`text-sm font-bold ${
                  partyBg[detail.predictedWinner]?.split(" ")[1] ?? "text-zinc-300"
                }`}
              >
                {detail.predictedWinner}
              </span>
            </div>
          </div>

          {/* vote bars */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Vote Share Estimates</div>
            <VoteBar label="CON" pct={detail.conVote} color={partyColor.CON} />
            <VoteBar label="REF" pct={detail.refVote} color={partyColor.Reform} />
            <VoteBar label="LAB" pct={detail.labVote} color={partyColor.LAB} />
            <VoteBar label="LD" pct={detail.ldVote} color={partyColor.LD} />
            <VoteBar label="GRN" pct={detail.grnVote} color={partyColor.Green} />
          </div>

          {/* demographics (if available) */}
          {detailDemo ? (
            <div className="space-y-3">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Census Demographics
                <span className="ml-1 text-zinc-600">(+/- vs constituency avg)</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <DemoSection label="Age" catKey="age" data={detailDemo.age} avg={demographics.age} />
                <DemoSection
                  label="Ethnicity"
                  catKey="ethnicity"
                  data={detailDemo.ethnicity}
                  avg={demographics.ethnicity}
                />
                <DemoSection
                  label="Housing"
                  catKey="housing"
                  data={detailDemo.housing}
                  avg={demographics.housing}
                />
                <DemoSection
                  label="Education"
                  catKey="education"
                  data={detailDemo.education}
                  avg={demographics.education}
                />
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-zinc-600 italic">
              Ward-level census demographics not available for this ward.
            </div>
          )}
        </div>
      )}

      {!selected && (
        <div className="text-[10px] text-zinc-600 text-center">
          Click a row to view detailed ward data
        </div>
      )}
    </div>
  );
}
