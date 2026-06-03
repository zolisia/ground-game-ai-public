import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Live data (employment rate, claimant count, MP info): 24h TTL, warmed daily by cron.
// Demographic profile (Census indicators): 6-month TTL, auto-fetched on first request
// and stored in demographic_profile/{slug}. Adding a new constituency requires no code
// change — the first page load triggers the fetch and caches it.
const TTL_MS = 24 * 60 * 60 * 1000;
const DEMOGRAPHIC_TTL_MS = 180 * 24 * 60 * 60 * 1000; // ~6 months

const ONS_BASE = "https://api.beta.ons.gov.uk/v1/population-types";
const NOMIS_BASE = "https://www.nomisweb.co.uk/api/v01";

const BRAINTREE_WPCA24 = "721420347";

interface DataSection {
  heading: string;
  rows: Record<string, string>[];
}

interface CommonsLibraryData {
  constituency: string;
  onsCode: string;
  sections: Record<string, DataSection[]>;
  sectionCount: number;
  source: string;
  sourceUrl: string;
  scrapedAt: string;
  note?: string;
}

// Deprivation indicators sourced from published government datasets.
// Not available via real-time API — updated here when new data is released
// (IMD ~every 4 years, life exp / fuel / child pov annually).
// For any constituency not listed, the Deprivation section is omitted.
const DEPRIVATION_LOOKUP: Record<string, {
  imdRank: string; lifeExpM: string; lifeExpF: string;
  fuelPov: string; childPov: string;
}> = {
  "braintree":                        { imdRank: "456th (less deprived)", lifeExpM: "80.5 years", lifeExpF: "83.8 years", fuelPov: "11.8%",  childPov: "18.2%" },
  "clacton":                          { imdRank: "108th (more deprived)", lifeExpM: "77.2 years", lifeExpF: "81.6 years", fuelPov: "17.4%",  childPov: "30.2%" },
  "walthamstow":                      { imdRank: "182nd (more deprived)", lifeExpM: "79.0 years", lifeExpF: "83.3 years", fuelPov: "13.8%",  childPov: "41.8%" },
  "sheffield-central":                { imdRank: "32nd (most deprived)",  lifeExpM: "77.5 years", lifeExpF: "82.0 years", fuelPov: "17.9%",  childPov: "46.1%" },
  "leeds-central-and-headingley":     { imdRank: "91st (more deprived)",  lifeExpM: "77.8 years", lifeExpF: "82.1 years", fuelPov: "16.2%",  childPov: "41.2%" },
  "south-basildon-and-east-thurrock": { imdRank: "319th (average)",       lifeExpM: "78.8 years", lifeExpF: "82.8 years", fuelPov: "13.9%",  childPov: "28.7%" },
  "great-yarmouth":                   { imdRank: "89th (more deprived)",  lifeExpM: "77.3 years", lifeExpF: "81.5 years", fuelPov: "19.8%",  childPov: "36.4%" },
  "streatham-and-croydon-north":      { imdRank: "148th (more deprived)", lifeExpM: "79.5 years", lifeExpF: "83.6 years", fuelPov: "13.1%",  childPov: "40.3%" },
  "lewisham-east":                    { imdRank: "160th (more deprived)", lifeExpM: "79.6 years", lifeExpF: "83.7 years", fuelPov: "13.4%",  childPov: "37.9%" },
  "tonbridge":                        { imdRank: "556th (less deprived)", lifeExpM: "81.2 years", lifeExpF: "84.9 years", fuelPov: "9.8%",   childPov: "15.1%" },
};

// ─── ONS Census 2021 helpers ─────────────────────────────────────────────────

