import { NextResponse } from "next/server";
import type { DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";

// HM Land Registry — Open Government Licence, no auth required
// UK House Price Index: https://landregistry.data.gov.uk/
// Price Paid Data: https://landregistry.data.gov.uk/data/ppi
//
// Geography: queries are keyed on the LAD name (UKHPI region uses mixed case
// like "Braintree"; PPI district uses upper case like "BRAINTREE"). Land
// Registry district names mostly match ONS LAD names but not always — some
// constituencies will return empty results until verified per-LAD.

const TTL_MS = 24 * 60 * 60 * 1000;

interface UKHPIItem {
  period: string;
  averagePrice: number;
  annualChange?: number;
  salesVolume?: number;
  percentageChange?: number;
  housePriceIndex?: number;
}

interface TransactionRecord {
  transactionDate: string;
  pricePaid: number;
  propertyAddress: {
    paon?: string;
    saon?: string;
    street?: string;
    town?: string;
    district?: string;
    county?: string;
    postcode?: string;
  };
  propertyType?: string;
  estateType?: string;
  newBuild?: boolean;
  transactionCategory?: string;
}

interface HousePricesData {
  index: { items: UKHPIItem[] };
  recentSales: Record<string, unknown>[];
  source: string;
  sourceUrl: string;
}

// false = region has no UKHPI data (clean 400); null = network/unexpected error (500)
async function generateFreshData(
  ladName: string
): Promise<HousePricesData | null | false> {
  try {
    const slug = ladName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const ppiDistrict = encodeURIComponent(ladName.toUpperCase());

    // Step 1: Fetch region URI list and PPI recent sales in parallel
    const [regionRes, salesRes] = await Promise.allSettled([
      fetch(
        `https://landregistry.data.gov.uk/data/ukhpi/region/${slug}.json?_pageSize=36`,
        { next: { revalidate: 86400 } }
      ),
      fetch(
        `https://landregistry.data.gov.uk/data/ppi/transaction-record.json?propertyAddress.district=${ppiDistrict}&_pageSize=20&_sort=-transactionDate`,
        { next: { revalidate: 86400 } }
      ),
    ]);

    // Step 2: Parse region URI list (newest-first array of month URIs)
    let monthUris: string[] = [];
    if (regionRes.status === "fulfilled" && regionRes.value.ok) {
      const regionData = await regionRes.value.json();
      monthUris = regionData?.result?.items ?? [];
    }

    // No months means this LAD slug has no UKHPI coverage
    if (monthUris.length === 0) {
      return false;
    }

    // Step 3: Fetch monthly price records in batches to avoid rate limiting
    // Land Registry throttles ~36 simultaneous requests; batches of 12 with
    // 150ms gaps give full coverage without significant latency overhead.
    const BATCH_SIZE = 12;
    const indexItems: UKHPIItem[] = [];

    for (let i = 0; i < monthUris.length; i += BATCH_SIZE) {
      if (i > 0) await new Promise((r) => setTimeout(r, 150));

      const batch = monthUris.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map((uri) => {
          const url = uri.replace(/^http:/, "https:") + ".json";
          return fetch(url, { next: { revalidate: 86400 } }).then((r) => {
            if (!r.ok) throw new Error(`${r.status}`);
            return r.json();
          });
        })
      );

      for (const result of batchResults) {
        if (result.status !== "fulfilled") continue;
        const topic = result.value?.result?.primaryTopic;
        if (!topic?.averagePrice) continue;

        // Extract period from _about URI: .../month/2026-03 -> 2026-03
        const about = (topic._about as string) ?? "";
        const period = about.split("/month/")[1] ?? "";
        if (!period) continue;

        indexItems.push({
          period,
          averagePrice: Number(topic.averagePrice),
          annualChange:
            topic.percentageAnnualChange != null
              ? Number(topic.percentageAnnualChange)
              : undefined,
          salesVolume:
            topic.salesVolume != null ? Number(topic.salesVolume) : undefined,
        });
      }
    }

    // Sort oldest to newest for chart rendering
    indexItems.sort((a, b) => a.period.localeCompare(b.period));

    // Step 4: Recent sales from PPI
    let recentSales: Record<string, unknown>[] = [];
    if (salesRes.status === "fulfilled" && salesRes.value.ok) {
      const salesData = await salesRes.value.json();
      const rawItems: TransactionRecord[] = salesData?.result?.items ?? [];
      recentSales = rawItems.map((t) => {
        let typeLabel: string | null = null;
        const pt = t.propertyType as unknown;
        if (typeof pt === "string") {
          typeLabel = pt;
        } else if (pt && typeof pt === "object") {
          const obj = pt as Record<string, unknown>;
          if (Array.isArray(obj.prefLabel) && obj.prefLabel[0]) {
            typeLabel = String(
              (obj.prefLabel[0] as Record<string, string>)._value ?? ""
            );
          } else if (obj._about) {
            typeLabel = String(obj._about).split("/").pop() ?? null;
          }
        }
        return {
          date: t.transactionDate,
          price: t.pricePaid,
          address: [
            t.propertyAddress?.paon,
            t.propertyAddress?.street,
            t.propertyAddress?.town,
          ]
            .filter(Boolean)
            .join(", "),
          postcode: t.propertyAddress?.postcode ?? null,
          type: typeLabel,
          newBuild: t.newBuild ?? false,
        };
      });
    }

    return {
      index: { items: indexItems },
      recentSales,
      source: "live",
      sourceUrl: "https://landregistry.data.gov.uk/",
    };
  } catch (err) {
    console.error("House prices data fetch failed:", err);
    return null;
  }
}

