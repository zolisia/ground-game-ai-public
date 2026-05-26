import { NextResponse } from "next/server";
import { doc, getDoc, setDoc, type DocumentReference } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Commons Library constituency data
// Since commonslibrary.parliament.uk blocks server-side scraping (403),
// we use the Commons Library data dashboard CSV downloads + NOMIS report data
// to build a comprehensive profile.

const TTL_MS = 24 * 60 * 60 * 1000;

// NOMIS wpca24 code for Braintree parliamentary constituency. The data layer
// doesn't yet declare a `wpca24Code` field — same forward-compatible cast
// pattern as /api/cqc's postcodes. Once sourced per-constituency, the cast
// below will pick it up automatically.
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

async function fetchNomisReport(wpca24Code: string | null): Promise<DataSection[]> {
  const sections: DataSection[] = [];

  try {
    // Employment rate from Annual Population Survey (GB-level, not
    // constituency-specific — so always shown when available).
    const empRes = await fetch(
      `https://www.nomisweb.co.uk/api/v01/dataset/NM_17_5.data.json?geography=2092957703&variable=45&measures=20599&time=latest`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) }
    );
    if (empRes.ok) {
      const empData = await empRes.json();
      const obs = empData?.obs ?? [];
      if (obs.length > 0) {
        const val = obs[0]?.obs_value?.value;
        const date = obs[0]?.time?.description || "";
        if (val) {
          sections.push({
            heading: "Employment Rate (GB)",
            rows: [{ Measure: "Employment rate (16-64)", Value: `${val}%`, Period: date }],
          });
        }
      }
    }
  } catch { /* continue */ }

  // The next two endpoints are constituency-specific and need wpca24Code.
  if (!wpca24Code) return sections;

  try {
    // Claimant count
    const ccRes = await fetch(
      `https://www.nomisweb.co.uk/api/v01/dataset/NM_162_1.data.json?geography=${wpca24Code}&time=latestMINUS2&measures=20100,20201&gender=0&age=0`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) }
    );
    if (ccRes.ok) {
      const ccData = await ccRes.json();
      const obs = ccData?.obs ?? [];
      const rows: Record<string, string>[] = [];
      let date = "";
      for (const o of obs) {
        const measure = String(o.measures?.value);
        const val = o.obs_value?.value;
        date = o.time?.description || date;
        if (measure === "20100" && val > 10) {
          rows.push({ Measure: "Claimant count", Value: Number(val).toLocaleString(), Period: date });
        } else if (measure === "20201" && val > 0 && val < 100) {
          rows.push({ Measure: "Claimant rate", Value: `${val}%`, Period: date });
        }
      }
      if (rows.length > 0) {
        sections.push({ heading: "Claimant Count", rows });
      }
    }
  } catch { /* continue */ }

  try {
    // Population estimates from NOMIS
    const popRes = await fetch(
      `https://www.nomisweb.co.uk/api/v01/dataset/NM_2010_1.data.json?geography=${wpca24Code}&time=latest&measures=20100&gender=0&c_age=200`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) }
    );
    if (popRes.ok) {
      const popData = await popRes.json();
      const obs = popData?.obs ?? [];
      if (obs.length > 0) {
        const val = obs[0]?.obs_value?.value;
        const date = obs[0]?.time?.description || "";
        if (val) {
          sections.push({
            heading: "Population",
            rows: [{ Measure: "Total population", Value: Number(val).toLocaleString(), Period: date }],
          });
        }
      }
    }
  } catch { /* continue */ }

  return sections;
}

async function fetchParliamentData(constituency: string): Promise<DataSection[]> {
  const sections: DataSection[] = [];

  try {
    // MP info from Parliament API
    const mpRes = await fetch(
      `https://members-api.parliament.uk/api/Members/Search?Name=&Constituency=${encodeURIComponent(constituency)}&IsCurrentMember=true`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) }
    );
    if (mpRes.ok) {
      const mpData = await mpRes.json();
      const items = mpData?.items ?? [];
      if (items.length > 0) {
        const mp = items[0].value;
        const latestParty = mp.latestParty?.name || "";
        const gender = mp.gender || "";
        const memberSince = mp.membershipStartDate ? new Date(mp.membershipStartDate).getFullYear() : "";
        sections.push({
          heading: "Member of Parliament",
          rows: [
            { Field: "Name", Value: mp.nameDisplayAs || "" },
            { Field: "Party", Value: latestParty },
            { Field: "Gender", Value: gender },
            { Field: "Member since", Value: String(memberSince) },
          ],
        });
      }
    }
  } catch { /* continue */ }

  return sections;
}

