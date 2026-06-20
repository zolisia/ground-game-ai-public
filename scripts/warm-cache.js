#!/usr/bin/env node
// Cache warming script — hits every Firestore-cached API route for all 9
// selectable constituencies so Firestore is pre-populated before first user visit.
//
// Usage:
//   node scripts/warm-cache.js                        # against localhost:3000
//   node scripts/warm-cache.js https://your-app.com  # against production
//
// Skip AI brief (costs money, 30-min TTL — warm separately if needed):
//   SKIP_AI_BRIEF=1 node scripts/warm-cache.js

const BASE_URL = process.argv[2] || "http://localhost:3000";
const SKIP_AI_BRIEF = process.env.SKIP_AI_BRIEF === "1";

const SLUGS = [
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

const CENSUS_TOPICS = [
  "age-under16",
  "age-over65",
  "ethnicity",
  "religion",
  "health-bad",
  "qualifications",
  "tenure-owned",
  "tenure-rented",
  "cars-none",
  "economic-unemployed",
  "deprivation",
  "country-born-uk",
];

// Routes with Firestore cache, keyed by constituency slug
const SLUG_ROUTES = [
  "/api/crime",
  "/api/commons-library",
  "/api/universal-credit",
  "/api/house-prices",
  "/api/employment",
  "/api/health",
  "/api/cqc",
  "/api/planning",
  "/api/fixmystreet",
  "/api/floods",
  ...(SKIP_AI_BRIEF ? [] : ["/api/ai-brief"]),
];

async function hit(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    const source = res.ok ? (await res.json().catch(() => ({}))).source ?? "ok" : `HTTP ${res.status}`;
    return { url, ok: res.ok, source };
  } catch (err) {
    return { url, ok: false, source: err.message };
  }
}

async function warmSlug(slug) {
  const routes = [
    ...SLUG_ROUTES.map((r) => `${BASE_URL}${r}?constituency=${slug}`),
    ...CENSUS_TOPICS.map((t) => `${BASE_URL}/api/census?constituency=${slug}&topic=${t}`),
  ];

  const results = await Promise.all(routes.map(hit));
  const failed = results.filter((r) => !r.ok);
  const cached = results.filter((r) => r.source === "cache");

  console.log(
    `  ${slug}: ${results.length - failed.length}/${results.length} ok` +
    (cached.length ? ` (${cached.length} already cached)` : "") +
    (failed.length ? `\n    FAILED: ${failed.map((r) => r.url.replace(BASE_URL, "")).join(", ")}` : "")
  );
}

async function main() {
  console.log(`Warming cache against ${BASE_URL}`);
  console.log(`${SLUGS.length} constituencies × ${SLUG_ROUTES.length + CENSUS_TOPICS.length} routes\n`);

  // Warm one constituency at a time to avoid hammering external APIs in parallel
  for (const slug of SLUGS) {
    await warmSlug(slug);
  }

  // trends-v2 is hardcoded to Braintree, only needs one call
  const trendsResult = await hit(`${BASE_URL}/api/trends-v2`);
  console.log(`  trends-v2 (braintree only): ${trendsResult.ok ? trendsResult.source : "FAILED — " + trendsResult.source}`);

  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
