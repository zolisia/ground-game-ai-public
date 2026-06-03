export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

const ROUTES = [
  "/api/news",
  "/api/crime",
  "/api/parliament",
  "/api/electoral-calculus",
  "/api/employment",
  "/api/house-prices",
  "/api/universal-credit",
  "/api/ai-brief",
  "/api/trends-v2",
];

async function warmSlug(
  baseUrl: string,
  slug: string
): Promise<{ ok: number; failed: string[] }> {
  const urls = [
    ...ROUTES.map((r) => `${baseUrl}${r}?constituency=${slug}&force=1`),
    ...CENSUS_TOPICS.map(
      (t) => `${baseUrl}/api/census?constituency=${slug}&topic=${t}&force=1`
    ),
  ];

  const results = await Promise.allSettled(
    urls.map((url) =>
      fetch(url, { signal: AbortSignal.timeout(30_000) }).then((r) => ({
        url,
        ok: r.ok,
      }))
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

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { origin } = new URL(request.url);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? origin;
  const started = Date.now();
  const summary: Record<string, { ok: number; failed: string[] }> = {};

  for (const slug of SLUGS) {
    const result = await warmSlug(baseUrl, slug);
    if (result.failed.length) summary[slug] = result;
  }

  return Response.json({
    slugs: SLUGS.length,
    routesPerSlug: ROUTES.length + CENSUS_TOPICS.length,
    durationMs: Date.now() - started,
    failures: summary,
  });
}
