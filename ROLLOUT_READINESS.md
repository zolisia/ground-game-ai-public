# Rollout Readiness Assessment — `ground-game-ai-public`

## TL;DR

1. **The work is mechanical, not architectural.** All 650 UK constituencies are already populated in the data layer (`src/data/constituencies.ts`); the destination — `getFullData(slug)` — exists. The refactor is wiring ~24 API routes that hardcode `"braintree"` onto the slug-driven data layer. No system redesign, no data modelling.

2. **Concrete numbers:** ~38 files touched to onboard constituency #2 today; ~5-8 working days for the refactor that supports 3-5 pilot constituencies cleanly; ~2 weeks for full UK multi-constituency support including Scotland/Wales/NI data and URL routing UX.

3. **Cost ceilings appear earlier than expected.** EPC gov.uk breaks at ~4 constituencies (100/day quota); SerpAPI's $50/month plan exhausts in a month at moderate traffic; Apify scales linearly from ~$30/month at 20 constituencies to ~$1,200/month at 650. All free gov / Parliament APIs scale fine; Anthropic AI Brief stays manageable (~$300/month at 650).

4. **No multi-tenancy plumbing exists yet.** `next.config.mjs` is empty; no URL routing for constituencies; no constituency-switcher in the UI. Choosing between separate Vercel apps / subdomains / path-based routing is a product decision that gates the refactor.

5. **Caching is collision-free.** Every Firestore cache key already includes the constituency slug as the document ID. `crime_cache/uxbridge` will coexist with `crime_cache/braintree` automatically once routes start writing slug-driven keys. No cache rearchitecture needed.

---

Date: 2026-05-07
Branch: `zoja/dev`
Scope: what breaks, scales, or needs rework before expanding from 1 (Braintree) to 3 / 20 / 650 constituencies.
Baseline: `MVP_STATUS.md` (2026-05-05). The four commits since baseline (`5c399cc`, `9668f8b`, `d3a9a16`, `3cd2901`) do not change the hardcoding picture.

---

## 1. Hardcoding inventory

### 1.1 Status of MVP_STATUS.md §5 inventory

Re-verified against current source. **Still accurate.** Cross-checks performed:

- 14 API routes write a Firestore cache key with `"braintree"` literal — confirmed by `grep -rn "doc(db, " src/app/api/`. (See §2 for full list.)
- 24 of 27 `route.ts` files reference `Braintree`, `braintree`, `Cleverly`, `4366`, `E14001121`, or `CM7/CM77/CO9` — confirmed by `grep -rln`.
- The 3 routes with **no** Braintree literal: `/api/headlines`, `/api/polling`, `/api/worship`. (MVP_STATUS.md said `/api/headlines`, `/api/polling`, and "partly `/api/electoral-calculus`" — `/api/worship` does NOT contain a literal but uses `isInsideConstituency()` which loads the Braintree GeoJSON; effectively still scoped to Braintree.)
- `next.config.mjs` is still `const nextConfig = {}; export default nextConfig;` — no rewrites, no middleware.

### 1.2 API routes with Braintree-specific literals — count and list

**24 of 27 routes** contain at least one constituency-specific literal.

