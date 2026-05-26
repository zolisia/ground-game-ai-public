import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";

// Schools list per constituency, served from static JSON files under
// public/data/schools-{slug}.json. Each file is a filtered slice of the
// monthly OFSTED "state-funded schools — latest inspections" management
// information CSV, filtered by Parliamentary constituency name (the column
// is authoritative — sourced directly from DfE GIAS records).
//
// Why static rather than a live GIAS API call: the public GIAS endpoints
// (get-information-schools.service.gov.uk/api/…, /search/results/json,
// /Downloads/…) are gated by Akamai bot protection and 403/404 from any
// server-side fetch, so a runtime API call isn't viable. OFSTED's monthly
// CSV is published on assets.publishing.service.gov.uk (same CDN we use for
// the IMD data) without that gating — we filter it offline and commit the
// resulting per-constituency JSON. Re-run scripts/build-schools-data.py to
// refresh.

interface School {
  urn: number;
  name: string;
  type: "Primary" | "Secondary" | "Special" | "Other";
  ofstedRating: string;
  postcode: string;
  ageRange: string;
  pupils: number;
}

interface StaticFile {
  source: string;
  sourceUrl: string;
  schools: School[];
}

interface ApiSchool extends School {
  // Kept for backwards compatibility with the existing SchoolsPanel UI which
  // reads `address` (for the Google-search link and the truncated location
  // line) and `lat`/`lng` (declared on its interface even though not used
  // for rendering). For the OFSTED dataset, the postcode is the only address
  // fragment we have, so `address` mirrors `postcode`.
  address: string;
  lat: number;
  lng: number;
}

async function loadStaticSchools(slug: string): Promise<StaticFile | null> {
  try {
    const filePath = join(process.cwd(), "public", "data", `schools-${slug}.json`);
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as StaticFile;
  } catch {
    return null;
  }
}

function buildSummary(schools: ApiSchool[]) {
  return {
    total: schools.length,
    primary: schools.filter((s) => s.type === "Primary").length,
    secondary: schools.filter((s) => s.type === "Secondary").length,
    special: schools.filter((s) => s.type === "Special").length,
    outstanding: schools.filter((s) => s.ofstedRating === "Outstanding").length,
    good: schools.filter((s) => s.ofstedRating === "Good").length,
    requiresImprovement: schools.filter((s) => s.ofstedRating === "Requires Improvement").length,
    inadequate: schools.filter((s) => s.ofstedRating === "Inadequate").length,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const constituencySlug = searchParams.get("constituency") || "braintree";

  if (!getFullData(constituencySlug)) {
    return Response.json({ error: "Invalid constituency slug" }, { status: 400 });
  }

  const file = await loadStaticSchools(constituencySlug);
  if (!file) {
    return Response.json(
      {
        error: "Schools data not available",
        message: "School data not yet sourced for this constituency",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }

  const schools: ApiSchool[] = file.schools.map((s) => ({
    ...s,
    address: s.postcode,
    lat: 0,
    lng: 0,
  }));

  return NextResponse.json({
    schools,
    summary: buildSummary(schools),
    source: file.source,
    sourceUrl: file.sourceUrl,
  });
}
