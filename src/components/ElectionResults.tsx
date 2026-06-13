"use client";

import { electionResults2024 } from "@/data/braintree";

export default function ElectionResults() {
  const { results, turnout, year } = electionResults2024;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>General Election {year}</span>
        <span>Turnout: {turnout}%</span>
      </div>

      <div className="space-y-2.5">
        {results.map((r) => (
          <div key={r.party}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                <span className="text-sm text-zinc-300">{r.party}</span>
              </div>
              <span className="text-sm font-medium text-zinc-200">
                {r.percentage}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${r.percentage}%`,
                  backgroundColor: r.color,
                }}
              />
            </div>
            <div className="text-[11px] text-zinc-600 mt-0.5">
              {r.candidate} &middot; {r.votes.toLocaleString()} votes
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
