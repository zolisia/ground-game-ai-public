"use client";

import { useState } from "react";
import Header, { TabId } from "@/components/Header";
import Panel from "@/components/Panel";
import dynamic from "next/dynamic";

const ConstituencyMap = dynamic(() => import("@/components/ConstituencyMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-zinc-600 text-[11px] uppercase tracking-wider">
      Initialising map…
    </div>
  ),
});
import ElectoralIntel from "@/components/ElectoralIntel";
import Demographics from "@/components/Demographics";
import NewsFeed from "@/components/NewsFeed";
import FixMyStreet from "@/components/FixMyStreet";
import ConstituencyProfile from "@/components/ConstituencyProfile";
import ParliamentBills from "@/components/ParliamentBills";
import HansardFeed from "@/components/HansardFeed";
import AIBrief from "@/components/AIBrief";
import TrendsPanel from "@/components/TrendsPanel";
import Headlines from "@/components/Headlines";
import LiveFeeds from "@/components/LiveFeeds";
import OppositionTracker from "@/components/OppositionTracker";
import MentionsFeed from "@/components/MentionsFeed";
import ActivityCharts from "@/components/ActivityCharts";
import PollingDashboard from "@/components/PollingDashboard";
import SchoolsPanel from "@/components/SchoolsPanel";
import HealthPanel from "@/components/HealthPanel";
import EmploymentPanel from "@/components/EmploymentPanel";
import HousePricesPanel from "@/components/HousePricesPanel";
import UniversalCreditPanel from "@/components/UniversalCreditPanel";
import EPCPanel from "@/components/EPCPanel";
import CQCPanel from "@/components/CQCPanel";
import PetitionsPanel from "@/components/PetitionsPanel";
import WardDataHub from "@/components/WardDataHub";
import CommonsLibraryPanel from "@/components/CommonsLibraryPanel";
import {
  Map,
  Newspaper,
  Vote,
  BarChart3,
  AlertTriangle,
  Users,
  Landmark,
  BookOpen,
  Brain,
  TrendingUp,
  FileText,
  Tv,
  Shield,
  AtSign,
  GraduationCap,
  HeartPulse,
  Briefcase,
  Activity,
  PieChart,
  Home,
  CreditCard,
  Zap,
  Stethoscope,
  LayoutGrid,
} from "lucide-react";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("map");

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1 p-2 lg:p-3">
        <div className="max-w-[1800px] mx-auto">

          {/* ═══ MAP TAB ═══ */}
          {activeTab === "map" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3">
              {/* Map — dominant panel */}
              <Panel
                title="Constituency Map"
                icon={<Map className="h-3.5 w-3.5" />}
                className="lg:col-span-8 lg:row-span-2 min-h-[450px] lg:min-h-[650px]"
              >
                <ConstituencyMap />
              </Panel>

              {/* Profile sidebar */}
              <Panel
                title="Braintree"
                icon={<Users className="h-3.5 w-3.5" />}
                className="lg:col-span-4"
              >
                <ConstituencyProfile />
              </Panel>

              {/* Electoral Intelligence */}
              <Panel
                title="Electoral Intelligence"
                icon={<Vote className="h-3.5 w-3.5" />}
                className="lg:col-span-4"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">EC + Parliament</span>
                }
              >
                <ElectoralIntel />
              </Panel>

              {/* AI Brief */}
              <Panel
                title="AI Intelligence Brief"
                icon={<Brain className="h-3.5 w-3.5" />}
                className="lg:col-span-12"
                headerAction={
                  <span className="text-[9px] text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                    <Brain className="h-3 w-3" />
                    AI-Powered
                  </span>
                }
              >
                <AIBrief />
              </Panel>
            </div>
          )}

          {/* ═══ POLITICAL TAB ═══ */}
          {activeTab === "political" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3">
              {/* Electoral Intelligence — wide */}
              <Panel
                title="Electoral Intelligence"
                icon={<Vote className="h-3.5 w-3.5" />}
                className="lg:col-span-8"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">EC + Parliament</span>
                }
              >
                <ElectoralIntel />
              </Panel>

              {/* Opposition Tracker */}
              <Panel
                title="Opposition Tracker"
                icon={<Shield className="h-3.5 w-3.5" />}
                className="lg:col-span-4"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Social Intel</span>
                }
              >
                <OppositionTracker />
              </Panel>

              {/* Activity Charts — time-series graphs */}
              <Panel
                title="Activity Over Time"
                icon={<Activity className="h-3.5 w-3.5" />}
                className="lg:col-span-12"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Trends</span>
                }
              >
                <ActivityCharts />
              </Panel>

              {/* Political Headlines */}
              <Panel
                title="Political Headlines"
                icon={<FileText className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[500px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">UK Politics</span>
                }
              >
                <Headlines />
              </Panel>

              {/* Parliamentary Activity */}
              <Panel
                title="Parliamentary Activity"
                icon={<Landmark className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[500px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Live</span>
                }
              >
                <ParliamentBills />
              </Panel>

              {/* Hansard */}
              <Panel
                title="Hansard"
                icon={<BookOpen className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[500px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Parliament.uk</span>
                }
              >
                <HansardFeed />
              </Panel>

              {/* Social Mentions */}
              <Panel
                title="Social Mentions"
                icon={<AtSign className="h-3.5 w-3.5" />}
                className="lg:col-span-6 max-h-[500px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">X / Social</span>
                }
              >
                <MentionsFeed />
              </Panel>

              {/* Live News */}
              <Panel
                title="Live News"
                icon={<Tv className="h-3.5 w-3.5" />}
                className="lg:col-span-6"
                headerAction={
                  <span className="text-[9px] text-red-500 flex items-center gap-1 uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 bg-red-500 rounded-full animate-pulse" />
                    Live
                  </span>
                }
              >
                <LiveFeeds />
              </Panel>

              {/* AI Brief */}
              <Panel
                title="AI Intelligence Brief"
                icon={<Brain className="h-3.5 w-3.5" />}
                className="lg:col-span-12"
                headerAction={
                  <span className="text-[9px] text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                    <Brain className="h-3 w-3" />
                    AI-Powered
                  </span>
                }
              >
                <AIBrief />
              </Panel>

              {/* Ward Explorer — all ward data in one place */}
              <Panel
                title="Ward Explorer"
                icon={<LayoutGrid className="h-3.5 w-3.5" />}
                className="lg:col-span-12"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">28 WARDS</span>
                }
              >
                <WardDataHub />
              </Panel>
            </div>
          )}

          {/* ═══ POLLING TAB ═══ */}
          {activeTab === "polling" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3">
              {/* National Polling — full width */}
              <Panel
                title="National Polling"
                icon={<PieChart className="h-3.5 w-3.5" />}
                className="lg:col-span-12"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Wikipedia / BPC Pollsters</span>
                }
              >
                <PollingDashboard />
              </Panel>
            </div>
          )}

          {/* ═══ DEMOGRAPHICS TAB ═══ */}
          {activeTab === "demographics" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3">
              {/* Demographics — wide panel with charts */}
              <Panel
                title="Demographics"
                icon={<BarChart3 className="h-3.5 w-3.5" />}
                className="lg:col-span-12"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Census 2021</span>
                }
              >
                <Demographics />
              </Panel>

              {/* Schools */}
              <Panel
                title="Schools"
                icon={<GraduationCap className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[600px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">DfE / GIAS</span>
                }
              >
                <SchoolsPanel />
              </Panel>

              {/* Public Health */}
              <Panel
                title="Public Health"
                icon={<HeartPulse className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[600px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">PHE Fingertips</span>
                }
              >
                <HealthPanel />
              </Panel>

              {/* Employment */}
              <Panel
                title="Employment & Economy"
                icon={<Briefcase className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[600px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">NOMIS / ONS</span>
                }
              >
                <EmploymentPanel />
              </Panel>

              {/* House Prices */}
              <Panel
                title="House Prices"
                icon={<Home className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[600px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">HM Land Registry</span>
                }
              >
                <HousePricesPanel />
              </Panel>

              {/* Universal Credit */}
              <Panel
                title="Universal Credit"
                icon={<CreditCard className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[600px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">DWP / Stat-Xplore</span>
                }
              >
                <UniversalCreditPanel />
              </Panel>

              {/* EPC Ratings */}
              <Panel
                title="EPC Ratings"
                icon={<Zap className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[600px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">MHCLG / EPC Register</span>
                }
              >
                <EPCPanel />
              </Panel>

              {/* Constituency Profile */}
              <Panel
                title="Constituency Profile"
                icon={<BookOpen className="h-3.5 w-3.5" />}
                className="lg:col-span-12"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Census · NOMIS · ONS</span>
                }
              >
                <CommonsLibraryPanel />
              </Panel>

              {/* E-Petitions */}
              <Panel
                title="E-Petitions"
                icon={<FileText className="h-3.5 w-3.5" />}
                className="lg:col-span-8 max-h-[600px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Parliament</span>
                }
              >
                <PetitionsPanel />
              </Panel>

              {/* Care Quality */}
              <Panel
                title="Care Quality"
                icon={<Stethoscope className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[600px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">CQC</span>
                }
              >
                <CQCPanel />
              </Panel>
            </div>
          )}

          {/* ═══ LOCAL ISSUES TAB ═══ */}
          {activeTab === "local" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3">
              {/* Community Issues */}
              <Panel
                title="Community Issues"
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[500px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">FixMyStreet</span>
                }
              >
                <FixMyStreet />
              </Panel>

              {/* Local News */}
              <Panel
                title="Local News"
                icon={<Newspaper className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[500px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Auto-updating</span>
                }
              >
                <NewsFeed />
              </Panel>

              {/* Search Trends */}
              <Panel
                title="Search Trends"
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[500px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Google Trends</span>
                }
              >
                <TrendsPanel />
              </Panel>

              {/* Political Headlines (local relevance) */}
              <Panel
                title="Political Headlines"
                icon={<FileText className="h-3.5 w-3.5" />}
                className="lg:col-span-6 max-h-[500px]"
                headerAction={
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">UK Politics</span>
                }
              >
                <Headlines />
              </Panel>

              {/* Live News */}
              <Panel
                title="Live News"
                icon={<Tv className="h-3.5 w-3.5" />}
                className="lg:col-span-6"
                headerAction={
                  <span className="text-[9px] text-red-500 flex items-center gap-1 uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 bg-red-500 rounded-full animate-pulse" />
                    Live
                  </span>
                }
              >
                <LiveFeeds />
              </Panel>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-4 pb-3 text-center">
          <p className="text-[10px] text-zinc-700 uppercase tracking-wider">
            Ground Game Intel &middot; Constituency Intelligence Platform
          </p>
        </footer>
      </main>
    </div>
  );
}
