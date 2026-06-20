"use client";

import { useConstituency } from "@/hooks/useConstituency";
import { getFullData } from "@/data";

const PARTY_COLORS: Record<string, string> = {
  con: "#1d4ed8",
  lab: "#dc2626",
  ld: "#f97316",
  reform: "#22d3ee",
  green: "#16a34a",
  other: "#6b7280",
};

const PARTY_NAMES: Record<string, string> = {
  con: "Conservative",
  lab: "Labour",
  ld: "Liberal Democrats",
  reform: "Reform UK",
  green: "Green",
  other: "Other",
};

export default function ElectionResults() {
  const { slug } = useConstituency();
  const data = getFullData(slug);
  const r = data?.constituency.results2024;

  if (!r) {
    return (
      <div className="p-4">
        <div className="text-xs text-zinc-500">Election results not available for this constituency.</div>
      </div>
    );
  }

  const knownVotes = r.con + r.lab + r.ld + r.reform + r.green;
  const otherVotes = Math.max(0, r.totalVotes - knownVotes);
  const otherShare = otherVotes > 0
    ? Math.round((otherVotes / r.totalVotes) * 1000) / 10
    : 0;

  const parties = [
    { key: "con", votes: r.con, share: r.conShare },
    { key: "lab", votes: r.lab, share: r.labShare },
    { key: "reform", votes: r.reform, share: r.reformShare },
    { key: "ld", votes: r.ld, share: r.ldShare },
    { key: "green", votes: r.green, share: r.greenShare },
    ...(otherVotes > 0 ? [{ key: "other", votes: otherVotes, share: otherShare }] : []),
  ]
    .filter((p) => p.votes > 0)
    .sort((a, b) => b.share - a.share);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>General Election 2024</span>
        <span>Turnout: {r.turnoutPct}%</span>
      </div>

      <div className="space-y-2.5">
        {parties.map((p) => (
          <div key={p.key}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: PARTY_COLORS[p.key] }}
                />
                <span className="text-sm text-zinc-300">{PARTY_NAMES[p.key]}</span>
              </div>
              <span className="text-sm font-medium text-zinc-200">{p.share}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${p.share}%`,
                  backgroundColor: PARTY_COLORS[p.key],
                }}
              />
            </div>
            <div className="text-[11px] text-zinc-600 mt-0.5">
              {p.votes.toLocaleString()} votes
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
