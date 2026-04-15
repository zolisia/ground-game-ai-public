"use client";

import { useEffect, useState } from "react";
import {
  ecPrediction as fallbackEcPrediction,
  wardElectoralCalc as fallbackWardElectoralCalc,
} from "@/data/braintree";

const partyColors: Record<string, string> = {
  CON: "#0087DC",
  LAB: "#DC241f",
  Reform: "#12B6CF",
  LIB: "#FAA61A",
  Green: "#6AB023",
  OTH: "#999999",
};

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

export default function ECPrediction() {
  const [pred, setPred] = useState<{
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
        const res = await fetch("/api/electoral-calculus?type=seat&seat=Braintree");
        if (!res.ok) return;
        const data: ECConstituencyData = await res.json();
        if (data.prediction && Object.keys(data.predicted).length > 0) {
          setPred(toLiveEcPrediction(data));
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
  }, []);

  const wards = Object.entries(wardElectoralCalc);

  // Count ward predictions
  const wardCounts: Record<string, number> = {};
  for (const [, data] of wards) {
    wardCounts[data.predictedWinner] = (wardCounts[data.predictedWinner] || 0) + 1;
  }

  // Count swings (wards that changed)
  const swings = wards.filter(([, d]) => d.winner2024 !== d.predictedWinner);

  return (
    <div className="space-y-4">
      {/* Headline prediction */}
      <div className="bg-zinc-800/30 rounded-lg p-3">
        <div className="text-xs text-zinc-500 mb-1">Constituency Prediction</div>
        <div className="text-lg font-bold text-cyan-400">{pred.prediction}</div>
        <div className="flex gap-3 mt-2">
          {Object.entries(pred.winningChances)
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
      </div>

      {/* Predicted vote shares */}
      <div>
        <div className="text-xs text-zinc-500 mb-2 font-medium">Predicted Vote Share</div>
        <div className="space-y-1.5">
          {Object.entries(pred.predicted)
            .filter(([k]) => k !== "OTH")
            .sort((a, b) => b[1] - a[1])
            .map(([party, share]) => (
              <div key={party} className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-400 w-14">{party}</span>
                <div className="flex-1 bg-zinc-800 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${share * 2}%`,
                      backgroundColor: partyColors[party] || "#999",
                      opacity: 0.8,
                    }}
                  />
                </div>
                <span className="text-xs text-zinc-300 font-medium w-12 text-right">{share}%</span>
              </div>
            ))}
        </div>
      </div>

      {/* Ward swing summary */}
      <div>
        <div className="text-xs text-zinc-500 mb-2 font-medium">
          Ward Predictions ({wards.length} wards)
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(wardCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([party, count]) => (
              <div key={party} className="bg-zinc-800/30 rounded-lg p-2 text-center">
                <div className="text-lg font-bold" style={{ color: partyColors[party] || "#999" }}>
                  {count}
                </div>
                <div className="text-[10px] text-zinc-500">{party} wards</div>
              </div>
            ))}
        </div>
        <div className="mt-2 text-[11px] text-zinc-600">
          {swings.length} ward{swings.length !== 1 ? "s" : ""} predicted to change hands
        </div>
      </div>

      {/* Ward detail table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800">
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
                <tr key={name} className={`border-b border-zinc-800/30 ${changed ? "bg-zinc-800/20" : ""}`}>
                  <td className="py-1 text-zinc-300">{name}</td>
                  <td className="text-center">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{ color: partyColors[data.winner2024] || "#999" }}
                    >
                      {data.winner2024}
                    </span>
                  </td>
                  <td className="text-center">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{ color: partyColors[data.predictedWinner] || "#999" }}
                    >
                      {data.predictedWinner}
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
        Source: Electoral Calculus MRP &middot; Updated {pred.lastUpdated}
        {dataSource === "live" && <span className="text-emerald-600 ml-1">(live)</span>}
      </div>
    </div>
  );
}
