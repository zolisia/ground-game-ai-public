"use client";

import { useEffect, useState } from "react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

interface SectionData {
  heading: string;
  rows: Record<string, string>[];
}

interface CommonsLibraryData {
  constituency: string;
  sections: Record<string, SectionData[]>;
  sectionCount: number;
  source: string;
  sourceUrl: string;
  scrapedAt: string;
  error?: string;
}

// ─── SVG Donut Chart ────────────────────────────────────────────────
function Donut({
  value,
  size = 80,
  stroke = 6,
  color = "#34d399",
  label,
  sub,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label: string;
  sub?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(value, 100) / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#27272a"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-zinc-100">{value}%</span>
        </div>
      </div>
      <span className="text-[10px] text-zinc-400 text-center leading-tight max-w-[90px]">{label}</span>
      {sub && <span className="text-[9px] text-zinc-600 -mt-0.5">{sub}</span>}
    </div>
  );
}

// ─── Hero Stat ──────────────────────────────────────────────────────
function HeroStat({ value, label, color = "text-emerald-400" }: { value: string; label: string; color?: string }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-black tracking-tight ${color}`}>{value}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

// ─── Mini bar ───────────────────────────────────────────────────────
function MiniBar({ label, value, max = 100, color = "#34d399" }: { label: string; value: number; max?: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-zinc-400 w-36 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-semibold text-zinc-200 w-14 text-right shrink-0">{value}%</span>
    </div>
  );
}

function extractPct(val: string): number | null {
  const m = val.match(/([\d.]+)%/);
  return m ? parseFloat(m[1]) : null;
}

function getRowVal(rows: Record<string, string>[], measure: string): string | null {
  for (const r of rows) {
    const vals = Object.values(r);
    if (vals[0]?.toLowerCase().includes(measure.toLowerCase())) return vals[1] || null;
  }
  return null;
}

function getRowEngland(rows: Record<string, string>[], measure: string): string | null {
  for (const r of rows) {
    if (Object.values(r)[0]?.toLowerCase().includes(measure.toLowerCase())) return r.England || null;
  }
  return null;
}

// Delta badge: shows how constituency compares to England average
function Delta({ local, national, invert = false }: { local: string; national: string | null; invert?: boolean }) {
  if (!national) return null;
  const lv = extractPct(local) ?? parseFloat(local.replace(/[£,]/g, ""));
  const nv = extractPct(national) ?? parseFloat(national.replace(/[£,]/g, ""));
  if (isNaN(lv) || isNaN(nv) || lv === nv) return null;
  const diff = lv - nv;
  const isGood = invert ? diff < 0 : diff > 0;
  const sign = diff > 0 ? "+" : "";
  const isPct = local.includes("%");
  const display = isPct ? `${sign}${diff.toFixed(1)}pp` : `${sign}${diff.toFixed(0)}`;
  return (
    <span className={`text-[9px] font-medium ml-1 px-1 py-0.5 rounded ${isGood ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
      {display} vs England
    </span>
  );
}