| Route | Hardcoded literals | Lifts to data layer? |
|---|---|---|
| `/api/ai-brief` | cache key `"braintree"`; prompt strings `"James Cleverly (Conservative)"`, `"Braintree"` (lines 16, 127) | no |
| `/api/air-quality` | `CENTER_LAT = 51.974`, `CENTER_LNG = 0.535`; cache key `"braintree"`; 3-station fallback list | no |
| `/api/census` | 28 hardcoded ward codes; cache key `census_cache/braintree-${topicId}` | no |
| `/api/commons-library` | `ONS_CODE = "E14001121"`, `NOMIS_CODE = "721420347"`; cache `"braintree"` | no |
| `/api/cqc` | `POSTCODES = ["CM7","CM77","CO9"]`; cache `"braintree"`; 12-facility fallback | no |
| `/api/crime` | cache `"braintree"`; `isInsideConstituency()` (Braintree GeoJSON) | no |
| `/api/electoral-calculus` | `seat=Braintree` default; comment `var SeatCode = 'E14001121'` | partial — `?seat=` query param |
| `/api/employment` | `BRAINTREE_GEO = "1820328091"`; cache `"braintree"` | no |
| `/api/epc` | `POSTCODES = ["CM7","CM77","CO9"]` | no |
| `/api/fixmystreet` | cache `"braintree"`; bbox 0.308–0.782 / 51.829–52.087; `isInsideConstituency()` | no |
| `/api/floods` | `CENTER_LAT = 51.96`, `CENTER_LNG = 0.55`; cache `"braintree"`; `isInsideConstituency()` | no |
| `/api/hansard` | `MP_ID = 4366`; `TWFY_PERSON_ID = 11816`; `"James Cleverly"` fallback; URL `james_cleverly/braintree` | no |
| `/api/health` | `BRAINTREE_DISTRICT = "E07000067"`; cache `"braintree"` | no |
| `/api/house-prices` | cache `"braintree"`; URL `propertyAddress.district=BRAINTREE`; `?name=Braintree` | no |
| `/api/mentions` | `MP_NAME = "James Cleverly"`, `MP_HANDLE = "JamesCleverly"` | no |
| `/api/news` | RSS feeds: `"Google News - Cleverly"` query `James+Cleverly`; `Braintree & Witham Times` URL | no |
| `/api/opposition` | hardcoded `CANDIDATES` array (4 named 2024 candidates with vote shares + handles) | no |
| `/api/parliament` | `MP_ID = 4366` (line 7) | no |
| `/api/petitions` | `ONS_CODE = "E14001121"` (line 15) | no |
| `/api/planning` | cache `"braintree"`; `isInsideConstituency()` | no |
| `/api/schools` | hardcoded array of ~18 named Braintree schools (lat/lng/URN); cache `"braintree"` | no |
| `/api/trends` | seed terms `"Braintree Essex"`, `"Braintree council"`, `"James Cleverly"` | no |
| `/api/trends-v2` | one constant: `CONSTITUENCY_SLUG = "braintree"` (line 23); reads everything else from `getFullData(slug)` | **yes — only route on data layer** |
| `/api/universal-credit` | `CONSTITUENCY_CODE = "721420347"`; cache `"braintree"` | no |

The **3 clean routes**: `/api/headlines` (national RSS only), `/api/polling` (national aggregator), `/api/worship` (passes coords to Overpass — but in practice consumed via `ConstituencyMap.tsx` which scopes by GeoJSON).

### 1.3 Files that change to onboard a second constituency (e.g. Witham)

A literal "what would I have to edit tomorrow to make `/witham` work" walk-through. If you point a fresh deploy at Witham today **without refactoring**, you would need to touch **at least 38 files** (24 API routes + 8 data/lib/public files + 6 components):

**API routes (24 files)** — every entry from §1.2 with "no" or "partial" in the right column.

**Data + lib + public (8 files)**
1. `src/data/braintree.ts` — entire static dataset (demographics, ward demographics, election results, ward data) used by `ConstituencyProfile`, `Demographics`, `WardDataHub`, `WardTable`, `ElectionResults`. Would need a `witham.ts` equivalent or refactor onto `@/data`.
2. `src/data/braintree-boundary.ts` — simplified GeoJSON used as fallback in some components.
3. `src/lib/geo.ts` — `isInsideConstituency()` reads `public/geojson/braintree-constituency.geojson` from disk; no slug parameter. Lines 12, 30.
4. `public/geojson/braintree-constituency.geojson` — the polygon `geo.ts` consumes.
5. `public/geojson/braintree-wards.geojson` — ward overlay.
6. (`public/geojson/constituencies-all.geojson` already exists — would NOT need to change; this is the all-650 file.)
7. `src/data/index.ts` — already exports `getFullData(slug)`. No code change needed if the routes were rewired to it; does need verification that Witham's entries in `mp-data.ts`, `constituency-geo.ts`, `constituency-areas.ts`, `news-feeds.ts`, `candidates-2024.ts` are populated (they are — all five files have 543–650 entries).
8. `src/data/news-feeds.ts` — verify Witham has `bbcRegional`, `googleConstituency`, `googleMp` URLs (file has 543 entries; spot-check needed).

**Components (6 files)**
1. `src/components/Header.tsx` — hardcoded string `"Braintree · James Cleverly"`.
2. `src/components/ConstituencyProfile.tsx` — imports `src/data/braintree.ts`.
3. `src/components/Demographics.tsx` — imports from `src/data/braintree.ts`.
4. `src/components/WardDataHub.tsx` — imports from `src/data/braintree.ts`.
5. `src/components/WardTable.tsx` — imports from `src/data/braintree.ts`.
6. `src/components/ElectionResults.tsx` — imports `electionResults2024` from `src/data/braintree.ts`.
7. `src/components/ConstituencyMap.tsx` — hardcoded GeoJSON paths `/geojson/braintree-constituency.geojson`, `/geojson/braintree-wards.geojson`, plus an Essex Police crime-map URL string.
8. `src/components/PollingDashboard.tsx` — `BRAINTREE_2024` swing baseline constant; `seat=Braintree` in fetch URL.
9. `src/components/HansardFeed.tsx` — TWFY URL slug `james_cleverly/braintree`.
10. `src/components/ECPrediction.tsx` and `src/components/ElectoralIntel.tsx` — `seat=Braintree` in fetch URLs.
11. `src/components/FixMyStreet.tsx`, `NewsFeed.tsx`, `HealthPanel.tsx` — `Braintree` in display strings/links.

