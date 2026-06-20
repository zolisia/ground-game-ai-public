import { NextResponse } from "next/server";
import { getFullData } from "@/data";

// Parliament Members API — public, no auth required
// https://members-api.parliament.uk
// TheyWorkForYou — for linking to debate pages

interface WrittenQuestion {
  value: {
    id: number;
    askingMemberId: number;
    questionText: string;
    dateTabled: string;
    dateForAnswer: string;
    answeringBodyName: string;
    heading: string;
    answeredWhen: string | null;
    isAnswered: boolean;
    uin: string;
  };
}

interface EdmItem {
  value: {
    title: string;
    number: string;
    id: number;
    dateTabled: string;
    sponsorsCount: number;
    isPrayer: boolean;
    isAmendment: boolean;
  };
}

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "speeches"; // speeches | questions

  const constituencySlug = searchParams.get("constituency") || "braintree";
  const constituencyData = getFullData(constituencySlug);

  if (!constituencyData) {
    return Response.json(
      { error: "Invalid constituency slug" },
      { status: 400 }
    );
  }

  if (!constituencyData.mp) {
    return Response.json(
      { error: "MP data not available for this constituency" },
      { status: 400 }
    );
  }

  const MP_ID = constituencyData.mp.memberId;
  const TWFY_PERSON_ID = constituencyData.mp.twfyPersonId;
  const MP_NAME = constituencyData.mp.name;
  const CONSTITUENCY_SLUG = constituencyData.constituency.slug;

  // Generate TWFY URL slug from MP name. NOTE: data-layer names may include
  // honorifics (e.g. "Sir James Cleverly" → "sir_james_cleverly"), which TWFY
  // may not recognise (their canonical URL uses "james_cleverly"). If TWFY
  // links 404 for honored MPs, strip honorifics here — see /api/trends-v2's
  // stripHonorific helper for the pattern.
  const mpNameSlug = MP_NAME.toLowerCase().replace(/\s+/g, "_");

  try {
    if (type === "questions") {
      return await getWrittenQuestions(MP_ID);
    } else {
      return await getRecentActivity(
        MP_ID,
        MP_NAME,
        TWFY_PERSON_ID,
        mpNameSlug,
        CONSTITUENCY_SLUG
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch parliamentary activity" },
      { status: 500 }
    );
  }
}

// Recent parliamentary activity — combines votes + EDMs since Hansard API is dead
async function getRecentActivity(
  mpId: number,
  mpName: string,
  twfyPersonId: number | null,
  mpNameSlug: string,
  constituencySlug: string
) {
  // Fetch latest votes and EDMs in parallel
  const [votesRes, edmsRes] = await Promise.allSettled([
    fetch(`https://members-api.parliament.uk/api/Members/${mpId}/Voting?house=1&take=10`, {
      next: { revalidate: 3600 },
      headers: { Accept: "application/json" },
    }),
    fetch(`https://members-api.parliament.uk/api/Members/${mpId}/Edms`, {
      next: { revalidate: 3600 },
      headers: { Accept: "application/json" },
    }),
  ]);

  interface ActivityItem {
    title: string;
    date: string | null;
    excerpt: string;
    url: string;
    house: string;
    type: string;
    speaker: string | null;
  }

  const activities: ActivityItem[] = [];

  // Process votes into activity items
  if (votesRes.status === "fulfilled" && votesRes.value.ok) {
    const votesData = await votesRes.value.json();
    const votes: VoteItem[] = votesData.items || [];
    for (const v of votes.slice(0, 8)) {
      const votedAye = v.value.inAffirmativeLobby;
      const won = votedAye
        ? v.value.numberInFavour > v.value.numberAgainst
        : v.value.numberAgainst > v.value.numberInFavour;
      activities.push({
        title: v.value.title,
        date: v.value.date,
        excerpt: `Voted ${votedAye ? "Aye" : "No"} — ${v.value.numberInFavour} for, ${v.value.numberAgainst} against${won ? " (Won)" : " (Lost)"}`,
        url: `https://www.theyworkforyou.com/divisions/pw-${v.value.date.substring(0, 10)}-${v.value.divisionNumber}-commons`,
        house: "Commons",
        type: "division",
        speaker: mpName,
      });
    }
  }

  // Process EDMs
  if (edmsRes.status === "fulfilled" && edmsRes.value.ok) {
    const edmsData = await edmsRes.value.json();
    const edms: EdmItem[] = edmsData.items || [];
    for (const e of edms.slice(0, 5)) {
      activities.push({
        title: `EDM ${e.value.number}: ${e.value.title}`,
        date: e.value.dateTabled,
        excerpt: `Early Day Motion — ${e.value.sponsorsCount} sponsors`,
        url: `https://edm.parliament.uk/early-day-motion/${e.value.id}`,
        house: "Commons",
        type: "edm",
        speaker: mpName,
      });
    }
  }

  // Sort by date descending
  activities.sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });

  return NextResponse.json({
    speeches: activities,
    total: activities.length,
    twfyUrl: twfyPersonId
      ? `https://www.theyworkforyou.com/mp/${twfyPersonId}/${mpNameSlug}/${constituencySlug}`
      : undefined,
  });
}

async function getWrittenQuestions(mpId: number) {
  const url = `https://members-api.parliament.uk/api/Members/${mpId}/WrittenQuestions?take=15`;

  const res = await fetch(url, {
    next: { revalidate: 3600 },
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    return NextResponse.json(
      { questions: [], error: "Parliament API unavailable" },
      { status: 502 }
    );
  }

  const data = await res.json();
  const items: WrittenQuestion[] = data.items || [];

  const questions = items.map((item: WrittenQuestion) => {
    const q = item.value;
    const excerpt = (q.questionText || "")
      .replace(/<[^>]*>/g, "")
      .substring(0, 300)
      .trim();

    return {
      title: q.heading || "Written Question",
      date: q.dateTabled,
      excerpt: excerpt.length === 300 ? `${excerpt}...` : excerpt,
      url: `https://questions-statements.parliament.uk/written-questions/detail/${q.dateTabled ? q.dateTabled.substring(0, 10) + "/" : ""}${q.uin}`,
      house: "Commons" as const,
      type: "question" as const,
      answeringBody: q.answeringBodyName || null,
      isAnswered: q.isAnswered,
      dateForAnswer: q.dateForAnswer || null,
    };
  });

  return NextResponse.json({ questions });
}
