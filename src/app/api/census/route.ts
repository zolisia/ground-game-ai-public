import { NextResponse } from "next/server";
import { doc, getDoc, setDoc, type DocumentReference } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const dynamic = "force-dynamic";

// ONS Census 2021 API — free, no auth required
// https://api.beta.ons.gov.uk/v1
// Fetches ward-level census data for all wards in the Braintree constituency

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ONS_API = "https://api.beta.ons.gov.uk/v1/population-types";

// All 28 wards in the Braintree Parliamentary Constituency
// 26 from Braintree District + 2 from Uttlesford District (Felsted & Stebbing, The Sampfords)
const WARD_CODES = [
  "E05010365", "E05010366", "E05010367", "E05010368", "E05010369",
  "E05010370", "E05010371", "E05010372", "E05010374", "E05010378",
  "E05010379", "E05010380", "E05010382", "E05010383", "E05010384",
  "E05010385", "E05010388", "E05010389", "E05010390", "E05012961",
  "E05012962", "E05012963", "E05012964", "E05012965", "E05012966",
  "E05012967",
  // Uttlesford District wards within Braintree constituency
  "E05009915", // Felsted & Stebbing
  "E05009931", // The Sampfords
];

// Census topics available as map overlays
// Each maps to an ONS dimension ID and population type
interface CensusTopic {
  id: string;
  label: string;
  dimension: string;
  populationType: "UR" | "HH"; // Usual Residents or Households
  // Which category to use for the choropleth (percentage of this category)
  primaryCategory: string;
  primaryLabel: string;
  allCategories?: boolean; // If true, return all categories for breakdown
}

const TOPICS: CensusTopic[] = [
  {
    id: "age-under16",
    label: "Age: Under 16",
    dimension: "resident_age_3a",
    populationType: "UR",
    primaryCategory: "1",
    primaryLabel: "Aged 15 years and under",
  },
  {
    id: "age-over65",
    label: "Age: Over 65",
    dimension: "resident_age_3a",
    populationType: "UR",
    primaryCategory: "3",
    primaryLabel: "Aged 65 years and over",
  },
  {
    id: "ethnicity",
    label: "Ethnicity: Non-White British",
    dimension: "ethnic_group_tb_20b",
    populationType: "UR",
    primaryCategory: "13", // White British — we invert to show diversity %
    primaryLabel: "Ethnic minorities (non-White British)",
    allCategories: true,
  },
  {
    id: "religion",
    label: "Religion: No Religion",
    dimension: "religion_tb",
    populationType: "UR",
    primaryCategory: "1",
    primaryLabel: "No religion",
    allCategories: true,
  },
  {
    id: "health-bad",
    label: "Health: Bad or Very Bad",
    dimension: "health_in_general",
    populationType: "UR",
    primaryCategory: "4", // Bad health
    primaryLabel: "Bad or very bad health",
  },
  {
    id: "qualifications",
    label: "Education: Level 4+ (Degree)",
    dimension: "highest_qualification",
    populationType: "UR",
    primaryCategory: "5",
    primaryLabel: "Level 4 qualifications and above",
  },
  {
    id: "tenure-owned",
    label: "Housing: Owner Occupied",
    dimension: "hh_tenure_9a",
    populationType: "HH",
    primaryCategory: "1", // Owned outright
    primaryLabel: "Owner occupied",
  },
  {
    id: "tenure-rented",
    label: "Housing: Social Rented",
    dimension: "hh_tenure_9a",
    populationType: "HH",
    primaryCategory: "5", // Social rented from council
    primaryLabel: "Social rented",
  },
  {
    id: "cars-none",
    label: "Car Ownership: No Car",
    dimension: "number_of_cars_6a",
    populationType: "HH",
    primaryCategory: "1",
    primaryLabel: "No cars or vans",
  },
  {
    id: "economic-unemployed",
    label: "Economically Inactive",
    dimension: "economic_activity_status_12a",
    populationType: "UR",
    primaryCategory: "9",
    primaryLabel: "Economically inactive",
  },
  {
    id: "deprivation",
    label: "Household Deprivation",
    dimension: "hh_deprivation",
    populationType: "HH",
    primaryCategory: "5", // Deprived in 3+ dimensions
    primaryLabel: "Deprived in 3+ dimensions",
  },
  {
    id: "country-born-uk",
    label: "Born Outside UK",
    dimension: "country_of_birth_12a",
    populationType: "UR",
    primaryCategory: "1", // UK — we invert
    primaryLabel: "Born outside UK",
  },
];

interface ONSObservation {
  dimensions: Array<{
    dimension_id: string;
    option: string;
    option_id: string;
  }>;
  observation: number;
}

interface ONSResponse {
  observations: ONSObservation[];
  total_observations: number;
}

interface WardData {
  wardCode: string;
  wardName: string;
  value: number;
  total: number;
  primaryCount: number;
  breakdown?: Record<string, number>;
}

interface CensusData {
  topic: { id: string; label: string; primaryLabel: string };
  wards: WardData[];
  summary: {
    totalPopulation: number;
    constituencyAverage: number;
    highestWard: WardData;
    lowestWard: WardData;
  };
  source: string;
}

