"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

export default function AIBrief() {
  const { slug } = useConstituency();
  const [brief, setBrief] = useState<string>("");
  const [generated, setGenerated] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchBrief();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function fetchBrief() {
    try {
      setLoading(true);
      const res = await fetch(withConstituency("/api/ai-brief", slug));
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setBrief(data.brief || "");
      setGenerated(data.generated || "");
    } catch {
      setBrief("*Unable to generate brief. Check API configuration.*");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchBrief();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-zinc-800 rounded w-3/4" />
          <div className="h-3 bg-zinc-800/60 rounded w-full" />
          <div className="h-3 bg-zinc-800/60 rounded w-5/6" />
          <div className="h-3 bg-zinc-800/40 rounded w-4/5" />
          <div className="h-4 bg-zinc-800 rounded w-2/3 mt-4" />
          <div className="h-3 bg-zinc-800/60 rounded w-full" />
          <div className="h-3 bg-zinc-800/60 rounded w-3/4" />
        </div>
        <div className="text-center text-[10px] text-zinc-600 mt-4">
          Generating AI intelligence brief...
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header bar with timestamp and refresh */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/50 bg-zinc-900/30">
        {generated && (
          <span className="text-[10px] text-zinc-600">
            Generated:{" "}
            {new Date(generated).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-1 rounded hover:bg-zinc-800 transition-colors disabled:opacity-50"
          title="Regenerate brief"
        >
          <RefreshCw
            className={`h-3 w-3 text-zinc-500 ${refreshing ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* Brief content rendered as markdown-like HTML */}
      <div className="px-3 py-3 overflow-y-auto max-h-[600px]">
        <div className="prose prose-invert prose-xs max-w-none">
          {brief.split("\n").map((line, i) => {
            // Heading 1
            if (line.startsWith("# ")) {
              return (
                <h3
                  key={i}
                  className="text-sm font-bold text-zinc-100 mt-3 mb-2 first:mt-0"
                >
                  {line.replace(/^# /, "")}
                </h3>
              );
            }
            // Heading 2
            if (line.startsWith("## ")) {
              return (
                <h4
                  key={i}
                  className="text-xs font-semibold text-emerald-400 mt-3 mb-1.5 uppercase tracking-wide"
                >
                  {line.replace(/^## /, "")}
                </h4>
              );
            }
            // Heading 3
            if (line.startsWith("### ")) {
              return (
                <h5
                  key={i}
                  className="text-xs font-semibold text-zinc-300 mt-2 mb-1"
                >
                  {line.replace(/^### /, "")}
                </h5>
              );
            }
            // Horizontal rule
            if (line.startsWith("---")) {
              return (
                <hr
                  key={i}
                  className="border-zinc-800 my-2"
                />
              );
            }
            // Bullet points
            if (line.startsWith("- ") || line.startsWith("* ")) {
              const content = line.replace(/^[-*] /, "");
              return (
                <div key={i} className="flex gap-1.5 text-[11px] text-zinc-400 leading-relaxed ml-1 mb-0.5">
                  <span className="text-emerald-500 mt-0.5">•</span>
                  <span dangerouslySetInnerHTML={{ __html: formatInline(content) }} />
                </div>
              );
            }
            // Blockquote
            if (line.startsWith("> ")) {
              return (
                <div
                  key={i}
                  className="border-l-2 border-amber-500/50 pl-2 text-[11px] text-amber-400/80 italic my-1"
                >
                  {line.replace(/^> /, "")}
                </div>
              );
            }
            // Empty line
            if (line.trim() === "") {
              return <div key={i} className="h-1.5" />;
            }
            // Normal paragraph
            return (
              <p
                key={i}
                className="text-[11px] text-zinc-400 leading-relaxed mb-1"
                dangerouslySetInnerHTML={{ __html: formatInline(line) }}
              />
            );
          })}
        </div>
      </div>

      <div className="px-3 py-2 border-t border-zinc-800/50 text-center">
        <span className="text-[10px] text-zinc-600">
          Powered by Claude Sonnet · Anthropic API
        </span>
      </div>
    </div>
  );
}

// Format inline markdown: **bold**, *italic*, `code`
function formatInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-zinc-200">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="text-emerald-400 bg-zinc-800/50 px-1 rounded text-[10px]">$1</code>');
}
