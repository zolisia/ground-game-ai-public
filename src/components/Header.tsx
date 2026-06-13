"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SELECTABLE_CONSTITUENCIES, type ConstituencySlug } from "@/hooks/useConstituency";
import ThemeToggle from "@/components/ThemeToggle";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close on Escape — standard sidebar behaviour. Listener is only registered
  // while the sidebar is open so the global keyup is a no-op the rest of the
  // time.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keyup", onKey);
    return () => window.removeEventListener("keyup", onKey);
  }, [sidebarOpen]);

  return (
    <>
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-2">
          {/* Left: Logo */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-bold text-foreground tracking-tight uppercase">
                Ground Game <span className="text-emerald-500">Intel</span>
              </span>
            </div>
            <div className="hidden sm:block h-4 w-px bg-border" />
            <span className="hidden sm:block text-[10px] text-zinc-600 uppercase tracking-widest">
              Constituency Monitor
            </span>
          </div>

          {/* Right: live indicator + sidebar trigger */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5 px-2 py-1 border border-border">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Live</span>
            </div>
            <ThemeToggle />
            <button
              className="text-zinc-400 hover:text-foreground transition-colors"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? "Close constituency menu" : "Open constituency menu"}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-t border-border overflow-x-auto">
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
      </header>

      {/* Backdrop. Always mounted so the opacity transition runs on close too;
          `pointer-events-none` when closed so clicks pass through to the page. */}
      <div
        className={`fixed inset-0 bg-black/60 z-[60] transition-opacity duration-200 ${
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar. Slides in from the right (same side as the burger trigger)
          via translate-x; always mounted so enter and exit are both animated. */}
      <aside
        className={`fixed inset-y-0 right-0 w-72 bg-card border-l border-border z-[70] flex flex-col transform transition-transform duration-200 ease-out ${
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!sidebarOpen}
        aria-label="Constituency selector"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">
            Constituencies
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="text-zinc-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {SELECTABLE_CONSTITUENCIES.map((c) => {
            const isActive = c.slug === constituencySlug;
            return (
              <button
                key={c.slug}
                onClick={() => {
                  onConstituencyChange(c.slug);
                  setSidebarOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-xs transition-colors border-l-2 ${
                  isActive
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500 font-medium"
                    : "text-zinc-400 border-transparent hover:bg-muted/50 hover:text-zinc-200"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
