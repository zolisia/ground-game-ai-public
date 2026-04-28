import { NextResponse } from "next/server";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const dynamic = "force-dynamic";

// HM Land Registry — Open Government Licence, no auth required
// UK House Price Index: https://landregistry.data.gov.uk/
// Price Paid Data: https://landregistry.data.gov.uk/data/ppi

const TTL_MS = 24 * 60 * 60 * 1000;
const cacheDoc = doc(db, "house_prices_cache", "braintree");

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

async function generateFreshData(): Promise<HousePricesData | null> {
  try {
    const [indexRes, salesRes] = await Promise.allSettled([
      fetch(
        "https://landregistry.data.gov.uk/data/ukhpi/region.json?name=Braintree&_pageSize=50",
        { next: { revalidate: 86400 } }
      ),
      fetch(
        "https://landregistry.data.gov.uk/data/ppi/transaction-record.json?propertyAddress.district=BRAINTREE&_pageSize=20&_sort=-transactionDate",
        { next: { revalidate: 86400 } }
      ),
    ]);

    let indexItems: UKHPIItem[] = [];
    if (indexRes.status === "fulfilled" && indexRes.value.ok) {
      const indexData = await indexRes.value.json();
      const rawItems: Record<string, unknown>[] = indexData?.result?.items ?? [];
      indexItems = rawItems
        .map((item) => {
          // Period can be a URI like http://reference.data.gov.uk/id/month/2024-06
          // or a plain string like "2024-06"
          let period: string | null = null;
          const rawPeriod = item["http://purl.org/linked-data/sdmx/2009/dimension#refPeriod"]
            ?? item.refPeriod ?? item.period ?? null;
          if (rawPeriod && typeof rawPeriod === "object" && (rawPeriod as Record<string, unknown>)._about) {
            // Extract date from URI: .../2024-06 -> 2024-06
            const aboutStr = String((rawPeriod as Record<string, unknown>)._about);
            period = aboutStr.split("/").pop() ?? aboutStr;
          } else if (typeof rawPeriod === "string") {
            period = rawPeriod.includes("/") ? rawPeriod.split("/").pop() ?? rawPeriod : rawPeriod;
          }

          const averagePrice = Number(
            item["http://landregistry.data.gov.uk/def/ukhpi/averagePrice"]
            ?? item.averagePrice ?? 0
          );
          const annualChange = item["http://landregistry.data.gov.uk/def/ukhpi/percentageAnnualChange"]
            ?? item.annualChange ?? item.percentageChange ?? null;
          const salesVolume = item["http://landregistry.data.gov.uk/def/ukhpi/salesVolume"]
            ?? item.salesVolume ?? null;

          return {
            period: period ?? "",
            averagePrice,
            annualChange: annualChange != null ? Number(annualChange) : undefined,
            salesVolume: salesVolume != null ? Number(salesVolume) : undefined,
          };
        })
        .filter((item) => item.period && item.averagePrice > 0);
    }

    let recentSales: Record<string, unknown>[] = [];
    if (salesRes.status === "fulfilled" && salesRes.value.ok) {
      const salesData = await salesRes.value.json();
      const rawItems: TransactionRecord[] = salesData?.result?.items ?? [];
      recentSales = rawItems.map((t) => {
        // Normalize propertyType — Land Registry returns nested objects
        let typeLabel: string | null = null;
        const pt = t.propertyType as unknown;
        if (typeof pt === "string") {
          typeLabel = pt;
        } else if (pt && typeof pt === "object") {
          const obj = pt as Record<string, unknown>;
          // Try prefLabel first, then _about URL
          if (Array.isArray(obj.prefLabel) && obj.prefLabel[0]) {
            typeLabel = String((obj.prefLabel[0] as Record<string, string>)._value ?? "");
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

async function fetchAndUpdateCache() {
  try {
    const fresh = await generateFreshData();
    if (!fresh) return;

    const existing = await getDoc(cacheDoc);
    const existingData = existing.exists() ? existing.data().data : null;

    if (existingData && JSON.stringify(existingData) === JSON.stringify(fresh)) {
      return;
    }

    await setDoc(cacheDoc, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Background house prices cache update failed:", err);
  }
}

export async function GET() {
  try {
    const snap = await getDoc(cacheDoc);
    const cached = snap.exists() ? snap.data() : null;

    if (cached) {
      const ageMs = Date.now() - new Date(cached.updated_at).getTime();
      if (ageMs > TTL_MS) {
        fetchAndUpdateCache();
      }
      return NextResponse.json({ ...cached.data, source: "cache" });
    }

    const fresh = await generateFreshData();
    if (!fresh) {
      return NextResponse.json(
        { index: { items: [] }, recentSales: [], error: "Failed to fetch house price data" },
        { status: 500 }
      );
    }

    await setDoc(cacheDoc, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json(fresh);
  } catch {
    return NextResponse.json(
      { index: { items: [] }, recentSales: [], error: "Failed to fetch house price data" },
      { status: 500 }
    );
  }
}
