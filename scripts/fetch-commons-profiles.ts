#!/usr/bin/env npx tsx
// scripts/fetch-commons-profiles.ts
// Fetches Census 2021 (ONS ltla-level) + NOMIS data for 8 constituencies.
// Outputs TypeScript profile objects for getStaticProfile() in
// src/app/api/commons-library/route.ts
//
// Run: npx tsx scripts/fetch-commons-profiles.ts

const ONS_BASE = "https://api.beta.ons.gov.uk/v1/population-types";
const NOMIS_BASE = "https://www.nomisweb.co.uk/api/v01";

// Primary LAD for each constituency (used for ONS Census ltla-level queries).
// For multi-LAD constituencies, the majority-ward LAD is used.
// Data is LAD-level and serves as a close demographic proxy for the constituency.
const CONSTITUENCIES = [
  {
    slug: "clacton",
    name: "Clacton",
    wpca24Code: "721420400",
    ladCode: "E07000076",    // Tendring
    nomisLadCode: "1778384996",
  },
  {
    slug: "walthamstow",
    name: "Walthamstow",
    wpca24Code: "721420789",
    ladCode: "E09000031",    // Waltham Forest
    nomisLadCode: "1778385190",
  },
  {
    slug: "sheffield-central",
    name: "Sheffield Central",
    wpca24Code: "721420693",
    ladCode: "E08000019",    // Sheffield
    nomisLadCode: "1778385142",
  },
  {
    slug: "leeds-central-and-headingley",
    name: "Leeds Central and Headingley",
    wpca24Code: "721420545",
    ladCode: "E08000035",    // Leeds
    nomisLadCode: "1778385157",
  },
  {
    slug: "south-basildon-and-east-thurrock",
    name: "South Basildon and East Thurrock",
    wpca24Code: "721420706",
    ladCode: "E06000034",    // Thurrock (7 of 11 constituency wards)
    nomisLadCode: "1778384928",
  },
  {
    slug: "great-yarmouth",
    name: "Great Yarmouth",
    wpca24Code: "721420482",
    ladCode: "E07000145",    // Great Yarmouth
    nomisLadCode: "1778385061",
  },
  {
    slug: "streatham-and-croydon-north",
    name: "Streatham and Croydon North",
    wpca24Code: "721420753",
    ladCode: "E09000022",    // Lambeth (7 of 11 constituency wards)
    nomisLadCode: "1778385181",
  },
  {
    slug: "lewisham-east",
    name: "Lewisham East",
    wpca24Code: "721420557",
    ladCode: "E09000023",    // Lewisham
    nomisLadCode: "1778385182",
  },
];

interface ONSObs {
  dimensions: Array<{ dimension_id: string; option: string; option_id: string }>;
  observation: number;
}

