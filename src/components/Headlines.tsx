"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Bookmark } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

interface HeadlineItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

type Tab = "headlines" | "briefings";

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  BBC: { bg: "bg-red-600/20", text: "text-red-400" },
  "Sky News": { bg: "bg-sky-600/20", text: "text-sky-400" },
  Guardian: { bg: "bg-indigo-800/20", text: "text-indigo-300" },
  Politico: { bg: "bg-orange-600/20", text: "text-orange-400" },
  Telegraph: { bg: "bg-green-600/20", text: "text-green-400" },
  "GB News": { bg: "bg-red-700/20", text: "text-red-300" },
};

function getSourceStyle(source: string) {
  return SOURCE_COLORS[source] || { bg: "bg-zinc-700/20", text: "text-zinc-400" };
}

export default function Headlines() {
  const { slug } = useConstituency();
  const [headlines, setHeadlines] = useState<HeadlineItem[]>([]);
  const [briefings, setBriefings] = useState<HeadlineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("headlines");

  useEffect(() => {
    async function fetchHeadlines() {
      setLoading(true);
      try {
        const res = await fetch(withConstituency("/api/headlines", slug));
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setHeadlines(data.headlines || []);
        setBriefings(data.briefings || []);
      } catch {
        setHeadlines(getMockHeadlines());
      } finally {
        setLoading(false);
      }
    }
    fetchHeadlines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="animate-pulse space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-14 bg-zinc-800 rounded" />
              <div className="h-3.5 bg-zinc-800 rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setTab("headlines")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "headlines"
              ? "text-emerald-400 border-b-2 border-emerald-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Top Headlines
        </button>
        <button
          onClick={() => setTab("briefings")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "briefings"
              ? "text-emerald-400 border-b-2 border-emerald-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Bookmark className="inline h-3 w-3 mr-1" />
          Daily Briefings
        </button>
      </div>

      {tab === "headlines" ? (
        <div className="divide-y divide-zinc-800/50">
          {headlines.map((item, i) => {
            const style = getSourceStyle(item.source);
            return (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-2.5 hover:bg-zinc-800/30 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${style.bg} ${style.text}`}
                      >
                        {item.source}
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        {formatTimeAgo(item.pubDate)}
                      </span>
                    </div>
                    <h3 className="text-sm text-zinc-200 font-medium leading-snug group-hover:text-emerald-400 transition-colors line-clamp-2">
                      {item.title}
                    </h3>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-zinc-600 group-hover:text-emerald-400 mt-1 flex-shrink-0" />
                </div>
              </a>
            );
          })}
          {headlines.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-zinc-600">
              No headlines available
            </div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-zinc-800/50">
          {briefings.length > 0 ? (
            briefings.map((item, i) => {
              const style = getSourceStyle(item.source);
              return (
                <a
                  key={i}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-3 hover:bg-zinc-800/30 transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Bookmark className="h-3 w-3 text-orange-400" />
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${style.bg} ${style.text}`}
                    >
                      {item.source}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {formatTimeAgo(item.pubDate)}
                    </span>
                  </div>
                  <h3 className="text-sm text-zinc-200 font-medium leading-snug group-hover:text-emerald-400 transition-colors">
                    {item.title}
                  </h3>
                </a>
              );
            })
          ) : (
            <div className="px-4 py-6 text-center">
              <Bookmark className="h-5 w-5 text-zinc-600 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">
                Daily briefings from Politico, BBC, and other outlets appear here
              </p>
              <p className="text-[10px] text-zinc-600 mt-1">
                Eg. Politico London Playbook, Westminster morning briefings
              </p>
            </div>
          )}
        </div>
      )}

      <div className="px-3 py-2 text-[10px] text-zinc-700 text-center border-t border-zinc-800/50">
        BBC, Sky, Guardian, Telegraph, GB News, Politico &middot; Updates every 10 min
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return "Yesterday";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

function getMockHeadlines(): HeadlineItem[] {
  return [
    { title: "PM faces backbench revolt over planning reform bill", link: "#", pubDate: new Date(Date.now() - 30 * 60000).toISOString(), source: "BBC" },
    { title: "Chancellor under pressure to revise fiscal rules", link: "#", pubDate: new Date(Date.now() - 2 * 3600000).toISOString(), source: "Guardian" },
    { title: "Home Secretary announces new small boats crackdown", link: "#", pubDate: new Date(Date.now() - 3 * 3600000).toISOString(), source: "Sky News" },
    { title: "Reform UK surges in latest polling as by-election looms", link: "#", pubDate: new Date(Date.now() - 4 * 3600000).toISOString(), source: "GB News" },
    { title: "NHS waiting list target missed by two years, report warns", link: "#", pubDate: new Date(Date.now() - 5 * 3600000).toISOString(), source: "Telegraph" },
  ];
}
