"use client";

import { useEffect, useState } from "react";
import {
  ecPrediction as fallbackEcPrediction,
  wardElectoralCalc as fallbackWardElectoralCalc,
} from "@/data/braintree";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";
import { getFullData } from "@/data";

type View = "results" | "prediction" | "wards";

const partyColors: Record<string, string> = {
  CON: "#0087DC", LAB: "#DC241f", Reform: "#12B6CF", LIB: "#FAA61A", Green: "#6AB023", OTH: "#999",
};

// The data-layer candidate `party` field uses long form (e.g. "Conservative
// and Unionist Party"). Map to the short display labels + colours the UI uses.
// Anything unmapped falls into "Other".
interface PartyMeta { label: string; color: string; }
function partyMeta(longName: string): PartyMeta {
  const n = longName.toLowerCase();
  if (n.includes("conservative")) return { label: "Conservative", color: "#0087DC" };
  if (n.includes("labour")) return { label: "Labour", color: "#DC241f" };
  if (n.includes("reform")) return { label: "Reform UK", color: "#12B6CF" };
  if (n.includes("liberal democrat")) return { label: "Liberal Democrats", color: "#FAA61A" };
  if (n.includes("green")) return { label: "Green", color: "#6AB023" };
  if (n.includes("plaid")) return { label: "Plaid Cymru", color: "#005B54" };
  if (n.includes("snp") || n.includes("scottish national")) return { label: "SNP", color: "#FDF38E" };
  return { label: longName, color: "#999999" };
}

interface ResultRow {
  party: string;        // short display name
  candidate: string;    // real candidate name from data layer, or "<Party> Candidate" fallback
  votes: number;
  percentage: number;
  color: string;
}

interface DerivedResults {
  year: number;
  turnout: number;      // percentage
  majority: number;     // percentage (winner share - runner-up share)
  electorate: number;
  results: ResultRow[];
}

// Build the 2024 results view from the data layer for the active constituency.
// Top 5 by votes shown individually; the rest are grouped as "Other".
function deriveResults(slug: string): DerivedResults | null {
  const data = getFullData(slug);
  if (!data) return null;
  const candidates = data.candidates ?? [];
  const r2024 = data.constituency.results2024;

  if (candidates.length === 0) {
    return {
      year: 2024,
      turnout: r2024.turnoutPct,
      majority: 0,
      electorate: data.constituency.electorate,
      results: [],
    };
  }

  const sorted = [...candidates].sort((a, b) => b.votes - a.votes);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);

  const rows: ResultRow[] = top.map((c) => {
    const meta = partyMeta(c.party);
    return {
      party: meta.label,
      candidate: c.name,
      votes: c.votes,
      percentage: c.share,
      color: meta.color,
    };
  });

  if (rest.length > 0) {
    const otherVotes = rest.reduce((sum, c) => sum + c.votes, 0);
    const otherShare = rest.reduce((sum, c) => sum + c.share, 0);
    rows.push({
      party: "Other",
      candidate: `${rest.length} candidate${rest.length === 1 ? "" : "s"}`,
      votes: otherVotes,
      percentage: Math.round(otherShare * 10) / 10,
      color: "#999999",
    });
  }

  const winner = sorted[0];
  const runnerUp = sorted[1];
  const majorityPct = runnerUp ? Math.round((winner.share - runnerUp.share) * 10) / 10 : winner.share;

  return {
    year: 2024,
    turnout: r2024.turnoutPct,
    majority: majorityPct,
    electorate: data.constituency.electorate,
    results: rows,
  };
}

interface ECConstituencyData {
  prediction: string;
  predicted: Record<string, { share: number }>;
  winningChances: Record<string, number>;
  wards: Array<{ ward: string; district: string; electorate: number; winner2024: string; predictedWinner: string }>;
}

