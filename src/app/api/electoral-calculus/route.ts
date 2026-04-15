import { NextResponse } from "next/server";

// Electoral Calculus scraper for constituency prediction data
// Scrapes ward-level MRP estimates and constituency predictions
// Also scrapes national seat projection (MRP model)
//
// EC HTML structure (as of 2026):
// National: #seatpred TABLE.center.equalcols — TR class=con/lab/reform/etc
//   Columns: Party | 2024 Votes | 2024 Seats | Pred Votes | Low Seats | Pred Seats | High Seats
//   Pred Seats is in 6th TD, wrapped in <B>
// Constituency: TABLE.seatpred.center.equalcols — party rows with class
//   Prediction pill: .pills .reform / .con / .lab etc — "Prediction: Reform gain from CON"
//   Winning chances: TABLE.seatpred.barchart — bar width + percentage text
//   Ward table: TABLE.small — District | Ward | Electorate | GE24 Winner | Pred Winner

interface WardPrediction {
  ward: string;
  district: string;
  electorate: number;
  winner2024: string;
  predictedWinner: string;
}

interface ConstituencyPrediction {
  name: string;
  code: string;
  mp: string;
  mpParty: string;
  electorate: number;
  turnout: number;
  prediction: string;
  results2024: Record<string, { votes: number; share: number }>;
  predicted: Record<string, { share: number }>;
  winningChances: Record<string, number>;
  wards: WardPrediction[];
  scrapedAt: string;
}

interface NationalProjection {
  seats: Record<string, number>;
  voteShare: Record<string, number>;
  outcome: string;
  majority: number;
  largestParty: string;
  lastUpdated: string;
  source: string;
  scrapedAt: string;
}

const EC_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "text/html",
};

