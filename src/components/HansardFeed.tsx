"use client";

import { useEffect, useState } from "react";
import { ExternalLink, MessageSquare, HelpCircle, Vote, FileText } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

type Tab = "speeches" | "questions";

interface Speech {
  title: string;
  date: string;
  excerpt: string;
  url: string;
  house: string;
  type: string;
  speaker: string | null;
}

interface Question {
  title: string;
  date: string;
  excerpt: string;
  url: string;
  house: string;
  type: string;
  answeringBody: string | null;
  isAnswered: boolean;
}

export default function HansardFeed() {
  const { slug } = useConstituency();
  const [tab, setTab] = useState<Tab>("speeches");
  const [speeches, setSpeeches] = useState<Speech[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSpeeches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function fetchSpeeches() {
    try {
      setLoading(true);
      const res = await fetch(withConstituency("/api/hansard?type=speeches", slug));
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setSpeeches(data.speeches || []);
    } catch {
      setSpeeches([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchQuestions() {
    try {
      setLoading(true);
      const res = await fetch(withConstituency("/api/hansard?type=questions", slug));
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }

  function handleTabChange(newTab: Tab) {
    setTab(newTab);
    if (newTab === "questions" && questions.length === 0) fetchQuestions();
    if (newTab === "speeches" && speeches.length === 0) fetchSpeeches();
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse space-y-2">
            <div className="h-3 bg-zinc-800 rounded w-4/5" />
            <div className="h-2.5 bg-zinc-800/50 rounded w-3/5" />
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
          onClick={() => handleTabChange("speeches")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "speeches"
              ? "text-emerald-400 border-b-2 border-emerald-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <MessageSquare className="inline h-3 w-3 mr-1" />
          Recent Activity
        </button>
        <button
          onClick={() => handleTabChange("questions")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "questions"
              ? "text-emerald-400 border-b-2 border-emerald-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <HelpCircle className="inline h-3 w-3 mr-1" />
          Written Questions
        </button>
      </div>

      {/* Speeches */}
      {tab === "speeches" && (
        <div className="divide-y divide-zinc-800/50">
          {speeches.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-600">
              No recent Hansard contributions found
            </div>
          ) : (
            speeches.slice(0, 10).map((speech, i) => (
              <a
                key={i}
                href={speech.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2.5 hover:bg-zinc-800/20 transition-colors group"
              >
                <div className="flex items-start gap-2">
                  <div className={`mt-0.5 p-1 rounded ${speech.type === "division" ? "bg-blue-400/10" : "bg-amber-400/10"}`}>
                    {speech.type === "division" ? (
                      <Vote className="h-3 w-3 text-blue-400" />
                    ) : (
                      <FileText className="h-3 w-3 text-amber-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-zinc-300 leading-snug font-medium group-hover:text-zinc-100">
                      {speech.title}
                      <ExternalLink className="inline h-2.5 w-2.5 ml-1 text-zinc-600 group-hover:text-zinc-400" />
                    </p>
                    {speech.excerpt && (
                      <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">
                        {speech.excerpt}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-[10px]">
                      <span className="text-blue-400/70">
                        {speech.house}
                      </span>
                      {speech.speaker && (
                        <span className="text-zinc-600">{speech.speaker}</span>
                      )}
                      {speech.date && (
                        <span className="text-zinc-600">
                          {new Date(speech.date).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      )}

      {/* Written Questions */}
      {tab === "questions" && (
        <div className="divide-y divide-zinc-800/50">
          {questions.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-600">
              No written questions found
            </div>
          ) : (
            questions.map((q, i) => (
              <a
                key={i}
                href={q.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2.5 hover:bg-zinc-800/20 transition-colors group"
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 p-1 rounded bg-purple-400/10">
                    <HelpCircle className="h-3 w-3 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-zinc-300 leading-snug font-medium group-hover:text-zinc-100">
                      {q.title}
                      <ExternalLink className="inline h-2.5 w-2.5 ml-1 text-zinc-600 group-hover:text-zinc-400" />
                    </p>
                    {q.excerpt && (
                      <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">
                        {q.excerpt}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-[10px]">
                      <span
                        className={`px-1 rounded font-bold ${
                          q.isAnswered
                            ? "text-emerald-400 bg-emerald-400/10"
                            : "text-amber-400 bg-amber-400/10"
                        }`}
                      >
                        {q.isAnswered ? "Answered" : "Pending"}
                      </span>
                      {q.answeringBody && (
                        <span className="text-zinc-600">{q.answeringBody}</span>
                      )}
                      {q.date && (
                        <span className="text-zinc-600">
                          {new Date(q.date).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      )}

      <div className="px-3 py-2 border-t border-zinc-800/50 text-center">
        <a
          href="https://www.theyworkforyou.com/mp/11816/james_cleverly/braintree"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-zinc-600 hover:text-emerald-400 transition-colors"
        >
          View full record on TheyWorkForYou ↗
        </a>
      </div>
    </div>
  );
}
