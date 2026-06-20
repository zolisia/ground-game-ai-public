import { NextResponse } from "next/server";
import { getFullData } from "@/data";

// UK Parliament APIs — public, no auth required
// Members API: https://members-api.parliament.uk
// Bills API: https://bills-api.parliament.uk

interface VoteItem {
  value: {
    title: string;
    date: string;
    inAffirmativeLobby: boolean;
    inNegativeLobby: boolean;
    numberInFavour: number;
    numberAgainst: number;
    divisionNumber: number;
  };
}

interface ApiBill {
  billId: number;
  shortTitle: string;
  currentHouse: string;
  originatingHouse: string;
  lastUpdate: string;
  isAct: boolean;
  isDefeated: boolean;
  billWithdrawn: string | null;
  currentStage?: {
    description: string;
    house: string;
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Get constituency from query param, default to braintree
  const constituencySlug = searchParams.get("constituency") || "braintree";
  const constituencyData = getFullData(constituencySlug);

  // Validate constituency exists (and has MP data populated)
  if (!constituencyData || !constituencyData.mp) {
    return Response.json(
      { error: "Invalid constituency slug" },
      { status: 400 }
    );
  }

  const MP_ID = constituencyData.mp.memberId;
  const type = searchParams.get("type") || "votes"; // votes | bills
  const query = searchParams.get("q");

  try {
    if (type === "votes") {
      return await getVotes(MP_ID);
    } else {
      return await getBills(query);
    }
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

async function getVotes(mpId: number) {
  const url = `https://members-api.parliament.uk/api/Members/${mpId}/Voting?house=1&take=20`;
  const res = await fetch(url, {
    next: { revalidate: 1800 },
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    return NextResponse.json({ votes: [], error: "Parliament API unavailable" }, { status: 502 });
  }

  const data = await res.json();
  const votes = (data.items || []).map((item: VoteItem) => ({
    title: item.value.title,
    date: item.value.date,
    votedAye: item.value.inAffirmativeLobby,
    votedNo: item.value.inNegativeLobby,
    ayes: item.value.numberInFavour,
    noes: item.value.numberAgainst,
    divisionNumber: item.value.divisionNumber,
    // Use TheyWorkForYou which has working division pages (votes.parliament.uk returns 403)
    url: `https://www.theyworkforyou.com/divisions/pw-${item.value.date.substring(0, 10)}-${item.value.divisionNumber}-commons`,
  }));

  return NextResponse.json({ votes });
}

async function getBills(query: string | null) {
  // Only fetch current bills (active in this parliamentary session)
  // IsCurrentBill=true filters out historical/defeated/withdrawn bills
  let url = "https://bills-api.parliament.uk/api/v1/Bills?CurrentHouse=All&SortBy=DateUpdatedDesc&Take=20&IsCurrentBill=true";
  if (query) {
    url = `https://bills-api.parliament.uk/api/v1/Bills?SearchTerm=${encodeURIComponent(query)}&SortBy=DateUpdatedDesc&Take=20&IsCurrentBill=true`;
  }

  const res = await fetch(url, {
    next: { revalidate: 1800 },
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    return NextResponse.json({ bills: [], error: "Parliament API unavailable" }, { status: 502 });
  }

  const data = await res.json();
  const bills = (data.items || []).map((bill: ApiBill) => {
    // Determine which house the bill is currently in from stage info
    const stageHouse = bill.currentStage?.house || bill.currentHouse || bill.originatingHouse;
    const house = stageHouse === "Commons" ? "Commons" : stageHouse === "Lords" ? "Lords" : bill.originatingHouse;
    const stageDesc = bill.currentStage?.description || "Unknown";
    // Include house in stage for clarity (e.g. "Committee Stage (Commons)")
    const stageWithHouse = stageDesc !== "Unknown" && house
      ? `${stageDesc} (${house})`
      : stageDesc;

    return {
      id: bill.billId,
      title: bill.shortTitle,
      house,
      stage: stageDesc,
      stageWithHouse,
      lastUpdate: bill.lastUpdate,
      isAct: bill.isAct,
      isDefeated: bill.isDefeated,
      withdrawn: !!bill.billWithdrawn,
      url: `https://bills.parliament.uk/bills/${bill.billId}`,
    };
  });

  return NextResponse.json({ bills, total: data.totalResults });
}
