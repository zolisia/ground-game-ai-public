import { NextResponse } from "next/server";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TTL_MS = 30 * 60 * 1000;

const cacheDoc = doc(db, "ai_brief_cache", "braintree");

const PLACEHOLDER_BRIEF = `# Constituency Intelligence Brief — Braintree

**Generated:** ${new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

**MP:** James Cleverly (Conservative)

---

> **AI Brief unavailable.** The Anthropic API key is not configured. Set the \`ANTHROPIC_API_KEY\` environment variable to enable AI-powered intelligence synthesis.

## Data Sources Active

- Local News Headlines — collecting
- Crime Summary — collecting
- Parliamentary Votes — collecting
- Community Issues (FixMyStreet) — collecting

---

*Configure your API key to unlock daily AI-synthesised intelligence briefs.*
`;

interface DataSources {
  news: unknown;
  crime: unknown;
  parliament: unknown;
  fixmystreet: unknown;
}

interface BriefData {
  brief: string;
  generated: string;
  model?: string;
  usage?: unknown;
}

async function fetchLocalData(baseUrl: string): Promise<DataSources> {
  const endpoints = [
    { key: "news", path: "/api/news" },
    { key: "crime", path: "/api/crime" },
    { key: "parliament", path: "/api/parliament?type=votes" },
    { key: "fixmystreet", path: "/api/fixmystreet" },
  ];

  const results = await Promise.allSettled(
    endpoints.map(async (ep) => {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        cache: "no-store",
        headers: { "User-Agent": "GroundGameAI/1.0" },
      });
      if (!res.ok) return { key: ep.key, data: null };
      return { key: ep.key, data: await res.json() };
    })
  );

  const sources: DataSources = {
    news: null,
    crime: null,
    parliament: null,
    fixmystreet: null,
  };

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      const key = result.value.key as keyof DataSources;
      sources[key] = result.value.data;
    }
  }

  return sources;
}

// Trim data to avoid huge prompts that waste tokens
function summariseData(data: unknown, type: string): string {
  if (!data) return "No data available";
  try {
    const d = data as Record<string, unknown>;
    if (type === "news") {
      const items = (d.items || d.articles || []) as Array<{ title?: string; source?: string; date?: string }>;
      return items.slice(0, 10).map(i => `- ${i.title || "Untitled"} (${i.source || "unknown"})`).join("\n") || "No headlines";
    }
    if (type === "crime") {
      const summary = d.summary as Record<string, number> | undefined;
      if (summary) return Object.entries(summary).map(([k, v]) => `- ${k}: ${v}`).join("\n");
      const crimes = (d.crimes || []) as Array<{ category?: string }>;
      return `${crimes.length} total crimes reported`;
    }
    if (type === "parliament") {
      const votes = (d.votes || []) as Array<{ title?: string; votedAye?: boolean; date?: string }>;
      return votes.slice(0, 10).map(v => `- ${v.votedAye ? "Aye" : "No"}: ${v.title} (${v.date?.substring(0, 10) || ""})`).join("\n") || "No votes";
    }
    if (type === "fixmystreet") {
      const reports = (d.reports || []) as Array<{ title?: string; category?: string }>;
      return reports.slice(0, 10).map(r => `- [${r.category || "other"}] ${r.title || "Untitled"}`).join("\n") || "No reports";
    }
    // Fallback: truncated JSON
    const str = JSON.stringify(data);
    return str.length > 2000 ? str.substring(0, 2000) + "..." : str;
  } catch {
    return "Data parsing error";
  }
}

