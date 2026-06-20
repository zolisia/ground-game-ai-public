export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — Vercel Pro limit

// Cache warming cron endpoint. Vercel calls this on the schedules in vercel.json
// and injects:  Authorization: Bearer <CRON_SECRET>
// Add CRON_SECRET to your Vercel environment variables.
//
// Three scopes (set in vercel.json):
//
//   scope=live   every 30 min  — flood alerts only for priority 9 constituencies
//   scope=full   every 2 hours — all routes for priority 9 constituencies
//   scope=deep   daily at 4am  — key routes for ALL 650 constituencies in parallel
//                                batches so the cache is fully warm before the
//                                business day. Skips routes that are expensive or
//                                blocked (ai-brief, cqc).

import { CONSTITUENCIES } from "@/data/constituencies";

// Priority constituencies — always fully warmed every 2 hours
const PRIORITY_SLUGS = [
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

// All 650 constituencies — used for the 4am deep run
const ALL_SLUGS = CONSTITUENCIES.map((c) => c.slug);

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

// Full route set — used for priority constituencies every 2 hours
const STANDARD_ROUTES = [
  "/api/crime",
  "/api/commons-library",
  "/api/universal-credit",
  "/api/house-prices",
  "/api/employment",
  "/api/health",
  "/api/cqc",
  "/api/planning",
  "/api/fixmystreet",
  "/api/ai-brief",
  "/api/electoral-calculus",
];

// Routes warmed every 30 minutes (live data only)
const LIVE_ROUTES = ["/api/floods"];

// Routes warmed in the 4am deep run for all 650 constituencies.
// Excludes: ai-brief (costs money), cqc (API returns 403).
// Census is handled separately to avoid 12×650=7800 simultaneous calls.
const DEEP_ROUTES = [
  "/api/crime",
  "/api/commons-library",
  "/api/house-prices",
  "/api/employment",
  "/api/planning",
  "/api/floods",
  "/api/electoral-calculus",
];

async function hitUrl(url: string): Promise<{ ok: boolean; url: string }> {
  try {
    // 55s gives slow routes (health CSV, EC scraper) time to complete.
    const res = await fetch(url, { signal: AbortSignal.timeout(55_000) });
    return { ok: res.ok, url };
  } catch {
    return { ok: false, url };
  }
}

// Warm a single slug — all provided routes in parallel.
// force=true: bypass Firestore cache and re-fetch from source (used for
//   live/full scopes where data must be fresh).
// force=false: let each route honour its own TTL (used for the 4am deep scope
//   so cache hits return in <1s and only genuinely stale data is re-fetched).
async function warmSlug(
  baseUrl: string,
  slug: string,
  routes: string[],
  force = true
): Promise<{ ok: number; failed: string[] }> {
  const suffix = force ? "&force=1" : "";
  const urls = routes.map((r) => `${baseUrl}${r}?constituency=${slug}${suffix}`);
  const results = await Promise.allSettled(urls.map(hitUrl));

  const failed: string[] = [];
  let ok = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) {
      ok++;
    } else {
      const url = r.status === "fulfilled" ? r.value.url : "unknown";
      failed.push(url.replace(baseUrl, ""));
    }
  }
  return { ok, failed };
}

// Warm a batch of slugs in parallel (used by deep scope)
async function warmBatch(
  baseUrl: string,
  slugs: string[],
  routes: string[],
  force = true
): Promise<{ ok: number; failed: number }> {
  const results = await Promise.allSettled(
    slugs.map((slug) => warmSlug(baseUrl, slug, routes, force))
  );
  let ok = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      ok += r.value.ok;
      failed += r.value.failed.length;
    } else {
      failed++;
    }
  }
  return { ok, failed };
}

// Census warming — batched to avoid hammering NOMIS
async function warmCensus(
  baseUrl: string,
  slugs: string[]
): Promise<{ ok: number; failed: number }> {
  const urls = slugs.flatMap((slug) =>
    CENSUS_TOPICS.map(
      (t) => `${baseUrl}/api/census?constituency=${slug}&topic=${t}&force=1`
    )
  );

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < urls.length; i += 9) {
    const batch = urls.slice(i, i + 9);
    const results = await Promise.allSettled(batch.map(hitUrl));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.ok) ok++;
      else failed++;
    }
  }
  return { ok, failed };
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams, origin } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "full";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? origin;

  const started = Date.now();
  let totalOk = 0;
  let totalFailed = 0;

  if (scope === "live") {
    // Every 30 min: flood alerts only for priority constituencies
    for (const slug of PRIORITY_SLUGS) {
      const r = await warmSlug(baseUrl, slug, LIVE_ROUTES);
      totalOk += r.ok;
      totalFailed += r.failed.length;
    }
  } else if (scope === "full") {
    // Every 2 hours: all routes for priority 9 constituencies + census
    for (const slug of PRIORITY_SLUGS) {
      const r = await warmSlug(baseUrl, slug, [...STANDARD_ROUTES, ...LIVE_ROUTES]);
      totalOk += r.ok;
      totalFailed += r.failed.length;
    }
    await fetch(`${baseUrl}/api/trends-v2?force=1`, {
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);

    const census = await warmCensus(baseUrl, PRIORITY_SLUGS);
    totalOk += census.ok;
    totalFailed += census.failed;
  } else if (scope === "deep") {
    // 4am daily: key routes for ALL 650 constituencies in parallel batches of 30.
    // No force flag — routes honour their own TTL so cache hits return in <1s.
    // This keeps the total run time well within the 300s Vercel limit.
    // Only genuinely stale or missing cache entries trigger external API calls.
    const BATCH_SIZE = 30;
    for (let i = 0; i < ALL_SLUGS.length; i += BATCH_SIZE) {
      const batch = ALL_SLUGS.slice(i, i + BATCH_SIZE);
      const r = await warmBatch(baseUrl, batch, DEEP_ROUTES, false);
      totalOk += r.ok;
      totalFailed += r.failed;
    }

    // Health is warmed separately — no force flag so the 30-day Firestore TTL
    // is respected. Cache hits return in <1s; cold fetches download a ~233k-line
    // CSV from Fingertips (~30-45s), so we use a 55s timeout and smaller batches
    // to avoid hammering the endpoint. In steady state (post-first-run) this
    // entire block completes in a few seconds.
    const HEALTH_BATCH_SIZE = 15;
    for (let i = 0; i < ALL_SLUGS.length; i += HEALTH_BATCH_SIZE) {
      const batch = ALL_SLUGS.slice(i, i + HEALTH_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((slug) =>
          fetch(`${baseUrl}/api/health?constituency=${slug}`, {
            signal: AbortSignal.timeout(55_000),
          })
            .then((r) => r.ok)
            .catch(() => false)
        )
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) totalOk++;
        else totalFailed++;
      }
    }
  }

  return Response.json({
    scope,
    slugs: scope === "deep" ? ALL_SLUGS.length : PRIORITY_SLUGS.length,
    totalOk,
    totalFailed,
    durationMs: Date.now() - started,
  });
}
