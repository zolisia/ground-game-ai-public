"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
  Cell,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";
import { getFullData } from "@/data";

// Party colors
const PARTY_COLORS: Record<string, string> = {
  con: "#0087DC",
  lab: "#DC241f",
  reform: "#12B6CF",
  ld: "#FAA61A",
  green: "#6AB023",
};

const PARTY_NAMES: Record<string, string> = {
  con: "Conservative",
  lab: "Labour",
  reform: "Reform UK",
  ld: "Lib Dems",
  green: "Green",
};

interface PollRecord {
  date: string;
  pollster: string;
  sampleSize: string;
  con: number;
  lab: number;
  reform: number;
  ld: number;
  green: number;
  lead: string;
}

interface TimeSeriesPoint {
  index: number;
  date: string;
  pollster: string;
  con: number;
  lab: number;
  reform: number;
  ld: number;
  green: number;
}

interface MIIRecord {
  issue: string;
  pct: number;
  change?: number;
}

interface LeaderRating {
  name: string;
  party: string;
  rating: number;
  change: number;
  color: string;
}

interface TrackerPoint {
  date: string;
  value: number;
  label?: string;
}

interface SeatProjection {
  party: string;
  seats: number;
  change: number;
  color: string;
}

interface ECNational {
  seats: Record<string, number>;
  voteShare: Record<string, number>;
  outcome: string;
  majority: number;
  largestParty: string;
  lastUpdated: string;
  source: string;
}

interface ECConstituency {
  name: string;
  mp: string;
  mpParty: string;
  electorate: number;
  turnout: number;
  prediction: string;
  results2024: Record<string, { votes: number; share: number }>;
  predicted: Record<string, { share: number }>;
  winningChances: Record<string, number>;
  wards: Array<{ ward: string; district: string; electorate: number; winner2024: string; predictedWinner: string }>;
}

interface PollingData {
  polls: PollRecord[];
  timeSeries: TimeSeriesPoint[];
  averages: Record<string, number>;
  trackers: {
    govApproval: TrackerPoint[];
    rightDirection: TrackerPoint[];
    economicConfidence: TrackerPoint[];
  };
  mii: MIIRecord[];
  leaderRatings: LeaderRating[];
  seatProjection?: SeatProjection[];
  source: string;
}

type Section = "intention" | "seats" | "leaders" | "issues" | "local" | "trackers";


function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; dataKey?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border px-3 py-2 text-xs shadow-lg">
      <p className="text-zinc-400 mb-1 font-medium">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-zinc-500">
            {PARTY_NAMES[entry.dataKey || entry.name] || entry.name}:
          </span>
          <span className="text-zinc-200 font-bold">{entry.value}%</span>
        </p>
      ))}
    </div>
  );
}

function TrackerTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border px-3 py-2 text-xs shadow-lg">
      <p className="text-zinc-400 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-zinc-200 font-bold">
          {entry.value > 0 ? "+" : ""}
          {entry.value}%
        </p>
      ))}
    </div>
  );
}

