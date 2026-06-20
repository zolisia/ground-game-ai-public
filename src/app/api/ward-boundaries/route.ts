import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface WardFeature {
  type: "Feature";
  properties: { WD24CD: string; WD24NM: string };
  geometry: unknown;
}

interface WardFeatureCollection {
  type: "FeatureCollection";
  features: WardFeature[];
}

let _allWards: WardFeatureCollection | null = null;

function loadAllWards(): WardFeatureCollection {
  if (_allWards) return _allWards;
  try {
    const filePath = join(process.cwd(), "src", "data", "wards-uk-2024.geojson");
    const raw = readFileSync(filePath, "utf-8");
    _allWards = JSON.parse(raw) as WardFeatureCollection;
  } catch {
    _allWards = { type: "FeatureCollection", features: [] };
  }
  return _allWards;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const constituencySlug = searchParams.get("constituency") || "braintree";

  const fullData = getFullData(constituencySlug);
  if (!fullData) {
    return NextResponse.json({ error: "Invalid constituency slug" }, { status: 400 });
  }

  const wardCodes = fullData.areas?.wards?.map((w) => w.code);
  if (!wardCodes || wardCodes.length === 0) {
    return NextResponse.json(
      {
        error: "Ward boundaries not available",
        message: "Ward codes not yet sourced for this constituency",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }

  const codeSet = new Set(wardCodes);
  const allWards = loadAllWards();
  const filtered = allWards.features.filter(
    (f) => f.properties?.WD24CD && codeSet.has(f.properties.WD24CD)
  );

  const featureCollection: WardFeatureCollection = {
    type: "FeatureCollection",
    features: filtered,
  };

  return NextResponse.json(featureCollection, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