That is **~10 components** touched, but only ~6 with substantive logic changes; the rest are cosmetic strings.

**Realistic minimum to onboard Witham tomorrow without refactoring: ~38 files edited.** The "12 files" estimate the user used as a placeholder is an undercount; the true number lives between 35 and 45 depending on how aggressively cosmetic strings are scrubbed.

### 1.4 Single configuration entry point?

**No — but a partial one exists.**

- `src/data/index.ts` exposes `getFullData(slug)` returning `{constituency, mp, geo, areas, candidates, newsFeeds}`.
- The data files behind it are populated for all 543–650 constituencies (verified counts: `constituencies.ts` has 652 `name:` lines, `constituency-geo.ts` 543 `E14*` keys, `constituency-areas.ts` 543, `news-feeds.ts` 543, `candidates-2024.ts` 650, `mp-data.ts` keyed by memberId).
- **One** API route (`/api/trends-v2`) consumes `getFullData()`. The other 23 routes that need constituency context hardcode their own literals and do not import from `@/data`.
- Most `src/components/*.tsx` either consume the data layer indirectly via API routes, or import from the static `src/data/braintree.ts` (which is *not* part of the unified data layer — it predates it).

So: scattered, with a usable destination already drafted. The refactor is "wire 23 more routes onto `getFullData()`" plus "replace the four `braintree.ts`-importing components with the data layer."

---

## 2. Caching strategy

All 14 cached routes use the same Firebase Firestore cache-then-refresh pattern with `doc(db, <collection>, <key>)`. Verified by `grep -rn "doc(db, " src/app/api/`.

### 2.1 Cache key inventory

| Route | Collection | Key pattern (literal in source) | Per-constituency? |
|---|---|---|---|
| `/api/ai-brief` | `ai_brief_cache` | `"braintree"` | (b) hardcoded literal |
| `/api/census` | `census_cache` | `` `braintree-${topicId}` `` | (b) hardcoded literal |
| `/api/commons-library` | `commons_library_cache` | `"braintree"` | (b) hardcoded literal |
| `/api/cqc` | `cqc_cache` | `"braintree"` | (b) hardcoded literal |
| `/api/crime` | `crime_cache` | `"braintree"` | (b) hardcoded literal |
| `/api/employment` | `employment_cache` | `"braintree"` | (b) hardcoded literal |
| `/api/fixmystreet` | `fixmystreet_cache` | `"braintree"` | (b) hardcoded literal |
| `/api/floods` | `flood_cache` | `"braintree"` | (b) hardcoded literal |
| `/api/health` | `health_cache` | `"braintree"` | (b) hardcoded literal |
| `/api/house-prices` | `house_prices_cache` | `"braintree"` | (b) hardcoded literal |
| `/api/planning` | `planning_cache` | `"braintree"` | (b) hardcoded literal |
| `/api/schools` | `schools_cache` | `"braintree"` | (b) hardcoded literal |
| `/api/trends-v2` | `trends_cache` | `CONSTITUENCY_SLUG` (= `"braintree"` constant, but the *only* constant of its kind) | (b) hardcoded constant |
| `/api/universal-credit` | `universal_credit_cache` | `"braintree"` | (b) hardcoded literal |
| `/api/air-quality` | (cache writes — not in `doc(db,` grep but route has TTL refresh logic via different pattern) | n/a verified | n/a |
| `/api/electoral-calculus` | (cache writes — not in `doc(db,` grep) | n/a verified | n/a |

### 2.2 Categorisation

- **(a) Already scoped per-constituency by request param**: 0 routes.
- **(b) Look scoped but hardcode the slug**: all 14 cached routes (every entry above). The cache key shape (`<collection>/<slug>`) is correct for multi-tenant — but the slug is a string literal, not derived from the request.
- **(c) Global keys with no constituency component**: 0. All 14 use `<collection>/braintree`. The collection-per-data-type design is correct; the issue is purely the hardcoded slug.

### 2.3 Multi-tenant collision check

`crime_cache/uxbridge` would coexist with `crime_cache/braintree` **without collision** — Firestore docs in the same collection with different IDs are independent. The cache namespacing is structurally fine. The only blocker is that the slug in the document ID is a literal `"braintree"` in source rather than read from a request parameter or `getFullData(slug)`.

### 2.4 Flag: nothing global, but every key is hardcoded