async function fetchAndUpdateCache(
  ladName: string,
  cacheDocRef: DocumentReference
) {
  try {
    const fresh = await generateFreshData(ladName);
    if (!fresh) return; // handles null (error) and false (not found)

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
    console.error("Background house prices cache update failed:", err);
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

  // Try data-layer LAD name (first LAD for multi-LAD constituencies), else
  // Braintree-only fallback. Land Registry district names mostly match ONS
  // LAD names but not always — some constituencies may return empty results
  // until verified per-LAD.
  const ladName =
    constituencyData.areas?.lads?.[0]?.name ??
    (constituencySlug === "braintree" ? "Braintree" : null);

  if (!ladName) {
    return Response.json(
      {
        error: "House prices data not available",
        message: "LAD name not yet sourced for this constituency",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }

  const cacheDocRef = adminDb.collection("house_prices_cache").doc(constituencySlug);

  type CacheDoc = { data: Record<string, unknown>; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await cacheDocRef.get();
    if (snap.exists) {
      cached = snap.data() as CacheDoc;
    }
  } catch (err) {
    console.warn("House prices cache read failed (continuing without cache):", err);
  }

  if (cached && !force) {
    const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
    if (cacheAge > TTL_MS) {
      fetchAndUpdateCache(ladName, cacheDocRef)
        .catch(err => console.warn("House prices background refresh failed:", err));
    }
    return NextResponse.json({ ...cached.data, source: "cache", _cachedAt: new Date(cached.updated_at).getTime() });
  }

  const fresh = await generateFreshData(ladName);
  if (fresh === false) {
    return Response.json(
      {
        error: "House price data not available for this area",
        message: "No UKHPI data found for this local authority",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }
  if (!fresh) {
    return NextResponse.json(
      { index: { items: [] }, recentSales: [], error: "Failed to fetch house price data" },
      { status: 500 }
    );
  }

  const cachedAt = Date.now();
  try {
    await cacheDocRef.set({
      data: fresh,
      updated_at: new Date(cachedAt).toISOString(),
    });
  } catch (err) {
    console.warn("House prices cache write failed (returning fresh anyway):", err);
  }

  return NextResponse.json({ ...fresh, _cachedAt: cachedAt });
}