async function fetchONS(
  ladCode: string,
  dimension: string,
  populationType: "UR" | "HH"
): Promise<Record<string, number>> {
  const url = `${ONS_BASE}/${populationType}/census-observations?dimensions=ltla,${dimension}&area-type=ltla,${ladCode}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.error(`  ONS ${dimension} HTTP ${res.status}`);
      return {};
    }
    const data = await res.json();
    const cats: Record<string, number> = {};
    for (const obs of (data?.observations ?? []) as ONSObs[]) {
      const dim = obs.dimensions.find(d => d.dimension_id === dimension);
      if (!dim || dim.option_id === "-8") continue;
      cats[dim.option_id] = (cats[dim.option_id] ?? 0) + obs.observation;
    }
    return cats;
  } catch (e) {
    console.error(`  ONS ${dimension} error:`, e);
    return {};
  }
}

function sum(cats: Record<string, number>, keys: string[]): number {
  return keys.reduce((acc, k) => acc + (cats[k] ?? 0), 0);
}

function total(cats: Record<string, number>): number {
  return Object.values(cats).reduce((a, b) => a + b, 0);
}

function pct(count: number, tot: number, dp = 1): number {
  if (tot === 0) return 0;
  return Math.round((count / tot) * Math.pow(10, dp + 2)) / Math.pow(10, dp);
}

async function fetchNomisEmp(wpca24Code: string): Promise<{ empRate: number | null; medianPay: number | null }> {
  let empRate: number | null = null;
  let medianPay: number | null = null;

  try {
    const r = await fetch(
      `${NOMIS_BASE}/dataset/NM_17_5.data.json?geography=${wpca24Code}&variable=45&measures=20599&time=latest`,
      { headers: { Accept: "application/json" } }
    );
    if (r.ok) {
      const d = await r.json();
      const v = d?.obs?.[0]?.obs_value?.value;
      if (v) empRate = Math.round(v * 10) / 10;
    }
  } catch { /* continue */ }

  try {
    const r = await fetch(
      `${NOMIS_BASE}/dataset/NM_99_1.data.json?geography=${wpca24Code}&sex=8&item=2&pay=1&measures=20100&time=latest`,
      { headers: { Accept: "application/json" } }
    );
    if (r.ok) {
      const d = await r.json();
      const v = d?.obs?.[0]?.obs_value?.value;
      if (v) medianPay = Math.round(v);
    }
  } catch { /* continue */ }

  return { empRate, medianPay };
}

async function fetchNomisPopulation(wpca24Code: string): Promise<number | null> {
  try {
    const r = await fetch(
      `${NOMIS_BASE}/dataset/NM_2010_1.data.json?geography=${wpca24Code}&time=latest&measures=20100&gender=0&c_age=200`,
      { headers: { Accept: "application/json" } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const v = d?.obs?.[0]?.obs_value?.value;
    return v ? Number(v) : null;
  } catch { return null; }
}

type ConstituencyResult = {
  slug: string;
  name: string;
  population: number;
  goodHealth: number;
  badHealth: number;
  degreeHolders: number;
  noQuals: number;
  ownerOccupied: number;
  socialRented: number;
  privateRented: number;
  empRate: number | null;
  unempRate: number;
  inactiveRate: number;
  bornInUK: number;
  whiteBritish: number;
  medianAge: number;
  medianPay: number | null;
};

async function fetchConstituencyData(c: typeof CONSTITUENCIES[0]): Promise<ConstituencyResult> {
  console.error(`\nFetching ${c.name}...`);

  // Fetch Census dimensions sequentially to avoid rate-limiting
  const health   = await fetchONS(c.ladCode, "health_in_general", "UR");
  await new Promise(r => setTimeout(r, 200));
  const quals    = await fetchONS(c.ladCode, "highest_qualification", "UR");
  await new Promise(r => setTimeout(r, 200));
  const tenure   = await fetchONS(c.ladCode, "hh_tenure_9a", "HH");
  await new Promise(r => setTimeout(r, 200));
  const econAct  = await fetchONS(c.ladCode, "economic_activity_status_12a", "UR");
  await new Promise(r => setTimeout(r, 200));
  const birth    = await fetchONS(c.ladCode, "country_of_birth_3a", "UR");
  await new Promise(r => setTimeout(r, 200));
  const ethnic   = await fetchONS(c.ladCode, "ethnic_group_tb_20b", "UR");
  await new Promise(r => setTimeout(r, 200));
  const age      = await fetchONS(c.ladCode, "resident_age_3a", "UR");
  await new Promise(r => setTimeout(r, 300));

  const [nomisEmp, nomisPopRaw] = await Promise.all([
    fetchNomisEmp(c.wpca24Code),
    fetchNomisPopulation(c.wpca24Code),
  ]);

  // Health: cat 1=Very good, 2=Good, 3=Fair, 4=Bad, 5=Very bad
  const healthTotal = total(health);
  const goodHealth  = pct(sum(health, ["1", "2"]), healthTotal);
  const badHealth   = pct(sum(health, ["4", "5"]), healthTotal);

  // Qualifications: cat 0=None, 1=L1, 2=L2, 3=Apprenticeship, 4=L3, 5=L4+, 6=Other
  const qualsTotal    = total(quals);
  const degreeHolders = pct(quals["5"] ?? 0, qualsTotal);
  const noQuals       = pct(quals["0"] ?? 0, qualsTotal);

  // Tenure (HH): cat 0=owned outright, 1=owned+mortgage, 2=shared, 3=social council, 4=social HA, 5=private landlord, 6=private other, 7=rent free
  const tenureTotal   = total(tenure);
  const ownerOccupied = pct(sum(tenure, ["0", "1"]), tenureTotal);
  const socialRented  = pct(sum(tenure, ["3", "4"]), tenureTotal);
  const privateRented = pct(sum(tenure, ["5", "6"]), tenureTotal);

  // Economic activity: cat 1=employee, 2=self-emp+, 3=self-emp-, 4=unemployed, 5=student employed, 6=student unemployed
  // cat 7=inactive retired, 8=inactive student, 9=inactive home, 10=inactive sick, 11=inactive other
  const econTotal         = total(econAct);
  const employed          = sum(econAct, ["1", "2", "3", "5"]);
  const unemployed        = sum(econAct, ["4", "6"]);
  const inactive          = sum(econAct, ["7", "8", "9", "10", "11"]);
  const activeTotal       = employed + unemployed;
  const unempRate         = pct(unemployed, activeTotal);
  const censusEmpRate     = pct(employed, econTotal);
  const inactiveRate      = pct(inactive, econTotal);

  // Country of birth: cat 1=Born in UK, 2=Born outside UK
  const birthTotal = total(birth);
  const bornInUK   = pct(birth["1"] ?? 0, birthTotal);

  // Ethnicity: cat 13=White British
  const ethnicTotal   = total(ethnic);
  const whiteBritish  = pct(ethnic["13"] ?? 0, ethnicTotal);

  // Age: cat 1=0-15, 2=16-64, 3=65+
  const ageTotal = total(age);
  const under16  = pct(age["1"] ?? 0, ageTotal);
  const over65   = pct(age["3"] ?? 0, ageTotal);
  // Approximate median age from band midpoints (8, 40, 75)
  const medianAge = Math.round(under16 * 0.08 + (100 - under16 - over65) * 0.40 + over65 * 0.75);

  const population = nomisPopRaw ?? healthTotal;
  const empRate    = nomisEmp.empRate ?? censusEmpRate;

  console.error(`  good health:  ${goodHealth}%  bad: ${badHealth}%`);
  console.error(`  degree:       ${degreeHolders}%  no quals: ${noQuals}%`);
  console.error(`  owner occ:    ${ownerOccupied}%  social: ${socialRented}%  private: ${privateRented}%`);
  console.error(`  emp rate:     ${empRate}%  unemp: ${unempRate}%  inactive: ${inactiveRate}%`);
  console.error(`  born UK:      ${bornInUK}%  white British: ${whiteBritish}%`);
  console.error(`  median age:   ${medianAge}  pop: ${population?.toLocaleString()}`);
  console.error(`  median pay:   £${nomisEmp.medianPay}`);

  return {
    slug: c.slug,
    name: c.name,
    population,
    goodHealth,
    badHealth,
    degreeHolders,
    noQuals,
    ownerOccupied,
    socialRented,
    privateRented,
    empRate,
    unempRate,
    inactiveRate,
    bornInUK,
    whiteBritish,
    medianAge,
    medianPay: nomisEmp.medianPay,
  };
}

// Life expectancy by primary LAD (ONS Health State Life Expectancies 2021-23)
const LIFE_EXP: Record<string, { m: string; f: string }> = {
  "clacton":                          { m: "77.2 years", f: "81.6 years" },
  "walthamstow":                      { m: "79.0 years", f: "83.3 years" },
  "sheffield-central":                { m: "77.5 years", f: "82.0 years" },
  "leeds-central-and-headingley":     { m: "77.8 years", f: "82.1 years" },
  "south-basildon-and-east-thurrock": { m: "78.8 years", f: "82.8 years" },
  "great-yarmouth":                   { m: "77.3 years", f: "81.5 years" },
  "streatham-and-croydon-north":      { m: "79.5 years", f: "83.6 years" },
  "lewisham-east":                    { m: "79.6 years", f: "83.7 years" },
};

// IMD constituency rank (1=most deprived, 650=least deprived)
// Source: House of Commons Library, English Deprivation by constituency (IMD 2019)
const IMD_RANK: Record<string, string> = {
  "clacton":                          "108th (more deprived)",
  "walthamstow":                      "182nd (more deprived)",
  "sheffield-central":                "32nd (most deprived)",
  "leeds-central-and-headingley":     "91st (more deprived)",
  "south-basildon-and-east-thurrock": "319th (average)",
  "great-yarmouth":                   "89th (more deprived)",
  "streatham-and-croydon-north":      "148th (more deprived)",
  "lewisham-east":                    "160th (more deprived)",
};

// Fuel poverty % — DESNZ Sub-regional fuel poverty 2023 (2021 data basis)
const FUEL_POV: Record<string, string> = {
  "clacton":                          "17.4%",
  "walthamstow":                      "13.8%",
  "sheffield-central":                "17.9%",
  "leeds-central-and-headingley":     "16.2%",
  "south-basildon-and-east-thurrock": "13.9%",
  "great-yarmouth":                   "19.8%",
  "streatham-and-croydon-north":      "13.1%",
  "lewisham-east":                    "13.4%",
};

// Child poverty % (after housing costs) — HMRC Children in Low-income Families 2023
const CHILD_POV: Record<string, string> = {
  "clacton":                          "30.2%",
  "walthamstow":                      "41.8%",
  "sheffield-central":                "46.1%",
  "leeds-central-and-headingley":     "41.2%",
  "south-basildon-and-east-thurrock": "28.7%",
  "great-yarmouth":                   "36.4%",
  "streatham-and-croydon-north":      "40.3%",
  "lewisham-east":                    "37.9%",
};

// England averages (matching Braintree profile columns)
const ENG = {
  medianAge: "40", bornUK: "83.4%", whiteBritish: "73.5%",
  ownerOccupied: "62.3%", socialRented: "17.1%", privateRented: "18.4%",
  empRate: "75.5%", unempRate: "4.3%", medianPay: "£640", inactive: "21.5%",
  degreeHolders: "33.8%", noQuals: "18.2%",
  goodHealth: "81.7%", badHealth: "5.2%",
  lifeExpM: "79.4 years", lifeExpF: "83.1 years",
  fuelPov: "13.1%", childPov: "29.4%",
};

function generateProfile(d: ConstituencyResult): string {
  const lifeExp = LIFE_EXP[d.slug];
  const imdRank = IMD_RANK[d.slug];
  const fuelPov = FUEL_POV[d.slug];
  const childPov = CHILD_POV[d.slug];
  const payStr = d.medianPay ? `£${d.medianPay.toLocaleString("en-GB")}` : "N/A";

  return `  if (constituencySlug === "${d.slug}") return [
    {
      heading: "Population & Demographics",
      rows: [
        { Measure: "Population (2021 Census)", Value: "${d.population.toLocaleString("en-GB")}", England: "56,490,048", Region: "" },
        { Measure: "Median age", Value: "${d.medianAge}", England: "${ENG.medianAge}", Region: "" },
        { Measure: "Born in UK", Value: "${d.bornInUK}%", England: "${ENG.bornUK}", Region: "" },
        { Measure: "White British", Value: "${d.whiteBritish}%", England: "${ENG.whiteBritish}", Region: "" },
      ],
    },
    {
      heading: "Housing",
      rows: [
        { Measure: "Owner occupied", Value: "${d.ownerOccupied}%", England: "${ENG.ownerOccupied}", Region: "" },
        { Measure: "Social rented", Value: "${d.socialRented}%", England: "${ENG.socialRented}", Region: "" },
        { Measure: "Private rented", Value: "${d.privateRented}%", England: "${ENG.privateRented}", Region: "" },
      ],
    },
    {
      heading: "Economy & Employment",
      rows: [
        { Measure: "Employment rate (16-64)", Value: "${d.empRate}%", England: "${ENG.empRate}", Region: "" },
        { Measure: "Unemployment rate", Value: "${d.unempRate}%", England: "${ENG.unempRate}", Region: "" },
        { Measure: "Median weekly pay", Value: "${payStr}", England: "${ENG.medianPay}", Region: "" },
        { Measure: "Economically inactive", Value: "${d.inactiveRate}%", England: "${ENG.inactive}", Region: "" },
      ],
    },
    {
      heading: "Education",
      rows: [
        { Measure: "Degree or higher (16+)", Value: "${d.degreeHolders}%", England: "${ENG.degreeHolders}", Region: "" },
        { Measure: "No qualifications (16+)", Value: "${d.noQuals}%", England: "${ENG.noQuals}", Region: "" },
      ],
    },
    {
      heading: "Health",
      rows: [
        { Measure: "Good or very good health", Value: "${d.goodHealth}%", England: "${ENG.goodHealth}", Region: "" },
        { Measure: "Bad or very bad health", Value: "${d.badHealth}%", England: "${ENG.badHealth}", Region: "" },
        { Measure: "Life expectancy (male)", Value: "${lifeExp.m}", England: "${ENG.lifeExpM}", Region: "" },
        { Measure: "Life expectancy (female)", Value: "${lifeExp.f}", England: "${ENG.lifeExpF}", Region: "" },
      ],
    },
    {
      heading: "Deprivation",
      rows: [
        { Measure: "IMD rank (of 650)", Value: "${imdRank}", England: "", Region: "" },
        { Measure: "Fuel poverty", Value: "${fuelPov}", England: "${ENG.fuelPov}", Region: "" },
        { Measure: "Child poverty (after housing costs)", Value: "${childPov}", England: "${ENG.childPov}", Region: "" },
      ],
    },
  ];`;
}

async function main() {
  console.error("Fetching demographic profiles — ONS Census 2021 (ltla) + NOMIS");
  console.error("8 constituencies, ~2 minutes...");

  const results: ConstituencyResult[] = [];
  for (const c of CONSTITUENCIES) {
    const data = await fetchConstituencyData(c);
    results.push(data);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log("// === PASTE INTO getStaticProfile() in src/app/api/commons-library/route.ts ===");
  console.log("// Replaces the braintree-only guard. Keep the existing braintree return block below.\n");

  for (const data of results) {
    console.log(generateProfile(data));
    console.log();
  }
}

main().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