Strictly, there are no "global / unscoped" keys — the schema is per-constituency. But because the slug is always literally `"braintree"`, **deploying a second constituency without changing the cache key would clobber the first constituency's cache** (every refresh would overwrite Braintree's data with the new constituency's). This is a surprise-failure mode if someone duplicates the codebase rather than parameterising.

---

## 3. External API inventory + rate limits + costs

Built by reading every route's outbound `fetch` calls. "Calls per refresh" is per-constituency, per-cache-miss. "Volume @ 20 constituencies" assumes all caches cold over a 24h window — i.e. the upper bound, not the steady state.

| Route | External API | Auth | Free-tier limit (reference values) | Cost / request | TTL | Calls per cache miss | Volume @ 20 (per 24h) | Volume @ 650 (per 24h) | Feasibility |
|---|---|---|---|---|---|---|---|---|---|
| `/api/crime` | data.police.uk | none | ~15 concurrent (soft) | 0 | 15 min | 1 per ward × ~18 wards = ~18 | 96 refreshes × 18 = **1,728** | 56k | Tight at 650 — see §4 |
| `/api/fixmystreet` | FixMyStreet | none | none documented | 0 | 30 min | 1 (bbox) | 960 | 31k | Fine |
| `/api/floods` | Environment Agency | none | none documented | 0 | unknown (cached) | 1 | <100 | <3k | Fine |
| `/api/petitions` | gov.uk Petitions | none | none documented | 0 | uncached | 1 (full list) per request | request-rate-bound | request-rate-bound | Fine — full list is small (<1MB) |
| `/api/parliament` | UK Parliament Members API | none | none documented | 0 | uncached | 1 per request | request-rate-bound | request-rate-bound | Fine — but uncached so every page view hits it |
| `/api/hansard` | Members API + (optional) TheyWorkForYou | none | none documented | 0 | uncached | 2 per request | request-rate-bound | request-rate-bound | Fine — same uncached caveat |
| `/api/health` | OHID Fingertips | none | none documented | 0 | 24 h | several (route comment notes endpoint changes early 2026) | 20 | 650 | Upstream broken; needs Fingertips rewrite |
| `/api/employment` | NOMIS | none | none documented | 0 | 24 h | 1 | 20 | 650 | Fine |
| `/api/universal-credit` | NOMIS / DWP Stat-Xplore | none | none documented | 0 | 24 h | 1 | 20 | 650 | Fine |
| `/api/census` | NOMIS (per-topic) | none | none documented | 0 | 7 days | many (per ward × per topic) | <50 | <2k | Fine |
| `/api/commons-library` | NOMIS + Members API | none | none documented | 0 | 24 h | several | <100 | <3k | Fine |
| `/api/house-prices` | Land Registry | none | none documented | 0 | 24 h | 1 | 20 | 650 | Fine |
| `/api/planning` | various LPA endpoints | none | varies | 0 | 1 h | several | ~480 | 15.6k | Fine; per-LPA limits unknown |
| `/api/worship` | Overpass (OSM) | none | "be polite" | 0 | uncached | 1 (heavy) | request-rate-bound | request-rate-bound | OSM Overpass throttles aggressively at scale; **flag at 650** |
| `/api/air-quality` | OpenAQ | none | none documented | 0 | (cached) | 1 | <50 | <2k | Fine |
| `/api/headlines` | BBC/Sky/Guardian/Telegraph/GB News RSS | none | polite scraping | 0 | uncached | 5 per request | request-rate-bound | request-rate-bound | Fine — national, not per-constituency |
| `/api/news` | Google News RSS + local paper RSS | none | none documented | 0 | uncached | 2 per request | request-rate-bound | request-rate-bound | Fine; google may rate-limit at 650 |
| `/api/electoral-calculus` | electoralcalculus.co.uk (HTML scrape) | none | none documented | 0 | (cached) | 1 | <50 | <2k | Fine; scraping fragility independent of scale |
| `/api/cqc` | data.cqc.org.uk (no key path) + 12-facility fallback | partner code (`PARTNER_CODE` not set) | unknown | 0 / paid | 24 h | 1 | 20 | 650 | Currently fallback-only; partner approval gates real data |
| `/api/epc` | gov.uk EPC | `EPC_API_KEY`, `EPC_EMAIL` | **100/day default** per registered key | 0 | uncached | several per postcode (3 postcodes × pagination) | **>100/day at 4 constituencies** with default quota | impossible without quota uplift | **Cost ceiling at small scale** — needs quota uplift request |
| `/api/polling` | various polling aggregators | none | none documented | 0 | uncached | several | request-rate-bound | request-rate-bound | Fine — national |
| `/api/mentions` | X API or Apify | `X_BEARER_TOKEN` **or** `APIFY_API_TOKEN` | X v2 free: ~1500 tweets/month write only — no search; Apify: per-actor pricing | X paid (~$200+/mo); Apify ~$0.30/1k tweets | uncached | 1 per request | ~50/day per constituency assumed = 1k @ 20 = **30k tweets/mo** ≈ $9/mo Apify | 975k/mo ≈ $290/mo Apify | **At 20: manageable. At 650: significant Apify spend** |
| `/api/opposition` | Apify | `APIFY_API_TOKEN` | per-actor | ~$0.30/1k tweets | uncached | up to 4 candidates/constituency | 4× mentions volume | 4× mentions volume | ~$36/mo @ 20; ~$1,160/mo @ 650 |
| `/api/trends` | SerpAPI Google Trends | `SERPAPI_KEY` | **5,000 calls/mo** included in $50/mo plan | $50/mo minimum, then $0.01–$0.02/call | uncached | several per request (3 sub-queries) | ~3 × 50 page-views/day = 3k/mo @ 20 — **inside plan** | 100k+/mo — **needs $200+/mo plan** | **At 20: in-plan. At 650: significant spend** |
| `/api/trends-v2` | `google-trends-api` (npm, scrapes Google Trends private endpoints) | none | unmetered but unmaintained | 0 | 12 h | 3 sub-queries | 60/day @ 20 | 1,950/day @ 650 | Free but **2 of 3 endpoints currently broken** (TODO.md); fragility risk |
| `/api/ai-brief` | Anthropic API (Haiku 4.5) | `ANTHROPIC_API_KEY` | paid | ~$1/M input tokens, $5/M output tokens (Haiku 4.5) | 30 min | 1 (~5k tokens in, 1k tokens out per call) | 48 calls/day × 20 = 960/day → ~$0.30/day = **~$9/mo** | ~$300/mo @ 650 | **At 20: cheap. At 650: tracked but manageable.** Beware refresh-rate × constituency-count multiplier. |
| `/api/schools` | none — hardcoded list | n/a | n/a | 0 | 7 days | 0 | 0 | 0 | Hand-curated — does not scale |