async function generateFreshData(topic: CensusTopic): Promise<CensusData | null> {
  try {
    // Fetch data for all wards in parallel
    // ONS API supports querying one ward at a time
    const wardResults = await Promise.allSettled(
      WARD_CODES.map(async (wardCode) => {
        const url = `${ONS_API}/${topic.populationType}/census-observations?dimensions=wd,${topic.dimension}&area-type=wd,${wardCode}`;
        const res = await fetch(url, {
          next: { revalidate: 604800 }, // Cache 7 days — census data doesn't change
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return null;
        const data: ONSResponse = await res.json();
        return { wardCode, observations: data.observations };
      })
    );

    const wardData: WardData[] = [];

    for (const result of wardResults) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const { wardCode, observations } = result.value;

      let total = 0;
      let primaryCount = 0;
      const breakdown: Record<string, number> = {};
      let wardName = "";

      for (const obs of observations) {
        const wardDim = obs.dimensions.find(d => d.dimension_id === "wd");
        const valueDim = obs.dimensions.find(d => d.dimension_id === topic.dimension);
        if (wardDim) wardName = wardDim.option;
        if (!valueDim) continue;

        // Skip "Does not apply" categories
        if (valueDim.option_id === "-8") continue;

        total += obs.observation;
        breakdown[valueDim.option] = obs.observation;

        // Handle inverted topics (where we want 100% - primaryCategory%)
        if (topic.id === "ethnicity" || topic.id === "country-born-uk") {
          // For these, primaryCategory is the majority — we want the inverse
          if (valueDim.option_id !== topic.primaryCategory) {
            primaryCount += obs.observation;
          }
        } else if (topic.id === "health-bad") {
          // Combine "Bad" and "Very bad" health
          if (valueDim.option_id === "4" || valueDim.option_id === "5") {
            primaryCount += obs.observation;
          }
        } else if (topic.id === "tenure-owned") {
          // Combine "Owned outright" and "Owned with mortgage"
          if (valueDim.option_id === "1" || valueDim.option_id === "2") {
            primaryCount += obs.observation;
          }
        } else if (topic.id === "deprivation") {
          // Combine "Deprived in 3" and "Deprived in 4" dimensions
          if (valueDim.option_id === "4" || valueDim.option_id === "5") {
            primaryCount += obs.observation;
          }
        } else {
          if (valueDim.option_id === topic.primaryCategory) {
            primaryCount += obs.observation;
          }
        }
      }

      const percentage = total > 0 ? Math.round((primaryCount / total) * 1000) / 10 : 0;

      wardData.push({
        wardCode,
        wardName,
        value: percentage,
        total,
        primaryCount,
        ...(topic.allCategories ? { breakdown } : {}),
      });
    }

    // Calculate constituency-wide stats
    const totalPop = wardData.reduce((sum, w) => sum + w.total, 0);
    const totalPrimary = wardData.reduce((sum, w) => sum + w.primaryCount, 0);
    const avgPercentage = totalPop > 0 ? Math.round((totalPrimary / totalPop) * 1000) / 10 : 0;

    return {
      topic: {
        id: topic.id,
        label: topic.label,
        primaryLabel: topic.primaryLabel,
      },
      wards: wardData,
      summary: {
        totalPopulation: totalPop,
        constituencyAverage: avgPercentage,
        highestWard: wardData.reduce((max, w) => w.value > max.value ? w : max, wardData[0]),
        lowestWard: wardData.reduce((min, w) => w.value < min.value ? w : min, wardData[0]),
      },
      source: "ONS Census 2021",
    };
  } catch (err) {
    console.error("Census API error:", err);
    return null;
  }
}

async function fetchAndUpdateCache(topic: CensusTopic, cacheDocRef: DocumentReference) {
  try {
    const fresh = await generateFreshData(topic);
    if (!fresh) return;

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
    console.error("Background census cache update failed:", err);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topicId = searchParams.get("topic") || "age-under16";

  // If requesting the list of available topics
  if (topicId === "list") {
    return NextResponse.json({
      topics: TOPICS.map(t => ({
        id: t.id,
        label: t.label,
        primaryLabel: t.primaryLabel,
      })),
    });
  }

  const topic = TOPICS.find(t => t.id === topicId);
  if (!topic) {
    return NextResponse.json({ error: "Unknown topic" }, { status: 400 });
  }

  // One cache doc per topic so different choropleth selections don't overwrite each other
  const cacheDocRef = doc(db, "census_cache", `braintree-${topicId}`);

  try {
    const snap = await getDoc(cacheDocRef);
    const cached = snap.exists() ? snap.data() : null;

    if (cached) {
      const ageMs = Date.now() - new Date(cached.updated_at).getTime();
      if (ageMs > TTL_MS) {
        fetchAndUpdateCache(topic, cacheDocRef);
      }
      return NextResponse.json({ ...cached.data, source: "cache" });
    }

    const fresh = await generateFreshData(topic);
    if (!fresh) {
      return NextResponse.json(
        { error: "Failed to fetch census data" },
        { status: 500 }
      );
    }

    await setDoc(cacheDocRef, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json(fresh);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch census data" },
      { status: 500 }
    );
  }
}
