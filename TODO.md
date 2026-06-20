# TODO

Last audited: 2026-06-20

---

## Multi-constituency gaps (things that break or show empty for constituency #2)

- **WardDataHub** — explicitly returns "not yet available" for any non-Braintree slug (`src/components/WardDataHub.tsx:200`). All its data (`wardData`, `wardElectoralCalc`, `wardDemographics`, `demographics`) comes from `@/data/braintree`. Needs per-constituency data or a route.
- **PollingDashboard local section** — `BraintreeLocalSection` uses `BRAINTREE_2024` vote share baseline for swing projections. Non-Braintree shows "not yet available" (`src/components/PollingDashboard.tsx:418`). Needs per-constituency 2024 results piped in from the data layer.
- **ConstituencyMap Essex Police link** — hardcoded to `essex-police/braintree` (`src/components/ConstituencyMap.tsx:494`). Needs a per-constituency police force URL from the data layer, or remove the link.
- **ConstituencyMap ward overlay** — uses `wardData` from `@/data/braintree` as a lookup table for rendering ward labels and EC predictions on the map (`src/components/ConstituencyMap.tsx:229`). Works for Braintree, silently shows no ward data for others.
- **Air quality fallback** — `/api/air-quality` fallback station list is Braintree-only; other constituencies get nothing if OpenAQ returns no results (`src/app/api/air-quality/route.ts:119`).

## Broken / requires env vars not yet set

- **AIBrief** — needs `ANTHROPIC_API_KEY`. Shows "configure key" placeholder.
- **EPCPanel** — needs `EPC_API_KEY` + `EPC_EMAIL`. Register at epc.opendatacommunities.org (free, instant).
- **MentionsFeed** — needs `X_BEARER_TOKEN` or `APIFY_API_TOKEN`.
- **OppositionTracker** — needs `APIFY_API_TOKEN` for live posts; shows candidate list only without it.
- **HealthPanel** — fully built. Fingertips CSV endpoint works; the route parses the ~233k-line response and caches in Firestore for 30 days. Included in 4am deep warm (separate health block, no force flag, 55s timeout). Cold first-load takes 30-45s; all subsequent loads from cache. Priority constituencies also warmed every 2 hours via STANDARD_ROUTES.
- **CQCPanel** — CQC API returns 403; falls back to hardcoded Braintree directory. Other constituencies show "not yet sourced".

## PRs to open upstream (Steve-Aaron)

- Live feeds fix (Sky News / GB News / Times Radio embeds working)
- Data caching layer (Firestore cache-then-refresh pattern)
- Trends free route (`/api/trends-v2` + `TrendsPanel` wired to it)

## Decided / no action needed

- Constituency config refactor — done. All 27 API routes accept `?constituency=<slug>`.
- TrendsPanel → trends-v2 — done. `/api/trends` (SerpAPI) route has been deleted.
- Times Radio live feed — fixed (`youtubeVideoId` now populated).
- Schools data — real DfE/Ofsted data for all 650 constituencies.
- Mock data audit — complete. AI Brief pipeline is clean (no mock data summarised).
- SerpAPI decision — resolved by deletion of `/api/trends`.