### 3.1 Cost ceiling APIs at 20 constituencies

Three APIs concentrate the multi-tenant spend:

1. **EPC (gov.uk)** — 100/day quota per key. Already a constraint at 4–5 constituencies given multi-postcode pagination. **Hardest ceiling at any scale.** Mitigation: request quota uplift (free, takes weeks).
2. **SerpAPI** — `/api/trends` $50/mo plan covers 5,000 calls. Several sub-queries per page-load × 20 constituencies × moderate traffic exits the included tier inside one month. Already known-deferred via `/api/trends-v2`.
3. **Apify (X scrapes)** for `/api/mentions` + `/api/opposition` — manageable at $9–$36/mo at 20 constituencies, but the cost grows linearly. At 650, estimate $300–$1,200/mo.

Anthropic `/api/ai-brief` is **not** the cost ceiling at 20 (~$9/mo with current 30-min TTL). It becomes meaningful at 650 (~$300/mo) but scales linearly with both constituency count and traffic.

### 3.2 Unknowns that need research

- `/api/parliament`, `/api/hansard`, `/api/petitions` — uncached. No documented rate limit on UK Parliament APIs. **Unknown — needs research at 650 deploy time.**
- `/api/worship` (Overpass) — OSM Overpass instances actively throttle. **Unknown — almost certainly blocks at 650 without a self-hosted Overpass mirror.**
- `/api/news` (Google News RSS) — Google does not document a rate limit; aggressive polling from one IP gets 429s. **Unknown above ~5 RPS sustained.**
- FixMyStreet and Land Registry rate limits — undocumented.

---

## 4. Data freshness at scale

The cache-then-refresh pattern (`getDoc` → if `ageMs > TTL_MS` then `setDoc(fresh)`) **does** absorb most of the load. First user per constituency triggers the cold fetch; subsequent users in the TTL window read from Firestore.

### 4.1 TTL inventory (per route, verified by `grep "TTL_MS ="`)

| Route | TTL | At 20 constituencies, refreshes per day | At 650, refreshes per day |
|---|---|---|---|
| `/api/crime` | **15 min** | 96 × 20 = 1,920 | 62,400 |
| `/api/ai-brief` | 30 min | 48 × 20 = 960 | 31,200 |
| `/api/fixmystreet` | 30 min | 48 × 20 = 960 | 31,200 |
| `/api/planning` | 1 h | 24 × 20 = 480 | 15,600 |
| `/api/trends-v2` | 12 h | 2 × 20 = 40 | 1,300 |
| `/api/cqc` | 24 h | 20 | 650 |
| `/api/health` | 24 h | 20 | 650 |
| `/api/employment` | 24 h | 20 | 650 |
| `/api/commons-library` | 24 h | 20 | 650 |
| `/api/universal-credit` | 24 h | 20 | 650 |
| `/api/house-prices` | 24 h | 20 | 650 |
| `/api/census` | 7 days | ~3 | ~93 |
| `/api/schools` | 7 days | ~3 (no upstream call — irrelevant) | ~93 |