async function fetchONSLtla(
  ladCode: string,
  dim: string,
  popType: "UR" | "HH"
): Promise<Record<string, number>> {
  const url = `${ONS_BASE}/${popType}/census-observations?dimensions=ltla,${dim}&area-type=ltla,${ladCode}`;
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return {};
    const data = await r.json();
    const cats: Record<string, number> = {};
    for (const obs of (data?.observations ?? [])) {
      const d = obs.dimensions?.find((x: { dimension_id: string }) => x.dimension_id === dim);
      if (d && d.option_id !== "-8") cats[d.option_id] = (cats[d.option_id] ?? 0) + obs.observation;
    }
    return cats;
  } catch {
    return {};
  }
}

function sc(cats: Record<string, number>, keys: string[]): number {
  return keys.reduce((a, k) => a + (cats[k] ?? 0), 0);
}
function tc(cats: Record<string, number>): number {
  return Object.values(cats).reduce((a, b) => a + b, 0);
}
function fp(n: number, t: number): string {
  if (t === 0) return "0%";
  return `${Math.round((n / t) * 1000) / 10}%`;
}

// ─── Dynamic demographic profile fetch ──────────────────────────────────────

async function fetchDemographicProfile(
  slug: string,
  ladCode: string,
  wpca24Code: string
): Promise<DataSection[]> {
  try {
    // Fetch Census dimensions sequentially to respect ONS rate limits
    const health   = await fetchONSLtla(ladCode, "health_in_general", "UR");
    await new Promise(r => setTimeout(r, 200));
    const quals    = await fetchONSLtla(ladCode, "highest_qualification", "UR");
    await new Promise(r => setTimeout(r, 200));
    const tenure   = await fetchONSLtla(ladCode, "hh_tenure_9a", "HH");
    await new Promise(r => setTimeout(r, 200));
    const econAct  = await fetchONSLtla(ladCode, "economic_activity_status_12a", "UR");
    await new Promise(r => setTimeout(r, 200));
    const birth    = await fetchONSLtla(ladCode, "country_of_birth_3a", "UR");
    await new Promise(r => setTimeout(r, 200));
    const ethnic   = await fetchONSLtla(ladCode, "ethnic_group_tb_20b", "UR");
    await new Promise(r => setTimeout(r, 200));
    const ageGrp   = await fetchONSLtla(ladCode, "resident_age_3a", "UR");

    if (tc(health) === 0 && tc(quals) === 0) return []; // nothing came back

    // NOMIS APS employment rate
    let empRate: string | null = null;
    let medianPay: string | null = null;
    try {
      const er = await fetch(
        `${NOMIS_BASE}/dataset/NM_17_5.data.json?geography=${wpca24Code}&variable=45&measures=20599&time=latest`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (er.ok) {
        const v = (await er.json())?.obs?.[0]?.obs_value?.value;
        if (v) empRate = `${Math.round(v * 10) / 10}%`;
      }
    } catch { /* continue */ }

    // NOMIS ASHE median weekly pay
    try {
      const pr = await fetch(
        `${NOMIS_BASE}/dataset/NM_99_1.data.json?geography=${wpca24Code}&sex=8&item=2&pay=1&measures=20100&time=latest`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (pr.ok) {
        const v = (await pr.json())?.obs?.[0]?.obs_value?.value;
        if (v && String(v) !== "") medianPay = `£${Math.round(Number(v)).toLocaleString("en-GB")}`;
      }
    } catch { /* continue */ }

    // Computed indicators
    const ht = tc(health), qt = tc(quals), tt = tc(tenure);
    const bt = tc(birth), etht = tc(ethnic), at = tc(ageGrp);

    const goodHealth   = fp(sc(health, ["1", "2"]), ht);
    const badHealth    = fp(sc(health, ["4", "5"]), ht);
    const degree       = fp(quals["5"] ?? 0, qt);
    const noQuals      = fp(quals["0"] ?? 0, qt);
    const ownerOcc     = fp(sc(tenure, ["0", "1"]), tt);
    const socialRent   = fp(sc(tenure, ["3", "4"]), tt);
    const privateRent  = fp(sc(tenure, ["5", "6"]), tt);
    const employed     = sc(econAct, ["1", "2", "3", "5"]);
    const unemployed   = sc(econAct, ["4", "6"]);
    const unempRate    = fp(unemployed, employed + unemployed);
    const bornUK       = fp(birth["1"] ?? 0, bt);
    const whiteBritish = fp(ethnic["13"] ?? 0, etht);
    const u16  = at > 0 ? (ageGrp["1"] ?? 0) / at * 100 : 20;
    const o65  = at > 0 ? (ageGrp["3"] ?? 0) / at * 100 : 18;
    const medAge = String(Math.round(u16 * 0.08 + (100 - u16 - o65) * 0.40 + o65 * 0.75));

    const dep = DEPRIVATION_LOOKUP[slug];

    return [
      {
        heading: "Population & Demographics",
        rows: [
          { Measure: "Median age", Value: medAge, England: "40", Region: "" },
          { Measure: "Born in UK", Value: bornUK, England: "83.4%", Region: "" },
          { Measure: "White British", Value: whiteBritish, England: "73.5%", Region: "" },
        ],
      },
      {
        heading: "Housing",
        rows: [
          { Measure: "Owner occupied", Value: ownerOcc, England: "62.3%", Region: "" },
          { Measure: "Social rented", Value: socialRent, England: "17.1%", Region: "" },
          { Measure: "Private rented", Value: privateRent, England: "18.4%", Region: "" },
        ],
      },
      {
        heading: "Economy & Employment",
        rows: [
          ...(empRate ? [{ Measure: "Employment rate (16-64)", Value: empRate, England: "75.5%", Region: "" }] : []),
          { Measure: "Unemployment rate", Value: unempRate, England: "4.3%", Region: "" },
          ...(medianPay ? [{ Measure: "Median weekly pay", Value: medianPay, England: "£640", Region: "" }] : []),
        ],
      },
      {
        heading: "Education",
        rows: [
          { Measure: "Degree or higher (16+)", Value: degree, England: "33.8%", Region: "" },
          { Measure: "No qualifications (16+)", Value: noQuals, England: "18.2%", Region: "" },
        ],
      },
      {
        heading: "Health",
        rows: [
          { Measure: "Good or very good health", Value: goodHealth, England: "81.7%", Region: "" },
          { Measure: "Bad or very bad health", Value: badHealth, England: "5.2%", Region: "" },
          ...(dep ? [
            { Measure: "Life expectancy (male)", Value: dep.lifeExpM, England: "79.4 years", Region: "" },
            { Measure: "Life expectancy (female)", Value: dep.lifeExpF, England: "83.1 years", Region: "" },
          ] : []),
        ],
      },
      ...(dep ? [{
        heading: "Deprivation",
        rows: [
          { Measure: "IMD rank (of 650)", Value: dep.imdRank, England: "", Region: "" },
          { Measure: "Fuel poverty", Value: dep.fuelPov, England: "13.1%", Region: "" },
          { Measure: "Child poverty (after housing costs)", Value: dep.childPov, England: "29.4%", Region: "" },
        ],
      }] : []),
    ];
  } catch {
    return [];
  }
}

// ─── Live NOMIS data (refreshed daily) ──────────────────────────────────────

async function fetchNomisReport(wpca24Code: string | null): Promise<DataSection[]> {
  const sections: DataSection[] = [];

  try {
    const empRes = await fetch(
      `${NOMIS_BASE}/dataset/NM_17_5.data.json?geography=2092957703&variable=45&measures=20599&time=latest`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) }
    );
    if (empRes.ok) {
      const obs = (await empRes.json())?.obs ?? [];
      if (obs.length > 0) {
        const val = obs[0]?.obs_value?.value;
        const date = obs[0]?.time?.description || "";
        if (val) sections.push({
          heading: "Employment Rate (GB)",
          rows: [{ Measure: "Employment rate (16-64)", Value: `${val}%`, Period: date }],
        });
      }
    }
  } catch { /* continue */ }

  if (!wpca24Code) return sections;

  try {
    const ccRes = await fetch(
      `${NOMIS_BASE}/dataset/NM_162_1.data.json?geography=${wpca24Code}&time=latestMINUS2&measures=20100,20201&gender=0&age=0`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) }
    );
    if (ccRes.ok) {
      const obs = (await ccRes.json())?.obs ?? [];
      const rows: Record<string, string>[] = [];
      let date = "";
      for (const o of obs) {
        const measure = String(o.measures?.value);
        const val = o.obs_value?.value;
        date = o.time?.description || date;
        if (measure === "20100" && val > 10) rows.push({ Measure: "Claimant count", Value: Number(val).toLocaleString(), Period: date });
        else if (measure === "20201" && val > 0 && val < 100) rows.push({ Measure: "Claimant rate", Value: `${val}%`, Period: date });
      }
      if (rows.length > 0) sections.push({ heading: "Claimant Count", rows });
    }
  } catch { /* continue */ }

  try {
    const popRes = await fetch(
      `${NOMIS_BASE}/dataset/NM_2010_1.data.json?geography=${wpca24Code}&time=latest&measures=20100&gender=0&c_age=200`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) }
    );
    if (popRes.ok) {
      const obs = (await popRes.json())?.obs ?? [];
      if (obs.length > 0) {
        const val = obs[0]?.obs_value?.value;
        const date = obs[0]?.time?.description || "";
        if (val) sections.push({
          heading: "Population",
          rows: [{ Measure: "Total population", Value: Number(val).toLocaleString(), Period: date }],
        });
      }
    }
  } catch { /* continue */ }

  return sections;
}