export default function CommonsLibraryPanel() {
  const { slug } = useConstituency();
  const [data, setData] = useState<CommonsLibraryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(withConstituency("/api/commons-library", slug))
      .then((res) => res.json())
      .then((d: CommonsLibraryData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="flex gap-4 justify-center">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-20 h-20 bg-muted rounded-full" />
          ))}
        </div>
        <div className="h-24 bg-muted rounded-xl" />
        <div className="h-24 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!data || data.sectionCount === 0) {
    return <p className="text-zinc-500 text-xs">Constituency profile data unavailable</p>;
  }

  // Gate on the presence of the grouped demographic sections. The route emits
  // a `live` section for every constituency, but the population / economy /
  // housing / etc. groups only appear for constituencies whose static profile
  // has been sourced (currently Braintree only). Without this gate, the panel
  // below would fall through to the hardcoded Braintree fallback strings on
  // every `getRowVal(...) || "..."` line and silently misrepresent the data.
  const hasDemographicProfile = !!(
    data.sections.population?.[0]?.rows?.length ||
    data.sections.economy?.[0]?.rows?.length ||
    data.sections.housing?.[0]?.rows?.length
  );
  if (!hasDemographicProfile) {
    return (
      <div className="bg-muted/50 border border-border rounded-xl p-6 text-center">
        <p className="text-zinc-400 text-sm font-medium mb-1">
          Demographic profile not yet sourced
        </p>
        <p className="text-zinc-600 text-[11px]">
          Census 2021 indicators for {data.constituency} haven&apos;t been added to the data layer yet.
        </p>
      </div>
    );
  }

  // Extract key stats from the data
  const pop = data.sections.population?.[0]?.rows || [];
  const econ = data.sections.economy?.[0]?.rows || [];
  const housing = data.sections.housing?.[0]?.rows || [];
  const edu = data.sections.education?.[0]?.rows || [];
  const health = data.sections.health?.[0]?.rows || [];
  const dep = data.sections.deprivation?.[0]?.rows || [];
  const transport = data.sections.transport?.[0]?.rows || [];

  const population = getRowVal(pop, "population") || "80,100";
  const electorate = getRowVal(pop, "electorate") || "77,781";
  const medianAge = getRowVal(pop, "median") || "43";
  const medianAgeEng = getRowEngland(pop, "median");
  const bornUK = extractPct(getRowVal(pop, "born in uk") || "91.5%");
  const bornUKEng = getRowEngland(pop, "born in uk");
  const whiteBritish = extractPct(getRowVal(pop, "white british") || "87.5%");

  const empRate = extractPct(getRowVal(econ, "employment") || "78.2%");
  const empRateEng = getRowEngland(econ, "employment");
  const selfEmp = extractPct(getRowVal(econ, "self-emp") || "12.1%");
  const unempRate = extractPct(getRowVal(econ, "unemployment") || "3.4%");
  const unempRateEng = getRowEngland(econ, "unemployment");
  const medianPay = getRowVal(econ, "median") || "£620";
  const medianPayEng = getRowEngland(econ, "median");

  const ownerOcc = extractPct(getRowVal(housing, "owner") || "72.5%");
  const ownerOccEng = getRowEngland(housing, "owner");
  const socialRent = extractPct(getRowVal(housing, "social") || "13.2%");
  const privateRent = extractPct(getRowVal(housing, "private") || "12.1%");
  const avgPrice = getRowVal(housing, "average") || "£345,000";
  const avgPriceEng = getRowEngland(housing, "average");

  const degree = extractPct(getRowVal(edu, "degree") || "28.3%");
  const degreeEng = getRowEngland(edu, "degree");
  const noQuals = extractPct(getRowVal(edu, "no qual") || "17.8%");
  const goodSchools = extractPct(getRowVal(edu, "good") || "89%");

  const goodHealth = extractPct(getRowVal(health, "good or very good") || "81.2%");
  const badHealth = extractPct(getRowVal(health, "bad") || "4.8%");
  const lifeExpM = getRowVal(health, "male") || "80.5 years";
  const lifeExpMEng = getRowEngland(health, "male");
  const lifeExpF = getRowVal(health, "female") || "83.8 years";
  const lifeExpFEng = getRowEngland(health, "female");

  const imdRank = getRowVal(dep, "imd") || "456th";
  const fuelPov = getRowVal(dep, "fuel") || "11.8%";
  const fuelPovEng = getRowEngland(dep, "fuel");
  const childPov = getRowVal(dep, "child") || "18.2%";
  const childPovEng = getRowEngland(dep, "child");

  const carOwn = extractPct(getRowVal(transport, "car") || "85.6%");
  const workFromHome = extractPct(getRowVal(transport, "home") || "14.3%");
  const broadband = extractPct(getRowVal(transport, "broadband") || "95.2%");

  return (
    <div className="space-y-5">
      {/* ── Hero Stats Row ── */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-muted rounded-xl p-3">
          <HeroStat value={population} label="Population" color="text-blue-400" />
        </div>
        <div className="bg-muted rounded-xl p-3">
          <HeroStat value={electorate} label="Electorate" color="text-emerald-400" />
        </div>
        <div className="bg-muted rounded-xl p-3">
          <div className="text-center">
            <div className="text-2xl font-black tracking-tight text-amber-400">{medianAge}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Median Age</div>
            <Delta local={medianAge} national={medianAgeEng} />
          </div>
        </div>
        <div className="bg-muted rounded-xl p-3">
          <div className="text-center">
            <div className="text-2xl font-black tracking-tight text-purple-400">{avgPrice}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Avg House Price</div>
            <Delta local={avgPrice} national={avgPriceEng} />
          </div>
        </div>
      </div>

      {/* ── Donut Charts Row: Key Percentages ── */}
      <div className="bg-muted rounded-xl p-4">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3 font-medium">
          Key Indicators
        </div>
        <div className="flex justify-around flex-wrap gap-3">
          {empRate && <Donut value={empRate} label="Employment Rate" color="#34d399" />}
          {ownerOcc && <Donut value={ownerOcc} label="Home Ownership" color="#fbbf24" />}
          {goodHealth && <Donut value={goodHealth} label="Good Health" color="#f87171" />}
          {degree && <Donut value={degree} label="Degree Holders" color="#a78bfa" />}
          {broadband && <Donut value={broadband} label="Superfast Broadband" color="#22d3ee" />}
        </div>
      </div>

      {/* ── Economy ── */}
      <div className="bg-muted rounded-xl p-4">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3 font-medium">
          Jobs & Economy
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-emerald-400">{empRate}%</div>
            <div className="text-[9px] text-zinc-500">Employment</div>
            <Delta local={`${empRate}%`} national={empRateEng} />
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-red-400">{unempRate}%</div>
            <div className="text-[9px] text-zinc-500">Unemployment</div>
            <Delta local={`${unempRate}%`} national={unempRateEng} invert />
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-zinc-200">{medianPay}</div>
            <div className="text-[9px] text-zinc-500">Median Weekly Pay</div>
            <Delta local={medianPay} national={medianPayEng} />
          </div>
        </div>
        {selfEmp && <MiniBar label="Self-employment" value={selfEmp} color="#34d399" />}
      </div>

      {/* ── Housing ── */}
      <div className="bg-muted rounded-xl p-4">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3 font-medium">
          Housing Tenure
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            {ownerOcc && <MiniBar label="Owner occupied" value={ownerOcc} color="#fbbf24" />}
            <Delta local={`${ownerOcc}%`} national={ownerOccEng} />
          </div>
          {socialRent && <MiniBar label="Social rented" value={socialRent} color="#f97316" />}
          {privateRent && <MiniBar label="Private rented" value={privateRent} color="#fb923c" />}
        </div>
      </div>

      {/* ── Health ── */}
      <div className="bg-muted rounded-xl p-4">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3 font-medium">
          Health & Wellbeing
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-base font-bold text-blue-400">{lifeExpM}</div>
            <div className="text-[9px] text-zinc-500">Life Exp. (Male)</div>
            <Delta local={lifeExpM} national={lifeExpMEng} />
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-base font-bold text-pink-400">{lifeExpF}</div>
            <div className="text-[9px] text-zinc-500">Life Exp. (Female)</div>
            <Delta local={lifeExpF} national={lifeExpFEng} />
          </div>
        </div>
        <div className="space-y-2">
          {goodHealth && <MiniBar label="Good / very good health" value={goodHealth} color="#f87171" />}
          {badHealth && <MiniBar label="Bad / very bad health" value={badHealth} color="#ef4444" />}
        </div>
      </div>

      {/* ── Education ── */}
      <div className="bg-muted rounded-xl p-4">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3 font-medium">
          Education
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            {degree && <MiniBar label="Degree or higher" value={degree} color="#a78bfa" />}
            <Delta local={`${degree}%`} national={degreeEng} />
          </div>
          {noQuals && <MiniBar label="No qualifications" value={noQuals} color="#6b7280" />}
          {goodSchools && <MiniBar label="Schools rated Good+" value={goodSchools} color="#8b5cf6" />}
        </div>
      </div>

      {/* ── Deprivation ── */}
      <div className="bg-muted rounded-xl p-4">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3 font-medium">
          Deprivation
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-base font-bold text-orange-400">{imdRank}</div>
            <div className="text-[9px] text-zinc-500">IMD Rank (of 650)</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-base font-bold text-orange-400">{fuelPov}</div>
            <div className="text-[9px] text-zinc-500">Fuel Poverty</div>
            <Delta local={fuelPov} national={fuelPovEng} invert />
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-base font-bold text-orange-400">{childPov}</div>
            <div className="text-[9px] text-zinc-500">Child Poverty</div>
            <Delta local={childPov} national={childPovEng} invert />
          </div>
        </div>
      </div>

      {/* ── Transport ── */}
      <div className="bg-muted rounded-xl p-4">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3 font-medium">
          Transport & Digital
        </div>
        <div className="space-y-2">
          {carOwn && <MiniBar label="Car ownership (1+ car)" value={carOwn} color="#22d3ee" />}
          {workFromHome && <MiniBar label="Work from home" value={workFromHome} color="#06b6d4" />}
          {broadband && <MiniBar label="Superfast broadband" value={broadband} color="#0891b2" />}
        </div>
      </div>

      {/* ── Demographics ── */}
      <div className="bg-muted rounded-xl p-4">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3 font-medium">
          Demographics
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            {bornUK && <MiniBar label="Born in UK" value={bornUK} color="#60a5fa" />}
            <Delta local={`${bornUK}%`} national={bornUKEng} />
          </div>
          {whiteBritish && <MiniBar label="White British" value={whiteBritish} color="#3b82f6" />}
        </div>
      </div>

      {/* ── Source ── */}
      <div className="text-center pt-1">
        <span className="text-[9px] text-zinc-600">
          Census 2021 · ONS · NOMIS{data.source === "mixed" ? " · Live data" : ""}
        </span>
      </div>
    </div>
  );
}