### 4.2 The crime-route worry

`/api/crime` at 15-minute TTL: at 20 constituencies that is **a fresh fetch every 45 seconds on average**, each fetch making ~18 calls to `data.police.uk` (one per ward bounding box). That is ~24 outbound requests per minute sustained. data.police.uk has soft concurrency limits around 15 — sequential requests are fine, but parallelism could trip it.

At 650 constituencies, the same arithmetic gives **a fresh fetch every 1.4 seconds**, with ~18 outbound calls each → ~775 req/min. **This will be rate-limited by data.police.uk in some form.** Mitigations: lengthen TTL to 1h+, batch crime fetches per police force area rather than per constituency, or move to the bulk monthly download.

### 4.3 Other aggressive TTLs

`/api/fixmystreet` at 30 min × 20 = 960/day = 1 every 90s — fine. `/api/planning` at 1h × 20 = once every 3 min — fine. `/api/ai-brief` at 30 min is fine load-wise but each call is paid Anthropic — see §3.

### 4.4 Freshness vs cost trade-off

The cache-then-refresh pattern only *absorbs* load if traffic is even. Since every constituency's first user triggers its own cold fetch, a cold-deploy + 20 simultaneous users from 20 different constituencies = 20 cold fetches in parallel. None of the routes implement single-flight de-duplication, so two simultaneous users in the same constituency post-deploy = two cold fetches. Acceptable at pilot scale; would matter at 650.

---

## 5. The data layer state

### 5.1 What's there

| File | Type | Coverage | Notes |
|---|---|---|---|
| `src/data/index.ts` | re-export + `getFullData(slug)` | n/a | 46 lines; defines `FullConstituencyData` |
| `src/data/constituencies.ts` | static array | **650** entries (652 `name:` matches incl. type interface) | spot-checked first 50: all real ONS codes, all non-empty MP names, 2024 results filled |
| `src/data/mp-data.ts` | `Record<memberId, MpData>` | 670 lines — appears to cover the 650 sitting MPs by `memberId` | spot-checked first 13 entries — all real |
| `src/data/constituency-geo.ts` | `Record<onsCode, ConstituencyGeo>` | **543** entries (English constituencies only — Scotland/Wales/NI not in the geo file) | risk: Scottish/Welsh constituency #2 would be missing centroid+bbox |
| `src/data/constituency-areas.ts` | `Record<onsCode, ConstituencyAreas>` | **543** entries | same coverage gap as geo |
| `src/data/candidates-2024.ts` | `Record<constituencyName, Candidate[]>` | **650** entries | full coverage |
| `src/data/news-feeds.ts` | `Record<onsCode, NewsFeedConfig>` | **543** entries | same coverage gap |
| `src/data/braintree.ts` | static panels (demographics, ward data, election results) | 1 (Braintree only) | **legacy, predates `@/data`**; consumed directly by 5 components |
| `src/data/braintree-boundary.ts` | hardcoded GeoJSON | 1 (Braintree) | 149 lines |
| `public/geojson/constituencies-all.geojson` | all-650 GeoJSON | 650 | available but `src/lib/geo.ts` does not use it |
| `public/geojson/braintree-constituency.geojson` | single-constituency GeoJSON | 1 | hardcoded path in `src/lib/geo.ts:12` |

**Coverage gap**: the data layer covers **543 English constituencies**. Scotland (~57), Wales (~32), and Northern Ireland (~18) are missing from `constituency-geo.ts`, `constituency-areas.ts`, and `news-feeds.ts`. Adding non-English constituencies to the pilot requires populating these files first.

### 5.2 Frontend wiring

Only `/api/trends-v2` (route side) consumes `getFullData(slug)`. On the component side, components either:

- Fetch via API routes (and inherit the route's hardcoding), or
- Import directly from the legacy `src/data/braintree.ts` (5 components: `ConstituencyProfile`, `Demographics`, `WardDataHub`, `WardTable`, `ElectionResults`).

There is **no component currently calling `getFullData()`**. The only consumer is server-side, in one route.

### 5.3 Minimum viable change to onboard constituency #2 today

Without refactoring, "make `/witham` work" is a **patch-every-file** exercise. Concrete file list (overlaps §1.3):

1. **24 API routes**: replace each Braintree literal with a `slug` request parameter, call `getFullData(slug)`, derive ONS code / NOMIS code / cache key from it. Each route needs ~10–30 lines changed.
2. **5 legacy components** (`ConstituencyProfile`, `Demographics`, `WardDataHub`, `WardTable`, `ElectionResults`): rewrite to consume `getFullData()` instead of `src/data/braintree.ts`. Or duplicate `src/data/braintree.ts` → `src/data/witham.ts` (faster but multiplies the problem).
3. **5 components with seat strings** (`Header`, `ConstituencyMap`, `PollingDashboard`, `HansardFeed`, `ECPrediction`, `ElectoralIntel`, `FixMyStreet`, `NewsFeed`, `HealthPanel`): replace literals.
4. **`src/lib/geo.ts`**: parameterise — read `public/geojson/constituencies-all.geojson` (already present!) and filter by ONS code, instead of reading the single `braintree-constituency.geojson` file.
5. **Verify Witham's data is present** in the 5 data-layer files: `mp-data.ts` (memberId), `constituency-geo.ts` (E14001568? — need to look up Witham's ONS code), `constituency-areas.ts`, `news-feeds.ts`, `candidates-2024.ts`. All five are 650-deep for English seats; Witham (Essex) will be present.

Total: **~38 files, several hundred lines of code.** This is the same number as §1.3 — confirmed by independent recount.

---

## 6. Deployment / multi-tenancy

### 6.1 Current state

- Single Vercel project, single deployment.
- `next.config.mjs` is `{}` — no rewrites, no redirects, no middleware.
- One implicit route at `/` (`src/app/page.tsx`); no constituency segment in the URL.
- Env vars are set per-Vercel-project — currently shared (no per-constituency split).
- All Firestore cache keys hardcode `"braintree"` — no per-tenant namespace at the data layer.

### 6.2 Four options compared

| Aspect | (a) 3 separate Vercel apps | (b) Constituency switcher (one app, no URL change) | (c) Subdomains (`braintree.app, witham.app`) | (d) URL paths (`/braintree`, `/witham`) |
|---|---|---|---|---|
| Refactor blast radius | Smallest — duplicate-and-edit the codebase per app | Largest — must thread `slug` through every API route + component | Medium — slug derived from `Host` header in middleware; routes still need `slug` parameter | Medium — slug derived from URL segment via dynamic route `[slug]/page.tsx`; routes need `slug` parameter |
| Shared API keys (`ANTHROPIC_API_KEY`, `APIFY_API_TOKEN`, `SERPAPI_KEY`) | **Per-app duplication** of every key in every Vercel project — operationally painful | Single shared set | Single shared set | Single shared set |
| Cache namespacing | Naturally separate (different Firestore projects? or same project, different keys still hardcoded) | Forces per-key namespacing (the right answer) | Forces per-key namespacing | Forces per-key namespacing |
| Deploy process | Deploy 3 (or 20) projects on every change. Risk of drift. | Single deploy | Single deploy + DNS per constituency | Single deploy |
| URL structure | Different domains per pilot client | None — switcher component picks active constituency | `braintree.example.com` etc. | `example.com/braintree` etc. |
| SEO / sharing | Distinct apps look distinct | Bad — same URL for different content | Good — clean per-client branding | Good — clean per-content URLs |
| Onboarding constituency #21 | **+1 Vercel project** | Add to switcher dropdown | Configure DNS subdomain | New URL path automatically works |
| Failure isolation | Strong (one client's bug doesn't affect others) | None | Weak (all served by same deploy) | Weak (same deploy) |
| Suitability for white-label / per-client branding | Strongest | Weakest | Strong | Medium |
| Effort to reach state from today | Zero structural — just duplicate the repo and edit literals | Largest refactor (§5.3 + UI selector) | Medium refactor (§5.3 + middleware reads `Host`) | Medium refactor (§5.3 + dynamic route) |

### 6.3 Trade-offs

The "scattered hardcoding → 38 files" problem (§1, §5) **must be solved for any of (b)/(c)/(d)**; it can be sidestepped by (a) duplicate-and-deploy. Option (a) is the only path that scales today without the refactor — but its operational cost grows linearly: 3 projects = 3× envvar admin, deploy admin, monitoring; 20 projects = unmanageable.

Options (c) and (d) are functionally equivalent in technical terms; the difference is branding/URL aesthetics. Both require the §5.3 refactor before they become viable. (c) is friendlier to per-client white-labelling; (d) is friendlier to a single product offering multi-constituency views.

Option (b) (in-app switcher) is the same code refactor as (c)/(d) without the URL-routing benefit; users would not be able to bookmark or share a constituency-specific link.

### 6.4 Things every option must address

