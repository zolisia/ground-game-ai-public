# TODO

Last audited: 2026-06-21

---

## Requires action from Zoja

- **EPC API key** — register free at epc.opendatacommunities.org. Add `EPC_API_KEY` and `EPC_EMAIL` to `.env.local` for dev. Tell Steve to add to Vercel for prod. Route is already multi-constituency.
- **OpenAQ API key** — register free at openaq.org. Add `OPENAQ_API_KEY` to `.env.local` and tell Steve for Vercel. Restores live air quality feed (currently returns empty).

## Requires Steve (Vercel env vars)

- **`CRON_SECRET`** — must be set in Vercel for 4am cache warm to fire.
- **`ANTHROPIC_API_KEY`** — needed for AIBrief panel.
- **EPC + OpenAQ keys** — once Zoja registers (above), pass to Steve for Vercel.

## Blocked on third-party

- **MentionsFeed** — needs `X_BEARER_TOKEN` or `APIFY_API_TOKEN`.
- **OppositionTracker** — needs `APIFY_API_TOKEN`.
- **CQCPanel** — CQC API returns 403. Nothing to do until CQC fix their API.

## Remaining structural gaps (blocked on data, not code)

- **ConstituencyMap ward overlay** — ward labels and EC predictions on the map only render for Braintree. Blocked on ward-level data for other constituencies.
- **WardDataHub** — removed from UI. Component kept in codebase. Restore when real sourced ward vote data exists.

## Decided / no action needed

- Constituency config refactor — done. All 27 API routes accept `?constituency=<slug>`.
- TrendsPanel — done. On trends-v2, old SerpAPI route deleted.
- Times Radio live feed — fixed.
- Schools data — real DfE/Ofsted data for all 650 constituencies.
- Mock data audit — complete. AI Brief pipeline clean.
- PollingDashboard local section — fixed. Uses real per-constituency 2024 results.
- ConstituencyMap hardcoded links — fixed (zoom, Essex Police link, ward fallback).
- Air quality fallback — fixed. Returns empty instead of wrong Braintree stations.
- HealthPanel — fully built. Fingertips CSV endpoint works, 30-day Firestore cache, included in 4am deep warm.
- ECPrediction flash bug — fixed. No longer shows Braintree data while loading another constituency.
- 4am cache warm — fixed. Was timing out at Vercel 300s limit due to force-fetching all 650 routes. Now respects TTL (cache hits return in <1s). hitUrl timeout raised 30s → 55s.