export default function PollingDashboard() {
  const { slug } = useConstituency();
  const fullData = getFullData(slug);
  const constituencyName = fullData?.constituency.name ?? "Constituency";
  const results2024 = fullData?.constituency.results2024 ?? null;
  const electorate2024 = fullData?.constituency.electorate ?? 0;
  const [data, setData] = useState<PollingData | null>(null);
  const [ecNational, setEcNational] = useState<ECNational | null>(null);
  const [ecConstituency, setEcConstituency] = useState<ECConstituency | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("intention");

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      try {
        // Fetch polling data and Electoral Calculus data in parallel
        const [pollingRes, ecRes] = await Promise.allSettled([
          fetch(withConstituency("/api/polling?type=all", slug)),
          fetch(withConstituency("/api/electoral-calculus?type=both", slug)),
        ]);

        if (pollingRes.status === "fulfilled" && pollingRes.value.ok) {
          const json = await pollingRes.value.json();
          setData(json);
        }

        if (ecRes.status === "fulfilled" && ecRes.value.ok) {
          const ecJson = await ecRes.value.json();
          if (ecJson.national) setEcNational(ecJson.national);
          if (ecJson.constituency) setEcConstituency(ecJson.constituency);
        }
      } catch {
        // Will show loading then static fallback
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const sections: { id: Section; label: string }[] = [
    { id: "intention", label: "Vote Intention" },
    { id: "seats", label: "Seat Projection" },
    { id: "local", label: constituencyName },
    { id: "leaders", label: "Leader Ratings" },
    { id: "issues", label: "Key Issues" },
    { id: "trackers", label: "Trackers" },
  ];

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="animate-pulse flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-7 w-24 bg-muted rounded" />
          ))}
        </div>
        <div className="animate-pulse h-64 bg-muted/50 rounded" />
        <div className="animate-pulse grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-muted/30 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return <div className="p-4 text-xs text-zinc-600">Unable to load polling data</div>;

  return (
    <div>
      {/* Section tabs */}
      <div className="flex border-b border-border">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
              section === s.id
                ? "text-emerald-400 border-b-2 border-emerald-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* ══════ VOTE INTENTION ══════ */}
        {section === "intention" && (
          <div className="space-y-4">
            {/* Current polling averages */}
            <div className="grid grid-cols-5 gap-2">
              {(["reform", "con", "lab", "ld", "green"] as const).map((party) => {
                const val = data.averages[party] || 0;
                // Determine ranking
                const sorted = Object.entries(data.averages)
                  .sort((a, b) => b[1] - a[1]);
                const rank = sorted.findIndex(([k]) => k === party) + 1;
                return (
                  <div
                    key={party}
                    className="bg-muted/50 border border-border/50 px-3 py-3 text-center relative overflow-hidden"
                  >
                    <div
                      className="absolute bottom-0 left-0 right-0 opacity-15"
                      style={{
                        backgroundColor: PARTY_COLORS[party],
                        height: `${Math.min(val * 2, 100)}%`,
                      }}
                    />
                    <div className="relative">
                      {rank === 1 && (
                        <span className="absolute -top-1 -right-1 text-[9px] text-emerald-400 font-bold">
                          #1
                        </span>
                      )}
                      <p
                        className="text-2xl font-black"
                        style={{ color: PARTY_COLORS[party] }}
                      >
                        {val}%
                      </p>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">
                        {PARTY_NAMES[party]}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Trend line chart */}
            <div>
              <p className="text-[11px] text-zinc-500 mb-2">Polling trend (last 30 polls)</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "#52525b" }}
                    axisLine={{ stroke: "#27272a" }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "#52525b" }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                    domain={[0, 40]}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="reform" stroke="#12B6CF" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="con" stroke="#0087DC" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="lab" stroke="#DC241f" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ld" stroke="#FAA61A" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="green" stroke="#6AB023" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="flex items-center justify-center gap-4 mt-2">
                {Object.entries(PARTY_COLORS).map(([key, color]) => (
                  <span key={key} className="flex items-center gap-1 text-[10px] text-zinc-500">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    {PARTY_NAMES[key]}
                  </span>
                ))}
              </div>
            </div>

            {/* Recent polls table */}
            <div>
              <p className="text-[11px] text-zinc-500 mb-2">Recent polls</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">Date</th>
                      <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">Pollster</th>
                      <th className="text-center py-1.5 px-2 font-medium" style={{ color: PARTY_COLORS.con }}>CON</th>
                      <th className="text-center py-1.5 px-2 font-medium" style={{ color: PARTY_COLORS.lab }}>LAB</th>
                      <th className="text-center py-1.5 px-2 font-medium" style={{ color: PARTY_COLORS.reform }}>REF</th>
                      <th className="text-center py-1.5 px-2 font-medium" style={{ color: PARTY_COLORS.ld }}>LD</th>
                      <th className="text-center py-1.5 px-2 font-medium" style={{ color: PARTY_COLORS.green }}>GRN</th>
                      <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">Lead</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.polls.slice(0, 12).map((poll, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                      >
                        <td className="py-1.5 px-2 text-zinc-400">{poll.date}</td>
                        <td className="py-1.5 px-2 text-zinc-300 font-medium">{poll.pollster}</td>
                        <td className="py-1.5 px-2 text-center text-zinc-300">{poll.con}</td>
                        <td className="py-1.5 px-2 text-center text-zinc-300">{poll.lab}</td>
                        <td className="py-1.5 px-2 text-center text-zinc-200 font-bold">{poll.reform}</td>
                        <td className="py-1.5 px-2 text-center text-zinc-400">{poll.ld}</td>
                        <td className="py-1.5 px-2 text-center text-zinc-400">{poll.green}</td>
                        <td className="py-1.5 px-2 text-right font-bold text-emerald-400">{poll.lead}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="text-[10px] text-zinc-700 flex items-center justify-between">
              <span>Source: Wikipedia / Electoral Calculus / BPC pollsters</span>
              <a
                href="https://en.wikipedia.org/wiki/Opinion_polling_for_the_next_United_Kingdom_general_election"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-600 hover:text-emerald-400 flex items-center gap-1"
              >
                Full data <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          </div>
        )}

        {/* ══════ SEAT PROJECTION ══════ */}
        {section === "seats" && (
          <SeatProjectionSection averages={data.averages} ecNational={ecNational} />
        )}

        {/* ══════ LOCAL POLLING ══════ */}
        {section === "local" && (
          results2024 ? (
            <LocalSection averages={data.averages} ecConstituency={ecConstituency} constituencyName={constituencyName} results2024={results2024} electorate={electorate2024} />
          ) : (
            <div className="p-4 text-center">
              <div className="text-xs text-zinc-500">
                Local polling data not yet available for {constituencyName}.
              </div>
            </div>
          )
        )}

        {/* ══════ LEADER RATINGS ══════ */}
        {section === "leaders" && (
          <div className="space-y-4">
            <p className="text-[11px] text-zinc-500">Net approval ratings (approve minus disapprove)</p>

            <div className="space-y-3">
              {data.leaderRatings.map((leader) => {
                const barWidth = Math.min(Math.abs(leader.rating) * 2, 100);
                const isNegative = leader.rating < 0;
                return (
                  <div key={leader.name} className="bg-muted/50 border border-border/50 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm text-zinc-200 font-medium">{leader.name}</span>
                        <span
                          className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-semibold"
                          style={{ backgroundColor: leader.color + "30", color: leader.color }}
                        >
                          {leader.party}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-black ${isNegative ? "text-red-400" : "text-emerald-400"}`}>
                          {leader.rating > 0 ? "+" : ""}{leader.rating}
                        </span>
                        <span className="flex items-center gap-0.5 text-[10px]">
                          {leader.change > 0 ? (
                            <TrendingUp className="h-3 w-3 text-emerald-500" />
                          ) : leader.change < 0 ? (
                            <TrendingDown className="h-3 w-3 text-red-400" />
                          ) : (
                            <Minus className="h-3 w-3 text-zinc-500" />
                          )}
                          <span className={leader.change > 0 ? "text-emerald-500" : leader.change < 0 ? "text-red-400" : "text-zinc-500"}>
                            {leader.change > 0 ? "+" : ""}{leader.change}
                          </span>
                        </span>
                      </div>
                    </div>
                    {/* Bar visualization */}
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: isNegative ? "#f87171" : "#10b981",
                          opacity: 0.7,
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-[9px] text-zinc-600">
                      <span>-100</span>
                      <span>0</span>
                      <span>+100</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-muted/30 border border-border/50 px-4 py-3">
              <p className="text-[11px] text-zinc-400 mb-2 font-medium">Best Prime Minister</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xl font-black" style={{ color: PARTY_COLORS.reform }}>28%</p>
                  <p className="text-[10px] text-zinc-500">Farage</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black" style={{ color: PARTY_COLORS.lab }}>20%</p>
                  <p className="text-[10px] text-zinc-500">Starmer</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black" style={{ color: PARTY_COLORS.con }}>18%</p>
                  <p className="text-[10px] text-zinc-500">Badenoch</p>
                </div>
              </div>
              <p className="text-[9px] text-zinc-600 text-center mt-2">34% Don&apos;t know</p>
            </div>

            <p className="text-[10px] text-zinc-700">Source: Aggregated YouGov/Savanta/Opinium tracker data</p>
          </div>
        )}

        {/* ══════ KEY ISSUES ══════ */}
        {section === "issues" && (
          <div className="space-y-4">
            <p className="text-[11px] text-zinc-500">
              Most Important Issues facing the country (% of respondents mentioning)
            </p>

            {/* Horizontal bar chart */}
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data.mii} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 9, fill: "#52525b" }}
                  axisLine={{ stroke: "#27272a" }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="issue"
                  tick={{ fontSize: 10, fill: "#a1a1aa" }}
                  axisLine={false}
                  tickLine={false}
                  width={120}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [`${value}%`, "Mentioned by"]}
                  contentStyle={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #3f3f46",
                    fontSize: 11,
                  }}
                />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                  {data.mii.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={index === 0 ? "#10b981" : index < 3 ? "#3b82f6" : "#52525b"}
                      fillOpacity={1 - index * 0.06}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Change indicators */}
            <div className="grid grid-cols-2 gap-2">
              {data.mii.slice(0, 6).map((issue) => (
                <div
                  key={issue.issue}
                  className="flex items-center justify-between bg-muted/30 border border-border/50 px-3 py-2"
                >
                  <span className="text-[11px] text-zinc-300">{issue.issue}</span>
                  <span className="flex items-center gap-1 text-[10px]">
                    <span className="font-bold text-zinc-200">{issue.pct}%</span>
                    {issue.change && issue.change !== 0 && (
                      <span className={issue.change > 0 ? "text-emerald-500" : "text-red-400"}>
                        {issue.change > 0 ? (
                          <TrendingUp className="h-3 w-3 inline" />
                        ) : (
                          <TrendingDown className="h-3 w-3 inline" />
                        )}
                        {issue.change > 0 ? "+" : ""}{issue.change}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-zinc-700">
              Source: Ipsos Issues Index / YouGov MII tracker patterns. Multiple responses allowed.
            </p>
          </div>
        )}

        {/* ══════ TRACKERS ══════ */}
        {section === "trackers" && (
          <div className="space-y-5">
            {/* Government Approval */}
            <TrackerChart
              title="Government Approval"
              subtitle="% who approve of government performance"
              data={data.trackers.govApproval}
              color="#3b82f6"
              gradientId="govGrad"
            />

            {/* Right Direction */}
            <TrackerChart
              title="Right Direction"
              subtitle="% who think the country is heading in the right direction"
              data={data.trackers.rightDirection}
              color="#10b981"
              gradientId="dirGrad"
            />

            {/* Economic Confidence */}
            <TrackerChart
              title="Economic Confidence"
              subtitle="Net economic optimism (optimists minus pessimists)"
              data={data.trackers.economicConfidence}
              color="#f59e0b"
              gradientId="econGrad"
              allowNegative
            />

            <p className="text-[10px] text-zinc-700">
              Source: Aggregated tracker data from YouGov, Ipsos, Savanta. Updated monthly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SEAT PROJECTION SECTION — Electoral Calculus MRP
// ═══════════════════════════════════════════════════

function SeatProjectionSection({ averages, ecNational }: { averages: Record<string, number>; ecNational: ECNational | null }) {
  // 2024 actual seats (for change calculation)
  const seats2024: Record<string, number> = { con: 121, lab: 411, reform: 5, ld: 72, green: 4, snp: 9, other: 28 };
  const result2024: Record<string, number> = { con: 23.7, lab: 33.7, reform: 14.3, ld: 12.2, green: 6.8 };
  const totalSeats = 650;
  const majorityLine = 326;

  // Use Electoral Calculus data if available, otherwise fall back to UNS
  const useEC = !!ecNational && Object.keys(ecNational.seats).length >= 3;

  let projected: SeatProjection[];
  let sourceName: string;

  if (useEC) {
    // Real Electoral Calculus MRP data
    sourceName = ecNational!.source;
    const ecSeats = ecNational!.seats;
    projected = [
      { party: "Reform UK", seats: ecSeats.reform || 0, change: (ecSeats.reform || 0) - seats2024.reform, color: PARTY_COLORS.reform },
      { party: "Labour", seats: ecSeats.lab || 0, change: (ecSeats.lab || 0) - seats2024.lab, color: PARTY_COLORS.lab },
      { party: "Conservative", seats: ecSeats.con || 0, change: (ecSeats.con || 0) - seats2024.con, color: PARTY_COLORS.con },
      { party: "Lib Dems", seats: ecSeats.ld || 0, change: (ecSeats.ld || 0) - seats2024.ld, color: PARTY_COLORS.ld },
      { party: "Green", seats: ecSeats.green || 0, change: (ecSeats.green || 0) - seats2024.green, color: PARTY_COLORS.green },
      { party: "SNP", seats: ecSeats.snp || seats2024.snp, change: (ecSeats.snp || seats2024.snp) - seats2024.snp, color: "#FFF95D" },
      { party: "Other", seats: ecSeats.other || seats2024.other, change: 0, color: "#6b7280" },
    ];
  } else {
    // Fallback UNS model
    sourceName = "Uniform National Swing (estimated)";
    const swings: Record<string, number> = {};
    for (const party of ["con", "lab", "reform", "ld", "green"]) {
      swings[party] = (averages[party] || 0) - result2024[party];
    }
    const mult: Record<string, number> = { con: 3.5, lab: 4.0, reform: 2.0, ld: 1.5, green: 0.5 };
    projected = [
      { party: "Reform UK", seats: Math.max(0, Math.round(seats2024.reform + (swings.reform || 0) * mult.reform)), change: 0, color: PARTY_COLORS.reform },
      { party: "Labour", seats: Math.max(0, Math.round(seats2024.lab + (swings.lab || 0) * mult.lab)), change: 0, color: PARTY_COLORS.lab },
      { party: "Conservative", seats: Math.max(0, Math.round(seats2024.con + (swings.con || 0) * mult.con)), change: 0, color: PARTY_COLORS.con },
      { party: "Lib Dems", seats: Math.max(0, Math.round(seats2024.ld + (swings.ld || 0) * mult.ld)), change: 0, color: PARTY_COLORS.ld },
      { party: "Green", seats: Math.max(0, Math.round(seats2024.green + (swings.green || 0) * mult.green)), change: 0, color: PARTY_COLORS.green },
      { party: "SNP", seats: seats2024.snp, change: 0, color: "#FFF95D" },
      { party: "Other", seats: seats2024.other, change: 0, color: "#6b7280" },
    ];
    // Calculate changes
    projected[0].change = projected[0].seats - seats2024.reform;
    projected[1].change = projected[1].seats - seats2024.lab;
    projected[2].change = projected[2].seats - seats2024.con;
    projected[3].change = projected[3].seats - seats2024.ld;
    projected[4].change = projected[4].seats - seats2024.green;
    // Normalise
    const total = projected.reduce((s, p) => s + p.seats, 0);
    if (total !== totalSeats && total > 0) {
      const scale = totalSeats / total;
      for (const p of projected) p.seats = Math.round(p.seats * scale);
    }
  }

  const sorted = [...projected].sort((a, b) => b.seats - a.seats);
  const largestParty = sorted[0];

  // Swings (always show from polling data)
  const swings: Record<string, number> = {};
  for (const party of ["con", "lab", "reform", "ld", "green"]) {
    swings[party] = (averages[party] || 0) - result2024[party];
  }

  // EC vote share if available
  const ecVote = ecNational?.voteShare;

  return (
    <div className="space-y-4">
      {/* Source badge */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-zinc-500">
          {useEC ? "MRP constituency-level model" : "Estimated from Uniform National Swing"}
        </p>
        <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${useEC ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
          {useEC ? "ELECTORAL CALCULUS MRP" : "UNS ESTIMATE"}
        </span>
      </div>

      {/* Majority indicator */}
      <div className="bg-muted/50 border border-border/50 px-4 py-3 text-center">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Projected Outcome</p>
        <p className="text-lg font-black" style={{ color: largestParty.color }}>
          {useEC && ecNational?.outcome
            ? ecNational.outcome
            : largestParty.seats >= majorityLine
              ? `${largestParty.party} Majority (${largestParty.seats - majorityLine + 1})`
              : `Hung Parliament — ${largestParty.party} Largest (${largestParty.seats} seats)`}
        </p>
        <p className="text-[10px] text-zinc-500 mt-1">{majorityLine} seats needed for majority</p>
      </div>

      {/* Parliament bar visualization */}
      <div>
        <div className="flex h-12 rounded overflow-hidden gap-px">
          {sorted.filter(p => p.seats > 0).map((p) => (
            <div
              key={p.party}
              className="flex items-center justify-center transition-all duration-500 relative group"
              style={{
                backgroundColor: p.color,
                width: `${(p.seats / totalSeats) * 100}%`,
                opacity: 0.85,
              }}
              title={`${p.party}: ${p.seats} seats`}
            >
              {p.seats >= 20 && (
                <div className="text-center">
                  <span className="text-[11px] font-black text-white/90 block leading-tight">{p.seats}</span>
                  {p.seats >= 40 && (
                    <span className="text-[8px] text-white/60 block leading-tight">{p.party}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Majority line marker */}
        <div className="relative h-4">
          <div
            className="absolute top-0 w-px h-3 bg-white/50"
            style={{ left: `${(majorityLine / totalSeats) * 100}%` }}
          />
          <span
            className="absolute top-3 text-[9px] text-zinc-400 -translate-x-1/2 font-medium"
            style={{ left: `${(majorityLine / totalSeats) * 100}%` }}
          >
            326 majority
          </span>
        </div>
      </div>

      {/* Seat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {sorted.filter(p => p.seats > 0).map((p) => (
          <div key={p.party} className="bg-muted/30 border border-border/50 px-3 py-2 text-center">
            <p className="text-xl font-black" style={{ color: p.color }}>{p.seats}</p>
            <p className="text-[10px] text-zinc-500">{p.party}</p>
            <p className={`text-[10px] ${p.change > 0 ? "text-emerald-500" : p.change < 0 ? "text-red-400" : "text-zinc-600"}`}>
              {p.change > 0 ? "+" : ""}{p.change} vs 2024
            </p>
          </div>
        ))}
      </div>

      {/* EC vote share if available */}
      {ecVote && Object.keys(ecVote).length > 0 && (
        <div>
          <p className="text-[11px] text-zinc-500 mb-2">Projected vote share (MRP)</p>
          <div className="grid grid-cols-5 gap-2">
            {(["reform", "con", "lab", "ld", "green"] as const).map((party) => {
              const pct = ecVote[party] || 0;
              return (
                <div key={party} className="bg-muted/30 border border-border/50 px-2 py-2 text-center">
                  <p className="text-sm font-bold" style={{ color: PARTY_COLORS[party] }}>
                    {pct}%
                  </p>
                  <p className="text-[9px] text-zinc-600 uppercase">{PARTY_NAMES[party]}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* National swing from polling */}
      <div>
        <p className="text-[11px] text-zinc-500 mb-2">National swing since 2024 election (polling)</p>
        <div className="grid grid-cols-5 gap-2">
          {(["reform", "con", "lab", "ld", "green"] as const).map((party) => {
            const swing = swings[party];
            return (
              <div key={party} className="bg-muted/30 border border-border/50 px-2 py-2 text-center">
                <p className={`text-sm font-bold ${swing > 0 ? "text-emerald-400" : swing < 0 ? "text-red-400" : "text-zinc-400"}`}>
                  {swing > 0 ? "+" : ""}{swing.toFixed(1)}%
                </p>
                <p className="text-[9px] text-zinc-600 uppercase">{PARTY_NAMES[party]}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Source info */}
      <div className="flex items-center justify-between text-[10px] text-zinc-700">
        <span>Source: {sourceName}</span>
        <a
          href="https://www.electoralcalculus.co.uk/prediction_main.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-600 hover:text-emerald-400 flex items-center gap-1"
        >
          Electoral Calculus <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// LOCAL SECTION — EC MRP + UNS fallback
// ═══════════════════════════════════════════════════

interface Results2024Shape {
  conShare: number; labShare: number; ldShare: number; reformShare: number; greenShare: number;
  turnoutPct: number; winner: string; majority: number;
}

function LocalSection({ averages, ecConstituency, constituencyName, results2024, electorate }: {
  averages: Record<string, number>;
  ecConstituency: ECConstituency | null;
  constituencyName: string;
  results2024: Results2024Shape;
  electorate: number;
}) {
  const national2024: Record<string, number> = { con: 23.7, lab: 33.7, reform: 14.3, ld: 12.2, green: 6.8 };

  const base2024: Record<string, number> = {
    con: results2024.conShare,
    lab: results2024.labShare,
    reform: results2024.reformShare,
    ld: results2024.ldShare,
    green: results2024.greenShare,
  };

  const winnerKeyMap: Record<string, string> = { Con: "con", Lab: "lab", LD: "ld", Reform: "reform", Green: "green" };
  const currentHolder = winnerKeyMap[results2024.winner] ?? "con";

  const useEC = !!ecConstituency && Object.keys(ecConstituency.predicted).length > 0;

  // Build local projection from EC data or UNS fallback
  const localProjection: Record<string, number> = {};
  if (useEC) {
    const p = ecConstituency!.predicted;
    const keyMap: Record<string, string> = { CON: "con", LAB: "lab", Reform: "reform", LIB: "ld", Green: "green" };
    for (const [ecKey, partyKey] of Object.entries(keyMap)) {
      localProjection[partyKey] = p[ecKey]?.share || 0;
    }
    if (Object.values(localProjection).every(v => v === 0)) {
      for (const party of ["con", "lab", "reform", "ld", "green"]) {
        const nationalSwing = (averages[party] || 0) - national2024[party];
        localProjection[party] = Math.max(0, Math.round((base2024[party] + nationalSwing) * 10) / 10);
      }
    }
  } else {
    for (const party of ["con", "lab", "reform", "ld", "green"]) {
      const nationalSwing = (averages[party] || 0) - national2024[party];
      localProjection[party] = Math.max(0, Math.round((base2024[party] + nationalSwing) * 10) / 10);
    }
  }

  // Top 2 challengers by 2024 vote share (for vulnerability analysis)
  const topChallengers = (["con", "lab", "reform", "ld", "green"] as const)
    .filter(p => p !== currentHolder)
    .sort((a, b) => (base2024[b] ?? 0) - (base2024[a] ?? 0))
    .slice(0, 2);
  const holderShare = base2024[currentHolder] ?? 0;

  // Determine projected winner
  const sorted = Object.entries(localProjection).sort((a, b) => b[1] - a[1]);
  const projectedWinner = sorted[0];
  const projectedSecond = sorted[1];
  const projectedMajority = (projectedWinner[1] - projectedSecond[1]).toFixed(1);
  const wouldChange = projectedWinner[0] !== currentHolder;

  // EC winning probabilities
  const hasChances = useEC && ecConstituency && Object.keys(ecConstituency.winningChances).length > 0;

  // EC ward data
  const hasWards = useEC && ecConstituency && ecConstituency.wards.length > 0;

  // EC prediction text
  const ecPrediction = useEC ? ecConstituency!.prediction : "";

  return (
    <div className="space-y-4">
      {/* Source badge */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-zinc-500">
          {useEC ? `Electoral Calculus MRP prediction for ${constituencyName}` : `UNS projection for ${constituencyName} constituency`}
        </p>
        <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${useEC ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
          {useEC ? "EC MRP DATA" : "UNS ESTIMATE"}
        </span>
      </div>

      {/* Seat status banner */}
      <div className={`border px-4 py-3 text-center ${wouldChange ? "bg-red-500/10 border-red-500/30" : "bg-emerald-500/10 border-emerald-500/30"}`}>
        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: wouldChange ? "#f87171" : "#10b981" }}>
          {wouldChange ? "SEAT CHANGES HANDS" : "SEAT HOLDS"}
        </p>
        <p className="text-lg font-black" style={{ color: PARTY_COLORS[projectedWinner[0]] }}>
          {PARTY_NAMES[projectedWinner[0]]} Win
        </p>
        <p className="text-[11px] text-zinc-400">
          {ecPrediction || `Projected lead: ${projectedMajority}% over ${PARTY_NAMES[projectedSecond[0]]}`}
        </p>
      </div>

      {/* Winning Probabilities (EC MRP only) */}
      {hasChances && (
        <div>
          <p className="text-[11px] text-zinc-500 mb-2">Winning Probability (MRP model)</p>
          <div className="flex gap-1 h-8 rounded overflow-hidden">
            {Object.entries(ecConstituency!.winningChances)
              .sort((a, b) => b[1] - a[1])
              .filter(([, pct]) => pct > 0)
              .map(([party, pct]) => {
                const key = party.toLowerCase().replace("lib", "ld").replace("reform", "reform");
                const color = PARTY_COLORS[key] || "#6b7280";
                return (
                  <div
                    key={party}
                    className="flex items-center justify-center"
                    style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.8 }}
                    title={`${party}: ${pct}%`}
                  >
                    {pct >= 10 && (
                      <span className="text-[10px] font-bold text-white/90">{pct}%</span>
                    )}
                  </div>
                );
              })}
          </div>
          <div className="flex gap-3 mt-1.5 flex-wrap">
            {Object.entries(ecConstituency!.winningChances)
              .sort((a, b) => b[1] - a[1])
              .filter(([, pct]) => pct > 0)
              .map(([party, pct]) => {
                const key = party.toLowerCase().replace("lib", "ld");
                const color = PARTY_COLORS[key] || "#6b7280";
                return (
                  <span key={party} className="flex items-center gap-1 text-[10px]">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-zinc-400">{party}</span>
                    <span className="font-bold" style={{ color }}>{pct}%</span>
                  </span>
                );
              })}
          </div>
        </div>
      )}

      {/* 2024 Result vs Projected comparison */}
      <div>
        <p className="text-[11px] text-zinc-500 mb-2">2024 Result vs Current Projection</p>
        <div className="space-y-2">
          {(["con", "reform", "lab", "ld", "green"] as const).map((party) => {
            const actual = base2024[party] ?? 0;
            const projected = localProjection[party];
            const change = projected - actual;
            return (
              <div key={party} className="flex items-center gap-3">
                <span className="text-[10px] text-zinc-500 w-20 text-right uppercase">{PARTY_NAMES[party]}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden relative">
                    <div
                      className="h-full rounded-sm opacity-40"
                      style={{ width: `${actual * 2}%`, backgroundColor: PARTY_COLORS[party] }}
                    />
                    <div
                      className="absolute top-0 h-full rounded-sm opacity-90"
                      style={{ width: `${projected * 2}%`, backgroundColor: PARTY_COLORS[party] }}
                    />
                  </div>
                  <span className="text-[11px] font-bold w-12 text-right" style={{ color: PARTY_COLORS[party] }}>
                    {projected}%
                  </span>
                  <span className={`text-[10px] w-12 text-right ${change > 0 ? "text-emerald-500" : change < 0 ? "text-red-400" : "text-zinc-500"}`}>
                    {change > 0 ? "+" : ""}{change.toFixed(1)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[9px] text-zinc-600">
          <span className="w-20" />
          <span className="flex items-center gap-2">
            <span className="h-2 w-4 bg-zinc-600 opacity-40 rounded-sm" /> 2024 actual
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-4 bg-zinc-400 opacity-90 rounded-sm" /> Current projection
          </span>
        </div>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/30 border border-border/50 px-3 py-2 text-center">
          <p className="text-base font-bold text-zinc-100">
            {(useEC && ecConstituency!.electorate > 0 ? ecConstituency!.electorate : electorate).toLocaleString()}
          </p>
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Electorate</p>
        </div>
        <div className="bg-muted/30 border border-border/50 px-3 py-2 text-center">
          <p className="text-base font-bold text-zinc-100">
            {(useEC && ecConstituency!.turnout > 0 ? ecConstituency!.turnout : results2024.turnoutPct)}%
          </p>
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider">2024 Turnout</p>
        </div>
        <div className="bg-muted/30 border border-border/50 px-3 py-2 text-center">
          <p className="text-base font-bold text-zinc-100">{results2024.majority.toLocaleString()}</p>
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider">2024 Majority</p>
        </div>
      </div>

      {/* Ward-level breakdown (EC MRP only) */}
      {hasWards && (
        <div className="bg-muted/30 border border-border/50 px-4 py-3">
          <p className="text-[11px] text-zinc-400 font-medium mb-2">Ward-Level Predictions (MRP)</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
            {ecConstituency!.wards.map((ward) => {
              const wColor = PARTY_COLORS[ward.predictedWinner?.toLowerCase().replace("lib", "ld").replace("reform", "reform")] || "#6b7280";
              const changed = ward.winner2024 !== ward.predictedWinner;
              return (
                <div
                  key={ward.ward}
                  className="flex items-center justify-between bg-muted/30 px-2 py-1.5 rounded-sm"
                >
                  <span className="text-[10px] text-zinc-300 truncate flex-1">{ward.ward}</span>
                  <div className="flex items-center gap-1 ml-2">
                    {changed && <span className="text-[8px] text-amber-400">⟵</span>}
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: wColor }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[9px] text-zinc-600 mt-1.5">
            {ecConstituency!.wards.length} wards • Colored dot = predicted winner
            {ecConstituency!.wards.filter(w => w.winner2024 !== w.predictedWinner).length > 0 &&
              ` • ⟵ = changed from 2024`}
          </p>
        </div>
      )}

      {/* Vulnerability analysis */}
      <div className="bg-muted/30 border border-border/50 px-4 py-3">
        <p className="text-[11px] text-zinc-400 font-medium mb-2">Vulnerability Analysis</p>
        <div className="space-y-1.5 text-[11px]">
          {topChallengers.map((challenger) => {
            const swingNeeded = ((holderShare - (base2024[challenger] ?? 0)) / 2).toFixed(1);
            const nationalSwing = (averages[challenger] || 0) - (national2024[challenger] || 0);
            const swingPositive = nationalSwing > 0;
            return (
              <div key={challenger} className="contents">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Swing needed for {PARTY_NAMES[challenger]} to win:</span>
                  <span className="font-bold" style={{ color: PARTY_COLORS[challenger] }}>{swingNeeded}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Current national swing to {PARTY_NAMES[challenger]}:</span>
                  <span className={`font-bold ${swingPositive ? "text-emerald-400" : "text-red-400"}`}>
                    {swingPositive ? "+" : ""}{nationalSwing.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Source info */}
      <div className="flex items-center justify-between text-[10px] text-zinc-700">
        <span>Source: {useEC ? "Electoral Calculus MRP" : "Uniform National Swing estimate"}</span>
        <a
          href={`https://www.electoralcalculus.co.uk/fcgi-bin/seatdetails.py?seat=${encodeURIComponent(constituencyName)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-600 hover:text-emerald-400 flex items-center gap-1"
        >
          EC {constituencyName} <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════

function TrackerChart({
  title,
  subtitle,
  data,
  color,
  gradientId,
  allowNegative,
}: {
  title: string;
  subtitle: string;
  data: TrackerPoint[];
  color: string;
  gradientId: string;
  allowNegative?: boolean;
}) {
  const latest = data[data.length - 1]?.value || 0;
  const previous = data[data.length - 2]?.value || 0;
  const change = latest - previous;

  return (
    <div className="bg-muted/30 border border-border/50 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs text-zinc-300 font-medium">{title}</p>
          <p className="text-[10px] text-zinc-600">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black" style={{ color }}>
            {allowNegative && latest > 0 ? "+" : ""}{latest}%
          </p>
          <p className={`text-[10px] ${change > 0 ? "text-emerald-500" : change < 0 ? "text-red-400" : "text-zinc-500"}`}>
            {change > 0 ? "+" : ""}{change} vs last month
          </p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "#52525b" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={allowNegative ? ["auto", "auto"] : [0, "auto"]} />
          <Tooltip content={<TrackerTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={`url(#${gradientId})`}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
