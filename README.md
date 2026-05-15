# Ground Game Intel — Developer README

## Overview

Ground Game Intel is a daily constituency intelligence briefing dashboard for UK parliamentary constituencies. It aggregates live data from public APIs (Parliament, ONS Census, NOMIS, Land Registry, Environment Agency, Police.uk, CQC, OHID Fingertips, Electoral Calculus, RSS feeds) and synthesises it with Claude (Anthropic API, model `claude-haiku-4-5-20251001`) into a daily AI brief. The dashboard is scoped per constituency and designed to give MPs and their staff a fast, single-pane view of what is happening on the ground.

## Architecture

**Stack:** Next.js 14 App Router, TypeScript, Firebase Firestore, MapLibre GL JS, Tailwind CSS, Recharts.

### Data layer

All data requests flow through `getFullData(slug)` in `src/data/index.ts`. This function resolves constituency metadata, geographic data, ward/LAD codes, candidates, and news feed config from static data files. API routes call this function to resolve the identifiers they need rather than hardcoding them.

### Cache-then-refresh pattern

Every API route under `src/app/api/` follows the same pattern:

1. Read the route's Firestore document on every request (~50–100 ms).
2. Return cached data immediately if it exists.
3. In the background, if the cache is older than the route's TTL, fetch fresh data from the upstream API and write it to Firestore (only if the payload has changed, compared via `JSON.stringify`).
4. On a cold cache, fetch synchronously, write to Firestore, and return the fresh data.

Firestore cache keys use the pattern `<collection>/<slug>` (e.g. `crime_cache/witham`). The census choropleth uses `<slug>-<topic>` (e.g. `braintree-age-under16`) because the response shape varies by `?topic=` parameter.

## Multi-constituency support

All geographically-scoped API routes now accept a `?constituency=<slug>` query parameter (defaults to `braintree`). Internally each route calls `getFullData(slug)` and resolves geographic and identifier fields from the returned data:

- Latitude/longitude and bounding box from `geo` (`ConstituencyGeo`)
- LAD and ward codes from `areas` (`ConstituencyAreas`)
- MP member ID, ONS code, and constituency ID from `constituency`
- News feed URLs from `newsFeeds`

When a required field is missing (e.g. `geo` is undefined for a Scottish constituency) the route returns a clean HTTP 400 with a message naming the missing data. Routes that fall back to Braintree-hardcoded values do so explicitly and are listed as partial in the route table below.

Slug-to-ONS-code lookups and all geographic resolution happen inside the data layer; no route hardcodes constituency identifiers except where noted.

## Route reference table

| Route | Status | Notes |
|---|---|---|
| `parliament` | Fully multi-constituency | Uses `memberId` from data layer |
| `petitions` | Fully multi-constituency | Uses `constituencyId` from data layer |
| `electoral-calculus` | Fully multi-constituency | Uses seat name from data layer; see Known Limitations |
| `hansard` | Fully multi-constituency | Uses `memberId` from data layer |
| `air-quality` | Fully multi-constituency | Uses `lat`/`lng` from `geo` |
| `crime` | Fully multi-constituency | Uses `lat`/`lng`/`bbox` from `geo` |
| `fixmystreet` | Fully multi-constituency | Uses `lat`/`lng`/`bbox` from `geo` |
| `planning` | Fully multi-constituency | Uses `lat`/`lng`/`bbox` from `geo` |
| `floods` | Fully multi-constituency | Uses `lat`/`lng`/`bbox` from `geo` |
| `worship` | Fully multi-constituency | Uses `lat`/`lng`/`bbox` from `geo` |
| `census` | Fully multi-constituency | Uses ward codes from `areas`; returns 400 for NI (ONS Census 2021 covers England & Wales only) |
| `universal-credit` | Fully multi-constituency | Uses `wpca24Code` from constituency; currently only populated for Braintree (forward-compatible cast) |
| `epc` | Fully multi-constituency | Uses postcode sample points from `geo`; 100 req/day quota on free tier |
| `news` | Fully multi-constituency | Uses `newsFeeds` config from data layer |
| `mentions` | Fully multi-constituency | Uses `newsFeeds` config from data layer |
| `ai-brief` | Fully multi-constituency | Aggregates other routes by slug |
| `employment` | Fully multi-constituency | Uses NOMIS LAD codes from `areas` |
| `house-prices` | Fully multi-constituency | Uses LAD codes from `areas` |
| `health` | Fully multi-constituency | Uses ONS code from `constituency` |
| `commons-library` | Partial / fallback | Static demographic profile only populated for Braintree; other slugs return 400 |
| `schools` | Partial / fallback | Hardcoded school directory for Braintree; other slugs return 400 |
| `cqc` | Partial / fallback | Postcode list for CQC search only populated for Braintree; other slugs return 400 |
| `opposition` | Partial / fallback | Candidate Twitter handles and search terms only populated for Braintree; other slugs return 400 |
| `headlines` | No changes needed | National-scope endpoint; no constituency slug required |
| `polling` | No changes needed | National-scope endpoint; no constituency slug required |
| `trends` | No changes needed | National-scope endpoint; no constituency slug required |
| `trends-v2` | No changes needed | National-scope endpoint; no constituency slug required |

