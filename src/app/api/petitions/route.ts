import { NextResponse } from "next/server";
import { getFullData } from "@/data";

// Force dynamic — fetches live external data
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// UK Parliament Petitions API — free, no auth required
// Fetches open e-petitions and calculates constituency salience.
// Docs: https://petition.parliament.uk/help

const PETITIONS_API = "https://petition.parliament.uk/petitions.json";
const PETITION_DETAIL = "https://petition.parliament.uk/petitions";

const UK_POP = 67000000;

interface PetitionResult {
  title: string;
  url: string;
  totalSignatures: number;
  localSignatures: number;
  salience: number;
  overIndexed: boolean;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const constituencySlug = searchParams.get("constituency") || "braintree";
  const constituencyData = getFullData(constituencySlug);

  if (!constituencyData) {
    return Response.json(
      { error: "Invalid constituency slug" },
      { status: 400 }
    );
  }

  const ONS_CODE = constituencyData.constituency.onsCode;
  const electorate = constituencyData.constituency.electorate;

  try {
    // Fetch the list of open petitions
    const listRes = await fetch(`${PETITIONS_API}?state=open&page=1`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });

    if (!listRes.ok) {
      return NextResponse.json(
        { petitions: [], error: "Failed to fetch petitions list" },
        { status: 502 }
      );
    }

    const listData = await listRes.json();
    const rawPetitions = listData.data || [];

    // Sort by total signature count descending and take top 20
    const topPetitions = rawPetitions
      .sort((a: { attributes: { signature_count: number } }, b: { attributes: { signature_count: number } }) =>
        b.attributes.signature_count - a.attributes.signature_count
      )
      .slice(0, 20);

    // Fetch constituency breakdown for each petition in parallel
    const results: PetitionResult[] = [];

    const detailPromises = topPetitions.map(async (petition: { id: number; attributes: { action: string; signature_count: number } }) => {
      try {
        const detailRes = await fetch(`${PETITION_DETAIL}/${petition.id}.json`, {
          next: { revalidate: 3600 },
          signal: AbortSignal.timeout(5000),
        });

        if (!detailRes.ok) return null;

        const detailData = await detailRes.json();
        const constituencies = detailData.data?.attributes?.signatures_by_constituency || [];

        // Find this constituency
        const local = constituencies.find(
          (c: { ons_code: string }) => c.ons_code === ONS_CODE
        );

        if (!local) return null;

        const totalSigs = petition.attributes.signature_count;
        const localSigs = local.signature_count;

        // Salience: (local_share_of_signatures) / (constituency_share_of_population)
        // NOTE: numerator now uses electorate (from data layer), denominator
        // still uses UK total population. Bases differ — see comment above
        // UK_POP. Affects absolute values but not petition ranking order.
        const localShare = localSigs / totalSigs;
        const popShare = electorate / UK_POP;
        const salience = localShare / popShare;

        return {
          title: petition.attributes.action,
          url: `https://petition.parliament.uk/petitions/${petition.id}`,
          totalSignatures: totalSigs,
          localSignatures: localSigs,
          salience: Math.round(salience * 100) / 100,
          overIndexed: salience > 1,
        };
      } catch {
        // Individual petition fetch failed — skip it
        return null;
      }
    });

    const settled = await Promise.allSettled(detailPromises);
    for (const result of settled) {
      if (result.status === "fulfilled" && result.value) {
        results.push(result.value);
      }
    }

    // Sort by salience descending
    results.sort((a, b) => b.salience - a.salience);

    return NextResponse.json({
      petitions: results,
      source: "live",
    });
  } catch (err) {
    console.error("Petitions API error:", err);
    return NextResponse.json(
      { petitions: [], error: "Failed to fetch petitions data" },
      { status: 500 }
    );
  }
}
