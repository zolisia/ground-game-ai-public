export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — Vercel Pro limit

// Refreshes all Firestore-cached routes for all constituencies on a schedule.
// Vercel calls this endpoint automatically and injects:
//   Authorization: Bearer <CRON_SECRET>
// Add CRON_SECRET to your Vercel environment variables.
//
// Schedule is set in vercel.json:
//   - Full refresh: every 2 hours
//   - Floods only:  every 30 minutes (live emergency data)
//
// Each route is called with ?force=1 which bypasses the cached read
// and always fetches fresh data from external APIs.

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

// Routes refreshed every 2 hours (full run)
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

// Routes refreshed every 30 minutes (live data only)
const LIVE_ROUTES = ["/api/floods"];

async function warmSlug(baseUrl: string, slug: string, routes: string[]): Promise<{ ok: number; failed: string[] }> {
  const urls = [
    ...routes.map((r) => `${baseUrl}${r}?constituency=${slug}&force=1`),
  ];

  const results = await Promise.allSettled(
    urls.map((url) =>
      fetch(url, { signal: AbortSignal.timeout(30_000) }).then((r) => ({ url, ok: r.ok }))
    )
  );

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

async function warmCensus(baseUrl: string): Promise<{ ok: number; failed: string[] }> {
  const urls = SLUGS.flatMap((slug) =>
    CENSUS_TOPICS.map((t) => `${baseUrl}/api/census?constituency=${slug}&topic=${t}&force=1`)
  );

  // Census hits NOMIS — batch in groups of 9 (one per constituency per topic at a time)
  // rather than firing all 108 at once.
  const failed: string[] = [];
  let ok = 0;
  for (let i = 0; i < urls.length; i += 9) {
    const batch = urls.slice(i, i + 9);
    const results = await Promise.allSettled(
      batch.map((url) =>
        fetch(url, { signal: AbortSignal.timeout(30_000) }).then((r) => ({ url, ok: r.ok }))
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.ok) {
        ok++;
      } else {
        const url = r.status === "fulfilled" ? r.value.url : "unknown";
        failed.push(url.replace(baseUrl, ""));
      }
    }
  }
  return { ok, failed };
}

export async function GET(request: Request) {
  // Verify Vercel cron secret
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams, origin } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "full"; // "full" | "live"
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? origin;

  const started = Date.now();
  const summary: Record<string, { ok: number; failed: string[] }> = {};

  if (scope === "live") {
    // 30-min cron: only live routes (floods)
    for (const slug of SLUGS) {
      const result = await warmSlug(baseUrl, slug, LIVE_ROUTES);
      if (result.failed.length) summary[slug] = result;
    }
  } else {
    // 2-hour cron: all standard routes + census
    for (const slug of SLUGS) {
      const result = await warmSlug(baseUrl, slug, [...STANDARD_ROUTES, ...LIVE_ROUTES]);
      if (result.failed.length) summary[slug] = result;
    }
    for (const slug of SLUGS) {
      await fetch(`${baseUrl}/api/trends-v2?constituency=${slug}&force=1`, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
    }

    const censusResult = await warmCensus(baseUrl);
    if (censusResult.failed.length) summary["census"] = censusResult;
  }

  return Response.json({
    scope,
    slugs: SLUGS.length,
    durationMs: Date.now() - started,
    failures: summary,
  });
}
