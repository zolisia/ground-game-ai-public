# Refactor Audit — `ground-game-ai-public`

Date: 2026-05-11
Branch: `zoja/dev`
Scope: line-by-line refactor instruction sheet for moving 27 API routes + supporting components from hardcoded-Braintree to slug-driven multi-constituency, consuming `getFullData(slug)` from `src/data/index.ts`.

Prior audits (read first, this builds on them, does not duplicate):
- `MVP_STATUS.md` §5 — file-level hardcoding inventory.
- `ROLLOUT_READINESS.md` §1.2 — literals-per-route table; §2 — cache keys; §5 — data-layer state.

This document differs by: **per-route line numbers, exact code snippets, exact `getFullData()` replacements, per-route time estimates, and priority ordering.** The intended reader is the engineer who will start tomorrow.

---

## Section 1 — Route-by-route breakdown

#### /api/ai-brief

**Hardcoded values:**
- Line 10: `const cacheDoc = doc(db, "ai_brief_cache", "braintree");` — would become `const cacheDoc = doc(db, "ai_brief_cache", slug);` (after moving inside `GET` handler, because `slug` is request-scoped).
- Line 12: `` `# Constituency Intelligence Brief — Braintree` `` (in `PLACEHOLDER_BRIEF` template literal) — would become `` `# Constituency Intelligence Brief — ${fullData.constituency.name}` ``.
- Line 16: `**MP:** James Cleverly (Conservative)` — would become `**MP:** ${fullData.mp?.name ?? fullData.constituency.mp} (${fullData.constituency.party})`.
- Line 126: `Constituency: Braintree` (inside `buildPrompt`) — would become `Constituency: ${ctx.name}` where `ctx` is threaded into `buildPrompt`.
- Line 127: `MP: James Cleverly (Conservative)` — same as above.
- Line 153: `# Daily Constituency Intelligence Brief — Braintree` (inside the instructions block) — would become `# Daily Constituency Intelligence Brief — ${ctx.name}`.
- Line 50–53 (`endpoints` array): inner-fetch URLs `/api/news`, `/api/crime`, `/api/parliament?type=votes`, `/api/fixmystreet` — would become slug-aware `/api/news?slug=${slug}` etc. once those routes accept the slug param.

**Dynamic data fetched:**
- Anthropic Messages API (`https://api.anthropic.com/v1/messages`, Haiku 4.5): summarises four internal route results; the *constituency identity* is in the prompt template only, not in any outbound parameter.
- Internal fan-out to `/api/news`, `/api/crime`, `/api/parliament?type=votes`, `/api/fixmystreet` — each must already be slug-aware before AI Brief can be considered multi-constituency.

**Data layer needs:**
- `constituency.name` (`src/data/constituencies.ts` ✓)
- `constituency.party` (`src/data/constituencies.ts` ✓)
- `mp.name` (`src/data/mp-data.ts` ✓) — preferred over `constituency.mp` because `mp-data.ts` strips honorifics inconsistently; use `mp?.name ?? constituency.mp`.

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: Firestore cache-then-refresh (TTL 30 min, line 8). Background refresh on stale-hit (line 257).

**Refactor effort:**
- Medium
- Estimated time: 60 minutes (route is large but the literals are all in two functions: `buildPrompt`, and the placeholder template).

**Changes needed:**
1. Add `import { getFullData } from "@/data";` (top of file).
2. In `GET` handler (line 245): read `slug` from `searchParams`, default `"braintree"`; call `getFullData(slug)`; 404 if missing.
3. Move `cacheDoc` (line 10) from module scope into `GET` handler so it can be `doc(db, "ai_brief_cache", slug)`; pass to `fetchAndUpdateCache` as a parameter.
4. Thread `{name, mpDisplay, party}` (derived from full data) into `buildPrompt` (line 115) and replace literals on lines 126, 127, 153.
5. Replace `PLACEHOLDER_BRIEF` (lines 12–32) with a function that takes `{name, mpDisplay, party}` and returns the templated string (the placeholder must be evaluated per-request, not at module load).
6. Fan-out fetches (lines 49–53): append `?slug=${slug}` once those routes are refactored. Pre-refactor, this still returns Braintree data — flag in a comment.

---

#### /api/air-quality

**Hardcoded values:**
- Line 13: `const CENTER_LAT = 51.974;` — would become `const { lat: CENTER_LAT } = fullData.geo!;` (with null-check / fallback).
- Line 14: `const CENTER_LNG = 0.535;` — would become `const { lng: CENTER_LNG } = fullData.geo!;`.
- Lines 110–142 (`getFallbackData` function): hardcoded 3-station fallback list ("Chelmsford", "Colchester", "Southend-on-Sea") with Essex-only lat/lng — would become slug-aware fallback **or** removed (returning empty `stations: []` for non-Braintree is acceptable since OpenAQ paywall is the real blocker).

**Dynamic data fetched:**
- OpenAQ v3 `/v3/locations` (no auth, paywall behind 401 in practice): parameters `coordinates`, `radius`, `limit`. Constituency-specific: `coordinates` (from `CENTER_LAT`/`CENTER_LNG`).

**Data layer needs:**
- `geo.lat`, `geo.lng` (`src/data/constituency-geo.ts` ✓ — present for 543 English constituencies; **missing for Scotland/Wales/NI**).

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree (cache key NOT in this file — uses Next.js `revalidate: 1800`, line 36)
- Cache layer: Next.js revalidate 30 min (no Firestore).

**Refactor effort:**
- Easy
- Estimated time: 15 minutes.

**Changes needed:**
1. Read `slug` from request searchParams in `GET` (line 31); call `getFullData(slug)`; resolve `lat`/`lng` from `geo`.
2. Move `CENTER_LAT`/`CENTER_LNG` (lines 13–14) from module scope into the request handler.
3. Either delete `getFallbackData()` (lines 108–147) or parameterise it by `slug` (returning empty array when slug ≠ braintree is fine — the function comment says "DEFRA AURN monitoring network near Braintree" which is misleading at scale).

---

#### /api/census

**Hardcoded values:**
- Line 17–27: `const WARD_CODES = [...28 hardcoded ward codes...]` (26 Braintree District + 2 Uttlesford). Would become `const WARD_CODES = fullData.areas?.wards.map(w => w.code) ?? [];`.
- Line 326: `` const cacheDocRef = doc(db, "census_cache", `braintree-${topicId}`); `` — would become `` doc(db, "census_cache", `${slug}-${topicId}`) ``.

**Dynamic data fetched:**
- ONS Beta API `/v1/population-types/{UR|HH}/census-observations` per ward code per topic. Constituency-specific: `WARD_CODES` array (28 entries → could be larger/smaller for other seats).

**Data layer needs:**
- `areas.wards[].code` (`src/data/constituency-areas.ts` ✓ — present for 543 English constituencies; **missing for Scotland/Wales/NI**).

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: Firestore cache-then-refresh (TTL 7 days, line 11). One doc per topic (12 topics).

**Refactor effort:**
- Easy
- Estimated time: 20 minutes.

**Changes needed:**
1. Move the `WARD_CODES` definition (lines 17–27) inside `GET` so it can be derived from `getFullData(slug).areas.wards`.
2. Replace cache doc key (line 326) with `` `${slug}-${topicId}` ``.
3. 404 if `fullData.areas` is missing (the 543-vs-650 coverage gap will bite on Scottish seats).
4. Note: the static topics list (lines 42–141) is constituency-neutral — leave it alone.

---

#### /api/commons-library

**Hardcoded values:**
- Line 14: `const cacheDoc = doc(db, "commons_library_cache", "braintree");` — `doc(db, "commons_library_cache", slug)` (move inside handler).
- Line 16: `const CONSTITUENCY = "Braintree";` — `const CONSTITUENCY = fullData.constituency.name;`.
- Line 17: `const ONS_CODE = "E14001121";` — `const ONS_CODE = fullData.constituency.onsCode;`.
- Line 20: `const NOMIS_CODE = "721420347";` — needs `nomisConstituencyCode`. **Not currently in the data layer** (`constituency-areas.ts` has per-LAD `nomisCode` but not per-constituency `wpca24` code). Either: (a) add a top-level `nomisCode` field to `Constituency`; (b) derive from a NOMIS lookup endpoint at runtime.
- Lines 152–225 (`getStaticProfile`): entire Braintree-specific demographic comparison table (28 rows: population, housing, economy, education, health, deprivation, transport). All hardcoded values like `"80,100"`, `"77,781"`, `"£345,000"`, `"456th (less deprived)"`. **No single replacement** — this static profile data does not exist in the data layer at all. **Blocker for refactor.**
- Line 264, 326: `` `https://commonslibrary.parliament.uk/constituency/${CONSTITUENCY.toLowerCase()}/` `` — would derive from `slug` (`fullData.constituency.slug`).

**Dynamic data fetched:**
- NOMIS `NM_17_5` (GB employment rate — not constituency-specific, line 42–44).
- NOMIS `NM_162_1` claimant count by `NOMIS_CODE` (line 64).
- NOMIS `NM_2010_1` population by `NOMIS_CODE` (line 91).
- Parliament Members API search by `Constituency=${CONSTITUENCY}` (line 120).