## Known limitations

- **Scottish/Welsh/NI census:** ONS Census 2021 covers England and Wales only. The `census` route returns HTTP 400 for Northern Irish constituencies and has no ward-level data for Scotland.
- **Universal credit (`wpca24Code`):** The `wpca24Code` field (WPCA 2024 area code required by the NOMIS claimant count API) is currently only populated for Braintree in the data layer. Other constituencies will hit the fallback path until the field is backfilled.
- **Opposition tracking:** Candidate Twitter handles and Apify search terms are only configured for Braintree. The `opposition` route returns 400 for all other slugs.
- **EPC quota:** The EPC API (DLUHC/MHCLG) has a 100-request-per-day limit on the free tier. The route is multi-constituency but will start returning errors if the quota is exhausted across constituencies in a single day.
- **Electoral Calculus seat names:** Electoral Calculus uses Title Case seat names that do not always match ONS constituency naming (e.g. "Braintree" vs. "braintree"). If the lookup fails, use `?seat=<exact-EC-name>` to override the resolved name.
- **Non-English `geo`/`areas`:** Scottish, Welsh, and Northern Irish constituencies (approximately 107 of 650) have `geo` and `areas` as `undefined` in the data layer. All geo-dependent routes (`crime`, `floods`, `air-quality`, `planning`, `fixmystreet`, `worship`, `epc`, `census`) return HTTP 400 for these slugs.

## Testing

Start the dev server:

```bash
npm run dev
```

Example URLs to exercise the three tiers of support:

| URL | What to expect |
|---|---|
| `http://localhost:3000/?constituency=braintree` | Fully-supported case — all widgets load |
| `http://localhost:3000/?constituency=witham` | Non-Braintree English constituency — all fully-multi routes load; partial routes return 400 |
| `http://localhost:3000/?constituency=edinburgh-east` | Scottish constituency — geo-dependent routes return 400; parliament/petitions/hansard load |

API routes can be tested directly:

```
http://localhost:3000/api/crime?constituency=witham
http://localhost:3000/api/census?constituency=witham&topic=age-under16
http://localhost:3000/api/census?constituency=edinburgh-east&topic=age-under16   # expect 400
```

## Data fields

What `getFullData(slug)` returns and which fields are populated for non-English constituencies:

| Field | Type | Present for non-English? | Notes |
|---|---|---|---|
| `constituency` | `Constituency` | Yes | Name, slug, ONS code, MP name, party, member ID, constituency ID, region, county, electorate, 2024 results |
| `mp` | `MpData \| undefined` | Yes (where MP data is available) | Bio, committee memberships, social handles where sourced |
| `geo` | `ConstituencyGeo \| undefined` | No | `{lat, lng, bbox}` — populated for ~543/650 English constituencies only |
| `areas` | `ConstituencyAreas \| undefined` | No | `{lads: [{code, name, nomisCode}], wards: [{code, name}]}` — English constituencies only |
| `candidates` | `Candidate[]` | Yes | 2024 GE results: `{name, party, votes, share, elected}` |
| `newsFeeds` | `NewsFeedConfig \| undefined` | No | `{bbcRegional, googleConstituency, googleMp}` — currently only populated for English constituencies |

Routes that depend on `geo` or `areas` return HTTP 400 for the ~107 Scottish, Welsh, and Northern Irish constituencies where these fields are `undefined`.

## Environment variables

Put these in `.env.local` (git-ignored).

### Required: Firebase

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

### Optional: feature-specific keys

| Variable | Enables |
|---|---|
| `ANTHROPIC_API_KEY` | Daily AI brief (`/api/ai-brief`) |
| `EPC_API_KEY` + `EPC_EMAIL` | EPC ratings (`/api/epc`) |
| `APIFY_API_TOKEN` | X/Twitter mentions and opposition tracking |
| `SERPAPI_KEY` | Google Trends data |
| `X_BEARER_TOKEN` | Direct X API access (alternative to Apify) |

Without optional keys the corresponding widget returns a placeholder or falls back to static data. No other routes are affected.

## Project structure

```
src/
├── app/
│   ├── api/              # Data routes — one folder per data source
│   └── (pages)           # Dashboard pages and components
├── components/           # React components (widgets, maps, charts)
├── data/
│   └── index.ts          # getFullData(slug) — data layer entry point
└── lib/
    ├── firebase.ts       # Firestore client (HMR-safe singleton)
    └── geo.ts            # Constituency boundary helpers (multi-constituency)
```