// Strip HTML tags and decode entities
function strip(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, "")
    .trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "seat"; // "seat" | "national" | "both"
  const seat = searchParams.get("seat") || "Braintree";

  try {
    if (type === "national" || type === "both") {
      const national = await fetchNationalProjection();
      if (type === "national") {
        return NextResponse.json(national);
      }
      const constituency = await fetchConstituency(seat);
      return NextResponse.json({ national, constituency });
    }

    const data = await fetchConstituency(seat);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Scraper error", detail: String(err) },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════
// NATIONAL SEAT PROJECTION (MRP)
// ═══════════════════════════════════════════════════

async function fetchNationalProjection(): Promise<NationalProjection> {
  try {
    const res = await fetch("https://www.electoralcalculus.co.uk/prediction_main.html", {
      next: { revalidate: 43200 }, // 12 hours
      headers: EC_HEADERS,
    });

    if (!res.ok) throw new Error(`EC returned ${res.status}`);
    const html = await res.text();
    const result = parseNationalProjection(html);

    // Sanity check — main parties should have seats
    const mainSeats = (result.seats.reform || 0) + (result.seats.lab || 0) + (result.seats.con || 0);
    if (mainSeats < 50) {
      console.error("EC national scrape returned low seat count, using fallback");
      return getFallbackNationalProjection();
    }

    return result;
  } catch (err) {
    console.error("EC national projection error:", err);
    return getFallbackNationalProjection();
  }
}

function parseNationalProjection(html: string): NationalProjection {
  const seats: Record<string, number> = {};
  const voteShare: Record<string, number> = {};

  // EC uses <TR class=reform>, <TR class=con>, etc.
  // Each row has 7 TDs: Party | 2024 Votes | 2024 Seats | Pred Votes | Low | Pred Seats | High
  // Pred Seats (6th TD) is wrapped in <B>

  // Map EC CSS class names to our keys
  const classMap: Record<string, string> = {
    reform: "reform",
    con: "con",
    lab: "lab",
    lib: "ld",
    green: "green",
    nat: "snp", // SNP/Plaid use class="nat"
  };

  // Parse all TR elements with party class names
  // Pattern: <TR class=PARTYCLASS> ... <TD>...</TD> repeated
  for (const [cssClass, partyKey] of Object.entries(classMap)) {
    // Match the entire row for this party class (case insensitive)
    const rowPattern = new RegExp(
      `<TR\\s+class\\s*=\\s*["']?${cssClass}["']?[^>]*>([\\s\\S]*?)<\\/TR>`,
      "i"
    );
    const rowMatch = html.match(rowPattern);
    if (!rowMatch) continue;

    const rowHtml = rowMatch[1];

    // Extract all TD cells from this row
    const tdPattern = /<TD[^>]*>([\s\S]*?)<\/TD>/gi;
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdPattern.exec(rowHtml)) !== null) {
      cells.push(strip(tdMatch[1]));
    }

    // Also handle EC's loose markup — some rows have <TD> without </TD>
    // Fall back: find all content between <TD> tags
    if (cells.length < 4) {
      const looseTds = rowHtml.split(/<TD[^>]*>/i).slice(1);
      if (looseTds.length >= 4) {
        cells.length = 0;
        for (const td of looseTds) {
          cells.push(strip(td.replace(/<\/TD>.*/i, "")));
        }
      }
    }

    if (cells.length < 6) continue;

    // cells[0] = Party name
    // cells[1] = 2024 vote share (e.g., "14.3%")
    // cells[2] = 2024 seats
    // cells[3] = Predicted vote share (e.g., "27.5%")
    // cells[4] = Low seats estimate
    // cells[5] = Predicted seats (the one we want — in <B> tags)
    // cells[6] = High seats estimate

    // Extract predicted seats (6th cell, index 5)
    const predSeats = parseInt(cells[5]?.replace(/[^\d]/g, "") || "0");
    if (predSeats > 0 && predSeats <= 650) {
      seats[partyKey] = predSeats;
    }

    // Extract predicted vote share (4th cell, index 3)
    const predVoteMatch = cells[3]?.match(/([\d.]+)/);
    if (predVoteMatch) {
      const pct = parseFloat(predVoteMatch[1]);
      if (pct > 0 && pct < 70) {
        voteShare[partyKey] = pct;
      }
    }

    // Also extract 2024 vote share for reference (2nd cell, index 1)
    // Not stored but useful for validation
  }

  // Handle "Other" parties — sum any remaining seats
  // Look for min, oth, sf, dup, etc. rows
  const otherClasses = ["min", "oth", "sf", "dup", "sdlp", "apni", "uup", "ind", "pc"];
  let otherSeats = 0;
  for (const cls of otherClasses) {
    const rowPattern = new RegExp(
      `<TR\\s+class\\s*=\\s*["']?${cls}["']?[^>]*>([\\s\\S]*?)<\\/TR>`,
      "i"
    );
    const rowMatch = html.match(rowPattern);
    if (!rowMatch) continue;

    const rowHtml = rowMatch[1];
    const tdPattern = /<TD[^>]*>([\s\S]*?)<\/TD>/gi;
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdPattern.exec(rowHtml)) !== null) {
      cells.push(strip(tdMatch[1]));
    }
    if (cells.length < 4) {
      const looseTds = rowHtml.split(/<TD[^>]*>/i).slice(1);
      if (looseTds.length >= 4) {
        cells.length = 0;
        for (const td of looseTds) {
          cells.push(strip(td.replace(/<\/TD>.*/i, "")));
        }
      }
    }
    if (cells.length >= 6) {
      const s = parseInt(cells[5]?.replace(/[^\d]/g, "") || "0");
      if (s > 0) otherSeats += s;
    }
  }
  if (otherSeats > 0) seats.other = otherSeats;

  // Determine outcome
  const sorted = Object.entries(seats).sort((a, b) => b[1] - a[1]);
  const largestParty = sorted[0]?.[0] || "reform";
  const largestSeats = sorted[0]?.[1] || 0;
  const majority = largestSeats - 325;
  const outcome = majority > 0
    ? `${formatPartyName(largestParty)} Majority`
    : `Hung Parliament — ${formatPartyName(largestParty)} Largest`;

  return {
    seats,
    voteShare,
    outcome,
    majority,
    largestParty,
    lastUpdated: new Date().toISOString(),
    source: "Electoral Calculus MRP",
    scrapedAt: new Date().toISOString(),
  };
}

function formatPartyName(key: string): string {
  const names: Record<string, string> = {
    reform: "Reform UK", lab: "Labour", con: "Conservative",
    ld: "Lib Dems", green: "Green", snp: "SNP",
  };
  return names[key] || key;
}