- API key sharing model. Today all keys are global. Per-tenant keys (e.g. each client has their own Anthropic budget) is a separate decision from URL routing.
- Cache namespacing. Once the refactor lands, keys naturally become `<collection>/<slug>`. Today they are `<collection>/braintree`.
- Firestore quota. Free tier is 50k reads/day; at 20 constituencies × ~30 panels × ~100 page-views/day = 60k reads — already over free tier. **Pilot-scale Firestore needs the Blaze plan.**

---

## 7. Biggest blockers

The top 3 things that break or need significant rework if you tried to onboard Witham (constituency #2) **tomorrow**:

- **Hardcoded literals across 24 of 27 API routes.** Witham's data won't appear because the routes literally fetch Braintree's MP ID, ONS code, postcodes, ward codes, and bounding box. The fix is mechanical (read from `getFullData(slug)` instead of literal) but spans ~24 files and several hundred lines. (§1.2, §5.3.)

- **`src/lib/geo.ts` reads a hardcoded GeoJSON file**, not parameterised by slug. Every route that uses `isInsideConstituency()` (`/api/crime`, `/api/fixmystreet`, `/api/planning`, `/api/floods`, `/api/worship`) silently filters Witham requests against Braintree's polygon. The all-650 file `public/geojson/constituencies-all.geojson` already exists; `geo.ts` does not consume it. (§1.3 item 3.)

- **Firestore cache keys are literal `"braintree"` in 14 routes**. Without changing them, Witham's first cache write would overwrite Braintree's data. The schema is correct (one doc per constituency), but the slug needs to come from request context. (§2.2.)

Honourable mention: **5 components import directly from `src/data/braintree.ts`** (the legacy data file), which is single-constituency by design. These need rewriting to consume the unified data layer. (§5.2.)

---

## 8. Recommended refactor scope

### 8.1 Minimum viable refactor for 3–5 pilot constituencies

**Changes**:
1. Add `slug` request parameter to every API route. Pass via query string (e.g. `/api/crime?slug=witham`). Each route reads `getFullData(slug)` and replaces all literals with values from that object.
2. Replace cache key literal `"braintree"` with `slug` in all 14 cached routes. Schema unchanged.
3. Refactor `src/lib/geo.ts` to take an `onsCode` parameter and look up the polygon in `public/geojson/constituencies-all.geojson` (file already exists).
4. Replace the 5 components that import `src/data/braintree.ts` with components that take `slug` as a prop and call `getFullData(slug)`. Keep `src/data/braintree.ts` for now as a legacy fixture if specific demographics/ward fields are not yet migrated to the data layer; otherwise expand `src/data/index.ts` types to include them.
5. Choose URL strategy: dynamic route `src/app/[slug]/page.tsx` is the lowest-friction (option (d) in §6). Component props derive `slug` from `useParams()` or from the page's server-side props.
6. Header / map / chart components: replace 7–10 hardcoded display strings.
7. Verify the data-layer files are populated for the chosen pilot constituencies (English seats: yes; Scottish/Welsh/NI: requires populating geo + areas + news-feeds files).

**Stays unchanged**:
- Firestore schema (collection-per-data-type with constituency slug as doc ID).
- TTLs (revisit only if §4 load profile becomes a problem).
- Frontend panel layout and the 27 routes' external-API integrations.
- Anthropic / Apify / SerpAPI / EPC env-var setup.

### 8.2 Complexity estimate

**5–8 working days for one engineer with codebase familiarity.** Justified by:

- 24 API routes × ~20 lines changed each + per-route testing = 3 days.
- 10 components × ~10 lines each = 1 day.
- `src/lib/geo.ts` rewrite + Firestore cache-key parameterisation = 0.5 day.
- New URL routing structure (`[slug]/page.tsx`) and the switcher/landing UX = 1 day.
- Testing across 3–5 pilot constituencies, fixing the inevitable edge cases (e.g. constituencies whose news feeds don't have a local paper, or where 2024 candidate handles are missing) = 1–2 days.
- Deploy + verify cache namespacing + Firestore quota check = 0.5 day.

A reasonable shape would be: ~1 calendar week of focused work for 3 pilot constituencies; ~2 weeks if it includes Scotland/Wales/NI data-population and the URL/UX choice negotiations.

**Out of scope of the "minimum viable refactor"** but related:
- Resolving the SerpAPI vs `/api/trends-v2` decision (§3, TODO.md).
- Fixing `/api/health` Fingertips endpoint changes.
- Fingertips, EPC quota uplift requests, CQC partner code application.
- Adding Firestore caching to the 11 currently-uncached routes — only worth doing if pilot load demands it.
- Going from 5 → 650 constituencies is **not** primarily a code refactor; it is a question of upstream API rate limits (§3) and Firestore quota / spend.
