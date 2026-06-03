import { NextResponse } from "next/server";
import type { DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
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
// Census 2021 (ONS) + NOMIS APS + published government sources.
// Fetched June 2026 via scripts/fetch-commons-profiles.ts.
// Census metrics use LAD-level ONS data as a constituency-level proxy, except
// Sheffield Central and Leeds Central which use ward-level aggregation.
// Life expectancy: ONS Health State Life Expectancies 2021-23 by primary LAD.
// IMD rank: Commons Library, English Deprivation by Constituency (IMD 2019).
// Fuel poverty: DESNZ Sub-regional fuel poverty 2023. Child poverty: HMRC 2023.
function getStaticProfile(constituencySlug: string): DataSection[] {
  if (constituencySlug === "clacton") return [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "98,187", England: "56,490,048", Region: "" },
        { Measure: "Median age", Value: "45", England: "40", Region: "" },
        { Measure: "Born in UK", Value: "95%", England: "83.4%", Region: "" },
        { Measure: "White British", Value: "93.5%", England: "73.5%", Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied", Value: "71.5%", England: "62.3%", Region: "" },
        { Measure: "Social rented", Value: "8.2%", England: "17.1%", Region: "" },
        { Measure: "Private rented", Value: "19.8%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "61.9%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate", Value: "6.2%", England: "4.3%", Region: "" },
        { Measure: "Median weekly pay", Value: "£692", England: "£640", Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)", Value: "19.9%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "26.2%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "75.1%", England: "81.7%", Region: "" },
        { Measure: "Bad or very bad health", Value: "7.8%", England: "5.2%", Region: "" },
        { Measure: "Life expectancy (male)", Value: "77.2 years", England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "81.6 years", England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)", Value: "108th (more deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty", Value: "17.4%", England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "30.2%", England: "29.4%", Region: "" },
      ],
    },
  ];

  if (constituencySlug === "walthamstow") return [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "159,620", England: "56,490,048", Region: "" },
        { Measure: "Median age", Value: "37", England: "40", Region: "" },
        { Measure: "Born in UK", Value: "61.4%", England: "83.4%", Region: "" },
        { Measure: "White British", Value: "34%", England: "73.5%", Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied", Value: "48.9%", England: "62.3%", Region: "" },
        { Measure: "Social rented", Value: "21.5%", England: "17.1%", Region: "" },
        { Measure: "Private rented", Value: "27.8%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "83.6%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate", Value: "7.5%", England: "4.3%", Region: "" },
        { Measure: "Median weekly pay", Value: "£729", England: "£640", Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)", Value: "43.2%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "18.2%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "85%", England: "81.7%", Region: "" },
        { Measure: "Bad or very bad health", Value: "4.4%", England: "5.2%", Region: "" },
        { Measure: "Life expectancy (male)", Value: "79.0 years", England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "83.3 years", England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)", Value: "182nd (more deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty", Value: "13.8%", England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "41.8%", England: "29.4%", Region: "" },
      ],
    },
  ];

  if (constituencySlug === "sheffield-central") return [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "89,943", England: "56,490,048", Region: "" },
        { Measure: "Median age", Value: "40", England: "40", Region: "" },
        { Measure: "Born in UK", Value: "72.8%", England: "83.4%", Region: "" },
        { Measure: "White British", Value: "59.7%", England: "73.5%", Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied", Value: "37.3%", England: "62.3%", Region: "" },
        { Measure: "Social rented", Value: "17.2%", England: "17.1%", Region: "" },
        { Measure: "Private rented", Value: "45%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "69.8%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate", Value: "11.2%", England: "4.3%", Region: "" },
        { Measure: "Median weekly pay", Value: "£721", England: "£640", Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)", Value: "45.6%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "10.3%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "85.5%", England: "81.7%", Region: "" },
        { Measure: "Bad or very bad health", Value: "4.1%", England: "5.2%", Region: "" },
        { Measure: "Life expectancy (male)", Value: "77.5 years", England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "82.0 years", England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)", Value: "32nd (most deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty", Value: "17.9%", England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "46.1%", England: "29.4%", Region: "" },
      ],
    },
  ];

  if (constituencySlug === "leeds-central-and-headingley") return [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "106,362", England: "56,490,048", Region: "" },
        { Measure: "Median age", Value: "39", England: "40", Region: "" },
        { Measure: "Born in UK", Value: "76.7%", England: "83.4%", Region: "" },
        { Measure: "White British", Value: "63.8%", England: "73.5%", Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied", Value: "31.9%", England: "62.3%", Region: "" },
        { Measure: "Social rented", Value: "22.6%", England: "17.1%", Region: "" },
        { Measure: "Private rented", Value: "44.8%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "63%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate", Value: "13%", England: "4.3%", Region: "" },
        { Measure: "Median weekly pay", Value: "£757", England: "£640", Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)", Value: "39.1%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "9.9%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "86.4%", England: "81.7%", Region: "" },
        { Measure: "Bad or very bad health", Value: "3.6%", England: "5.2%", Region: "" },
        { Measure: "Life expectancy (male)", Value: "77.8 years", England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "82.1 years", England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)", Value: "91st (more deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty", Value: "16.2%", England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "41.2%", England: "29.4%", Region: "" },
      ],
    },
  ];

  if (constituencySlug === "south-basildon-and-east-thurrock") return [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "107,000", England: "56,490,048", Region: "" },
        { Measure: "Median age", Value: "38", England: "40", Region: "" },
        { Measure: "Born in UK", Value: "79%", England: "83.4%", Region: "" },
        { Measure: "White British", Value: "66.2%", England: "73.5%", Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied", Value: "63.3%", England: "62.3%", Region: "" },
        { Measure: "Social rented", Value: "17.7%", England: "17.1%", Region: "" },
        { Measure: "Private rented", Value: "18.3%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "85.1%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate", Value: "5.7%", England: "4.3%", Region: "" },
        { Measure: "Median weekly pay", Value: "£758", England: "£640", Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)", Value: "26.2%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "21.6%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "84.1%", England: "81.7%", Region: "" },
        { Measure: "Bad or very bad health", Value: "4.3%", England: "5.2%", Region: "" },
        { Measure: "Life expectancy (male)", Value: "78.8 years", England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "82.8 years", England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)", Value: "319th (average)", England: "", Region: "" },
        { Measure: "Fuel poverty", Value: "13.9%", England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "28.7%", England: "29.4%", Region: "" },
      ],
    },
  ];

  if (constituencySlug === "great-yarmouth") return [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "99,750", England: "56,490,048", Region: "" },
        { Measure: "Median age", Value: "43", England: "40", Region: "" },
        { Measure: "Born in UK", Value: "90.2%", England: "83.4%", Region: "" },
        { Measure: "White British", Value: "88.9%", England: "73.5%", Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied", Value: "61.8%", England: "62.3%", Region: "" },
        { Measure: "Social rented", Value: "16.2%", England: "17.1%", Region: "" },
        { Measure: "Private rented", Value: "21.5%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "72.3%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate", Value: "7.5%", England: "4.3%", Region: "" },
        { Measure: "Median weekly pay", Value: "£695", England: "£640", Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)", Value: "18.2%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "26.5%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "76.1%", England: "81.7%", Region: "" },
        { Measure: "Bad or very bad health", Value: "7.2%", England: "5.2%", Region: "" },
        { Measure: "Life expectancy (male)", Value: "77.3 years", England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "81.5 years", England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)", Value: "89th (more deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty", Value: "19.8%", England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "36.4%", England: "29.4%", Region: "" },
      ],
    },
  ];

  if (constituencySlug === "streatham-and-croydon-north") return [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "144,877", England: "56,490,048", Region: "" },
        { Measure: "Median age", Value: "38", England: "40", Region: "" },
        { Measure: "Born in UK", Value: "61.4%", England: "83.4%", Region: "" },
        { Measure: "White British", Value: "37.6%", England: "73.5%", Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied", Value: "33%", England: "62.3%", Region: "" },
        { Measure: "Social rented", Value: "33.6%", England: "17.1%", Region: "" },
        { Measure: "Private rented", Value: "31.4%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "81.9%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate", Value: "7.3%", England: "4.3%", Region: "" },
        { Measure: "Median weekly pay", Value: "£921", England: "£640", Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)", Value: "56.3%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "13.1%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "86.5%", England: "81.7%", Region: "" },
        { Measure: "Bad or very bad health", Value: "4%", England: "5.2%", Region: "" },
        { Measure: "Life expectancy (male)", Value: "79.5 years", England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "83.6 years", England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)", Value: "148th (more deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty", Value: "13.1%", England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "40.3%", England: "29.4%", Region: "" },
      ],
    },
  ];

  if (constituencySlug === "lewisham-east") return [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "117,190", England: "56,490,048", Region: "" },
        { Measure: "Median age", Value: "37", England: "40", Region: "" },
        { Measure: "Born in UK", Value: "64.4%", England: "83.4%", Region: "" },
        { Measure: "White British", Value: "37.2%", England: "73.5%", Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied", Value: "41.9%", England: "62.3%", Region: "" },
        { Measure: "Social rented", Value: "29.2%", England: "17.1%", Region: "" },
        { Measure: "Private rented", Value: "27.2%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "71.7%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate", Value: "8.2%", England: "4.3%", Region: "" },
        { Measure: "Median weekly pay", Value: "£829", England: "£640", Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)", Value: "49.8%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "14.6%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "85.2%", England: "81.7%", Region: "" },
        { Measure: "Bad or very bad health", Value: "4.3%", England: "5.2%", Region: "" },
        { Measure: "Life expectancy (male)", Value: "79.6 years", England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "83.7 years", England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)", Value: "160th (more deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty", Value: "13.4%", England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "37.9%", England: "29.4%", Region: "" },
      ],
    },
  ];

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

    const existing = await cacheDocRef.get();
    const existingData = existing.data()?.data ?? null;

    if (existingData && JSON.stringify(existingData) === JSON.stringify(fresh)) {
      return;
    }

    await cacheDocRef.set({
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
  const force = searchParams.get("force") === "1";
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

  const cacheDocRef = adminDb.collection("commons_library_cache").doc(constituencySlug);

  type CacheDoc = { data: Record<string, unknown>; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await cacheDocRef.get();
    if (snap.exists) {
      cached = snap.data() as CacheDoc;
    }
  } catch (err) {
    console.warn("Commons Library cache read failed (continuing without cache):", err);
  }

  if (cached && !force) {
    return NextResponse.json({ ...cached.data, source: "cache" });
  }

  try {
    const fresh = await generateFreshData(constituencySlug, constituencyName, onsCode, wpca24Code);

    try {
      await cacheDocRef.set({
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
