// Unified constituency data module
// Re-exports all data modules + provides a single lookup function
// Generated: 2026-03-22

export * from "./constituencies";
export * from "./mp-data";
export * from "./constituency-geo";
export * from "./constituency-areas";
export * from "./candidates-2024";
export * from "./news-feeds";
export * from "./ward-deprivation";

import { CONSTITUENCIES, type Constituency } from "./constituencies";
import { MP_DATA, type MpData } from "./mp-data";
import { CONSTITUENCY_GEO, type ConstituencyGeo } from "./constituency-geo";
import { CONSTITUENCY_AREAS, type ConstituencyAreas } from "./constituency-areas";
import { CANDIDATES_2024, type Candidate } from "./candidates-2024";
import { NEWS_FEEDS, type NewsFeedConfig } from "./news-feeds";

export interface FullConstituencyData {
  constituency: Constituency;
  mp: MpData | undefined;
  geo: ConstituencyGeo | undefined;
  areas: ConstituencyAreas | undefined;
  candidates: Candidate[];
  newsFeeds: NewsFeedConfig | undefined;
}

/** Get all data for a constituency by slug */
export function getFullData(slug: string): FullConstituencyData | undefined {
  const c = CONSTITUENCIES.find(x => x.slug === slug);
  if (!c) return undefined;
  return {
    constituency: c,
    mp: MP_DATA[c.memberId],
    geo: CONSTITUENCY_GEO[c.onsCode],
    areas: CONSTITUENCY_AREAS[c.onsCode],
    candidates: CANDIDATES_2024[c.name] || [],
    newsFeeds: NEWS_FEEDS[c.onsCode],
  };
}

/** Get all data for a constituency by ONS code */
export function getFullDataByCode(onsCode: string): FullConstituencyData | undefined {
  const c = CONSTITUENCIES.find(x => x.onsCode === onsCode);
  if (!c) return undefined;
  return getFullData(c.slug);
}