function buildPrompt(data: DataSources): string {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `You are a senior political intelligence analyst producing a daily constituency brief.

Today's date: ${today}
Constituency: Braintree
MP: James Cleverly (Conservative)

Below is raw data collected from multiple sources. Synthesise it into a structured, actionable constituency intelligence brief in clean markdown format.

---

## SOURCE DATA

### Local News Headlines
${summariseData(data.news, "news")}

### Crime Summary
${summariseData(data.crime, "crime")}

### Recent Parliamentary Votes
${summariseData(data.parliament, "parliament")}

### Community Issues (FixMyStreet)
${summariseData(data.fixmystreet, "fixmystreet")}

---

## INSTRUCTIONS

Produce the brief with these sections in markdown:

# Daily Constituency Intelligence Brief — Braintree
Include today's date and MP name.

## Top Local Stories
List the top 5 most relevant local news stories. For each, include:
- Headline and source
- A one-line relevance assessment (High / Medium / Low) explaining why it matters to the constituency or MP

## Community Issues Trending
Summarise the key themes from FixMyStreet reports. Identify any clusters or patterns (e.g. repeated potholes in one area, fly-tipping hotspots). Note anything that could become a political issue.

## Crime & Safety Summary
Provide a concise summary of the crime data. Highlight any notable patterns, trends, or areas of concern. Compare to what a constituent might expect — flag anything unusual.

## Parliamentary Activity
Summarise recent voting activity for the MP. Note any votes that could be locally controversial or noteworthy. Mention any upcoming bills or debates relevant to the constituency.

## Key Talking Points
Provide 3-5 bullet points the MP's team should be prepared to discuss today, drawing from all the above data. These should be conversation-ready.

## Risk Flags
Note any emerging issues that could escalate — things to watch in the next 24-48 hours.

Keep the tone professional and analytical. Be specific — reference actual data points. Do not invent or hallucinate information not present in the source data.`;
}

async function generateFreshBrief(baseUrl: string, apiKey: string): Promise<BriefData | null> {
  try {
    const data = await fetchLocalData(baseUrl);
    const prompt = buildPrompt(data);

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });

    if (!anthropicRes.ok) {
      const errorBody = await anthropicRes.text();
      console.error("Anthropic API error:", anthropicRes.status, errorBody);
      return null;
    }

    const anthropicData = await anthropicRes.json();
    const brief =
      anthropicData.content
        ?.filter((block: { type: string }) => block.type === "text")
        .map((block: { text: string }) => block.text)
        .join("\n") || PLACEHOLDER_BRIEF;

    return {
      brief,
      generated: new Date().toISOString(),
      model: anthropicData.model,
      usage: anthropicData.usage,
    };
  } catch (error) {
    console.error("AI Brief generation failed:", error);
    return null;
  }
}

async function fetchAndUpdateCache(baseUrl: string, apiKey: string) {
  try {
    const fresh = await generateFreshBrief(baseUrl, apiKey);
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
    console.error("Background AI brief cache update failed:", err);
  }
}

export async function GET(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  try {
    const snap = await getDoc(cacheDoc);
    const cached = snap.exists() ? snap.data() : null;

    if (cached) {
      if (apiKey) {
        const ageMs = Date.now() - new Date(cached.updated_at).getTime();
        if (ageMs > TTL_MS) {
          fetchAndUpdateCache(baseUrl, apiKey);
        }
      }
      return NextResponse.json({ ...cached.data, source: "cache" });
    }

    if (!apiKey) {
      return NextResponse.json(
        { brief: PLACEHOLDER_BRIEF, generated: new Date().toISOString(), cached: false },
        { status: 200 }
      );
    }

    const fresh = await generateFreshBrief(baseUrl, apiKey);
    if (!fresh) {
      return NextResponse.json(
        {
          brief: PLACEHOLDER_BRIEF,
          generated: new Date().toISOString(),
          error: "Brief generation failed",
        },
        { status: 200 }
      );
    }

    await setDoc(cacheDoc, {
      data: fresh,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json(fresh, { status: 200 });
  } catch (error) {
    console.error("AI brief route error:", error);
    return NextResponse.json(
      {
        brief: PLACEHOLDER_BRIEF,
        generated: new Date().toISOString(),
        error: "Brief generation failed",
      },
      { status: 200 }
    );
  }
}
