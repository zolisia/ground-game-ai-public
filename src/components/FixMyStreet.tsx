"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

interface Issue {
  id: number | string;
  title: string;
  category: string;
  state: string;
  created: string;
  latitude: number;
  longitude: number;
  url?: string;
}

export default function FixMyStreet() {
  const { slug } = useConstituency();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    async function fetchIssues() {
      try {
        const res = await fetch(withConstituency("/api/fixmystreet", slug));
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setIssues(data.issues || []);
      } catch {
        // Fall back to mock data
        setIssues(getMockIssues());
      } finally {
        setLoading(false);
      }
    }
    fetchIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const categories = ["all", ...Array.from(new Set(issues.map((i) => i.category)))];
  const filtered = filter === "all" ? issues : issues.filter((i) => i.category === filter);

  const statusIcon = (state: string) => {
    switch (state) {
      case "fixed":
        return <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />;
      case "investigating":
        return <Clock className="h-3.5 w-3.5 text-yellow-400" />;
      default:
        return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />;
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse space-y-2">
            <div className="h-3 bg-muted rounded w-3/4" />
            <div className="h-2.5 bg-muted/50 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 py-2 border-b border-border/50 flex gap-1 overflow-x-auto">
        {categories.slice(0, 6).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-2 py-0.5 text-[11px] rounded-full whitespace-nowrap transition-colors ${
              filter === cat
                ? "bg-emerald-500/20 text-emerald-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {cat === "all" ? "All" : cat}
          </button>
        ))}
      </div>
      <div className="divide-y divide-zinc-800/50">
        {filtered.slice(0, 10).map((issue) => (
          <a
            key={issue.id}
            href={issue.url || `https://www.fixmystreet.com/report/${issue.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-4 py-2.5 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-start gap-2">
              {statusIcon(issue.state)}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-300 leading-snug">{issue.title}</p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-600">
                  <span className="bg-muted px-1.5 py-0.5 rounded text-zinc-500">
                    {issue.category}
                  </span>
                  <span>{formatDate(issue.created)}</span>
                  <span
                    className={`capitalize ${
                      issue.state === "fixed"
                        ? "text-emerald-500"
                        : issue.state === "investigating"
                        ? "text-yellow-500"
                        : "text-red-500"
                    }`}
                  >
                    {issue.state}
                  </span>
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
      <div className="px-4 py-2 border-t border-border/50 text-center">
        <span className="text-xs text-zinc-600">
          {filtered.length} issues &middot; Data from FixMyStreet
        </span>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

function getMockIssues(): Issue[] {
  return [
    { id: 1, title: "Large pothole on London Road near Braintree station", category: "Potholes", state: "open", created: new Date(Date.now() - 86400000 * 2).toISOString(), latitude: 51.876, longitude: 0.558 },
    { id: 2, title: "Broken streetlight outside Tesco Express, High Street", category: "Street Lighting", state: "investigating", created: new Date(Date.now() - 86400000 * 3).toISOString(), latitude: 51.878, longitude: 0.555 },
    { id: 3, title: "Fly-tipping on Coggeshall Road layby", category: "Fly-tipping", state: "open", created: new Date(Date.now() - 86400000 * 1).toISOString(), latitude: 51.862, longitude: 0.531 },
    { id: 4, title: "Cracked pavement on Manor Street, Braintree", category: "Pavements", state: "fixed", created: new Date(Date.now() - 86400000 * 7).toISOString(), latitude: 51.877, longitude: 0.556 },
    { id: 5, title: "Graffiti on railway bridge, Halstead Road", category: "Graffiti", state: "open", created: new Date(Date.now() - 86400000 * 4).toISOString(), latitude: 51.880, longitude: 0.548 },
    { id: 6, title: "Overflowing bin at George Yard car park", category: "Rubbish", state: "fixed", created: new Date(Date.now() - 86400000 * 5).toISOString(), latitude: 51.877, longitude: 0.557 },
    { id: 7, title: "Damaged road sign on A120 slip road", category: "Road Signs", state: "investigating", created: new Date(Date.now() - 86400000 * 6).toISOString(), latitude: 51.870, longitude: 0.540 },
    { id: 8, title: "Blocked drain causing flooding on Rayne Road", category: "Drainage", state: "open", created: new Date(Date.now() - 86400000 * 1).toISOString(), latitude: 51.879, longitude: 0.545 },
    { id: 9, title: "Dog waste bins full at Braintree Recreation Ground", category: "Rubbish", state: "open", created: new Date(Date.now() - 86400000 * 2).toISOString(), latitude: 51.875, longitude: 0.560 },
    { id: 10, title: "Pothole cluster on Notley Road", category: "Potholes", state: "investigating", created: new Date(Date.now() - 86400000 * 3).toISOString(), latitude: 51.868, longitude: 0.555 },
  ];
}
