import { NextResponse } from "next/server";

// Force dynamic — fetches live external data
export const dynamic = "force-dynamic";

// Energy Performance Certificate (EPC) Open Data
// Requires free API key from https://epc.opendatacommunities.org/
// Auth: Basic base64(email:apiKey)
// Falls back to national average data if no key is configured

const EPC_BASE = "https://epc.opendatacommunities.org/api/v1/domestic/search";

// Postcodes covering Braintree constituency
const POSTCODES = ["CM7", "CM77", "CO9"];

interface EPCRecord {
  address: string;
  postcode: string;
  "current-energy-rating": string;
  "current-energy-efficiency": string;
  "lodgement-date": string;
  "property-type": string;
  "total-floor-area": string;
}

type BandCounts = Record<string, number>;

// National average EPC distribution (England & Wales, 2023/24 data)
// Used as fallback when no API key is configured
const NATIONAL_FALLBACK: BandCounts = {
  A: 2,
  B: 15,
  C: 32,
  D: 30,
  E: 15,
  F: 5,
  G: 1,
};

async function fetchEPCPage(
  postcode: string,
  apiKey: string,
  email: string
): Promise<EPCRecord[]> {
  const auth = Buffer.from(`${email}:${apiKey}`).toString("base64");
  const url = `${EPC_BASE}?postcode=${postcode}&size=100`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${auth}`,
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) return [];

    const data = await res.json();
    return data?.rows ?? [];
  } catch {
    return [];
  }
}

export async function GET() {
  const apiKey = process.env.EPC_API_KEY;
  const email = process.env.EPC_EMAIL ?? "";

  // If no API key, return a reasonable fallback
  if (!apiKey) {
    const totalFallback = Object.values(NATIONAL_FALLBACK).reduce((a, b) => a + b, 0);
    const poorlyRated =
      ((NATIONAL_FALLBACK.D + NATIONAL_FALLBACK.E + NATIONAL_FALLBACK.F + NATIONAL_FALLBACK.G) /
        totalFallback) *
      100;

    return NextResponse.json({
      ratings: NATIONAL_FALLBACK,
      totalAssessed: totalFallback,
      poorlyRated: Math.round(poorlyRated * 10) / 10,
      recentAssessments: [],
      source: "fallback",
      note: "No EPC API key configured. Showing national average distribution. Set EPC_API_KEY and EPC_EMAIL env vars to fetch live data.",
    });
  }

  try {
    // Fetch from all postcodes in parallel
    const results = await Promise.allSettled(
      POSTCODES.map((pc) => fetchEPCPage(pc, apiKey, email))
    );

    const allRecords: EPCRecord[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        allRecords.push(...result.value);
      }
    }

    // Aggregate by EPC band
    const ratings: BandCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
    for (const record of allRecords) {
      const band = record["current-energy-rating"]?.toUpperCase();
      if (band && band in ratings) {
        ratings[band]++;
      }
    }

    const totalAssessed = Object.values(ratings).reduce((a, b) => a + b, 0);
    const poorlyRatedCount = ratings.D + ratings.E + ratings.F + ratings.G;
    const poorlyRated =
      totalAssessed > 0
        ? Math.round((poorlyRatedCount / totalAssessed) * 1000) / 10
        : 0;

    // Recent assessments (last 10 sorted by date)
    const recentAssessments = allRecords
      .filter((r) => r["lodgement-date"])
      .sort((a, b) => b["lodgement-date"].localeCompare(a["lodgement-date"]))
      .slice(0, 10)
      .map((r) => ({
        address: r.address,
        postcode: r.postcode,
        rating: r["current-energy-rating"],
        efficiency: r["current-energy-efficiency"],
        date: r["lodgement-date"],
        propertyType: r["property-type"],
        floorArea: r["total-floor-area"],
      }));

    return NextResponse.json({
      ratings,
      totalAssessed,
      poorlyRated,
      recentAssessments,
      source: "live",
      sourceUrl: "https://epc.opendatacommunities.org/",
    });
  } catch {
    return NextResponse.json(
      {
        ratings: NATIONAL_FALLBACK,
        totalAssessed: 0,
        poorlyRated: 0,
        recentAssessments: [],
        error: "Failed to fetch EPC data",
        source: "fallback",
      },
      { status: 500 }
    );
  }
}