function getFallbackNationalProjection(): NationalProjection {
  // Based on Electoral Calculus March 2026 MRP projection
  return {
    seats: { reform: 308, lab: 75, con: 73, ld: 66, green: 56, snp: 44, other: 28 },
    voteShare: { reform: 27.5, con: 24.0, lab: 22.5, ld: 10.5, green: 8.0, snp: 2.5 },
    outcome: "Hung Parliament — Reform UK Largest",
    majority: -17,
    largestParty: "reform",
    lastUpdated: "2026-03-01T00:00:00Z",
    source: "Electoral Calculus MRP (cached fallback)",
    scrapedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════
// CONSTITUENCY-LEVEL PREDICTION
// ═══════════════════════════════════════════════════

async function fetchConstituency(seat: string): Promise<ConstituencyPrediction> {
  const url = `https://www.electoralcalculus.co.uk/fcgi-bin/seatdetails.py?seat=${encodeURIComponent(seat)}`;
  const res = await fetch(url, {
    next: { revalidate: 86400 },
    headers: EC_HEADERS,
  });

  if (!res.ok) {
    throw new Error(`EC returned ${res.status} for ${seat}`);
  }

  const html = await res.text();
  return parseConstituency(html, seat);
}

function parseConstituency(html: string, seatName: string): ConstituencyPrediction {
  // Extract seat code from JS: var SeatCode = 'E14001121';
  const codeMatch = html.match(/var SeatCode\s*=\s*'([^']+)'/);
  const seatCode = codeMatch?.[1] || "";

  // Extract MP info from seatsummary table
  // Pattern: <TD>MP at 2024:<TD><B>Name (Party)</B>
  const mpMatch = html.match(/MP at \d{4}[\s\S]{0,50}?<B>([^<(]+)\((\w+)\)/i);
  const mp = mpMatch?.[1]?.trim() || "";
  const mpParty = mpMatch?.[2]?.trim() || "";

  // Electorate and turnout from seatsummary
  const electMatch = html.match(/Electorate[\s\S]{0,50}?<B>([\d,]+)/i);
  const electorate = electMatch ? parseInt(electMatch[1].replace(/,/g, "")) : 0;

  const turnoutMatch = html.match(/Turnout[\s\S]{0,50}?<B>([\d.]+)%/i);
  const turnout = turnoutMatch ? parseFloat(turnoutMatch[1]) : 0;

  // Prediction from pill: <DIV class="pills uppercase"><DIV class="reform">Prediction: Reform gain from CON</DIV>
  const predMatch = html.match(/Prediction:\s*([^<]+)/i);
  const prediction = predMatch?.[1]?.trim() || "";

  // Parse vote share table — TABLE.seatpred.center.equalcols
  // Party rows: <TR class=con>, <TR class=reform>, etc.
  // Columns: Party | 2024 Votes | 2024 Share | Pred Votes
  const results2024: Record<string, { votes: number; share: number }> = {};
  const predicted: Record<string, { share: number }> = {};

  const partyClasses: Record<string, string> = {
    con: "CON", lab: "LAB", reform: "Reform", lib: "LIB", green: "Green",
  };

  for (const [cssClass, partyLabel] of Object.entries(partyClasses)) {
    const rowPattern = new RegExp(
      `<TR\\s+class\\s*=\\s*["']?${cssClass}["']?[^>]*>([\\s\\S]*?)<\\/TR>`,
      "i"
    );
    const rowMatch = html.match(rowPattern);
    if (!rowMatch) continue;

    const rowHtml = rowMatch[1];
    // Extract TD cells
    const cells: string[] = [];
    const tdPattern = /<TD[^>]*>([\s\S]*?)<\/TD>/gi;
    let tdMatch;
    while ((tdMatch = tdPattern.exec(rowHtml)) !== null) {
      cells.push(strip(tdMatch[1]));
    }
    // Loose TD fallback
    if (cells.length < 3) {
      const looseTds = rowHtml.split(/<TD[^>]*>/i).slice(1);
      if (looseTds.length >= 3) {
        cells.length = 0;
        for (const td of looseTds) {
          cells.push(strip(td.replace(/<\/TD>.*/i, "")));
        }
      }
    }

    // Constituency table: Party | 2024 Votes | 2024 Share | Pred Votes
    if (cells.length >= 3) {
      // 2024 results
      const votes2024 = parseInt(cells[1]?.replace(/[^\d]/g, "") || "0");
      const share2024Match = cells[2]?.match(/([\d.]+)/);
      const share2024 = share2024Match ? parseFloat(share2024Match[1]) : 0;

      if (votes2024 > 0 || share2024 > 0) {
        results2024[partyLabel] = { votes: votes2024, share: share2024 };
      }

      // Predicted share (4th cell if it exists)
      if (cells.length >= 4) {
        const predMatch = cells[3]?.match(/([\d.]+)/);
        if (predMatch) {
          predicted[partyLabel] = { share: parseFloat(predMatch[1]) };
        }
      }
    }
  }

  // Parse winning chances from barchart section
  // EC structure: "Chance of winning" header, then rows with <TD class=con>CON<TD>...30%
  // WARNING: Each bar row contains a nested <TABLE>, so we can't use </TABLE> to find the end
  const winningChances: Record<string, number> = {};

  // Find the section starting from "Chance of winning" — grab a large chunk
  const chanceStart = html.indexOf("Chance of winning");
  if (chanceStart !== -1) {
    // Grab a generous section after the header (enough to capture all party rows)
    const chanceSection = html.substring(chanceStart, chanceStart + 3000);

    // Find all party-class TDs with percentages nearby
    // Pattern: <TD class=PARTY>PARTYNAME<TD> ... NN%
    const chancePattern = /<TD\s+class\s*=\s*["']?(\w+)["']?[^>]*>[^<]*<[\s\S]*?(\d+)%/gi;
    let chanceMatch;
    while ((chanceMatch = chancePattern.exec(chanceSection)) !== null) {
      const cls = chanceMatch[1].toLowerCase();
      const pct = parseInt(chanceMatch[2]);
      // Only process known party classes
      if (cls in partyClasses || ["oth", "min"].includes(cls)) {
        const label = partyClasses[cls] || cls.toUpperCase();
        if (pct > 0) {
          winningChances[label] = pct;
        }
      }
    }
  }

  // Extract ward data
  const wards = extractWards(html);

  return {
    name: seatName,
    code: seatCode,
    mp,
    mpParty,
    electorate,
    turnout,
    prediction,
    results2024,
    predicted,
    winningChances,
    wards,
    scrapedAt: new Date().toISOString(),
  };
}

function extractWards(html: string): WardPrediction[] {
  const wards: WardPrediction[] = [];

  // Method 1: Parse ward HTML table (TABLE.small)
  // Columns: District | Ward | Electorate 2024 | GE24 Winner | Pred GE Winner
  // Winner cells use class="con", class="reform", etc.
  const wardTableMatch = html.match(/<TABLE\s+class\s*=\s*["']?small[^"']*["']?[^>]*>([\s\S]*?)<\/TABLE>/i);
  if (wardTableMatch) {
    const tableHtml = wardTableMatch[1];
    const rows = tableHtml.match(/<TR[^>]*>[\s\S]*?<\/TR>/gi) || [];

    for (const row of rows) {
      // Skip header row
      if (row.includes("<TH")) continue;

      const tdPattern = /<TD[^>]*>([\s\S]*?)<\/TD>/gi;
      const cells: string[] = [];
      const cellClasses: string[] = [];
      let tdMatch;
      while ((tdMatch = tdPattern.exec(row)) !== null) {
        cells.push(strip(tdMatch[1]));
        // Extract class from TD for party color
        const clsMatch = tdMatch[0].match(/class\s*=\s*["']?(\w+)/i);
        cellClasses.push(clsMatch?.[1] || "");
      }

      // Loose TD fallback
      if (cells.length < 4) {
        const looseTds = row.split(/<TD[^>]*>/i).slice(1);
        if (looseTds.length >= 4) {
          cells.length = 0;
          cellClasses.length = 0;
          for (const td of looseTds) {
            cells.push(strip(td.replace(/<\/TD>.*/i, "")));
            const clsMatch = td.match(/class\s*=\s*["']?(\w+)/i);
            cellClasses.push(clsMatch?.[1] || "");
          }
        }
      }

      if (cells.length >= 5) {
        const elec = parseInt(cells[2]?.replace(/[^\d]/g, "") || "0");
        if (elec > 0 && cells[1] && !cells[1].toLowerCase().includes("ward")) {
          // Winner text might be party abbreviation or class-based
          const winner2024 = cells[3] || cellClasses[3]?.toUpperCase() || "";
          const predictedWinner = cells[4] || cellClasses[4]?.toUpperCase() || "";
          wards.push({
            district: cells[0],
            ward: cells[1],
            electorate: elec,
            winner2024,
            predictedWinner,
          });
        }
      }
    }
  }

  // Method 2: Parse WardLocData JavaScript array as fallback
  if (wards.length === 0) {
    const wardLocMatch = html.match(/var WardLocData\s*=\s*new Array\(([\s\S]*?)\);/);
    if (wardLocMatch) {
      // Format: x, y, "WardName", "District", "../images/blue-dot-marker.png", "CON",
      const raw = wardLocMatch[1];
      // Split by commas but respect quoted strings
      const entries: string[] = [];
      const tokenPattern = /"([^"]*)"|([\d.]+)/g;
      let tokenMatch;
      while ((tokenMatch = tokenPattern.exec(raw)) !== null) {
        entries.push(tokenMatch[1] || tokenMatch[2] || "");
      }

      // Each ward has 6 fields: x(num), y(num), name(str), district(str), icon(str), party(str)
      for (let i = 0; i < entries.length - 5; i += 6) {
        const wardName = entries[i + 2];
        const district = entries[i + 3];
        const iconPath = entries[i + 4] || "";
        const party = entries[i + 5] || "";

        // Determine party from icon path or explicit party field
        let partyCode = party;
        if (!partyCode && iconPath) {
          if (iconPath.includes("blue")) partyCode = "CON";
          else if (iconPath.includes("red")) partyCode = "LAB";
          else if (iconPath.includes("cyan") || iconPath.includes("turquoise")) partyCode = "Reform";
          else if (iconPath.includes("orange") || iconPath.includes("yellow")) partyCode = "LIB";
          else if (iconPath.includes("green")) partyCode = "Green";
        }

        if (wardName && district && wardName.length > 1) {
          wards.push({
            ward: wardName,
            district,
            electorate: 0,
            winner2024: partyCode,
            predictedWinner: partyCode,
          });
        }
      }
    }
  }

  return wards;
}