// Hardcoded constituency profile data from Commons Library
// This data is sourced from the Commons Library constituency profile for Braintree
// Last updated: March 2026
// Constituency vs England & East of England comparisons
// Sources: Census 2021, ONS, NOMIS, Commons Library constituency profiles
//
// Returns Braintree's curated profile only for slug === "braintree". For other
// constituencies, returns an empty list — demographic comparison data has not
// yet been sourced per-constituency, and showing Braintree's stats labelled as
// another area would be misleading.
function getStaticProfile(constituencySlug: string): DataSection[] {
  if (constituencySlug !== "braintree") return [];
  return [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "80,100", England: "56,490,048", Region: "6,334,500" },
        { Measure: "Electorate (2024)", Value: "77,781", England: "", Region: "" },
        { Measure: "Median age", Value: "43", England: "40", Region: "42" },
        { Measure: "Population density (per hectare)", Value: "2.1", England: "4.3", Region: "3.3" },
        { Measure: "Born in UK", Value: "91.5%", England: "83.4%", Region: "88.2%" },
        { Measure: "White British", Value: "87.5%", England: "73.5%", Region: "80.4%" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied", Value: "72.5%", England: "62.3%", Region: "67.1%" },
        { Measure: "Social rented", Value: "13.2%", England: "17.1%", Region: "14.8%" },
        { Measure: "Private rented", Value: "12.1%", England: "18.4%", Region: "15.9%" },
        { Measure: "Average house price", Value: "£345,000", England: "£290,000", Region: "£320,000" },
        { Measure: "Homes (Council Tax)", Value: "34,500", England: "", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "78.2%", England: "75.5%", Region: "77.8%" },
        { Measure: "Self-employment rate", Value: "12.1%", England: "9.5%", Region: "10.8%" },
        { Measure: "Unemployment rate", Value: "3.4%", England: "4.3%", Region: "3.6%" },
        { Measure: "Median weekly pay", Value: "£620", England: "£640", Region: "£615" },
        { Measure: "Economically inactive", Value: "18.4%", England: "21.5%", Region: "18.6%" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)", Value: "28.3%", England: "33.8%", Region: "30.1%" },
        { Measure: "No qualifications (16+)", Value: "17.8%", England: "18.2%", Region: "17.5%" },
        { Measure: "Schools rated Good/Outstanding", Value: "89%", England: "87%", Region: "88%" },
        { Measure: "Level 4+ qualifications", Value: "31.2%", England: "36.4%", Region: "32.8%" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "81.2%", England: "81.7%", Region: "82.1%" },
        { Measure: "Bad or very bad health", Value: "4.8%", England: "5.2%", Region: "4.6%" },
        { Measure: "Disabled (day-to-day limited)", Value: "16.5%", England: "17.3%", Region: "16.8%" },
        { Measure: "Life expectancy (male)", Value: "80.5 years", England: "79.4 years", Region: "80.2 years" },
        { Measure: "Life expectancy (female)", Value: "83.8 years", England: "83.1 years", Region: "83.6 years" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)", Value: "456th (less deprived)", England: "", Region: "" },
        { Measure: "LSOAs in most deprived 10%", Value: "0", England: "", Region: "" },
        { Measure: "LSOAs in least deprived 10%", Value: "4", England: "", Region: "" },
        { Measure: "Fuel poverty", Value: "11.8%", England: "13.1%", Region: "10.9%" },
        { Measure: "Child poverty (after housing costs)", Value: "18.2%", England: "29.4%", Region: "22.1%" },
      ],
    },
    {
      heading: "Transport & Connectivity",
      rows: [
        { Measure: "Car ownership (1+ cars)", Value: "85.6%", England: "74.4%", Region: "81.2%" },
        { Measure: "Travel to work by car", Value: "68.2%", England: "54.5%", Region: "62.8%" },
        { Measure: "Travel to work by train", Value: "9.1%", England: "10.1%", Region: "8.4%" },
        { Measure: "Work from home", Value: "14.3%", England: "13.5%", Region: "14.8%" },
        { Measure: "Superfast broadband coverage", Value: "95.2%", England: "96.8%", Region: "95.9%" },
      ],
    },
  ];
}

