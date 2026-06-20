#!/usr/bin/env npx tsx
// scripts/seed-demographic-profiles.ts
// Writes pre-fetched demographic profiles directly to Firestore so all 9
// active constituencies show real data immediately on launch.
//
// Uses the accurate values already collected:
//   - Clacton, Walthamstow, S.Basildon, Gt Yarmouth, Streatham, Lewisham: ONS LAD-level
//   - Sheffield Central, Leeds Central: ONS ward-level (more accurate for inner-city)
//   - Braintree: from Commons Library constituency profile
//
// Run: npx tsx scripts/seed-demographic-profiles.ts

import * as admin from "firebase-admin";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local when env vars aren't already set (e.g. running locally)
if (!process.env.FIREBASE_ADMIN_PROJECT_ID) {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].replace(/^"|"$/g, ""); // strip surrounding quotes
      process.env[key] = val;
    }
  } catch { /* .env.local may not exist in CI — fall through */ }
}

const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("Missing FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db = admin.firestore();

interface Row { Measure: string; Value: string; England: string; Region: string; }
interface Section { heading: string; rows: Row[]; }

const PROFILES: Record<string, Section[]> = {
  braintree: [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "104,134", England: "56,490,048", Region: "6,334,500" },
        { Measure: "Median age",               Value: "43",      England: "40",         Region: "42" },
        { Measure: "Born in UK",               Value: "91.5%",   England: "83.4%",      Region: "88.2%" },
        { Measure: "White British",            Value: "87.5%",   England: "73.5%",      Region: "80.4%" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied",   Value: "72.5%", England: "62.3%", Region: "67.1%" },
        { Measure: "Social rented",    Value: "13.2%", England: "17.1%", Region: "14.8%" },
        { Measure: "Private rented",   Value: "12.1%", England: "18.4%", Region: "15.9%" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "78.2%", England: "75.5%", Region: "77.8%" },
        { Measure: "Unemployment rate",       Value: "3.4%",  England: "4.3%",  Region: "3.6%" },
        { Measure: "Median weekly pay",       Value: "£620",  England: "£640",  Region: "£615" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)",   Value: "28.3%", England: "33.8%", Region: "30.1%" },
        { Measure: "No qualifications (16+)",  Value: "17.8%", England: "18.2%", Region: "17.5%" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health",  Value: "81.2%",     England: "81.7%",      Region: "82.1%" },
        { Measure: "Bad or very bad health",    Value: "4.8%",      England: "5.2%",       Region: "4.6%" },
        { Measure: "Life expectancy (male)",    Value: "80.5 years",England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)",  Value: "83.8 years",England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)",                   Value: "456th (less deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty",                        Value: "11.8%",                 England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "18.2%",                 England: "29.4%", Region: "" },
      ],
    },
    {
      heading: "Transport & Connectivity",
      rows: [
        { Measure: "Car ownership (1+ cars)",       Value: "85.6%", England: "74.4%", Region: "81.2%" },
        { Measure: "Travel to work by car",         Value: "68.2%", England: "54.5%", Region: "62.8%" },
        { Measure: "Work from home",                Value: "14.3%", England: "13.5%", Region: "14.8%" },
        { Measure: "Superfast broadband coverage",  Value: "95.2%", England: "96.8%", Region: "95.9%" },
      ],
    },
  ],

  clacton: [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "98,187", England: "56,490,048", Region: "" },
        { Measure: "Median age",               Value: "45",     England: "40",         Region: "" },
        { Measure: "Born in UK",               Value: "95%",    England: "83.4%",      Region: "" },
        { Measure: "White British",            Value: "93.5%",  England: "73.5%",      Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied",  Value: "71.5%", England: "62.3%", Region: "" },
        { Measure: "Social rented",   Value: "8.2%",  England: "17.1%", Region: "" },
        { Measure: "Private rented",  Value: "19.8%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "61.9%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate",       Value: "6.2%",  England: "4.3%",  Region: "" },
        { Measure: "Median weekly pay",       Value: "£692",  England: "£640",  Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)",  Value: "19.9%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "26.2%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "75.1%",      England: "81.7%",      Region: "" },
        { Measure: "Bad or very bad health",   Value: "7.8%",       England: "5.2%",       Region: "" },
        { Measure: "Life expectancy (male)",   Value: "77.2 years", England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "81.6 years", England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)",                   Value: "108th (more deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty",                        Value: "17.4%",                 England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "30.2%",                 England: "29.4%", Region: "" },
      ],
    },
  ],

  walthamstow: [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "159,620", England: "56,490,048", Region: "" },
        { Measure: "Median age",               Value: "37",      England: "40",         Region: "" },
        { Measure: "Born in UK",               Value: "61.4%",   England: "83.4%",      Region: "" },
        { Measure: "White British",            Value: "34%",     England: "73.5%",      Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied",  Value: "48.9%", England: "62.3%", Region: "" },
        { Measure: "Social rented",   Value: "21.5%", England: "17.1%", Region: "" },
        { Measure: "Private rented",  Value: "27.8%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "83.6%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate",       Value: "7.5%",  England: "4.3%",  Region: "" },
        { Measure: "Median weekly pay",       Value: "£729",  England: "£640",  Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)",  Value: "43.2%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "18.2%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "85%",        England: "81.7%",      Region: "" },
        { Measure: "Bad or very bad health",   Value: "4.4%",       England: "5.2%",       Region: "" },
        { Measure: "Life expectancy (male)",   Value: "79.0 years", England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "83.3 years", England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)",                   Value: "182nd (more deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty",                        Value: "13.8%",                 England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "41.8%",                 England: "29.4%", Region: "" },
      ],
    },
  ],

  "sheffield-central": [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "89,943", England: "56,490,048", Region: "" },
        { Measure: "Median age",               Value: "40",     England: "40",         Region: "" },
        { Measure: "Born in UK",               Value: "72.8%",  England: "83.4%",      Region: "" },
        { Measure: "White British",            Value: "59.7%",  England: "73.5%",      Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied",  Value: "37.3%", England: "62.3%", Region: "" },
        { Measure: "Social rented",   Value: "17.2%", England: "17.1%", Region: "" },
        { Measure: "Private rented",  Value: "45%",   England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "69.8%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate",       Value: "11.2%", England: "4.3%",  Region: "" },
        { Measure: "Median weekly pay",       Value: "£721",  England: "£640",  Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)",  Value: "45.6%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "10.3%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "85.5%",     England: "81.7%",      Region: "" },
        { Measure: "Bad or very bad health",   Value: "4.1%",      England: "5.2%",       Region: "" },
        { Measure: "Life expectancy (male)",   Value: "77.5 years",England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "82.0 years",England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)",                   Value: "32nd (most deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty",                        Value: "17.9%",                England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "46.1%",                England: "29.4%", Region: "" },
      ],
    },
  ],

  "leeds-central-and-headingley": [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "106,362", England: "56,490,048", Region: "" },
        { Measure: "Median age",               Value: "39",      England: "40",         Region: "" },
        { Measure: "Born in UK",               Value: "76.7%",   England: "83.4%",      Region: "" },
        { Measure: "White British",            Value: "63.8%",   England: "73.5%",      Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied",  Value: "31.9%", England: "62.3%", Region: "" },
        { Measure: "Social rented",   Value: "22.6%", England: "17.1%", Region: "" },
        { Measure: "Private rented",  Value: "44.8%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "63%",  England: "75.5%", Region: "" },
        { Measure: "Unemployment rate",       Value: "13%",  England: "4.3%",  Region: "" },
        { Measure: "Median weekly pay",       Value: "£757", England: "£640",  Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)",  Value: "39.1%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "9.9%",  England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "86.4%",     England: "81.7%",      Region: "" },
        { Measure: "Bad or very bad health",   Value: "3.6%",      England: "5.2%",       Region: "" },
        { Measure: "Life expectancy (male)",   Value: "77.8 years",England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "82.1 years",England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)",                   Value: "91st (more deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty",                        Value: "16.2%",                England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "41.2%",                England: "29.4%", Region: "" },
      ],
    },
  ],

  "south-basildon-and-east-thurrock": [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "107,000", England: "56,490,048", Region: "" },
        { Measure: "Median age",               Value: "38",      England: "40",         Region: "" },
        { Measure: "Born in UK",               Value: "79%",     England: "83.4%",      Region: "" },
        { Measure: "White British",            Value: "66.2%",   England: "73.5%",      Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied",  Value: "63.3%", England: "62.3%", Region: "" },
        { Measure: "Social rented",   Value: "17.7%", England: "17.1%", Region: "" },
        { Measure: "Private rented",  Value: "18.3%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "85.1%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate",       Value: "5.7%",  England: "4.3%",  Region: "" },
        { Measure: "Median weekly pay",       Value: "£758",  England: "£640",  Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)",  Value: "26.2%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "21.6%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "84.1%",     England: "81.7%",      Region: "" },
        { Measure: "Bad or very bad health",   Value: "4.3%",      England: "5.2%",       Region: "" },
        { Measure: "Life expectancy (male)",   Value: "78.8 years",England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "82.8 years",England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)",                   Value: "319th (average)", England: "", Region: "" },
        { Measure: "Fuel poverty",                        Value: "13.9%",           England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "28.7%",           England: "29.4%", Region: "" },
      ],
    },
  ],

  "great-yarmouth": [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "99,750", England: "56,490,048", Region: "" },
        { Measure: "Median age",               Value: "43",     England: "40",         Region: "" },
        { Measure: "Born in UK",               Value: "90.2%",  England: "83.4%",      Region: "" },
        { Measure: "White British",            Value: "88.9%",  England: "73.5%",      Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied",  Value: "61.8%", England: "62.3%", Region: "" },
        { Measure: "Social rented",   Value: "16.2%", England: "17.1%", Region: "" },
        { Measure: "Private rented",  Value: "21.5%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "72.3%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate",       Value: "7.5%",  England: "4.3%",  Region: "" },
        { Measure: "Median weekly pay",       Value: "£695",  England: "£640",  Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)",  Value: "18.2%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "26.5%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "76.1%",     England: "81.7%",      Region: "" },
        { Measure: "Bad or very bad health",   Value: "7.2%",      England: "5.2%",       Region: "" },
        { Measure: "Life expectancy (male)",   Value: "77.3 years",England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "81.5 years",England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)",                   Value: "89th (more deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty",                        Value: "19.8%",                England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "36.4%",                England: "29.4%", Region: "" },
      ],
    },
  ],

  "streatham-and-croydon-north": [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "144,877", England: "56,490,048", Region: "" },
        { Measure: "Median age",               Value: "38",      England: "40",         Region: "" },
        { Measure: "Born in UK",               Value: "61.4%",   England: "83.4%",      Region: "" },
        { Measure: "White British",            Value: "37.6%",   England: "73.5%",      Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied",  Value: "33%",   England: "62.3%", Region: "" },
        { Measure: "Social rented",   Value: "33.6%", England: "17.1%", Region: "" },
        { Measure: "Private rented",  Value: "31.4%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "81.9%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate",       Value: "7.3%",  England: "4.3%",  Region: "" },
        { Measure: "Median weekly pay",       Value: "£921",  England: "£640",  Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)",  Value: "56.3%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "13.1%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "86.5%",     England: "81.7%",      Region: "" },
        { Measure: "Bad or very bad health",   Value: "4%",        England: "5.2%",       Region: "" },
        { Measure: "Life expectancy (male)",   Value: "79.5 years",England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "83.6 years",England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)",                   Value: "148th (more deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty",                        Value: "13.1%",                 England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "40.3%",                 England: "29.4%", Region: "" },
      ],
    },
  ],

  "lewisham-east": [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "117,190", England: "56,490,048", Region: "" },
        { Measure: "Median age",               Value: "37",      England: "40",         Region: "" },
        { Measure: "Born in UK",               Value: "64.4%",   England: "83.4%",      Region: "" },
        { Measure: "White British",            Value: "37.2%",   England: "73.5%",      Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied",  Value: "41.9%", England: "62.3%", Region: "" },
        { Measure: "Social rented",   Value: "29.2%", England: "17.1%", Region: "" },
        { Measure: "Private rented",  Value: "27.2%", England: "18.4%", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "71.7%", England: "75.5%", Region: "" },
        { Measure: "Unemployment rate",       Value: "8.2%",  England: "4.3%",  Region: "" },
        { Measure: "Median weekly pay",       Value: "£829",  England: "£640",  Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)",  Value: "49.8%", England: "33.8%", Region: "" },
        { Measure: "No qualifications (16+)", Value: "14.6%", England: "18.2%", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "85.2%",     England: "81.7%",      Region: "" },
        { Measure: "Bad or very bad health",   Value: "4.3%",      England: "5.2%",       Region: "" },
        { Measure: "Life expectancy (male)",   Value: "79.6 years",England: "79.4 years", Region: "" },
        { Measure: "Life expectancy (female)", Value: "83.7 years",England: "83.1 years", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)",                   Value: "160th (more deprived)", England: "", Region: "" },
        { Measure: "Fuel poverty",                        Value: "13.4%",                 England: "13.1%", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "37.9%",                 England: "29.4%", Region: "" },
      ],
    },
  ],
};

async function main() {
  const slugs = Object.keys(PROFILES);
  console.log(`Seeding demographic_profile for ${slugs.length} constituencies...`);

  for (const slug of slugs) {
    const ref = db.collection("demographic_profile").doc(slug);
    await ref.set({
      sections: PROFILES[slug],
      cached_at: new Date().toISOString(),
    });
    console.log(`  wrote ${slug} (${PROFILES[slug].length} sections)`);
  }

  // Also bust the commons_library_cache so stale responses are cleared
  console.log("\nClearing commons_library_cache for all constituencies...");
  for (const slug of slugs) {
    try {
      await db.collection("commons_library_cache").doc(slug).delete();
      console.log(`  cleared cache: ${slug}`);
    } catch {
      // doc may not exist yet — that's fine
    }
  }

  console.log("\nDone. All constituencies will serve fresh profile data on next request.");
  process.exit(0);
}

main().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