**Data layer needs:**
- `constituency.name`, `constituency.onsCode` ✓
- **Missing**: per-constituency NOMIS code (`wpca24` 7xxxxxxxx). The `constituency-areas.ts` has `nomisCode` on LADs but not on the constituency itself. Either add it as a 650-element lookup, or use ONS code via the NOMIS API geography lookup.
- **Missing**: the static demographic profile (lines 152–225). This is hand-curated; cloning it for 650 constituencies needs a data ingestion pipeline (Commons Library has CSV exports — feasible but not trivial).

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: Firestore cache-then-refresh (TTL 24 h, line 13).

**Refactor effort:**
- Hard
- Estimated time: 4 hours (mostly: deciding what to do with `getStaticProfile`; 30 min to plumb `slug` + 3.5 h to either remove the static profile or rebuild it as a per-constituency lookup table).

**Changes needed:**
1. Add `import { getFullData } from "@/data";`.
2. In `GET` (line 289), accept `slug` query param.
3. Replace `CONSTITUENCY`, `ONS_CODE` (lines 16–17) with derived values; thread through `generateFreshData`, `fetchNomisReport`, `fetchParliamentData`.
4. Add `nomisCode` to `Constituency` interface in `src/data/constituencies.ts` and populate it (or derive at runtime).
5. **Architectural decision needed:** what to do with `getStaticProfile`. Three options:
   - (a) Delete it — accept fewer rows on the panel for non-Braintree seats.
   - (b) Build a per-constituency static profile table (`src/data/commons-library-profiles.ts`) — sourced from Commons Library CSV exports.
   - (c) Move all numeric values to come from NOMIS + ONS APIs at runtime (eliminating static data) — most robust, most work.

---

#### /api/cqc

**Hardcoded values:**
- Line 13: `const cacheDoc = doc(db, "cqc_cache", "braintree");` — move into handler with `slug`.
- Line 19: `const POSTCODES = ["CM7", "CM77", "CO9"];` — would become a per-constituency postcode list. **Not in data layer**. Options: (a) add `postcodes: string[]` to `ConstituencyAreas` (would need sourcing); (b) derive postcodes from a postcode-to-ONS lookup (e.g., `postcodes.io`); (c) use `geo.bbox` + a postcode-by-bbox API.
- Lines 220–252 (`getFallbackData`): hardcoded list of 12 Braintree-area care facilities. Constituency-specific. Would become empty fallback or removed.

**Dynamic data fetched:**
- CQC public API `/locations?postalCode=${pc}` (per postcode) + `/locations/${id}` (detail per facility). Constituency-specific: `POSTCODES`.

**Data layer needs:**
- **Missing**: postcode list per constituency (`postcodes: string[]`). Block for refactor.

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: Firestore cache-then-refresh (TTL 24 h, line 12).

**Refactor effort:**
- Hard
- Estimated time: 3 hours (mostly: sourcing/generating postcode lists for 650 constituencies; 30 min for the route changes themselves).

**Changes needed:**
1. Accept `slug` in `GET` (line 194).
2. Resolve `POSTCODES` from `getFullData(slug).areas.postcodes` — but **add `postcodes` field to `ConstituencyAreas` first** (currently absent).
3. Move `cacheDoc` (line 13) into handler.
4. Replace `getFallbackData` (line 220) with empty list or per-slug lookup.
5. **Missing-data work**: build a postcode-to-constituency lookup — postcodes.io has `/postcodes/{postcode}` with `parliamentary_constituency`. Could pre-populate `postcodes-by-constituency.ts`. Roughly 1.7M UK postcodes; alternative is to query an existing dataset (e.g. ONS Postcode Directory).

---

#### /api/crime

**Hardcoded values:**
- Line 14: `const cacheDoc = doc(db, "crime_cache", "braintree");` — move into handler.
- Line 11: comment `"Uses multiple sample points across Braintree constituency for full coverage"` (cosmetic; update or remove).
- Line 45: comment `// Actual GeoJSON boundary extent: lat 51.829–52.087, lng 0.308–0.782` (cosmetic).
- Lines 47–92: `const SAMPLE_POINTS = [...32 hardcoded lat/lng pairs...]` — would become derived from `geo.bbox` (generate a grid of points covering the bbox). Or, ideally, sample from `areas.wards` centroids. **Lat/lng of each ward is not currently in the data layer.**
- Line 167: `isInsideConstituency(lng, lat)` — calls `src/lib/geo.ts` which loads Braintree GeoJSON from disk (`src/lib/geo.ts:12`). Must be refactored to accept the constituency ONS code and load from `public/geojson/constituencies-all.geojson` (already on disk, 21 MB, all-650).

**Dynamic data fetched:**
- data.police.uk `/api/crimes-street/all-crime?lat=&lng=&date=` per sample point. Constituency-specific: each point's lat/lng + the polygon used for `isInsideConstituency()` filtering.

**Data layer needs:**
- `geo.bbox` ✓ (for grid generation).
- A polygon for `isInsideConstituency()` — needs `src/lib/geo.ts` rewrite (see §5).
- Optionally: per-ward centroid coordinates (not present today; would need adding).

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: Firestore cache-then-refresh (TTL 15 min, line 13). **Aggressive TTL** — see `ROLLOUT_READINESS.md` §4.2.

**Refactor effort:**
- Hard
- Estimated time: 3 hours (1 h to rewrite `src/lib/geo.ts`; 1 h to generate sample points from bbox; 1 h testing across pilot seats).

**Changes needed:**
1. Accept `slug` query param in `GET` (line 225).
2. Replace `SAMPLE_POINTS` (lines 47–92) with a runtime-generated grid from `geo.bbox`. Suggested algorithm: 5×5 = 25 evenly-spaced lat/lng points; data.police.uk returns ~1 mile radius so 25 points covers ~75 km² which is adequate for any UK constituency.
3. Move `cacheDoc` (line 14) into handler.
4. Rewrite `src/lib/geo.ts:isInsideConstituency()` to take `(lng, lat, onsCode)` and load polygon from `public/geojson/constituencies-all.geojson` filtered by `properties.PCON24CD === onsCode` (or use the simplification: load once at startup into a `Map<onsCode, Polygon>`).
5. Update line 167 call to pass `onsCode`.

---

#### /api/electoral-calculus

**Hardcoded values:**
- Line 68: `const seat = searchParams.get("seat") || "Braintree";` — **already accepts a `seat` query parameter** (only constituency-aware route in the codebase besides `/api/trends-v2`). Default of `"Braintree"` is the only literal. Change to `|| "braintree"` and pass `fullData.constituency.name` from consumers, OR accept `slug` and derive `name`.

**Dynamic data fetched:**
- Electoral Calculus `/prediction_main.html` (national, no constituency input).
- Electoral Calculus `/fcgi-bin/seatdetails.py?seat=${name}` (line 282). Constituency-specific: `seat` URL param — caller drives.

**Data layer needs:**
- `constituency.name` ✓ (for the EC seat name parameter).

**Current state:**
- ⚠️ Partial — already parameterised by request query, but default is hardcoded; consumers (`ECPrediction.tsx`, `ElectoralIntel.tsx`, `ConstituencyMap.tsx`, `PollingDashboard.tsx`) all pass literal `seat=Braintree`.
- Cache layer: no Firestore cache (uses Next.js `revalidate: 43200` line 97 and `86400` line 284).

**Refactor effort:**
- Easy
- Estimated time: 10 minutes for the route itself; **separate ~30 min for the 4 components** that pass `seat=Braintree` (cosmetic — see §3).

**Changes needed:**
1. Optionally accept `slug` in addition to `seat` (preferred — slug is the canonical key).
2. Update default fallback (line 68) to use the project's chosen default-seat strategy.
3. **Update the 4 consumers** to derive `seat` from `getFullData(slug).constituency.name`.

---

#### /api/employment

**Hardcoded values:**
- Line 15: `const cacheDoc = doc(db, "employment_cache", "braintree");` — move into handler.
- Line 17: `const BRAINTREE_GEO = "1820328091";` — **NOMIS LAD code for Braintree District** (not the constituency). Would become `const LAD_GEO = fullData.areas?.lads[0]?.nomisCode;`. **Issue:** constituencies that span multiple LADs (e.g. Braintree spans Braintree + Uttlesford) need to pick *one* LAD or aggregate. Current code picks one and ignores the rest.
- Line 19: `const GB_GEO = "2092957699";` — constant; **not constituency-specific** (GB-level reference). Leave as-is.
- Three URLs on lines 70, 77, 82, 92, 164 use `${BRAINTREE_GEO}` — derive from `LAD_GEO`.

**Dynamic data fetched:**
- NOMIS `NM_127_1` model-based unemployment by `geography=BRAINTREE_GEO` (lines 70, 82).
- NOMIS `NM_162_1` claimant count by `geography=BRAINTREE_GEO` (line 77).
- NOMIS `NM_162_1` previous-year claimant for trend (line 164).

**Data layer needs:**
- `areas.lads[0].nomisCode` ✓ (`src/data/constituency-areas.ts` has `nomisCode` on each LAD; spot-check confirms first entry has `nomisCode: 1778385009`).
- **Caveat**: route uses one LAD only. Multi-LAD constituencies (Braintree spans 2 LADs) get partial data. Worth a design decision: aggregate or pick the largest.

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: Firestore cache-then-refresh (TTL 24 h, line 14).

**Refactor effort:**
- Easy
- Estimated time: 20 minutes.

