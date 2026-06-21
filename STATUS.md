# Project Status

Last updated: 2026-06-21

---

## Working

- All 27 API routes multi-constituency (`?constituency=<slug>`)
- 650-constituency data layer (schools, census, deprivation, areas, geo, results)
- Firestore cache-then-refresh on all data routes
- 4am deep cache warm for all 650 constituencies
- 2-hourly cache warm for 9 priority constituencies
- HealthPanel — Fingertips CSV endpoint, 30-day cache
- PollingDashboard — UNS swing projections using real per-constituency 2024 results
- ECPrediction — live Electoral Calculus MRP scrape, no stale Braintree flash
- ConstituencyMap — dynamic zoom, no hardcoded links
- TrendsPanel — trends-v2 (free, no SerpAPI)
- Times Radio / Sky News / GB News live feeds
- Schools data — real DfE/Ofsted for all 650

## Needs API keys

| Panel | Key needed | How to get |
|---|---|---|
| AIBrief | `ANTHROPIC_API_KEY` | Anthropic console — Steve to add to Vercel |
| EPCPanel | `EPC_API_KEY` + `EPC_EMAIL` | Register free at epc.opendatacommunities.org — use Developer API not downloads |
| Air quality | `OPENAQ_API_KEY` | Register free at openaq.org |
| MentionsFeed | `X_BEARER_TOKEN` or `APIFY_API_TOKEN` | Paid |
| OppositionTracker | `APIFY_API_TOKEN` | Paid |

Steve also needs to set `CRON_SECRET` in Vercel for the 4am cron to fire.

## Known limitations

- **CQCPanel** — CQC API returns 403. Blocked until CQC fix their API.
- **ConstituencyMap ward overlay** — ward labels and predictions only render for Braintree. Needs ward-level data for other constituencies.
- **WardDataHub** — removed from UI (data was estimated, not sourced). Component kept in codebase for when real data exists.