// Convert live EC constituency data to the shape used by ecPrediction
function toLiveEcPrediction(ec: ECConstituencyData) {
  const predicted: Record<string, number> = {};
  const keyMap: Record<string, string> = { CON: "CON", LAB: "LAB", Reform: "Reform", LIB: "LIB", Green: "Green" };
  for (const [ecKey, ourKey] of Object.entries(keyMap)) {
    if (ec.predicted[ecKey]?.share) {
      predicted[ourKey] = ec.predicted[ecKey].share;
    }
  }
  return {
    prediction: ec.prediction,
    predicted,
    winningChances: ec.winningChances,
    lastUpdated: new Date().toISOString().slice(0, 10),
  };
}

// Convert live EC ward data to the shape used by wardElectoralCalc
function toLiveWardData(wards: ECConstituencyData["wards"]): Record<string, { electorate: number; winner2024: string; predictedWinner: string }> {
  const result: Record<string, { electorate: number; winner2024: string; predictedWinner: string }> = {};
  for (const w of wards) {
    if (w.ward) {
      result[w.ward] = {
        electorate: w.electorate,
        winner2024: w.winner2024,
        predictedWinner: w.predictedWinner,
      };
    }
  }
  return result;
}

export default function ElectoralIntel() {
  const { slug } = useConstituency();
  const results2024 = deriveResults(slug);
  const [view, setView] = useState<View>("results");
  const [ecPrediction, setEcPrediction] = useState<{
    prediction: string;
    predicted: Record<string, number>;
    winningChances: Record<string, number>;
    lastUpdated: string;
  }>(fallbackEcPrediction);
  const [wardElectoralCalc, setWardElectoralCalc] = useState<
    Record<string, { electorate: number; winner2024: string; predictedWinner: string }>
  >(fallbackWardElectoralCalc);
  const [dataSource, setDataSource] = useState<"fallback" | "live">("fallback");

  useEffect(() => {
    async function fetchLiveEC() {
      try {
        const res = await fetch(withConstituency("/api/electoral-calculus?type=seat", slug));
        if (!res.ok) return;
        const data: ECConstituencyData = await res.json();
        if (data.prediction && Object.keys(data.predicted).length > 0) {
          setEcPrediction(toLiveEcPrediction(data));
          setDataSource("live");
        }
        if (data.wards && data.wards.length > 0) {
          const liveWards = toLiveWardData(data.wards);
          if (Object.keys(liveWards).length > 0) {
            setWardElectoralCalc(liveWards);
          }
        }
      } catch {
        // Keep fallback data
      }
    }
    fetchLiveEC();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const tabs: { key: View; label: string }[] = [
    { key: "results", label: "2024 Results" },
    { key: "prediction", label: "MRP Forecast" },
    { key: "wards", label: "Ward Map" },
  ];

  const wards = Object.entries(wardElectoralCalc);
  const swings = wards.filter(([, d]) => d.winner2024 !== d.predictedWinner);
  const wardCounts: Record<string, number> = {};
  for (const [, d] of wards) wardCounts[d.predictedWinner] = (wardCounts[d.predictedWinner] || 0) + 1;

  return (
    <div>
      {/* View tabs */}
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`flex-1 px-2 py-1.5 text-[11px] font-medium transition-colors ${
              view === t.key ? "text-emerald-400 border-b-2 border-emerald-400" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 2024 Results */}
      {view === "results" && (
        <div className="p-4 space-y-3">
          {!results2024 ? (
            <div className="text-[11px] text-zinc-500 text-center py-8">
              2024 results not available for this constituency.
            </div>
          ) : (
            <>
              <div className="flex justify-between text-xs text-zinc-500">
                <span>General Election {results2024.year}</span>
                <span>Turnout: {results2024.turnout}%</span>
              </div>
              {results2024.results.length === 0 ? (
                <div className="text-[11px] text-zinc-500 text-center py-4">
                  Candidate data not yet sourced for this constituency.
                </div>
              ) : (
                <div className="space-y-2">
                  {results2024.results.map((r) => (
                    <div key={r.party}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                          <span className="text-[12px] text-zinc-300">{r.party}</span>
                        </div>
                        <span className="text-[12px] font-medium text-zinc-200">{r.percentage}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${r.percentage}%`, backgroundColor: r.color }} />
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-0.5">
                        {r.candidate} · {r.votes.toLocaleString()} votes
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-zinc-600 text-center">
                Majority: {results2024.majority}% · Electorate: {results2024.electorate.toLocaleString()}
              </div>
            </>
          )}
        </div>
      )}

      {/* MRP Prediction */}
      {view === "prediction" && (
        <div className="p-4 space-y-3">
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <div className="text-[11px] text-zinc-500 mb-1">Constituency Prediction</div>
            <div className="text-base font-bold text-cyan-400">{ecPrediction.prediction}</div>
          </div>

          {/* Winning chances */}
          <div className="flex justify-center gap-4">
            {Object.entries(ecPrediction.winningChances)
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([party, chance]) => (
                <div key={party} className="text-center">
                  <div className="text-xl font-bold" style={{ color: partyColors[party] || "#999" }}>
                    {chance}%
                  </div>
                  <div className="text-[10px] text-zinc-500">{party}</div>
                </div>
              ))}
          </div>

          {/* Predicted shares */}
          <div className="space-y-1.5">
            <div className="text-[11px] text-zinc-500 font-medium">Predicted Vote Share</div>
            {Object.entries(ecPrediction.predicted)
              .filter(([k]) => k !== "OTH")
              .sort((a, b) => b[1] - a[1])
              .map(([party, share]) => (
                <div key={party} className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400 w-14">{party}</span>
                  <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${share * 2}%`, backgroundColor: partyColors[party] || "#999", opacity: 0.8 }} />
                  </div>
                  <span className="text-[11px] text-zinc-300 font-medium w-10 text-right">{share}%</span>
                </div>
              ))}
          </div>

          <div className="text-[10px] text-zinc-700 text-center">
            Source: Electoral Calculus MRP
            {dataSource === "live" && <span className="text-emerald-600 ml-1">(live)</span>}
          </div>
        </div>
      )}

      {/* Ward breakdown */}
      {view === "wards" && (
        <div className="p-3 space-y-3">
          {/* Ward summary */}
          <div className="flex gap-2">
            {Object.entries(wardCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([party, count]) => (
                <div key={party} className="flex-1 bg-muted/30 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold" style={{ color: partyColors[party] || "#999" }}>{count}</div>
                  <div className="text-[10px] text-zinc-500">{party}</div>
                </div>
              ))}
          </div>
          <div className="text-[10px] text-zinc-600 text-center">{swings.length} wards predicted to change hands</div>

          {/* Ward table */}
          <div className="overflow-auto max-h-[250px]">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-zinc-500 border-b border-border">
                  <th className="text-left py-1 font-medium">Ward</th>
                  <th className="text-center py-1 font-medium">2024</th>
                  <th className="text-center py-1 font-medium">Pred</th>
                  <th className="text-right py-1 font-medium">Elect.</th>
                </tr>
              </thead>
              <tbody>
                {wards.map(([name, data]) => {
                  const changed = data.winner2024 !== data.predictedWinner;
                  return (
                    <tr key={name} className={`border-b border-border/30 ${changed ? "bg-red-500/5" : ""}`}>
                      <td className="py-1 text-zinc-300">{name}</td>
                      <td className="text-center">
                        <span style={{ color: partyColors[data.winner2024] || "#999" }}>{data.winner2024}</span>
                      </td>
                      <td className="text-center">
                        <span style={{ color: partyColors[data.predictedWinner] || "#999" }}>
                          {data.predictedWinner}
                          {changed && " \u26A1"}
                        </span>
                      </td>
                      <td className="text-right text-zinc-500">{data.electorate.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-[10px] text-zinc-700 text-center">
            Source: Electoral Calculus MRP
            {dataSource === "live" && <span className="text-emerald-600 ml-1">(live)</span>}
          </div>
        </div>
      )}
    </div>
  );
}