async function fetchParliamentData(constituency: string): Promise<DataSection[]> {
  try {
    const mpRes = await fetch(
      `https://members-api.parliament.uk/api/Members/Search?Name=&Constituency=${encodeURIComponent(constituency)}&IsCurrentMember=true`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) }
    );
    if (!mpRes.ok) return [];
    const items = (await mpRes.json())?.items ?? [];
    if (items.length === 0) return [];
    const mp = items[0].value;
    return [{
      heading: "Member of Parliament",
      rows: [
        { Field: "Name", Value: mp.nameDisplayAs || "" },
        { Field: "Party", Value: mp.latestParty?.name || "" },
        { Field: "Gender", Value: mp.gender || "" },
        { Field: "Member since", Value: mp.membershipStartDate ? String(new Date(mp.membershipStartDate).getFullYear()) : "" },
      ],
    }];
  } catch {
    return [];
  }
}

// ─── Demographic profile — Firestore cache (6-month TTL) ────────────────────

async function getOrFetchDemographicProfile(
  slug: string,
  ladCode: string | null,
  wpca24Code: string | null
): Promise<DataSection[]> {
  const ref = adminDb.collection("demographic_profile").doc(slug);

  try {
    const snap = await ref.get();
    if (snap.exists) {
      const cached = snap.data()!;
      const age = Date.now() - new Date(cached.cached_at as string).getTime();
      if (age < DEMOGRAPHIC_TTL_MS) {
        return cached.sections as DataSection[];
      }
    }
  } catch { /* continue to fetch */ }

  if (!ladCode || !wpca24Code) return [];

  const sections = await fetchDemographicProfile(slug, ladCode, wpca24Code);
  if (sections.length > 0) {
    try {
      await ref.set({ sections, cached_at: new Date().toISOString() });
    } catch { /* write failure — still return the freshly fetched data */ }
  }
  return sections;
}

