"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Tab = "mentions" | "parliament" | "votes";

interface MentionDataPoint {
  date: string;
  label: string;
  mentions: number;
  positive: number;
  negative: number;
}

interface ParliamentDataPoint {
  date: string;
  label: string;
  votes: number;
  questions: number;
  debates: number;
}

interface VoteDataPoint {
  date: string;
  label: string;
  aye: number;
  no: number;
  total: number;
}

// Custom tooltip styling to match the dark theme
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a1a] border border-zinc-700 px-3 py-2 text-xs">
      <p className="text-zinc-400 mb-1 font-medium">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-zinc-500 capitalize">{entry.name}:</span>
          <span className="text-zinc-200 font-medium">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function ActivityCharts() {
  const [tab, setTab] = useState<Tab>("mentions");
  const [mentionData, setMentionData] = useState<MentionDataPoint[]>([]);
  const [parliamentData, setParliamentData] = useState<ParliamentDataPoint[]>([]);
  const [voteData, setVoteData] = useState<VoteDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch mentions, parliament votes, hansard activity, and written questions in parallel
        const [mentionsRes, parliamentRes, hansardRes, questionsRes] = await Promise.allSettled([
          fetch("/api/mentions"),
          fetch("/api/parliament?type=votes"),
          fetch("/api/hansard?type=speeches"),
          fetch("/api/hansard?type=questions"),
        ]);

        // Process mentions into daily buckets
        if (mentionsRes.status === "fulfilled" && mentionsRes.value.ok) {
          const data = await mentionsRes.value.json();
          const mentions = data.mentions || [];
          if (mentions.length > 0) {
            setMentionData(aggregateMentionsByDay(mentions));
          }
          // If no mentions (API unconfigured), leave as empty array
        }

        // Process parliament votes — parse once, reuse for both tabs
        let parsedVotes: Array<{ date: string; votedAye?: boolean }> = [];
        if (parliamentRes.status === "fulfilled" && parliamentRes.value.ok) {
          const data = await parliamentRes.value.json();
          parsedVotes = data.votes || [];
          if (parsedVotes.length > 0) {
            setVoteData(aggregateVotesByMonth(parsedVotes));
          }
        }

        // Process parliamentary activity (debates, questions, etc)
        // Hansard API returns { speeches: [...] } not { activities: [...] }
        {
          const activities: Array<{ date: string; type?: string }> = [];

          // Get speeches/EDMs/divisions from hansard
          if (hansardRes.status === "fulfilled" && hansardRes.value.ok) {
            const data = await hansardRes.value.json();
            const speeches = data.speeches || data.activities || [];
            activities.push(...speeches);
          }

          // Get written questions
          if (questionsRes.status === "fulfilled" && questionsRes.value.ok) {
            const qData = await questionsRes.value.json();
            const questions = qData.questions || [];
            for (const q of questions) {
              activities.push({ date: q.date, type: "question" });
            }
          }

          // Reuse already-parsed votes for combined view (don't re-read consumed response)
          const combined = aggregateParliamentByMonth(activities, parsedVotes);
          if (combined.length > 0) {
            setParliamentData(combined);
          }
        }
      } catch {
        // Leave all as empty arrays — no fake data
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "mentions", label: "Social Mentions" },
    { id: "parliament", label: "Parliamentary Activity" },
    { id: "votes", label: "Voting Record" },
  ];

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 w-28 bg-zinc-800 rounded" />
            ))}
          </div>
          <div className="h-48 bg-zinc-800/50 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${
              tab === t.id
                ? "text-emerald-400 border-b-2 border-emerald-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* Social Mentions Over Time */}
        {tab === "mentions" && mentionData.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-2xl mb-2">📊</div>
            <p className="text-sm text-zinc-400 font-medium">Social mentions not yet configured</p>
            <p className="text-xs text-zinc-600 mt-1">Connect X API or Apify to track mentions over time</p>
          </div>
        )}
        {tab === "mentions" && mentionData.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] text-zinc-500">Daily mention volume</p>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Total
                </span>
                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-red-400" /> Negative
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={mentionData}>
                <defs>
                  <linearGradient id="mentionGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="negGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#52525b" }}
                  axisLine={{ stroke: "#27272a" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#52525b" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="mentions"
                  name="mentions"
                  stroke="#10b981"
                  fill="url(#mentionGrad)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="negative"
                  name="negative"
                  stroke="#f87171"
                  fill="url(#negGrad)"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3 mt-3">
              <StatBox label="Total (7d)" value={mentionData.reduce((s, d) => s + d.mentions, 0)} />
              <StatBox label="Daily Avg" value={Math.round(mentionData.reduce((s, d) => s + d.mentions, 0) / Math.max(mentionData.length, 1))} />
              <StatBox
                label="Negative %"
                value={`${Math.round((mentionData.reduce((s, d) => s + d.negative, 0) / Math.max(mentionData.reduce((s, d) => s + d.mentions, 0), 1)) * 100)}%`}
                negative
              />
            </div>
          </div>
        )}

        {/* Parliamentary Activity Over Time */}
        {tab === "parliament" && parliamentData.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-2xl mb-2">🏛️</div>
            <p className="text-sm text-zinc-400 font-medium">No parliamentary activity data available</p>
            <p className="text-xs text-zinc-600 mt-1">Data will appear once voting records are fetched from Parliament API</p>
          </div>
        )}
        {tab === "parliament" && parliamentData.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] text-zinc-500">Monthly parliamentary engagement</p>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-blue-500" /> Votes
                </span>
                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Questions
                </span>
                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-purple-500" /> Debates
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={parliamentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#52525b" }}
                  axisLine={{ stroke: "#27272a" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#52525b" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="votes" name="votes" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                <Bar dataKey="questions" name="questions" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                <Bar dataKey="debates" name="debates" fill="#a855f7" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3 mt-3">
              <StatBox label="Total Votes" value={parliamentData.reduce((s, d) => s + d.votes, 0)} />
              <StatBox label="Questions" value={parliamentData.reduce((s, d) => s + d.questions, 0)} />
              <StatBox label="Debates" value={parliamentData.reduce((s, d) => s + d.debates, 0)} />
            </div>
          </div>
        )}

        {/* Voting Record Over Time */}
        {tab === "votes" && voteData.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-2xl mb-2">🗳️</div>
            <p className="text-sm text-zinc-400 font-medium">No voting record data available</p>
            <p className="text-xs text-zinc-600 mt-1">Data will appear once voting records are fetched from Parliament API</p>
          </div>
        )}
        {tab === "votes" && voteData.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] text-zinc-500">Monthly votes cast (Aye vs No)</p>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Aye
                </span>
                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> No
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={voteData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#52525b" }}
                  axisLine={{ stroke: "#27272a" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#52525b" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="aye" name="aye" stackId="votes" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="no" name="no" stackId="votes" fill="#f43f5e" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3 mt-3">
              <StatBox label="Total Votes" value={voteData.reduce((s, d) => s + d.total, 0)} />
              <StatBox
                label="Aye Rate"
                value={`${Math.round((voteData.reduce((s, d) => s + d.aye, 0) / Math.max(voteData.reduce((s, d) => s + d.total, 0), 1)) * 100)}%`}
              />
              <StatBox label="Most Active" value={getMostActive(voteData)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, negative }: { label: string; value: number | string; negative?: boolean }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 px-3 py-2 text-center">
      <p className={`text-base font-bold ${negative ? "text-red-400" : "text-zinc-100"}`}>
        {value}
      </p>
      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

function getMostActive(data: VoteDataPoint[]): string {
  if (data.length === 0) return "—";
  const sorted = [...data].sort((a, b) => b.total - a.total);
  return sorted[0].label;
}

// === Data aggregation functions ===

function aggregateMentionsByDay(mentions: Array<{ date: string; text?: string }>): MentionDataPoint[] {
  const now = new Date();
  const days: MentionDataPoint[] = [];

  for (let i = 6; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    const dateStr = day.toISOString().split("T")[0];
    const dayLabel = day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });

    const dayMentions = mentions.filter((m) => {
      try {
        return new Date(m.date).toISOString().split("T")[0] === dateStr;
      } catch {
        return false;
      }
    });

    // Simple negative detection based on keywords
    const negativeCount = dayMentions.filter((m) => {
      const text = (m.text || "").toLowerCase();
      return text.includes("against") || text.includes("fail") || text.includes("ignore") ||
        text.includes("worst") || text.includes("disgrace") || text.includes("angry") ||
        text.includes("terrible") || text.includes("useless") || text.includes("lose");
    }).length;

    days.push({
      date: dateStr,
      label: dayLabel,
      mentions: dayMentions.length,
      positive: dayMentions.length - negativeCount,
      negative: negativeCount,
    });
  }

  return days;
}

function aggregateVotesByMonth(votes: Array<{ date: string; votedAye?: boolean }>): VoteDataPoint[] {
  const months = new Map<string, { aye: number; no: number }>();

  for (const vote of votes) {
    try {
      const d = new Date(vote.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const existing = months.get(key) || { aye: 0, no: 0 };
      if (vote.votedAye) {
        existing.aye++;
      } else {
        existing.no++;
      }
      months.set(key, existing);
    } catch {
      // skip
    }
  }

  if (months.size === 0) return [];

  const sorted = Array.from(months.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6);

  return sorted.map(([key, val]) => {
    const [y, m] = key.split("-");
    const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("en-GB", { month: "short" });
    return {
      date: key,
      label: `${monthName} ${y.slice(2)}`,
      aye: val.aye,
      no: val.no,
      total: val.aye + val.no,
    };
  });
}

function aggregateParliamentByMonth(
  activities: Array<{ date: string; type?: string }>,
  votes: Array<{ date: string }>
): ParliamentDataPoint[] {
  const months = new Map<string, { votes: number; questions: number; debates: number }>();

  // Count votes by month
  for (const vote of votes) {
    try {
      const d = new Date(vote.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const existing = months.get(key) || { votes: 0, questions: 0, debates: 0 };
      existing.votes++;
      months.set(key, existing);
    } catch { /* skip */ }
  }

  // Count activities by type and month
  // Hansard returns types: "division", "edm", "question", "written_question", "debate"
  for (const act of activities) {
    try {
      const d = new Date(act.date);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const existing = months.get(key) || { votes: 0, questions: 0, debates: 0 };
      if (act.type === "division") {
        existing.votes++;
      } else if (act.type === "question" || act.type === "written_question") {
        existing.questions++;
      } else {
        // edm, debate, speech, etc.
        existing.debates++;
      }
      months.set(key, existing);
    } catch { /* skip */ }
  }

  if (months.size === 0) return [];

  const sorted = Array.from(months.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6);

  return sorted.map(([key, val]) => {
    const [y, m] = key.split("-");
    const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("en-GB", { month: "short" });
    return {
      date: key,
      label: `${monthName} ${y.slice(2)}`,
      ...val,
    };
  });
}