**Changes needed:**
1. Accept `slug` in `GET` (line 217).
2. Resolve `LAD_GEO` from `getFullData(slug).areas.lads[0].nomisCode`.
3. Move `cacheDoc` (line 15) into handler.
4. Rename `BRAINTREE_GEO` → `LAD_GEO` for clarity.
5. **Optional improvement** (out of scope of refactor): aggregate across all LADs in `areas.lads` weighted by ward count or population.

---

#### /api/epc

**Hardcoded values:**
- Line 14: `const POSTCODES = ["CM7", "CM77", "CO9"];` — same as `/api/cqc`. Blocked by missing per-constituency postcode list in data layer.

**Dynamic data fetched:**
- gov.uk EPC `/api/v1/domestic/search?postcode=${pc}` per postcode (line 46). Requires `EPC_API_KEY` + `EPC_EMAIL` (env, not constituency-driven). **Hard quota: 100 calls/day per key** — see `ROLLOUT_READINESS.md` §3.1.

**Data layer needs:**
- Per-constituency postcode list — **missing** (same as `/api/cqc`).

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree (postcodes only — env-driven for auth)
- Cache layer: none (Next.js `revalidate: 86400`, line 54).

**Refactor effort:**
- Hard
- Estimated time: 2 hours **assuming postcode list exists** (otherwise blocked on postcodes work for `/api/cqc`).

**Changes needed:**
1. Accept `slug` in `GET` (line 66).
2. Resolve `POSTCODES` from `getFullData(slug).areas.postcodes` (field to be added to `ConstituencyAreas`).
3. Cosmetic: rename `getFallbackData()` to be slug-aware (currently national fallback is fine, but tag with the slug).

---

#### /api/fixmystreet

**Hardcoded values:**
- Line 12: `const cacheDoc = doc(db, "fixmystreet_cache", "braintree");` — move into handler.
- Line 8: comment `"FixMyStreet API for Braintree constituency area"` (cosmetic).
- Line 43: comment `"Actual GeoJSON extent: lng 0.308–0.782, lat 51.829–52.087"` (cosmetic).
- Lines 45–62: `bboxes` array — 8 hardcoded bounding-box quadrants of the Braintree polygon. Would become derived from `geo.bbox` (split into 4 or 8 quadrants at runtime).
- Line 96: `isInsideConstituency(pin[1], pin[0])` — same `src/lib/geo.ts` constraint as `/api/crime`.

**Dynamic data fetched:**
- FixMyStreet `/around?ajax=1&bbox=${bbox}&status=open` per bbox (line 69). Constituency-specific: each bbox.

**Data layer needs:**
- `geo.bbox` ✓ (for bbox subdivision).
- Polygon from `src/lib/geo.ts` (needs rewrite).

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: Firestore cache-then-refresh (TTL 30 min, line 11).

**Refactor effort:**
- Medium
- Estimated time: 45 minutes (assuming `src/lib/geo.ts` rewrite is done separately).

**Changes needed:**
1. Accept `slug` in `GET` (line 137).
2. Replace `bboxes` (lines 45–62) with a runtime subdivision of `geo.bbox` into 4–8 quadrants.
3. Move `cacheDoc` (line 12) into handler.
4. Pass `onsCode` to `isInsideConstituency()` (line 96) once `src/lib/geo.ts` is refactored.

---

#### /api/floods

**Hardcoded values:**
- Line 9: `const CENTER_LAT = 51.96;` — `fullData.geo.lat`.
- Line 10: `const CENTER_LNG = 0.55;` — `fullData.geo.lng`.
- Line 11: `const RADIUS_KM = 20;` — leave as constant (could be tuned per constituency by `geo.bbox` diagonal, but 20 km is reasonable for any UK constituency).
- Line 13: `const cacheDoc = doc(db, "flood_cache", "braintree");` — move into handler.
- Line 87, 174: `isInsideConstituency(s.lng, s.lat)` — needs `src/lib/geo.ts` rewrite.

**Dynamic data fetched:**
- Environment Agency `/id/floods?lat=&long=&dist=` (line 40, 127). Constituency-specific: `CENTER_LAT`/`CENTER_LNG`.
- Environment Agency `/id/stations?lat=&long=&dist=` (line 43, 130). Same.

**Data layer needs:**
- `geo.lat`, `geo.lng` ✓.
- Polygon for `isInsideConstituency()` — needs rewrite.

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: Firestore cache-then-refresh (TTL implicit — see `getDoc` pattern; no `TTL_MS` const declared in this file, but `fetchAndUpdateCache` runs on every cache-hit, line 122).

**Refactor effort:**
- Easy
- Estimated time: 20 minutes.

**Changes needed:**
1. Accept `slug` in `GET` (line 113).
2. Resolve `CENTER_LAT`/`CENTER_LNG` from `getFullData(slug).geo`.
3. Move `cacheDoc` (line 13) into handler.
4. Pass `onsCode` to `isInsideConstituency()` calls (lines 87, 174).
5. Note: this route duplicates fetch logic in both `fetchAndUpdateCache` and `GET` — consider deduplicating during the refactor (optional).

---

#### /api/hansard

**Hardcoded values:**
- Line 7: `const MP_ID = 4366; // James Cleverly, Braintree` — `const MP_ID = fullData.constituency.memberId;`.
- Line 8: `const TWFY_PERSON_ID = 11816;` — `const TWFY_PERSON_ID = fullData.mp?.twfyPersonId;` (`mp-data.ts` has `twfyPersonId` field).
- Line 71, 75, 146: URLs `https://members-api.parliament.uk/api/Members/${MP_ID}/...` — already template-literal-driven by `MP_ID`.
- Line 109, 126: `speaker: "James Cleverly"` — `speaker: fullData.mp?.name ?? fullData.constituency.mp`.
- Line 141: `` `https://www.theyworkforyou.com/mp/${TWFY_PERSON_ID}/james_cleverly/braintree` `` — TWFY URLs follow pattern `/{personId}/{name_with_underscores}/{constituency_slug}`. Derived form: `` `${TWFY_PERSON_ID}/${fullData.mp?.name?.toLowerCase().replace(/\s+/g, "_") ?? "mp"}/${slug}` ``.

**Dynamic data fetched:**
- Members API `/Members/${MP_ID}/Voting` (line 71).
- Members API `/Members/${MP_ID}/Edms` (line 75).
- Members API `/Members/${MP_ID}/WrittenQuestions` (line 146).
- TWFY URL `/mp/${TWFY_PERSON_ID}/james_cleverly/braintree` (line 141) — link only, not fetched.

**Data layer needs:**
- `constituency.memberId` ✓.
- `mp.twfyPersonId` ✓ (`MpData` has it).
- `mp.name` ✓.
- `constituency.slug` ✓ (or derive from `name`).

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: none (Next.js `revalidate: 3600` line 72, 76, 147).

**Refactor effort:**
- Easy
- Estimated time: 25 minutes.

**Changes needed:**
1. Accept `slug` in `GET` (line 49); call `getFullData(slug)`.
2. Replace `MP_ID`, `TWFY_PERSON_ID` constants (lines 7–8) with values from `fullData`.
3. Replace `speaker: "James Cleverly"` (lines 109, 126) with derived MP name.
4. Replace TWFY URL (line 141) with derived URL.

---

#### /api/headlines

**Hardcoded values:**
- **None.** This route fetches national RSS feeds only (BBC, Sky, Guardian, Telegraph, GB News politics — lines 10–15) and briefing feeds (Politico, BBC — lines 18–21). No constituency-specific values.

**Dynamic data fetched:**
- 7 RSS feed URLs (all national).

**Data layer needs:**
- None.

**Current state:**
- ✅ Multi-constituency safe (national content, no per-constituency anything).
- Cache layer: Next.js `revalidate: 600` (line 42).

**Refactor effort:**
- N/A — no refactor needed.
- Estimated time: 0.

**Changes needed:**
- None.

---

#### /api/health