// ─── Main data assembly ──────────────────────────────────────────────────────

async function generateFreshData(
  constituencySlug: string,
  constituencyName: string,
  onsCode: string,
  wpca24Code: string | null,
  ladCode: string | null
): Promise<CommonsLibraryData> {
  const [nomisSections, parliamentSections, demographicSections] = await Promise.allSettled([
    fetchNomisReport(wpca24Code),
    fetchParliamentData(constituencyName),
    getOrFetchDemographicProfile(constituencySlug, ladCode, wpca24Code),
  ]);

  const liveSections: DataSection[] = [];
  if (nomisSections.status === "fulfilled") liveSections.push(...nomisSections.value);
  if (parliamentSections.status === "fulfilled") liveSections.push(...parliamentSections.value);

  const staticSections: DataSection[] = parliamentSections.status === "fulfilled"
    ? (demographicSections.status === "fulfilled" ? demographicSections.value : [])
    : [];

  const grouped: Record<string, DataSection[]> = {};
  for (const s of liveSections) {
    const cat = "live";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }
  for (const s of staticSections) {
    const cat = categorise(s.heading);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }

  const hasProfile = staticSections.length > 0;

  return {
    constituency: constituencyName,
    onsCode,
    sections: grouped,
    sectionCount: liveSections.length + staticSections.length,
    source: liveSections.length > 0 ? (hasProfile ? "mixed" : "live-only") : "static",
    sourceUrl: `https://commonslibrary.parliament.uk/constituency/${constituencySlug}/`,
    scrapedAt: new Date().toISOString(),
    ...(!hasProfile && { note: "Demographic profile is being fetched — check back shortly." }),
  };
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const constituencySlug = searchParams.get("constituency") || "braintree";
  const force = searchParams.get("force") === "1";
  const constituencyData = getFullData(constituencySlug);

  if (!constituencyData) {
    return Response.json({ error: "Invalid constituency slug" }, { status: 400 });
  }

  const constituencyName = constituencyData.constituency.name;
  const onsCode = constituencyData.constituency.onsCode;
  const wpca24Code = constituencyData.constituency.wpca24Code ?? (constituencySlug === "braintree" ? BRAINTREE_WPCA24 : null);
  const ladCode = constituencyData.areas?.lads?.[0]?.code ?? null;

  const cacheDocRef = adminDb.collection("commons_library_cache").doc(constituencySlug);

  type CacheDoc = { data: Record<string, unknown>; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await cacheDocRef.get();
    if (snap.exists) cached = snap.data() as CacheDoc;
  } catch { /* continue without cache */ }

  const cacheAge = cached ? Date.now() - new Date(cached.updated_at).getTime() : Infinity;
  if (cached && !force && cacheAge < TTL_MS) {
    return NextResponse.json({ ...cached.data, source: "cache" });
  }

  try {
    const fresh = await generateFreshData(constituencySlug, constituencyName, onsCode, wpca24Code, ladCode);
    try {
      await cacheDocRef.set({ data: fresh, updated_at: new Date().toISOString() });
    } catch { /* cache write failure — return fresh anyway */ }
    return NextResponse.json(fresh);
  } catch (err) {
    console.error("Commons Library API error:", err);
    return NextResponse.json(
      {
        constituency: constituencyName,
        onsCode,
        sections: {},
        sectionCount: 0,
        source: "error",
        sourceUrl: `https://commonslibrary.parliament.uk/constituency/${constituencySlug}/`,
        scrapedAt: new Date().toISOString(),
        note: "Failed to load constituency data.",
      },
      { status: 500 }
    );
  }
}

function categorise(heading: string): string {
  const h = heading.toLowerCase();
  if (h.includes("population") || h.includes("demograph")) return "population";
  if (h.includes("economy") || h.includes("employment") || h.includes("claimant")) return "economy";
  if (h.includes("housing") || h.includes("house price")) return "housing";
  if (h.includes("education") || h.includes("school")) return "education";
  if (h.includes("health") || h.includes("life expectancy")) return "health";
  if (h.includes("deprivation") || h.includes("imd")) return "deprivation";
  if (h.includes("transport") || h.includes("broadband")) return "transport";
  if (h.includes("member") || h.includes("parliament")) return "mp";
  return "other";
}
