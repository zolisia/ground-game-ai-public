#!/usr/bin/env npx tsx
/**
 * Fetches postcode districts and Census 2021 population for the 9 active constituencies.
 * Run: npx tsx scripts/fetch-constituency-data.ts
 *
 * Sources:
 *   - Postcodes: postcodes.io reverse-geocode + bbox grid sampling
 *   - Population: ONS Census 2021 Beta API, ward-level totals summed per constituency
 *
 * Output: TypeScript snippets to paste into:
 *   - src/data/constituency-areas.ts  (postcodes field on each ConstituencyAreas entry)
 *   - src/data/constituencies.ts      (population field on each Constituency entry)
 */

import { CONSTITUENCY_GEO } from "../src/data/constituency-geo";
import { CONSTITUENCY_AREAS } from "../src/data/constituency-areas";
import { CONSTITUENCIES } from "../src/data/constituencies";

const ACTIVE_SLUGS = [
  "braintree",
  "clacton",
  "walthamstow",
  "sheffield-central",
  "leeds-central-and-headingley",
  "south-basildon-and-east-thurrock",
  "great-yarmouth",
  "streatham-and-croydon-north",
  "lewisham-east",
];

const ONS_API = "https://api.beta.ons.gov.uk/v1/population-types";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Population via ONS Census 2021 ward sums ---

async function fetchWardPopulation(wardCode: string): Promise<number> {
  try {
    const url = `${ONS_API}/UR/census-observations?dimensions=wd,resident_age_3a&area-type=wd,${wardCode}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const observations: Array<{ observation: number }> = data.observations ?? [];
    return observations.reduce((sum, o) => sum + (o.observation ?? 0), 0);
  } catch {
    return 0;
  }
}

async function fetchConstituencyPopulation(onsCode: string): Promise<number | null> {
  const areas = CONSTITUENCY_AREAS[onsCode];
  if (!areas?.wards?.length) return null;

  const wardCodes = areas.wards.map((w) => w.code);
  process.stderr.write(`    Fetching population from ${wardCodes.length} wards...\n`);

  const results: number[] = [];
  // Batch in groups of 5 to avoid hammering the API
  for (let i = 0; i < wardCodes.length; i += 5) {
    const batch = wardCodes.slice(i, i + 5);
    const pops = await Promise.all(batch.map(fetchWardPopulation));
    results.push(...pops);
    if (i + 5 < wardCodes.length) await sleep(200);
  }

  const total = results.reduce((a, b) => a + b, 0);
  return total > 0 ? total : null;
}

// --- Postcode districts via postcodes.io bbox grid sampling ---

async function fetchPostcodeDistricts(
  onsCode: string,
  constituencyName: string
): Promise<string[]> {
  const geo = CONSTITUENCY_GEO[onsCode];
  if (!geo) return [];

  const [minLng, minLat, maxLng, maxLat] = geo.bbox;
  const districts = new Set<string>();

  // Build grid of sample points (every ~0.025 degrees ≈ 1.7km)
  const step = 0.025;
  const points: { lat: number; lon: number }[] = [];

  for (let la = minLat; la <= maxLat + step; la += step) {
    for (let lo = minLng; lo <= maxLng + step; lo += step) {
      points.push({ lat: Math.min(la, maxLat), lon: Math.min(lo, maxLng) });
    }
  }
  // Always include the centroid
  points.push({ lat: geo.lat, lon: geo.lng });

  process.stderr.write(`    Sampling ${points.length} grid points...\n`);

  for (let i = 0; i < points.length; i++) {
    const { lat, lon } = points[i];
    try {
      const url = `https://api.postcodes.io/postcodes?lat=${lat}&lon=${lon}&limit=10&radius=1500`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data.result) continue;

      for (const pc of data.result) {
        if (pc.parliamentary_constituency === constituencyName) {
          districts.add(pc.outcode as string);
        }
      }
    } catch {
      // Ignore individual failures
    }
    // Throttle: 1 request per 80ms (≈12 rps, well within postcodes.io limits)
    if (i % 10 === 9) await sleep(80);
  }

  return [...districts].sort();
}

// --- Main ---

async function main() {
  const active = ACTIVE_SLUGS.map((slug) => {
    const c = CONSTITUENCIES.find((x) => x.slug === slug)!;
    return c;
  });

  const results: Array<{
    slug: string;
    onsCode: string;
    name: string;
    postcodes: string[];
    population: number | null;
  }> = [];

  for (const c of active) {
    process.stderr.write(`\nProcessing ${c.slug} (${c.onsCode})...\n`);

    const [postcodes, population] = await Promise.all([
      fetchPostcodeDistricts(c.onsCode, c.name),
      fetchConstituencyPopulation(c.onsCode),
    ]);

    process.stderr.write(`  postcodes: [${postcodes.join(", ")}]\n`);
    process.stderr.write(`  population: ${population ?? "null"}\n`);

    results.push({ slug: c.slug, onsCode: c.onsCode, name: c.name, postcodes, population });
  }

  // --- Output TypeScript patches ---

  console.log("// ============================================================");
  console.log("// AUTO-GENERATED by scripts/fetch-constituency-data.ts");
  console.log("// Paste postcode arrays into CONSTITUENCY_AREAS entries in");
  console.log("// src/data/constituency-areas.ts");
  console.log("// Paste population values into Constituency entries in");
  console.log("// src/data/constituencies.ts");
  console.log("// ============================================================\n");

  console.log("// --- Postcode districts per constituency ---");
  for (const r of results) {
    console.log(`// ${r.slug} (${r.onsCode})`);
    if (r.postcodes.length > 0) {
      console.log(`// Add to CONSTITUENCY_AREAS["${r.onsCode}"]: postcodes: ${JSON.stringify(r.postcodes)},`);
    } else {
      console.log(`// WARNING: no postcode districts found for ${r.slug}`);
    }
  }

  console.log("\n// --- Population per constituency ---");
  for (const r of results) {
    if (r.population != null) {
      console.log(`// ${r.slug}: population: ${r.population},  // Census 2021`);
    } else {
      console.log(`// ${r.slug}: population not retrieved (no wards in data layer?)`);
    }
  }

  // Machine-readable JSON for programmatic patching
  console.log("\n// --- JSON (for scripted patching) ---");
  console.log(`// ${JSON.stringify(results.map(({ slug, onsCode, postcodes, population }) => ({ slug, onsCode, postcodes, population })))}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