**Hardcoded values:**
- Line 17: `const cacheDoc = doc(db, "health_cache", "braintree");` — move into handler.
- Line 22: `const BRAINTREE_DISTRICT = "E07000067";` — would become `const districtCode = fullData.areas?.lads[0]?.code;` (first LAD's E07/E08 code).
- Line 23: `const ENGLAND = "E92000001";` — constant, not constituency-specific. Leave as-is.
- Line 167, 181, 233: `areaName: "Braintree"` — `areaName: fullData.constituency.name`.
- Line 168, 182, 234: `areaCode: BRAINTREE_DISTRICT` — `areaCode: districtCode`.
- Lines 292–301 (`FALLBACK_INDICATORS`): Braintree-specific health indicator values. Would become per-constituency lookup **or** removed (returning empty list for non-Braintree is acceptable).

**Dynamic data fetched:**
- PHE Fingertips `/api/latest_data/specific_indicators_for_child_areas?...&parent_area_code=${ENGLAND}&...` (line 99).
- Fingertips `/api/latest_data/by_area_code?area_code=${BRAINTREE_DISTRICT}&...` (line 121). Constituency-specific: `BRAINTREE_DISTRICT`.

**Data layer needs:**
- `areas.lads[0].code` ✓ (LAD code).
- **Missing**: per-constituency fallback health data — but route comment notes Fingertips endpoints are broken anyway, so the fallback is the live path.

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: Firestore cache-then-refresh (TTL 24 h, line 16).

**Refactor effort:**
- Medium
- Estimated time: 1 hour (mostly: deciding what to do with `FALLBACK_INDICATORS` for non-Braintree seats).

**Changes needed:**
1. Accept `slug` in `GET` (line 207).
2. Replace `BRAINTREE_DISTRICT` (line 22) with derived LAD code.
3. Replace literal `"Braintree"` strings on lines 167, 181, 233 with `fullData.constituency.name`.
4. Move `cacheDoc` (line 17) into handler.
5. **Decision**: keep `FALLBACK_INDICATORS` (lines 292–301) only for Braintree, or remove entirely (route already gracefully returns the Fingertips path when available).

---

#### /api/house-prices

**Hardcoded values:**
- Line 12: `const cacheDoc = doc(db, "house_prices_cache", "braintree");` — move into handler.
- Line 52: URL `https://landregistry.data.gov.uk/data/ukhpi/region.json?name=Braintree&_pageSize=50` — `?name=${encodeURIComponent(fullData.constituency.name)}`.
- Line 56: URL `https://landregistry.data.gov.uk/data/ppi/transaction-record.json?propertyAddress.district=BRAINTREE&...` — `propertyAddress.district=${fullData.areas?.lads[0]?.name.toUpperCase()}`. **Caveat**: Land Registry district names don't always match LAD names exactly (e.g. "Braintree" vs "BRAINTREE"); needs verification.

**Dynamic data fetched:**
- Land Registry UKHPI by region name (line 52).
- Land Registry Price Paid Index by district (line 56). Constituency-specific: `name=Braintree` and `district=BRAINTREE`.

**Data layer needs:**
- `constituency.name` ✓.
- `areas.lads[0].name` ✓ — but needs case verification against Land Registry's accepted district names.

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: Firestore cache-then-refresh (TTL 24 h, line 11).

**Refactor effort:**
- Easy
- Estimated time: 20 minutes (5 min if Land Registry accepts LAD names directly; 20 min if a name-mapping table is needed).

**Changes needed:**
1. Accept `slug` in `GET` (line 168).
2. Replace `Braintree` on line 52 with `${fullData.constituency.name}`.
3. Replace `BRAINTREE` on line 56 with `${fullData.areas?.lads[0]?.name.toUpperCase()}`.
4. Move `cacheDoc` (line 12) into handler.
5. **Verify** UKHPI accepts arbitrary `name=` values and PPI accepts arbitrary `district=` values for non-Braintree pilots.

---

#### /api/mentions

**Hardcoded values:**
- Line 24: `const MP_NAME = "James Cleverly";` — `const MP_NAME = fullData.mp?.name?.replace(/^(Sir |Dame |Lord |Lady |Baroness |Baron )/, "") ?? fullData.constituency.mp;` (strip honorifics for X queries).
- Line 25: `const MP_HANDLE = "JamesCleverly";` — `const MP_HANDLE = fullData.mp?.twitter?.replace(/^@/, "") ?? "";`. **Caveat**: some MPs have no Twitter handle in `mp-data.ts` (spot-check: many `twitter: null`); the route must gracefully handle this (search by name only).

**Dynamic data fetched:**
- X API v2 `/2/tweets/search/recent?query=@${MP_HANDLE} OR "${MP_NAME}"` (line 91). Constituency-specific: handle + name.
- Apify Twitter scraper actors (lines 140–164). Constituency-specific: search terms.

**Data layer needs:**
- `mp.name` ✓.
- `mp.twitter` ✓ (nullable — confirmed spot-check: many MPs have `twitter: null`).

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: none.

**Refactor effort:**
- Easy
- Estimated time: 25 minutes.

**Changes needed:**
1. Accept `slug` in `GET` (line 27).
2. Replace `MP_NAME`/`MP_HANDLE` (lines 24–25) with `fullData.mp` derivations.
3. Add a code path for MPs without Twitter handles (~50% of MPs) — fall back to name-only search.

---

#### /api/news

**Hardcoded values:**
- Lines 7–13: `const FEEDS = [...6 hardcoded RSS feeds...]`:
  - Line 7: "BBC Essex" — would become `fullData.newsFeeds?.bbcRegional` (e.g. `https://feeds.bbci.co.uk/news/england/essex/rss.xml`).
  - Line 8: "Google News - Braintree" with `?q=Braintree+Essex` — would become `fullData.newsFeeds?.googleConstituency`.
  - Line 9: "Google News - Cleverly" with `?q=James+Cleverly` — would become `fullData.newsFeeds?.googleMp`.
  - Line 10: "Essex Live" — generic regional, but Essex-specific. Either drop or replace with a region-mapped feed. Not in data layer.
  - Line 11: "Braintree & Witham Times" — local paper. Not in data layer; would need a `localPaper: string | null` field.
  - Line 12: "East Anglian Daily Times" — same problem.

**Dynamic data fetched:**
- 6 RSS feeds. Constituency-specific: all 6.

**Data layer needs:**
- `newsFeeds.bbcRegional`, `newsFeeds.googleConstituency`, `newsFeeds.googleMp` ✓ (`src/data/news-feeds.ts` has these 3 fields for 543 English constituencies).
- **Missing**: regional weekly papers and local town papers (lines 10, 11, 12). Hand-curated.

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: none (Next.js `revalidate: 900` line 29).

**Refactor effort:**
- Easy
- Estimated time: 25 minutes (assuming you accept the simpler 3-feed model from the data layer).

**Changes needed:**
1. Accept `slug` in `GET` (line 23).
2. Resolve `FEEDS` from `getFullData(slug).newsFeeds` (3 entries: BBC regional, Google constituency, Google MP).
3. **Decision**: drop the regional weekly papers (lines 10–12) or expand the data layer to include them. Pilot decision; for first refactor, drop them.

---

#### /api/opposition

**Hardcoded values:**
- Lines 42–87: `const CANDIDATES = [...4 hardcoded 2024 candidates with vote shares + Twitter handles + colors...]`. Would become derived from `fullData.candidates` (the `CANDIDATES_2024` lookup in `src/data/candidates-2024.ts` ✓, 650 entries).
- Each candidate has fields beyond what's in `candidates-2024.ts`: `handle` (Twitter), `councilRep`, `councilHandle`, `searchTerms`, `color`. **Twitter handles, council reps and colors are not in `candidates-2024.ts`** (only `name`, `party`, `votes`, `share`, `elected`).

**Dynamic data fetched:**
- Apify Twitter scraper per candidate (line 102). Constituency-specific: search terms (handle/name).

**Data layer needs:**
- `candidates[]` ✓ for names, party, vote share.
- **Missing**: opposition candidates' Twitter handles. Hand-curated; not currently anywhere in the data layer.
- **Missing**: party colors (could be derived from a global party-color lookup constant, doesn't need to be per-constituency).
- **Missing**: council representative info — Braintree-specific extra detail. Probably out of scope to scale.

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: none.

**Refactor effort:**
- Hard
- Estimated time: 3 hours (1 h for route restructure; 2 h to source opposition Twitter handles for ~3-4 candidates × 650 constituencies = ~2,000 handle lookups, mostly not in any existing dataset).

**Changes needed:**
1. Accept `slug` in `GET` (line 175).
2. Replace `CANDIDATES` (lines 42–87) with iteration over `fullData.candidates` (top 4 by vote share, excluding the elected MP).
3. Add a global party-color lookup (e.g. `src/lib/party-colors.ts`) — not per-constituency.
4. **Acceptable simplification for first refactor**: drop the Twitter-handle column and run Apify searches by `candidate.name + party + constituency.name` instead of handles. Means lower-quality results but doesn't block multi-constituency.
5. **Out of scope**: sourcing per-candidate Twitter handles for all 650 seats.

---

#### /api/parliament

**Hardcoded values:**
- Line 7: `const MP_ID = 4366; // James Cleverly, Braintree` — `const MP_ID = fullData.constituency.memberId;`.
- Lines 53, related: URL templates already drive off `MP_ID`.

**Dynamic data fetched:**
- Members API `/Members/${MP_ID}/Voting` (line 53). Constituency-specific: `MP_ID`.
- Bills API search (line 82) — not constituency-specific.

**Data layer needs:**
- `constituency.memberId` ✓.

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: none (Next.js `revalidate: 1800` line 55, 88).

**Refactor effort:**
- Easy
- Estimated time: 10 minutes. **One of the easiest wins.**

**Changes needed:**
1. Accept `slug` in `GET` (line 36).
2. Replace `MP_ID` constant (line 7) with derived value.

---

#### /api/petitions

**Hardcoded values:**
- Line 15: `const ONS_CODE = "E14001121";` — `const ONS_CODE = fullData.constituency.onsCode;`.
- Line 16: `const CONSTITUENCY_POP = 74838;` — `const CONSTITUENCY_POP = fullData.constituency.electorate;` (electorate is a reasonable proxy for population for the salience calc; or derive population separately).
- Line 17: `const UK_POP = 67000000;` — constant, leave as-is.

**Dynamic data fetched:**
- gov.uk Petitions `/petitions.json?state=open` (line 31) — not constituency-specific.
- Per-petition detail JSON (line 58) — extracts `signatures_by_constituency` and filters by `ons_code === ONS_CODE` (line 71).

**Data layer needs:**
- `constituency.onsCode` ✓.
- `constituency.electorate` ✓.

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: none.

**Refactor effort:**
- Easy
- Estimated time: 10 minutes.

**Changes needed:**
1. Accept `slug` in `GET` (line 28).
2. Replace `ONS_CODE` (line 15) and `CONSTITUENCY_POP` (line 16) with derived values.

---

#### /api/planning

**Hardcoded values:**
- Line 14: `const PLANIT_URL = "...?bbox=0.30,51.75,0.79,52.09&recent=60&limit=100";` — bbox literals are Braintree-specific. Would become a runtime-built URL using `geo.bbox`.
- Line 17: `const cacheDoc = doc(db, "planning_cache", "braintree");` — move into handler.
- Line 97: `isInsideConstituency(app.lng, app.lat)` — needs `src/lib/geo.ts` rewrite.

**Dynamic data fetched:**
- PlanIt `/api/applics/json?bbox=...&recent=60&limit=100` (line 14, 63). Constituency-specific: `bbox`.

**Data layer needs:**
- `geo.bbox` ✓.
- Polygon for `isInsideConstituency()` — needs rewrite.

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: Firestore cache-then-refresh (TTL 1 h, line 16).

**Refactor effort:**
- Easy
- Estimated time: 20 minutes (assuming `src/lib/geo.ts` rewrite is done separately).

**Changes needed:**
1. Accept `slug` in `GET` (line 127).
2. Build `PLANIT_URL` at runtime using `geo.bbox`.
3. Move `cacheDoc` (line 17) into handler.
4. Pass `onsCode` to `isInsideConstituency()` (line 97).

---

#### /api/polling

**Hardcoded values:**
- **None** that are constituency-specific. The route fetches national polling from Wikipedia + Electoral Calculus and computes national averages.
- Static fallback polls (lines 393–415) are national, not Braintree-specific.

**Dynamic data fetched:**
- Wikipedia MediaWiki API `?action=parse&page=Opinion_polling_for_the_next_United_Kingdom_general_election` (line 57).
- Electoral Calculus `/polls.html` (line 193).

**Data layer needs:**
- None — route is national.

**Current state:**
- ✅ Multi-constituency safe (national content).
- Cache layer: Next.js `revalidate: 3600` (lines 60, 194).

**Refactor effort:**
- N/A — no refactor needed.
- Estimated time: 0.

**Changes needed:**
- None.

---

#### /api/schools

**Hardcoded values:**
- Line 13: `const cacheDoc = doc(db, "schools_cache", "braintree");` — move into handler.
- Line 98: URL `?SearchType=Location&Location=Braintree&LocationCoords=51.878,0.556&OpenOnly=true&radius=15` — `Location=${fullData.constituency.name}&LocationCoords=${geo.lat},${geo.lng}`.
- Lines 69–92: `const FALLBACK_SCHOOLS = [...22 hardcoded Braintree-area schools with lat/lng/URN...]` — entire hand-curated dataset. Would become slug-aware fallback (per-constituency static lookup) **or** removed (returning empty list when GIAS fails is acceptable for pilot).
- Line 122: `isInsideConstituency(lng, lat)` — needs `src/lib/geo.ts` rewrite.

**Dynamic data fetched:**
- DfE GIAS `/search/results/json?SearchType=Location&Location=...&LocationCoords=...&radius=15` (line 98). Constituency-specific: `Location`, `LocationCoords`.

**Data layer needs:**
- `constituency.name`, `geo.lat`, `geo.lng` ✓.
- **Missing**: per-constituency static school fallback. The 22-school hand-curated list does not scale. Two options: (a) drop fallback for non-Braintree seats; (b) source GIAS bulk data + filter to ONS code (~30,000 schools, large but tractable).

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree (URL location + fallback list)
- Cache layer: Firestore cache-then-refresh (TTL 7 days, line 12).

**Refactor effort:**
- Medium
- Estimated time: 1 hour (assuming you accept dropping the fallback for non-Braintree pilots; otherwise +half a day to ingest GIAS bulk data).

**Changes needed:**
1. Accept `slug` in `GET` (line 172).
2. Build GIAS URL at runtime using `constituency.name` + `geo.lat`/`geo.lng`.
3. Move `cacheDoc` (line 13) into handler.
4. Pass `onsCode` to `isInsideConstituency()` (line 122).
5. **Decision**: drop `FALLBACK_SCHOOLS` (lines 69–92) or replace with a per-slug lookup. Pilot recommendation: drop, accept empty state if GIAS fails.

---

#### /api/trends

**Hardcoded values:**
- Line 31: `const comparisonTerms = ["James Cleverly", "Reform UK", "Labour Party"];` — `["James Cleverly", ...]` would become MP name from data layer; the other two are national parties (constituency-agnostic).
- Line 32: `const localTerms = ["Braintree Essex", "Braintree council"];` — would become `[${constituency.name} ${constituency.county}, ${constituency.name} council]` or similar.
- Line 81: URL `q=Braintree+Essex` — would become `q=${encodeURIComponent(fullData.constituency.name + " " + fullData.constituency.county)}`.

**Dynamic data fetched:**
- SerpAPI Google Trends comparison (line 38). Constituency-specific: `comparisonTerms`, `localTerms`.
- SerpAPI Google Trends related-queries (line 81). Constituency-specific: seed term.

**Data layer needs:**
- `constituency.name`, `constituency.county`, `mp.name` ✓.

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: none (Next.js `revalidate: 3600` line 39, 63, 82).

**Refactor effort:**
- Easy
- Estimated time: 20 minutes.

**Changes needed:**
1. Accept `slug` in `GET` (line 15).
2. Replace `comparisonTerms` (line 31) and `localTerms` (line 32) with derived values.
3. Replace `Braintree+Essex` seed (line 81) with derived.
4. **Cross-cutting decision** (`MVP_STATUS.md` flags): may be deprecated in favour of `/api/trends-v2`. If kept, refactor; if rewired to v2, this route can be deleted.

---

#### /api/trends-v2

**Hardcoded values:**
- Line 23: `const CONSTITUENCY_SLUG = "braintree";` — the only literal. Already drives all downstream data via `getFullData(CONSTITUENCY_SLUG)` (line 38). Would become `const slug = searchParams.get("slug") || "braintree";` inside the handler.
- Line 24: `const cacheDoc = doc(db, "trends_cache", CONSTITUENCY_SLUG);` — move into handler.
- Lines 38–41: module-level `const fullData = getFullData(CONSTITUENCY_SLUG);` and derived `constituencyName`, `mpNameRaw`, `mpName`. These must move into the handler since `slug` is request-scoped.
- Line 55: `const EAST_OF_ENGLAND_NAME = "East of England";` — would become `fullData.constituency.region` (the data layer has a `region` field).

**Dynamic data fetched:**
- Google Trends (via `google-trends-api` npm scraper) — `dailyTrends`, `interestOverTime`, `interestByRegion`. Constituency-specific: `mpName`, `constituencyName`, `region`.

**Data layer needs:**
- `constituency.name`, `constituency.region`, `mp.name` ✓.

**Current state:**
- ⚠️ Partial — already uses `getFullData()`; only the slug is hardcoded.
- Cache layer: Firestore cache-then-refresh (TTL 12 h, line 22).

**Refactor effort:**
- Easy
- Estimated time: 25 minutes (more code movement than the simpler routes because module-scope `fullData` needs to become per-request).

**Changes needed:**
1. Replace `CONSTITUENCY_SLUG` constant (line 23) with `searchParams.get("slug") || "braintree"` inside `GET`.
2. Move `cacheDoc`, `fullData`, `constituencyName`, `mpName`, `KEYWORDS`, `EMPTY_PAYLOAD` (lines 24, 38–51, 271–281) **all** inside `GET` — they all derive from the slug.
3. Replace `EAST_OF_ENGLAND_NAME` (line 55) with `fullData.constituency.region`.
4. Refactor `safeInterestByRegion()`, `safeInterestOverTime()`, `safeDailyTrends()` to accept the needed context as parameters (rather than reading module-level globals).

---

#### /api/universal-credit

**Hardcoded values:**
- Line 12: `const cacheDoc = doc(db, "universal_credit_cache", "braintree");` — move into handler.
- Line 14: `const CONSTITUENCY_CODE = "721420347";` — NOMIS `wpca24` constituency code for Braintree. Would become derived. **Currently not in the data layer** (same issue as `/api/commons-library`).

**Dynamic data fetched:**
- NOMIS `NM_162_1.data.json?geography=${CONSTITUENCY_CODE}` (lines 74, 79, 85). Constituency-specific: `CONSTITUENCY_CODE`.

**Data layer needs:**
- **Missing**: NOMIS `wpca24` constituency code per constituency. Same blocker as `/api/commons-library`.

**Current state:**
- ❌ Uses `getFullData()`
- ❌ Hardcoded to Braintree
- Cache layer: Firestore cache-then-refresh (TTL 24 h, line 11).

**Refactor effort:**
- Medium
- Estimated time: 30 minutes after `nomisConstituencyCode` is added to the data layer; 4 hours including the data layer addition for all 650 constituencies.

**Changes needed:**
1. Accept `slug` in `GET` (line 203).
2. Add `nomisConstituencyCode: string` (or `number`) to `Constituency` interface in `src/data/constituencies.ts`. Populate for all 650 (NOMIS provides the lookup table at `https://www.nomisweb.co.uk/api/v01/dataset/NM_162_1/wpca24/def.sdmx.xml`).
3. Replace `CONSTITUENCY_CODE` (line 14) with `fullData.constituency.nomisConstituencyCode`.
4. Move `cacheDoc` (line 12) into handler.

---

#### /api/worship

**Hardcoded values:**
- Line 11: comment `// Actual GeoJSON extent: lat 51.829–52.087, lng 0.308–0.782` (cosmetic).
- Lines 11–16: `OVERPASS_QUERY` template with bbox literals `(51.82,0.30,52.09,0.79)` (twice). Would become a runtime-built bbox string from `geo.bbox`.
- Line 60: `isInsideConstituency(lng, lat)` — needs `src/lib/geo.ts` rewrite.

**Dynamic data fetched:**
- Overpass API (OSM) POST with query body (line 39). Constituency-specific: bbox in the query string.

**Data layer needs:**
- `geo.bbox` ✓.
- Polygon for `isInsideConstituency()` — needs rewrite.

**Current state:**
- ❌ Uses `getFullData()` (consumed by `ConstituencyMap.tsx` which scopes by GeoJSON, so effectively still Braintree-only).
- ❌ Hardcoded to Braintree (bbox)
- Cache layer: none (Next.js `revalidate: 604800` = 7 days, line 43).

**Refactor effort:**
- Easy
- Estimated time: 20 minutes (assuming `src/lib/geo.ts` rewrite is done separately).

**Changes needed:**
1. Accept `slug` in `GET` (line 37).
2. Build `OVERPASS_QUERY` at runtime using `geo.bbox`.
3. Pass `onsCode` to `isInsideConstituency()` (line 60).

---

## Section 2 — Data layer inventory

Field-by-field availability across `src/data/*.ts`. **Coverage column**: how many of the 650 constituencies have a non-null/non-empty value for this field. Spot-checks performed on `constituencies.ts` first 100 lines, `mp-data.ts` first 50 lines, `constituency-geo.ts` line counts, `constituency-areas.ts` first 25 entries, `news-feeds.ts` first 30 entries, `candidates-2024.ts` first 6 entries.

| Field | Example value | Present for all 650? | Used by which routes |
|---|---|---|---|
| `constituency.name` | `"Braintree"` | ✓ 650 | `/api/ai-brief`, `/api/commons-library`, `/api/health`, `/api/house-prices`, `/api/schools`, `/api/trends`, `/api/trends-v2`, `/api/electoral-calculus` |
| `constituency.slug` | `"braintree"` | ✓ 650 | all cache keys |
| `constituency.onsCode` | `"E14001121"` | ✓ 650 | `/api/commons-library`, `/api/petitions`; **needed by all routes calling `isInsideConstituency()`** once refactored |
| `constituency.mp` | `"Sir James Cleverly"` | ✓ 650 (some include honorifics) | `/api/ai-brief`, `/api/hansard`, `/api/mentions`, `/api/trends`, `/api/trends-v2` |
| `constituency.party` | `"Conservative"` | ✓ 650 | `/api/ai-brief` |
| `constituency.memberId` | `4366` | ✓ 650 | `/api/parliament`, `/api/hansard` |
| `constituency.constituencyId` | `3936` | ✓ 650 | (not currently used by any route — internal Parliament ID, useful for some Parliament API endpoints) |
| `constituency.region` | `"East of England"` | ✓ 650 | `/api/trends-v2` |
| `constituency.county` | `"Essex"` | ✓ 650 | `/api/trends` |
| `constituency.electorate` | `77781` | ✓ 650 | `/api/petitions` (salience denominator) |
| `constituency.results2024.{con,lab,ld,reform,green}` | `17414` | ✓ 650 | `PollingDashboard.tsx` (`BRAINTREE_2024` is the local shape) |
| `constituency.results2024.winner` | `"Con"` | ✓ 650 | `PollingDashboard.tsx`, `ElectionResults.tsx` |
| `mp.memberId` | `4366` | ✓ 650 keyed by memberId | `/api/parliament`, `/api/hansard` |
| `mp.name` | `"Sir James Cleverly"` | ✓ 650 (key is memberId so all matched MPs have this) | `/api/ai-brief`, `/api/hansard`, `/api/mentions`, `/api/trends-v2` |
| `mp.twitter` | `"@JamesCleverly"` or `null` | ⚠️ **~50% null** (spot-check first 50 lines shows ~half are `null`) | `/api/mentions` |
| `mp.website` | `"https://..."` or `null` | ⚠️ ~50% null | (not currently used) |
| `mp.email` | `"...@parliament.uk"` | ⚠️ mostly present | (not currently used) |
| `mp.facebook` | URL or `null` | ⚠️ partial | (not currently used) |
| `mp.instagram` | URL or `null` | ⚠️ partial | (not currently used) |
| `mp.twfyPersonId` | `11816` | ⚠️ mostly present | `/api/hansard` |
| `geo.lat` | `51.878` | ⚠️ **543/650** — English only | `/api/air-quality`, `/api/floods` |
| `geo.lng` | `0.556` | ⚠️ 543/650 | same |
| `geo.bbox` | `[0.308, 51.829, 0.782, 52.087]` | ⚠️ 543/650 | `/api/crime`, `/api/fixmystreet`, `/api/planning`, `/api/worship` |
| `areas.lads[].code` | `"E07000067"` | ⚠️ 543/650 | `/api/health` (district code) |
| `areas.lads[].name` | `"Braintree"` | ⚠️ 543/650 | `/api/house-prices` (district name for PPI) |
| `areas.lads[].nomisCode` | `1820328091` | ⚠️ 543/650 | `/api/employment` |
| `areas.wards[].code` | `"E05010365"` | ⚠️ 543/650 | `/api/census` |
| `areas.wards[].name` | `"Bocking Blackwater"` | ⚠️ 543/650 | (not currently used as identifier, only display) |
| `candidates[].name` | `"James Cleverly"` | ✓ 650 (keyed by constituency name) | `/api/opposition` (target field after refactor) |
| `candidates[].party` | `"Conservative and Unionist Party"` | ✓ 650 | `/api/opposition` |
| `candidates[].votes` | `17414` | ✓ 650 | `/api/opposition` (vote share computation) |
| `candidates[].share` | `35.5` | ✓ 650 | `/api/opposition` |
| `candidates[].elected` | `true`/`false` | ✓ 650 | (not currently used) |
| `newsFeeds.bbcRegional` | `"https://feeds.bbci.co.uk/news/england/essex/rss.xml"` | ⚠️ 543/650 | `/api/news` (target after refactor) |
| `newsFeeds.googleConstituency` | `"https://news.google.com/rss/search?q=Braintree%20constituency"` | ⚠️ 543/650 | `/api/news` |
| `newsFeeds.googleMp` | `"https://news.google.com/rss/search?q=James%20Cleverly"` | ⚠️ 543/650 | `/api/news` |

**Coverage gap summary:**
- 4 files cover all 650: `constituencies.ts`, `mp-data.ts`, `candidates-2024.ts`. (mp-data.ts is keyed by memberId; all 650 sitting MPs should be there, spot-check confirms first 13.)
- 3 files cover only 543: `constituency-geo.ts`, `constituency-areas.ts`, `news-feeds.ts`. Scotland (~57), Wales (~32), NI (~18) are **missing**.
- `mp.twitter` is **~50% null** across the dataset — affecting `/api/mentions` reliability.
- **Not in data layer at all** (would need to be added):
  - `constituency.nomisConstituencyCode` (`wpca24` 7xxxxxxxx) — blocker for `/api/commons-library` and `/api/universal-credit`.
  - `areas.postcodes: string[]` — blocker for `/api/cqc` and `/api/epc`.
  - Opposition candidates' Twitter handles — blocker for full-quality `/api/opposition`.
  - Per-constituency boundary GeoJSON polygon — exists for ALL 650 in `public/geojson/constituencies-all.geojson` (21 MB) but **not consumed by `src/lib/geo.ts`** which only loads the Braintree single-file. **Critical blocker** for crime/fixmystreet/planning/floods/worship.

---

## Section 3 — Frontend components needing updates

Static imports from the legacy `@/data/braintree` file (single-constituency by design):

- `src/components/Demographics.tsx:3` — `import { demographics, wardDemographics, type DemographicSet } from "@/data/braintree";`
- `src/components/Demographics.tsx:41` — `<option value="all">All Braintree (Constituency Average)</option>`
- `src/components/ConstituencyProfile.tsx:3` — `import { constituencyProfile } from "@/data/braintree";`
- `src/components/WardDataHub.tsx:10` — `import {...} from "@/data/braintree";`
- `src/components/WardTable.tsx:4` — `import { wardData } from "@/data/braintree";`
- `src/components/ElectionResults.tsx:3` — `import { electionResults2024 } from "@/data/braintree";`
- `src/components/ECPrediction.tsx:7` — `import {...} from "@/data/braintree";`
- `src/components/ElectoralIntel.tsx:8` — `import {...} from "@/data/braintree";`
- `src/components/ConstituencyMap.tsx:6` — `import { constituencyGeo, wardData, wardElectoralCalc as fallbackWardElectoralCalc } from "@/data/braintree";`

Hardcoded `seat=Braintree` URL parameters in component fetches:

- `src/components/ECPrediction.tsx:72` — `fetch("/api/electoral-calculus?type=seat&seat=Braintree")`
- `src/components/ElectoralIntel.tsx:71` — `fetch("/api/electoral-calculus?type=seat&seat=Braintree")`
- `src/components/ConstituencyMap.tsx:101` — `fetch("/api/electoral-calculus?type=seat&seat=Braintree").catch(...)`
- `src/components/PollingDashboard.tsx:199` — `fetch("/api/electoral-calculus?type=both&seat=Braintree")`
- `src/components/PollingDashboard.tsx:1071` — `href="https://www.electoralcalculus.co.uk/fcgi-bin/seatdetails.py?seat=Braintree"`

Hardcoded GeoJSON paths in components:

- `src/components/ConstituencyMap.tsx:99` — `fetch("/geojson/braintree-constituency.geojson")`
- `src/components/ConstituencyMap.tsx:100` — `fetch("/geojson/braintree-wards.geojson")`
- `src/components/ConstituencyMap.tsx:673` — `fetch("/geojson/braintree-wards.geojson")` (duplicate)

Hardcoded "Braintree" / "James Cleverly" display strings:

- `src/components/Header.tsx:48` — visible header text `Braintree`
- `src/components/Header.tsx:94` — mobile menu footer text `Braintree · James Cleverly (Con)`
- `src/components/HansardFeed.tsx:236` — `href="https://www.theyworkforyou.com/mp/11816/james_cleverly/braintree"` (TWFY MP page link)
- `src/components/HealthPanel.tsx:83` — display string `Braintree: {value}{unit}`
- `src/components/ParliamentBills.tsx:246` — display string `James Cleverly voting record`
- `src/components/PollingDashboard.tsx:127` — comment `// 2024 Braintree result` (cosmetic only)
- `src/components/PollingDashboard.tsx:224` — UI label `{ id: "local", label: "Braintree" }`
- `src/components/PollingDashboard.tsx:413` — JSX: `<BraintreeLocalSection averages={...} ecConstituency={...} />`
- `src/components/PollingDashboard.tsx:827` — function name `BraintreeLocalSection(...)` (rename to `LocalSwingSection`)
- `src/components/PollingDashboard.tsx:833` — `const braintreeBase = BRAINTREE_2024 as Record<string, number>;` (where `BRAINTREE_2024` is the local hardcoded 2024 result baseline — would derive from `constituency.results2024`)
- `src/components/PollingDashboard.tsx:845, 852` — `(braintreeBase[party] + nationalSwing)` (UNS swing math; will work for any seat once `braintreeBase` is derived)
- `src/components/PollingDashboard.tsx:878` — display string `Electoral Calculus MRP prediction for Braintree` / `UNS projection for Braintree constituency`

Hardcoded Essex Police crime-map URL:

- `src/components/ConstituencyMap.tsx:399` — `href="https://www.police.uk/pu/your-area/essex-police/braintree/?tab=CrimeMap"` (force-specific URL; police force varies by constituency — would need a per-constituency `policeForce` field or skip the link entirely)

Hardcoded petitions UI string:

- `src/components/ConstituencyMap.tsx:788` — display string `📝 E-Petitions — Braintree`

Hardcoded mock fallback data referencing Braintree (inside components, not API routes):

- `src/components/FixMyStreet.tsx:138, 141, 146` — three mock issue entries with "Braintree" in the title (these are inline fallback `getMockData()` content used when API fails; would be removed during refactor).
- `src/components/NewsFeed.tsx:111, 114, 115, 118, 125, 129, 132, 135, 136, 150, 160` — `getMockNews()` returns ~10 hardcoded fake Braintree news items used as fallback when `/api/news` fails. Would be removed during refactor (or made slug-aware/empty).

**Total component refactor surface:** ~10 files need substantive logic changes; ~5 more need cosmetic string changes only.

---

## Section 4 — Refactor priority order

### Easy wins (1-2 hardcoded values, clean API calls, ≤30 min each)

- `/api/parliament` — 10 min — single `MP_ID` constant; trivial swap.
- `/api/petitions` — 10 min — `ONS_CODE` + electorate; clean replacement.
- `/api/electoral-calculus` — 10 min for the route itself; the only literal is the default seat name.
- `/api/air-quality` — 15 min — 2 constants (lat, lng) from `geo`.
- `/api/floods` — 20 min — 2 constants from `geo`; cache key move.
- `/api/census` — 20 min — replace 28-element `WARD_CODES` with `areas.wards`; cache key.
- `/api/employment` — 20 min — single NOMIS LAD code from `areas.lads[0]`.
- `/api/house-prices` — 20 min — name + district from data layer; cache key.
- `/api/hansard` — 25 min — `MP_ID`, `TWFY_PERSON_ID`, MP name, TWFY URL.
- `/api/mentions` — 25 min — MP name + handle from `mp-data.ts` (handle is nullable).
- `/api/trends-v2` — 25 min — module-scope state must move into handler.
- `/api/news` — 25 min — 3 feeds from `newsFeeds`; drop the 3 regional papers.
- `/api/trends` — 20 min — terms derived from `constituency.name`, `county`, `mp.name`.
- `/api/worship` — 20 min — bbox from `geo.bbox`; depends on `src/lib/geo.ts` rewrite.

**Subtotal: 14 routes, ~4 hours 25 minutes.**

### Medium complexity (multiple values, needs cross-file changes, 1-3 hours each)

- `/api/fixmystreet` — 45 min — bbox subdivision from `geo.bbox`; depends on `src/lib/geo.ts` rewrite.
- `/api/planning` — 20 min for the route; +1 h for the `src/lib/geo.ts` rewrite (shared dependency, count once below).
- `/api/health` — 1 hour — LAD code; decide on `FALLBACK_INDICATORS`.
- `/api/ai-brief` — 1 hour — prompt template + placeholder + cache key; thread context through helper functions.
- `/api/schools` — 1 hour — GIAS URL + decision on `FALLBACK_SCHOOLS`.
- `/api/universal-credit` — 30 min for route; **+3 h** for adding `nomisConstituencyCode` field to data layer for all 650 (shared with commons-library).

**Subtotal: 6 routes, ~4 hours 35 minutes (route work only — shared blockers counted in Section 5).**

### Hard (boundary logic, multiple dependencies, unclear data needs, half a day+)

- `/api/crime` — 3 hours — `SAMPLE_POINTS` regeneration + `src/lib/geo.ts` rewrite + testing across pilot seats with diverse geographies.
- `/api/cqc` — 3 hours — blocked on per-constituency postcode list (which requires sourcing or generating ~1.7M postcode-to-constituency mappings, or adopting an external lookup).
- `/api/epc` — 2 hours — same postcode-list blocker; quota uplift is a separate operational task.
- `/api/commons-library` — 4 hours — decision on `getStaticProfile` (728-row hand-curated comparison table); add `nomisConstituencyCode` to data layer; thread slug throughout.
- `/api/opposition` — 3 hours — derive top 4 candidates from `candidates-2024.ts`; drop Twitter-handle column or commit to sourcing handles for ~2000 candidates.

**Subtotal: 5 routes, ~15 hours.**

### Cross-cutting dependencies (count once, shared across routes)

- **`src/lib/geo.ts` rewrite** — 1 hour — parameterise `isInsideConstituency` by `onsCode`, load polygons from the existing `public/geojson/constituencies-all.geojson` (21 MB file already present). **Unblocks** `/api/crime`, `/api/fixmystreet`, `/api/planning`, `/api/floods`, `/api/worship`, `/api/schools`.
- **Add `nomisConstituencyCode` to `Constituency`** — 3 hours (1 h to add field + 2 h to source values for 650 seats from NOMIS lookup tables). **Unblocks** `/api/commons-library`, `/api/universal-credit`.
- **Add per-constituency postcode lists** — half a day to a full day depending on chosen approach (postcodes.io batch lookup vs ONS Postcode Directory download). **Unblocks** `/api/cqc`, `/api/epc`.
- **Component refactor** — ~3-4 hours for the ~10 components that import `@/data/braintree` or hardcode `seat=Braintree`/GeoJSON paths (see §3).

### Totals

| Bucket | Routes | Time |
|---|---|---|
| Easy wins | 14 | ~4 h 25 min |
| Medium | 6 | ~4 h 35 min |
| Hard | 5 | ~15 h |
| `src/lib/geo.ts` rewrite (shared) | — | 1 h |
| Data layer extensions (shared) | — | ~6-8 h |
| Component refactor | — | ~3-4 h |
| **Grand total** | **25 routes** + 2 no-op | **~34-38 hours ≈ 4-5 working days** |

(The 2 no-op routes are `/api/headlines` and `/api/polling`, both national.)

---

## Section 5 — Missing data

The data layer covers most needs but has these gaps. Each blocks one or more routes.

### Boundary polygons (per-constituency GeoJSON)

- **Status:** `public/geojson/constituencies-all.geojson` exists for all 650 constituencies (21 MB on disk). `src/lib/geo.ts:12` does **not** consume it — it only reads `public/geojson/braintree-constituency.geojson` (single-constituency file). The `getPolygon()` function in `src/lib/geo.ts` is non-parameterised and returns a single polygon.
- **Routes blocked:** `/api/crime`, `/api/fixmystreet`, `/api/planning`, `/api/floods`, `/api/worship`, `/api/schools` (any route calling `isInsideConstituency()`).
- **Action:** rewrite `src/lib/geo.ts` to:
  1. Load `constituencies-all.geojson` once at module load.
  2. Build a `Map<onsCode, Polygon>` lookup (650 entries).
  3. Export `isInsideConstituency(lng, lat, onsCode)` taking the ONS code.
  4. Estimated 1 hour.
- **Alternative**: pre-process the 21 MB file into 650 small JSON files at build time, loaded on demand.

### Per-constituency postcode lists

- **Status:** Not in the data layer. `src/data/constituency-areas.ts` has wards and LADs, but no postcodes. The legacy `/api/cqc` and `/api/epc` routes use hand-typed `POSTCODES = ["CM7", "CM77", "CO9"]`.
- **Routes blocked:** `/api/cqc`, `/api/epc`.
- **Action:** add `postcodes: string[]` (postcode area prefixes, e.g. `["CM7", "CM77", "CO9"]`) to `ConstituencyAreas`. Source options:
  1. ONS Postcode Directory (free, full lookup of every UK postcode to its parliamentary constituency — ~1.7M rows).
  2. postcodes.io `/postcodes/{postcode}` (free public API).
  3. Manual curation per pilot constituency.
- Estimated half a day to a day depending on approach.

### NOMIS `wpca24` constituency code

- **Status:** Not in `Constituency` interface. Two routes need it: `/api/commons-library` (line 20) and `/api/universal-credit` (line 14). Both hardcode `"721420347"`.
- **Routes blocked:** `/api/commons-library`, `/api/universal-credit`.
- **Action:** add `nomisConstituencyCode: string` to `Constituency` interface; populate for all 650. NOMIS provides the lookup at `https://www.nomisweb.co.uk/api/v01/dataset/NM_162_1/wpca24/def.sdmx.xml`. Estimated 2-3 hours.

### Geo / areas / news-feeds coverage gap (Scotland, Wales, NI)

- **Status:** `constituency-geo.ts`, `constituency-areas.ts`, `news-feeds.ts` each have **543 entries — English constituencies only**. The 107 non-English constituencies (Scotland 57 + Wales 32 + NI 18) have no `geo`, `areas`, or `newsFeeds` data.
- **Routes blocked (when used for non-English seats):** `/api/air-quality`, `/api/floods`, `/api/crime`, `/api/fixmystreet`, `/api/planning`, `/api/worship`, `/api/census`, `/api/employment`, `/api/health`, `/api/news`, `/api/schools`. Essentially every route except the MP-driven ones (`/api/parliament`, `/api/hansard`) and the national ones (`/api/polling`, `/api/headlines`, `/api/electoral-calculus`).
- **Action:** out of scope for English pilot. For full UK rollout: source from ONS Open Geography (geo + areas) and curate BBC regional / Google search URLs (news-feeds). Estimated 1-2 days for the 107 missing seats.

### Opposition candidates' Twitter handles

- **Status:** `candidates-2024.ts` has names, parties, votes, vote shares — but no Twitter handles. The legacy `/api/opposition` route has hand-curated handles for 4 Braintree candidates only.
- **Routes blocked (for full functionality):** `/api/opposition`. Route still works without handles (Apify can search by name), but quality drops.
- **Action:** out of scope for first refactor. If needed: ~2000 lookups (650 × ~3-4 candidates each).

### Per-constituency boundary in `src/data/braintree-boundary.ts`

- **Status:** `src/data/braintree-boundary.ts` (149 lines) is a hardcoded simplified GeoJSON polygon, imported as a fallback by some components. Not currently used by `src/lib/geo.ts` (which reads the on-disk file). Single-constituency by design.
- **Action:** delete after `src/lib/geo.ts` rewrite consumes the all-650 file.

### Static profile data for Commons Library panel

- **Status:** `/api/commons-library` lines 152–225 contain a hand-curated 7-section / ~30-row comparison table (population, housing, economy, education, health, deprivation, transport) for Braintree only.
- **Routes blocked (for full functionality):** `/api/commons-library`. Route would still return live NOMIS + Parliament sections without this; the static table is the "rich" comparison view.
- **Action:** out of scope for first refactor. Decision required: drop the static table or build an ingestion from Commons Library CSV exports.

### Static fallback data with no scale path

These exist but won't scale; need a decision:

- `/api/schools` lines 69–92 — 22 hand-curated Braintree-area schools.
- `/api/cqc` lines 226–253 — 12 hand-curated Braintree-area CQC facilities.
- `/api/health` lines 292–301 — 8 Braintree-specific fallback indicators.

**Recommendation:** drop fallbacks for non-Braintree seats; accept empty state when upstream APIs fail. Re-evaluate when pilot reaches ~20 constituencies.

---

## Section 6 — Summary statistics

**Routes:**
- Total API routes: 27
- Already multi-constituency ready: 2 (`/api/headlines`, `/api/polling`) + 1 nearly there (`/api/trends-v2` — flip one constant)
- Partially parameterised: 1 (`/api/electoral-calculus` — accepts `seat=` query but defaults hardcoded)
- Need refactoring: 24

**Hardcoded values:**
- Total hardcoded constituency-specific literals across 24 routes: **~80 distinct literals**
  - Cache keys: 14 (one per cached route)
  - MP/constituency name strings: ~12 (across `/api/ai-brief`, `/api/commons-library`, `/api/health`, `/api/hansard`, `/api/mentions`, etc.)
  - ONS codes: 3 (`/api/commons-library`, `/api/petitions`, `/api/health` district)
  - NOMIS codes: 3 (`/api/commons-library`, `/api/employment`, `/api/universal-credit`)
  - Lat/lng centres: 4 (`/api/air-quality`, `/api/floods`)
  - Bounding boxes: ~10 (`/api/crime`, `/api/fixmystreet`, `/api/planning`, `/api/worship`)
  - Sample-point grids: 32 entries in `/api/crime` alone
  - Postcode lists: 6 (`/api/cqc`, `/api/epc` — 3 each)
  - Static fallback tables: 3 (`/api/cqc` 12 rows, `/api/schools` 22 rows, `/api/health` 8 rows, `/api/commons-library` ~30 rows, `/api/opposition` 4 candidates)
- Most common literal type: **cache key string `"braintree"`** (14 occurrences across cached routes).

**Data layer:**
- Constituencies in data layer: 650 ✓
- Files: 6 data modules (`constituencies`, `mp-data`, `candidates-2024`, `constituency-geo`, `constituency-areas`, `news-feeds`)
- Fields per constituency in `Constituency` type: 11 top-level + 13 sub-fields under `results2024` = **24 fields** (plus `MpData` 8 fields when joined, `Geo` 3 fields, `Areas` 2 lists, `Candidates` 5 fields, `NewsFeeds` 3 fields = ~45 total fields available per constituency when fully joined).
- Coverage gaps:
  - `constituency-geo.ts` / `constituency-areas.ts` / `news-feeds.ts`: 543/650 (English only — Scotland/Wales/NI absent)
  - `mp.twitter`: ~50% nullable
  - `mp.twfyPersonId`: mostly present, some nulls
  - Missing entirely: per-constituency `nomisConstituencyCode`, `postcodes`, opposition Twitter handles, Commons Library static profile data.

**Frontend:**
- Components with hardcoded constituency text or imports: **10** (Header, Demographics, ConstituencyProfile, WardDataHub, WardTable, ElectionResults, ECPrediction, ElectoralIntel, ConstituencyMap, PollingDashboard, HansardFeed, HealthPanel, ParliamentBills, FixMyStreet, NewsFeed — though the last two only have mock fallback strings)
- Components importing the legacy `@/data/braintree` file: **8** (Demographics, ConstituencyProfile, WardDataHub, WardTable, ElectionResults, ECPrediction, ElectoralIntel, ConstituencyMap)
- Components hardcoding `seat=Braintree`: **4** (ECPrediction, ElectoralIntel, ConstituencyMap, PollingDashboard)

**Refactor totals:**
- Easy wins: 14 routes, ~4.5 hours
- Medium: 6 routes, ~4.5 hours
- Hard: 5 routes, ~15 hours
- Cross-cutting (`src/lib/geo.ts`, data layer extensions, component refactor): ~10-13 hours
- **Grand total: ~34-38 hours ≈ 4-5 working days for one focused engineer.**

This aligns with `ROLLOUT_READINESS.md` §8.2's estimate of "5-8 working days" but trends to the lower bound when the hard routes are de-scoped (drop static fallbacks, defer opposition Twitter handles, drop Commons Library rich profile for non-pilot seats).

**Suggested ordering for execution:**

1. **Day 1 morning** — rewrite `src/lib/geo.ts` to consume `constituencies-all.geojson` (1 h). This unblocks 6 routes.
2. **Day 1 afternoon** — 14 easy-win routes (4.5 h). Each is self-contained; testable incrementally.
3. **Day 2** — 6 medium-complexity routes (4.5 h), plus `nomisConstituencyCode` data-layer extension (3 h).
4. **Day 3** — Component refactor + hardcoded-string scrubbing (3-4 h); start on hard routes (`/api/crime` first since it depends on `src/lib/geo.ts` and shows immediate value on the map).
5. **Day 4** — Remaining hard routes; postcode-list sourcing.
6. **Day 5** — Cross-pilot testing; edge cases (Scottish/Welsh seats if they're in the pilot set; multi-LAD constituencies; MPs with null Twitter).
