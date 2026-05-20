"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import { SELECTABLE_CONSTITUENCIES, type ConstituencySlug } from "@/hooks/useConstituency";

export type TabId = "map" | "political" | "polling" | "demographics" | "local";

const TABS: { id: TabId; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "political", label: "Political" },
  { id: "polling", label: "Polling" },
  { id: "demographics", label: "Demographics" },
  { id: "local", label: "Local Issues" },
];

interface HeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  constituencySlug: ConstituencySlug;
  onConstituencyChange: (slug: ConstituencySlug) => void;
}

export default function Header({
  activeTab,
  onTabChange,
  constituencySlug,
  onConstituencyChange,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const activeConstituency = SELECTABLE_CONSTITUENCIES.find(
    (c) => c.slug === constituencySlug
  );

  return (
    <header className="bg-[#141414] border-b border-[#2a2a2a] sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Left: Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-bold text-zinc-100 tracking-tight uppercase">
              Ground Game <span className="text-emerald-500">Intel</span>
            </span>
          </div>
          <div className="hidden sm:block h-4 w-px bg-[#2a2a2a]" />
          <span className="hidden sm:block text-[10px] text-zinc-600 uppercase tracking-widest">
            Constituency Monitor
          </span>
        </div>

        {/* Right: Status + Constituency */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1.5 px-2 py-1 border border-[#2a2a2a]">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Live</span>
          </div>
          <label className="hidden md:flex items-center gap-1.5">
            <span className="sr-only">Constituency</span>
            <select
              value={constituencySlug}
              onChange={(e) => onConstituencyChange(e.target.value as ConstituencySlug)}
              className="bg-[#141414] border border-[#2a2a2a] text-[11px] text-zinc-300 uppercase tracking-wider px-2 py-1 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {SELECTABLE_CONSTITUENCIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="md:hidden text-zinc-400 hover:text-white"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-t border-[#2a2a2a] overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2 text-[11px] uppercase tracking-wider font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "text-emerald-500 border-b-2 border-emerald-500 bg-emerald-500/5"
                : "text-zinc-600 hover:text-zinc-400 border-b-2 border-transparent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="absolute top-full left-0 right-0 bg-[#141414] border-b border-[#2a2a2a] p-3 md:hidden z-50">
          <nav className="flex flex-col gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { onTabChange(tab.id); setMenuOpen(false); }}
                className={`text-left px-3 py-2 text-[11px] uppercase tracking-wider ${
                  activeTab === tab.id
                    ? "text-emerald-500 bg-emerald-500/5"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
            <div className="mt-2 pt-2 border-t border-[#2a2a2a]">
              <label className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Constituency</span>
                <select
                  value={constituencySlug}
                  onChange={(e) => {
                    onConstituencyChange(e.target.value as ConstituencySlug);
                    setMenuOpen(false);
                  }}
                  className="flex-1 bg-[#141414] border border-[#2a2a2a] text-[11px] text-zinc-300 uppercase tracking-wider px-2 py-1 focus:outline-none focus:border-emerald-500"
                >
                  {SELECTABLE_CONSTITUENCIES.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1 text-[10px] text-zinc-600">
                Currently viewing: {activeConstituency?.name ?? "Braintree"}
              </p>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