async function generateFreshData(
  constituencySlug: string,
  constituencyName: string,
  onsCode: string,
  wpca24Code: string | null
): Promise<CommonsLibraryData> {
  // Fetch live NOMIS + Parliament data in parallel
  const [nomisSections, parliamentSections] = await Promise.allSettled([
    fetchNomisReport(wpca24Code),
    fetchParliamentData(constituencyName),
  ]);

  const liveSections: DataSection[] = [];
  if (nomisSections.status === "fulfilled") liveSections.push(...nomisSections.value);
  if (parliamentSections.status === "fulfilled") liveSections.push(...parliamentSections.value);

  // Combine live data with static profile (Braintree only — others get [])
  const staticSections = getStaticProfile(constituencySlug);

  const grouped: Record<string, DataSection[]> = {};

  // Live data first (takes precedence in display)
  for (const s of liveSections) {
    const cat = "live";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }

  // Static profile sections
  for (const s of staticSections) {
    const cat = categorise(s.heading);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }

  const note =
    staticSections.length === 0
      ? "Static demographic profile not yet sourced for this constituency. Showing live NOMIS/Parliament data only."
      : undefined;

  return {
    constituency: constituencyName,
    onsCode,
    sections: grouped,
    sectionCount: liveSections.length + staticSections.length,
    source: liveSections.length > 0 ? (staticSections.length > 0 ? "mixed" : "live-only") : "static",
    sourceUrl: `https://commonslibrary.parliament.uk/constituency/${constituencySlug}/`,
    scrapedAt: new Date().toISOString(),
    ...(note && { note }),
  };
}

async function fetchAndUpdateCache(
  constituencySlug: string,
  constituencyName: string,
  onsCode: string,
  wpca24Code: string | null,
  cacheDocRef: DocumentReference
) {
  try {
    const fresh = await generateFreshData(constituencySlug, constituencyName, onsCode, wpca24Code);

    const existing = await getDoc(cacheDocRef);
    const existingData = existing.exists() ? existing.data().data : null;

    if (existingData && JSON.stringify(existingData) === JSON.stringify(fresh)) {
      return;
    }

    await setDoc(cacheDocRef, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Background commons library cache update failed:", err);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const constituencySlug = searchParams.get("constituency") || "braintree";
  const constituencyData = getFullData(constituencySlug);

  if (!constituencyData) {
    return Response.json(
      { error: "Invalid constituency slug" },
      { status: 400 }
    );
  }

  const constituencyName = constituencyData.constituency.name;
  const onsCode = constituencyData.constituency.onsCode;

  // Forward-compatible cast: `wpca24Code` isn't declared on Constituency yet.
  // Same pattern as the postcodes cast in /api/cqc — when the field is
  // sourced per-constituency, this lookup picks it up automatically.
  const constituencyWithWpca = constituencyData.constituency as { wpca24Code?: string };
  const wpca24Code =
    constituencyWithWpca.wpca24Code ??
    (constituencySlug === "braintree" ? BRAINTREE_WPCA24 : null);

  const cacheDocRef = doc(db, "commons_library_cache", constituencySlug);

  type CacheDoc = { data: Record<string, unknown>; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await getDoc(cacheDocRef);
    if (snap.exists()) {
      cached = snap.data() as CacheDoc;
    }
  } catch (err) {
    console.warn("Commons Library cache read failed (continuing without cache):", err);
  }

  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs > TTL_MS) {
      fetchAndUpdateCache(constituencySlug, constituencyName, onsCode, wpca24Code, cacheDocRef);
    }
    return NextResponse.json({ ...cached.data, source: "cache" });
  }

  try {
    const fresh = await generateFreshData(constituencySlug, constituencyName, onsCode, wpca24Code);

    try {
      await setDoc(cacheDocRef, {
        data: fresh,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("Commons Library cache write failed (returning fresh anyway):", err);
    }

    return NextResponse.json(fresh);
  } catch (err) {
    console.error("Commons Library API error:", err);
    // Return static data as fallback (Braintree only — others get an empty
    // grouped sections object with a note).
    const staticSections = getStaticProfile(constituencySlug);
    const grouped: Record<string, DataSection[]> = {};
    for (const s of staticSections) {
      const cat = categorise(s.heading);
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(s);
    }
    return NextResponse.json({
      constituency: constituencyName,
      onsCode,
      sections: grouped,
      sectionCount: staticSections.length,
      source: "static",
      sourceUrl: `https://commonslibrary.parliament.uk/constituency/${constituencySlug}/`,
      scrapedAt: new Date().toISOString(),
      ...(staticSections.length === 0 && {
        note: "Static demographic profile not yet sourced for this constituency.",
      }),
    });
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
