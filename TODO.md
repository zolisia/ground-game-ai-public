# TODO

## Tomorrow / next session
- **Mock data audit.** Pass through the codebase to identify where each panel uses real vs fallback/placeholder/mock data. Specifically:
  - Map all `process.env.*_KEY` checks to what happens when the key is missing.
  - Check `src/data/` for any "fallback" datasets and document which routes use them.
  - Verify the AI brief input pipeline isn't summarising mock data into the daily brief.
  - Output: short list of "panel X uses real data" / "panel Y falls back to Z when W is missing."

## Strategic / bigger
- **Constituency config refactor** (README flags this). Pull Braintree-specific values (lat/lng, ward codes, GeoJSON, postcodes, MP name) into a single config object so adding constituency #2 is a config change, not a hunt-through-files exercise.
- **Tech-lead conversation: SerpAPI vs free Google Trends.** Decide whether to keep paying for SerpAPI long-term or commit to the free path. Both routes will exist after this weekend; pick one.
- **Trends-v2 free path: 2 of 3 sections currently broken** because `google-trends-api` package is 5y stale (last published 2020-12-28) and Google's endpoints have changed. `interestOverTime` works; `dailyTrends` and `interestByRegion` return HTML (likely consent/CAPTCHA wall) that the package can't parse. Options: (a) find or fork a maintained alternative; (b) bypass via SerpAPI (paid); (c) accept partial coverage. Decision deferred to the SerpAPI vs free tech-lead conversation above.

## PRs to open
- Live feeds fix (today's Sky News / GB News / Times Radio work) → upstream Steve-Aaron.
- Data caching layer (existing 9 commits) → upstream Steve-Aaron.
- Trends free route (this weekend's work) → upstream Steve-Aaron, after stage 1 ships.
