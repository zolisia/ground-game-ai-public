# MVP Readiness Audit — `ground-game-ai-public`

Date: 2026-05-05
Branch: `zoja/dev`
Bar for "MVP-ready": good enough to show pilot users / funders.

## Legend

- ✅ working with real data
- ⚠️ working but partial / limited (note what's missing)
- 🔴 broken or showing empty state
- 🟡 working but using mock / fallback / placeholder data when env var is missing

---

## 1. Frontend panels audit

One row per file under `src/components/`. The "Empty-state cause" column makes the explicit distinction the user asked for: **upstream** = the API route returns nothing / placeholder; **integration** = the component is not wired to a working route (or wired to a route that's missing env vars).

| Panel | Path | State | API route(s) consumed | Depends on | Empty-state cause | Gap to MVP-ready |
|---|---|---|---|---|---|---|
| AIBrief | `src/components/AIBrief.tsx` | 🔴 | `/api/ai-brief` | `ANTHROPIC_API_KEY`, all other routes (it summarises them) | Upstream — `ANTHROPIC_API_KEY` is not in `.env.local`; route returns empty | Set `ANTHROPIC_API_KEY`. Confirm input pipeline isn't summarising mock data (TODO.md flags this). |
| ActivityCharts | `src/components/ActivityCharts.tsx` | ⚠️ | `/api/mentions`, `/api/parliament?type=votes`, `/api/hansard?type=speeches`, `/api/hansard?type=questions` | Mentions data + Parliament/Hansard | Mixed — mentions empty (no `X_BEARER_TOKEN` / `APIFY_API_TOKEN`); Parliament/Hansard work | Set Apify or X token; otherwise the mentions chart is flat. |
| CQCPanel | `src/components/CQCPanel.tsx` | 🟡 | `/api/cqc` | `CQC_PARTNER_CODE` (referenced in route via `PARTNER_CODE`); falls back to a hardcoded list of 12 Braintree facilities when missing | Upstream fallback | Confirm the static fallback list is acceptable, or obtain CQC partner code. |
| CommonsLibraryPanel | `src/components/CommonsLibraryPanel.tsx` | ⚠️ | `/api/commons-library` | NOMIS (no key) + Members API (no key) | Upstream — works but pulls from open APIs only; uses 2021 census fallback section | Verify section coverage matches what real Commons Library briefs include. |
| ConstituencyMap | `src/components/ConstituencyMap.tsx` | ✅ | `/api/electoral-calculus`, `/api/fixmystreet`, `/api/crime`, `/api/planning`, `/api/worship`, `/api/floods`, `/api/census`, `/api/petitions`, `/api/air-quality` | All map layer routes + 2 GeoJSON files in `/public/geojson/` | Working | Layers depend on individual route health — see route table. |
| ConstituencyProfile | `src/components/ConstituencyProfile.tsx` | ✅ | none (static) | `src/data/braintree.ts` | n/a | Static; locked to Braintree by import path. |
| Demographics | `src/components/Demographics.tsx` | ✅ | none (static) | `src/data/braintree.ts` (`demographics`, `wardDemographics`) | n/a | Static; locked to Braintree. |
| ECPrediction | `src/components/ECPrediction.tsx` | ✅ | `/api/electoral-calculus?type=seat&seat=Braintree` | Electoral Calculus scrape | Working | `seat=Braintree` is hardcoded in the fetch URL. |
| EPCPanel | `src/components/EPCPanel.tsx` | 🔴 | `/api/epc` | `EPC_API_KEY`, `EPC_EMAIL` | Upstream — neither key in `.env.local`; route returns 401-style empty | Register at gov.uk EPC service; set both env vars. |
| ElectionResults | `src/components/ElectionResults.tsx` | ✅ | none (static) | `src/data/braintree.ts` (`electionResults2024`) | n/a | Static; locked to Braintree. |
| ElectoralIntel | `src/components/ElectoralIntel.tsx` | ✅ | `/api/electoral-calculus?type=seat&seat=Braintree` | Electoral Calculus scrape | Working | `seat=Braintree` hardcoded. |
| EmploymentPanel | `src/components/EmploymentPanel.tsx` | ✅ | `/api/employment` | NOMIS (no key) | Working | None known. |
| FixMyStreet | `src/components/FixMyStreet.tsx` | ✅ | `/api/fixmystreet` | FixMyStreet public API | Working | None known. |
| HansardFeed | `src/components/HansardFeed.tsx` | ✅ | `/api/hansard?type=speeches`, `/api/hansard?type=questions` | Members API (no key) | Working | None known. |
| Header | `src/components/Header.tsx` | ✅ | none | static "Braintree · James Cleverly" string | n/a | Hardcoded constituency name and MP. |
| Headlines | `src/components/Headlines.tsx` | ✅ | `/api/headlines` | BBC/Sky/Guardian/Telegraph/GB News RSS feeds | Working | National-only — not constituency-specific. |
| HealthPanel | `src/components/HealthPanel.tsx` | ⚠️ | `/api/health` | OHID Fingertips API (no key) | Upstream — route comment notes "as of early 2026, Fingertips data endpoints have changed"; uses fallback | Verify what the panel actually renders — code says fallback path is hit. |
| HousePricesPanel | `src/components/HousePricesPanel.tsx` | ✅ | `/api/house-prices` | Land Registry public API | Working | None known. |
| LiveFeeds | `src/components/LiveFeeds.tsx` | ⚠️ | none (static iframe URLs) | YouTube embed video IDs (hardcoded in component) | n/a | Of 5 channels: **Sky News + GB News embed**; **BBC News, BBC Parliament, Times Radio fall back to "Watch Live" buttons**. Times Radio's `youtubeVideoId` is `""` (placeholder per commit `7697d0a`). The user's note that Times Radio works does not match the current code. |
| MentionsFeed | `src/components/MentionsFeed.tsx` | 🔴 | `/api/mentions` | `X_BEARER_TOKEN` or `APIFY_API_TOKEN` | Upstream — neither token in `.env.local`; route returns no mentions | Add one of the two tokens. |
| NewsFeed | `src/components/NewsFeed.tsx` | 🟡 | `/api/news` | RSS feeds (Google News + Braintree & Witham Times) | Component falls back to **inline mock data** (`getMockNews()`) on fetch failure with banner "showing sample data" | Confirm the route resolves before pilot demo; or remove the mock fallback. |
| OppositionTracker | `src/components/OppositionTracker.tsx` | ⚠️ | `/api/opposition` | `APIFY_API_TOKEN` | Upstream — without Apify, route returns real 2024 candidate names + vote shares but **zero recent posts** (`source: "candidates_only"`) | Add `APIFY_API_TOKEN` for live posts; otherwise it's just a static list. |
| Panel | `src/components/Panel.tsx` | n/a | none | wrapper / layout | n/a | Layout only. |
| ParliamentBills | `src/components/ParliamentBills.tsx` | ✅ | `/api/parliament?type=votes` | Members API (no key) | Working | None known. |
| PetitionsPanel | `src/components/PetitionsPanel.tsx` | ✅ | `/api/petitions` | gov.uk e-petitions JSON (no key) | Working | None known. |
| PollingDashboard | `src/components/PollingDashboard.tsx` | ✅ | `/api/polling?type=all`, `/api/electoral-calculus?type=both&seat=Braintree` | Polling aggregator + Electoral Calculus | Working | `seat=Braintree` hardcoded; component also uses `BRAINTREE_2024` baseline for swing math. |
| SchoolsPanel | `src/components/SchoolsPanel.tsx` | 🟡 | `/api/schools` | None (route uses a **hardcoded list of ~18 schools** with lat/lng/URN) | Route returns the hardcoded list filtered by `isInsideConstituency` | This is hand-curated data, not a live source. Acceptable for demo, not for scale. |
| TrendsPanel | `src/components/TrendsPanel.tsx` | 🔴 | `/api/trends` (SerpAPI route) | `SERPAPI_KEY` | Upstream — `SERPAPI_KEY` not in `.env.local`; route returns `source: "unavailable"`, empty arrays | Set `SERPAPI_KEY` (paid) **OR** rewire panel to `/api/trends-v2` and accept partial coverage. |
| UniversalCreditPanel | `src/components/UniversalCreditPanel.tsx` | ✅ | `/api/universal-credit` | NOMIS / DWP Stat-Xplore (no key required for the NOMIS endpoints used) | Working | None known. |
| WardDataHub | `src/components/WardDataHub.tsx` | ✅ | none (static) | `src/data/braintree.ts` | n/a | Static; locked to Braintree. |
| WardTable | `src/components/WardTable.tsx` | ✅ | none (static) | `src/data/braintree.ts` (`wardData`) | n/a | Static; locked to Braintree. |

**Cross-reference gap:** `/api/trends-v2` exists and partially works, but **no component fetches it**. `TrendsPanel.tsx` is still wired to `/api/trends` (paid SerpAPI). This is the explicit "frontend not wired to a working route" gap the user emphasised.

---

## 2. API routes audit

One row per `route.ts` under `src/app/api/`. "Cache" = uses Firestore cache-then-refresh pattern.

| Route | State | Env vars (`process.env.*`) | Cache | Consumer(s) |
|---|---|---|---|---|
| `/api/ai-brief` | 🔴 | `ANTHROPIC_API_KEY` | yes | `AIBrief.tsx` |
| `/api/air-quality` | ✅ | none | yes | `ConstituencyMap.tsx` |
| `/api/census` | ✅ | none | yes | `ConstituencyMap.tsx` |
| `/api/commons-library` | ⚠️ | none | yes | `CommonsLibraryPanel.tsx` |
| `/api/cqc` | 🟡 | none in code, but `PARTNER_CODE` constant is referenced; falls back to a hardcoded 12-facility list | yes | `CQCPanel.tsx` |
| `/api/crime` | ✅ | none | yes | `ConstituencyMap.tsx` |
| `/api/electoral-calculus` | ✅ | none (HTML scrape) | yes | `ConstituencyMap.tsx`, `ECPrediction.tsx`, `ElectoralIntel.tsx`, `PollingDashboard.tsx` |
| `/api/employment` | ✅ | none | yes | `EmploymentPanel.tsx` |
| `/api/epc` | 🔴 | `EPC_API_KEY`, `EPC_EMAIL` | no | `EPCPanel.tsx` |
| `/api/fixmystreet` | ✅ | none | yes | `FixMyStreet.tsx`, `ConstituencyMap.tsx` |
| `/api/floods` | ✅ | none | yes | `ConstituencyMap.tsx` |
| `/api/hansard` | ✅ | none | no | `HansardFeed.tsx`, `ActivityCharts.tsx` |
| `/api/headlines` | ✅ | none | no | `Headlines.tsx` |
| `/api/health` | ⚠️ | none | yes | `HealthPanel.tsx` |
| `/api/house-prices` | ✅ | none | yes | `HousePricesPanel.tsx` |
| `/api/mentions` | 🔴 | `X_BEARER_TOKEN`, `APIFY_API_TOKEN` | no | `MentionsFeed.tsx`, `ActivityCharts.tsx` |
| `/api/news` | ✅ | none | no | `NewsFeed.tsx` |
| `/api/opposition` | ⚠️ | `APIFY_API_TOKEN` | no | `OppositionTracker.tsx` |
| `/api/parliament` | ✅ | none | no | `ParliamentBills.tsx`, `ActivityCharts.tsx` |
| `/api/petitions` | ✅ | none | no | `PetitionsPanel.tsx`, `ConstituencyMap.tsx` |
| `/api/planning` | ✅ | none | yes | `ConstituencyMap.tsx` |
| `/api/polling` | ✅ | none | no | `PollingDashboard.tsx` |
| `/api/schools` | 🟡 | none | yes | `SchoolsPanel.tsx`, ConstituencyMap (indirectly via static) |
| `/api/trends` | 🔴 | `SERPAPI_KEY` | no | `TrendsPanel.tsx` |
| `/api/trends-v2` | ⚠️ | none (uses free `google-trends-api` package) | yes | **none — no consumer yet** |
| `/api/universal-credit` | ✅ | none | yes | `UniversalCreditPanel.tsx` |
| `/api/worship` | ✅ | none (Overpass API) | no | `ConstituencyMap.tsx` |

**Caching split:** 14 routes use the Firestore cache-then-refresh pattern (`ai-brief`, `air-quality`, `census`, `commons-library`, `cqc`, `crime`, `electoral-calculus`, `employment`, `fixmystreet`, `floods`, `health`, `house-prices`, `planning`, `schools`, `trends-v2`, `universal-credit` — actually 16). 11 routes do not (`epc`, `hansard`, `headlines`, `mentions`, `news`, `opposition`, `parliament`, `petitions`, `polling`, `trends`, `worship`). README says "13 cached"; actual count is **16 cached / 11 uncached** of 27 routes.

---

## 3. Environment variable status

`.env.local` exists (path: `/Users/zojaprzywrzej/ground-game-ai-public/.env.local`).

Keys present (from `grep -E "^[A-Z_]+=" .env.local | cut -d= -f1`):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
```

Cross-reference against every `process.env.*` reference in source:

| Env var | Referenced in | Set in `.env.local`? | Effect when missing |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | `src/app/api/ai-brief/route.ts:246` | ❌ no | AI Brief panel renders empty / error path |
| `APIFY_API_TOKEN` | `src/app/api/mentions/route.ts:137`, `src/app/api/opposition/route.ts:93` | ❌ no | Mentions empty; Opposition shows candidates without posts |
| `EPC_API_KEY` | `src/app/api/epc/route.ts:67` | ❌ no | EPC panel returns no buildings |
| `EPC_EMAIL` | `src/app/api/epc/route.ts:68` | ❌ no | EPC panel returns no buildings |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `src/lib/firebase.ts:5` | ✅ yes | — |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `src/lib/firebase.ts:10` | ✅ yes | — |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `src/lib/firebase.ts:6` | ✅ yes | — |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | `src/lib/firebase.ts:11` | ✅ yes | — |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `src/lib/firebase.ts:9` | ✅ yes | — |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `src/lib/firebase.ts:7` | ✅ yes | — |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `src/lib/firebase.ts:8` | ✅ yes | — |
| `SERPAPI_KEY` | `src/app/api/trends/route.ts:16` | ❌ no | Trends panel renders empty unavailable state |
| `X_BEARER_TOKEN` | `src/app/api/mentions/route.ts:28,35,96` | ❌ no | Falls through to Apify path; if that's also missing, mentions empty |

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present in `.env.local` but **not referenced by any source file** — appear to be dead config.

---

## 4. Summary

### Panel state breakdown (31 components, 27 are panels — `Panel.tsx` and `Header.tsx` are layout, leaves 29 data panels)

- ✅ working with real data: **17** (ConstituencyMap, ConstituencyProfile, Demographics, ECPrediction, ElectionResults, ElectoralIntel, EmploymentPanel, FixMyStreet, HansardFeed, Headlines, HousePricesPanel, ParliamentBills, PetitionsPanel, PollingDashboard, UniversalCreditPanel, WardDataHub, WardTable)
- ⚠️ partial: **5** (ActivityCharts, CommonsLibraryPanel, HealthPanel, LiveFeeds, OppositionTracker)
- 🔴 broken / empty: **5** (AIBrief, EPCPanel, MentionsFeed, TrendsPanel)  → **4 actually**
- 🟡 mock / fallback / placeholder: **3** (CQCPanel, NewsFeed, SchoolsPanel)

(NewsFeed shows a yellow banner saying "showing sample data" when its route fails — it's 🟡, not 🔴.)

### Route state breakdown (27 routes)

- ✅ working: **17**
- ⚠️ partial: **5** (`commons-library`, `health`, `opposition`, `trends-v2`, plus implicitly `headlines` is fine)  → 4 partial
- 🔴 broken / requires missing key: **4** (`ai-brief`, `epc`, `mentions`, `trends`)
- 🟡 fallback to hardcoded data: **2** (`cqc`, `schools`)

### Blockers

#### (a) Things the user can do today
- Decide whether to set `SERPAPI_KEY` or rewire `TrendsPanel.tsx` to `/api/trends-v2` (the new route has no consumer).
- Set `EPC_API_KEY` + `EPC_EMAIL` after registering at https://epc.opendatacommunities.org (free, instant).
- Set `ANTHROPIC_API_KEY` in `.env.local` and Vercel.
- Replace Times Radio `youtubeVideoId: ""` placeholder with a working ID, or change BBC News / BBC Parliament tabs to clearly indicate they are link-out (not embed).
- Remove the `getMockNews()` fallback from `NewsFeed.tsx` (or accept it as graceful degradation).
- Run the "Mock data audit" item from `TODO.md`.

#### (b) Multi-day work
- Fix `/api/trends-v2` `dailyTrends` and `interestByRegion` (5-year-stale package, Google's endpoints changed — TODO.md option (a) "find or fork a maintained alternative").
- Constituency-config refactor (see section 5 — it's a large surface).
- Verify Fingertips API rewrite for `/api/health`; the route comment says endpoints have changed.
- Add Firestore caching to the 11 routes that lack it, if pilot load justifies it.

#### (c) Needs decision / budget from someone else
- **SerpAPI vs free Google Trends**: keep paying for `/api/trends` or commit to the free `/api/trends-v2` path (TODO.md flags this as the tech-lead conversation).
- **Apify token**: needed for `MentionsFeed` and `OppositionTracker` to show live social posts. Has a cost.
- **X (Twitter) Bearer Token** as cheaper alternative to Apify — needs API access tier approval.
- **CQC partner code**: official `data.cqc.org.uk` API requires a partnership application; current 12-facility hardcoded list is the workaround.

---

## 5. Architectural risks — constituency-hardcoding sprawl

Every file under `src/app/api/` listed below. "Hardcoded values" = constituency-specific literals embedded in the route. "Need to change for second constituency?" assumes the user wants to add e.g. Witham or any non-Braintree seat.

| Route | Hardcoded values | Change for new constituency? |
|---|---|---|
| `/api/ai-brief` | `cacheDoc(db, "ai_brief_cache", "braintree")`; system prompt strings `"James Cleverly (Conservative)"`, `"Braintree"` baked into prompt template (lines 16, 127) | **yes** — cache key + prompt template |
| `/api/air-quality` | `CENTER_LAT = 51.974`, `CENTER_LNG = 0.535`; cache key `"braintree"`; static fallback list of 3 stations with hardcoded lat/lng | **yes** — coords + fallback |
| `/api/census` | Static list of 28 ward codes (Braintree District + 2 Uttlesford wards); cache doc `census_cache/braintree-${topic}` | **yes** — entire ward list |
| `/api/commons-library` | `ONS_CODE = "E14001121"`, `NOMIS_CODE = "721420347"`, cache `"braintree"`; multiple `"80,100"` (population) and other hardcoded fallback rows | **yes** — every code + fallback table |
| `/api/cqc` | `POSTCODES = ["CM7", "CM77", "CO9"]`; cache `"braintree"`; hardcoded fallback list of 12 named facilities | **yes** — postcodes + fallback |
| `/api/crime` | cache `"braintree"`; relies on `isInsideConstituency()` from `src/lib/geo.ts` (hardcoded boundary at GeoJSON 51.829–52.087, 0.308–0.782) | **yes** — boundary lib |
| `/api/electoral-calculus` | accepts `seat` query param (default `"Braintree"`) — partly parameterised | partly — caller must pass slug |
| `/api/employment` | `BRAINTREE_GEO = "1820328091"`; cache `"braintree"`; lots of `braintree`-named locals (cosmetic) | **yes** — NOMIS code |
| `/api/epc` | `POSTCODES = ["CM7", "CM77", "CO9"]` | **yes** |
| `/api/fixmystreet` | cache `"braintree"`; bounding box constants (lng 0.308–0.782, lat 51.829–52.087); `isInsideConstituency()` | **yes** |
| `/api/floods` | `CENTER_LAT = 51.96`, `CENTER_LNG = 0.55`, cache `"braintree"`; `isInsideConstituency()` | **yes** |
| `/api/hansard` | `MP_ID = 4366`, `TWFY_PERSON_ID = 11816`; speaker name `"James Cleverly"` in two fallback objects; URL slug `james_cleverly/braintree` | **yes** |
| `/api/headlines` | none — national feeds only | no |
| `/api/health` | `BRAINTREE_DISTRICT = "E07000067"`; cache `"braintree"`; many `braintreeData` / `braintreePoint` local var names (cosmetic) | **yes** — district code |
| `/api/house-prices` | cache `"braintree"`; URL `propertyAddress.district=BRAINTREE`; URL `?name=Braintree` | **yes** |
| `/api/mentions` | `MP_NAME = "James Cleverly"`, `MP_HANDLE = "JamesCleverly"` | **yes** |
| `/api/news` | RSS feeds: `"Google News - Cleverly"` query `James+Cleverly`; `"Braintree & Witham Times"` feed URL | **yes** — full feed list |
| `/api/opposition` | Hardcoded `CANDIDATES` array of 4 named 2024 candidates with vote shares + handles | **yes** — entire candidate set |
| `/api/parliament` | `MP_ID = 4366` | **yes** |
| `/api/petitions` | `ONS_CODE = "E14001121"` | **yes** |
| `/api/planning` | cache `"braintree"`; uses `isInsideConstituency()` | **yes** |
| `/api/polling` | none constituency-specific | no |
| `/api/schools` | Hardcoded array of ~18 named Braintree schools with lat/lng/address/URN; cache `"braintree"` | **yes** — entire data table |
| `/api/trends` | comparison terms `["James Cleverly", ...]`, local terms `["Braintree Essex", "Braintree council"]`, related-query seed `"Braintree+Essex"` | **yes** |
| `/api/trends-v2` | `CONSTITUENCY_SLUG = "braintree"` (single declared constant — only route in tree that does this); reads everything else from `getFullData(slug)` | **partial — already abstracted via data layer**; one constant to flip |
| `/api/universal-credit` | `CONSTITUENCY_CODE = "721420347"`; cache `"braintree"` | **yes** |
| `/api/worship` | bounding box comment 51.829–52.087, 0.308–0.782; uses `isInsideConstituency()` | **yes** — boundary lib |

**Plus** `src/lib/geo.ts` (`isInsideConstituency` — point-in-polygon against a single hardcoded GeoJSON), `src/data/braintree.ts` (entire data file scoped to one constituency), `src/data/braintree-boundary.ts`, `public/geojson/braintree-constituency.geojson`, `public/geojson/braintree-wards.geojson`, plus `Header.tsx` (`Braintree · James Cleverly (Con)`), `ConstituencyMap.tsx` (GeoJSON paths), `PollingDashboard.tsx` (`BRAINTREE_2024` swing baseline), `HansardFeed.tsx` (TWFY URL slug), `ConstituencyMap.tsx` (Essex Police crime-map URL).

**Scale of refactor:** 24 of 27 API routes contain hardcoded constituency values. Only `/api/headlines`, `/api/polling`, and (partly) `/api/electoral-calculus` would not need code changes for a second constituency. `/api/trends-v2` is the only route currently consuming `getFullData(slug)` from `src/data/index.ts`.

The data layer at `src/data/index.ts` (`CONSTITUENCIES`, `MP_DATA`, `CONSTITUENCY_GEO`, `CONSTITUENCY_AREAS`, `CANDIDATES_2024`, `NEWS_FEEDS`, all keyed by ONS code or slug) **exists and is the intended target** for the refactor — it just hasn't been consumed by anything except `/api/trends-v2`.

`TODO.md` already parks this as "Constituency config refactor" under Strategic / bigger.

---
