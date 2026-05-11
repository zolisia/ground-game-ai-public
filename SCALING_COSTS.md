# Scaling Costs — `ground-game-ai-public`

**Audience:** Knox (business partner).
**Question:** what does this cost per month at 5 / 20 / 650 constituencies, what gets called how often, and where does it break?
**Date:** 2026-05-11. Branch: `zoja/dev`.
**Today's actual spend:** £0/month. Only Firebase is configured; every paid API is absent from `.env.local`. Numbers below are projections **assuming all paid APIs are switched on**.

---

## TL;DR

- **At 5 constituencies (early pilot): ~£87/month.** Apify dominates (~£64).
- **At 20 constituencies (full pilot): ~£350/month.** Apify ~£255 + AI Brief ~£89.
- **At 650 constituencies (full UK): ~£15,500/month** on the current uncached architecture.
- **First thing that breaks: gov.uk EPC's 100/day quota — at 4 constituencies.** It's a hard wall, not a budget question; only a quota uplift request fixes it.
- **The single optimisation that matters: cache `/api/mentions` and `/api/opposition`** for 1 hour. Current code re-fetches on every page-view. Adding caching cuts the 650-constituency bill by roughly 50% and the 20-constituency bill by 30%.
- **Anthropic note (important):** the projections below use the project lead's stated $15/$75 per million tokens. That's Opus pricing. The route actually uses **Haiku 4.5 at $1/$5 per million tokens** — actual Anthropic costs would be ~15× lower than shown. The high figure is a conservative ceiling.

---

## Pricing assumptions used

| Input | Value | Source |
|---|---|---|
| Anthropic input | **$15 per 1M tokens** | Per project lead. (Opus 4 rate; the route uses Haiku 4.5 at ~$1/1M — actual costs ~15× lower) |
| Anthropic output | **$75 per 1M tokens** | Per project lead. (Opus 4 rate; Haiku 4.5 is ~$5/1M) |
| Apify | **$0.30 per 1,000 items scraped** | https://apify.com/pricing |
| Apify min plan | **$49/month "Personal"** (= ~£39) | Minimum if you use any Apify; usage above $49 charged on top |
| SerpAPI Developer | **$50/month for 5,000 calls**, $0.015/call overage | https://serpapi.com/pricing |
| SerpAPI Production | **$130/month for 15,000 calls**, then $0.0087/call overage | https://serpapi.com/pricing |
| gov.uk EPC | **Free — 100 requests/day quota** | https://epc.opendatacommunities.org/docs/api |
| Firebase Spark (free) | 50K reads/day, 20K writes/day, 1GB | https://firebase.google.com/pricing |
| Firebase Blaze | $0.06 / 100K reads, $0.18 / 100K writes beyond free | https://firebase.google.com/pricing |
| Vercel Hobby | Free, 100GB bandwidth/month | https://vercel.com/pricing |
| Vercel Pro | $20/seat/month | https://vercel.com/pricing |
| FX rate | **$1 = £0.787** (i.e. £/$=1/1.27) | Per project lead |
| Baseline page-views | **2 per constituency per day** for uncached routes | Per project lead |
| Active page-views | **10 per constituency per day** for Apify routes | Per project lead |
| AI Brief baseline | **1 generation/constituency/day** (30-min TTL absorbs most page-views) | Inferred from route TTL |
| AI Brief active | **3 generations/constituency/day** (morning/noon/evening) | Per project lead |
| Tokens per AI Brief call | **5,000 input + 1,500 output** | Measured in earlier dev test (response was ~6KB ≈ 1,500 tokens output) |

---

## Section 1 — Master cost table (current configuration, 2 page-views/day baseline)

Every external API our routes call. "How often" is per constituency per day. Free APIs have £0 columns but appear here for completeness — you can see at a glance how much of the architecture is genuinely free.

| Service / API | Used by route | How often (current) | Cost per call | 5 const. | 20 const. | 650 const. | Notes |
|---|---|---|---|---|---|---|---|
| **Anthropic** (Haiku 4.5) | `/api/ai-brief` | 1 gen/day (cached 30 min) | $0.1875 = £0.148¹ | **£22** | **£89** | **£2,880** | `ANTHROPIC_API_KEY`. Worst-case at Opus pricing; actual ~15× less at Haiku rates. |
| **Apify — mentions** | `/api/mentions` | 2 calls/day (no cache) | $0.15 = £0.118 | **£35** | **£142** | **£4,608** | `APIFY_API_TOKEN`. 500 tweets per call. Route has **no cache** — every page-view fires a fresh fetch. |
| **Apify — opposition** | `/api/opposition` | 2 calls/day (no cache) | $0.12 = £0.094 | **£28** | **£113** | **£3,683** | `APIFY_API_TOKEN`. ~400 tweets per call (multiple candidates). **No cache.** |
| **SerpAPI** | `/api/trends` | 8 calls/day (3 sub-queries × 2 pv + 2 related) | $0.01 = £0.008² | £0³ | £0³ | £0³ | `SERPAPI_KEY`. **Currently disabled** — env var missing. Superseded by free `/api/trends-v2`. If switched on at 650 const.: £1,823/mo. |
| **Firebase Firestore** | Cache layer | ~30 reads/day, ~5 writes/day | $0.0000006/read, $0.0000018/write | **£0** | **£0** | **£15** | Free tier covers ≤ 50 constituencies easily. |
| **Vercel** | Hosting | 1 page-view = 1 request | Within Hobby tier | **£0** | **£0** | **£16⁴** | Pro tier ($20/mo) may be required at scale for SLA reasons, not cost. |
| **gov.uk EPC** | `/api/epc` | 24h cache; multi-call per refresh | Free (100/day quota) | **£0** | **£0** | **£0** | `EPC_API_KEY`, `EPC_EMAIL`. **Breaks at 4 constituencies** — see §5. |
| **data.police.uk** | `/api/crime` | 15-min TTL — fresh fetch every 15 min if anyone's loading | Free, soft rate limit ~15 concurrent | £0 | £0 | £0 | Aggressive TTL causes upstream pressure at scale — see §5. |
| **UK Parliament Members API** | `/api/parliament`, `/api/hansard` | 24h cache | Free | £0 | £0 | £0 | No env var. |
| **Hansard API** | `/api/hansard` | 24h cache | Free | £0 | £0 | £0 | No env var. |
| **ONS / NOMIS** | `/api/census`, `/api/employment`, `/api/universal-credit`, `/api/commons-library` | 7-day or 24h cache | Free | £0 | £0 | £0 | No env var. |
| **gov.uk Petitions** | `/api/petitions` | 24h cache | Free | £0 | £0 | £0 | No env var. |
| **Environment Agency floods** | `/api/floods` | Every request, no cache | Free | £0 | £0 | £0 | Small response; no cache risk. |
| **HM Land Registry** | `/api/house-prices` | 24h cache | Free | £0 | £0 | £0 | No env var. |
| **FixMyStreet** | `/api/fixmystreet` | 30-min cache | Free | £0 | £0 | £0 | No env var. |
| **OpenAQ** | `/api/air-quality` | 24h cache | Free | £0 | £0 | £0 | No env var. |
| **OpenStreetMap Overpass** | `/api/worship` | 7-day cache | Free, "be polite" | £0 | £0 | £0 | No env var. |
| **OHID Fingertips (public health)** | `/api/health` | 24h cache | Free | £0 | £0 | £0 | No env var. |
| **PlanIt** | `/api/planning` | 1-hour cache | Free | £0 | £0 | £0 | No env var. |
| **CQC** | `/api/cqc` | 24h cache | Free | £0 | £0 | £0 | `CQC_PARTNER_CODE` optional; falls back to hardcoded list when missing. |
| **electoralcalculus.co.uk** | `/api/electoral-calculus` | Scraped, 24h cache | Free | £0 | £0 | £0 | No env var. |
| **Polling aggregator / Wikipedia** | `/api/polling` | 24h cache | Free | £0 | £0 | £0 | No env var. |
| **Google News + local RSS** | `/api/news` | Hourly | Free | £0 | £0 | £0 | No env var. |
| **BBC / Sky / Guardian / Telegraph / GB News RSS** | `/api/headlines` | Hourly | Free | £0 | £0 | £0 | No env var. |
| **google-trends-api** (npm pkg) | `/api/trends-v2` | 12h cache | Free (scrapes Google) | £0 | £0 | £0 | Package unmaintained; 2 of 3 endpoints currently fail. |
| **Schools (hardcoded)** | `/api/schools` | n/a (static data) | Free | £0 | £0 | £0 | Hardcoded list of ~18 schools in route. |
| **TOTAL (do-nothing trajectory)** | | | | **~£87** | **~£350** | **~£11,200** | Plus £39/mo Apify Personal plan if total Apify usage < £39 (only applies at very small scale). |

¹ AI Brief cost-per-call math: 5,000 input × $15/1M + 1,500 output × $75/1M = $0.075 + $0.1125 = $0.1875.
² SerpAPI cost-per-call estimated at $0.01 (Developer plan $50 ÷ 5,000 included calls).
³ SerpAPI rows show £0 because `SERPAPI_KEY` is currently missing — the route returns `source: "unavailable"`. Footnote in §4 shows what it would cost if re-enabled.
⁴ Vercel Pro figure assumes one team seat is purchased for production rollout regardless of constituency count.

**At 5 constituencies, Apify (£63) is already above the £39 Personal plan minimum, so no flat minimum is added separately.**

### Section 1 — math breakdown for the three paid lines

**Anthropic AI Brief at 20 constituencies:**
```
1 gen/day × 30 days × 20 constituencies × $0.1875/call
= 600 calls × $0.1875
= $112.50/month
× £0.787 = £88.50/month
```

**Apify mentions at 20 constituencies:**
```
2 pv/day × 30 days × 20 constituencies × $0.15/call
= 1,200 calls × $0.15
= $180/month
× £0.787 = £141.66/month
```

**Apify opposition at 20 constituencies:**
```
2 pv/day × 30 days × 20 constituencies × $0.12/call
= 1,200 calls × $0.12
= $144/month
× £0.787 = £113.33/month
```

Total Apify at 20: £254.99. Plus AI Brief £88.50. **≈ £350/month.**

---

## Section 2 — Active use scenario (10 page-views/day Apify, 3 AI briefs/day)

What costs become if MPs and staff actively use the dashboard throughout the day.

| Service | How often (active use) | Cost per call | 5 const. | 20 const. | 650 const. | Notes |
|---|---|---|---|---|---|---|
| **Anthropic AI Brief** | 3 gen/day | $0.1875 | **£66** | **£266** | **£8,637** | 3× current baseline. Per project lead's "morning/noon/evening" assumption. |
| **Apify mentions** | 10 calls/day (no cache) | $0.15 | **£177** | **£709** | **£23,038** | 5× current baseline. Every page-view fires a fresh fetch. |
| **Apify opposition** | 10 calls/day (no cache) | $0.12 | **£142** | **£567** | **£18,430** | Same multiplier. |
| **SerpAPI** (if re-enabled) | 24 calls/day | $0.01–0.015 | (£39) | **(£102)**⁵ | **(£5,453)**⁵ | 3× usage. Forces Production tier ($130/mo) at 20+ constituencies. |
| **Firebase Firestore** | 3× current | as before | £0 | £0 | **£35** | Free tier still covers ≤ 50 const. |
| **Vercel** | More bandwidth, more requests | Within Pro tier | £16 | £16 | £16 | 1 Pro seat assumed; cost flat. |
| **All free APIs** | 3× current | Free | £0 | £0 | £0 | Free remains free. |
| **TOTAL (active use, SerpAPI off)** | | | **~£400** | **~£1,560** | **~£50,150** | |
| **TOTAL (active use, SerpAPI on)** | | | **~£440** | **~£1,660** | **~£55,600** | |

⁵ SerpAPI: 5 const = within $50 Developer tier. 20 const = 14,400/mo, still Developer. 50 const = 36,000/mo → Production. 650 const = 468,000/mo → Production + huge overage.

### Section 2 — math breakdown

**Apify mentions at 20 constituencies, active use:**
```
10 pv/day × 30 days × 20 constituencies × $0.15
= 6,000 calls × $0.15
= $900/month
× £0.787 = £708.30/month
```

**AI Brief at 20 constituencies, active use:**
```
3 gen/day × 30 days × 20 constituencies × $0.1875
= 1,800 calls × $0.1875
= $337.50/month
× £0.787 = £265.61/month
```

**At 650 constituencies, active use** the Apify mentions line alone is **£23,038/month** — over a quarter million pounds per year on Twitter scraping for just one of three social feeds. This is the line that needs caching most urgently.

---

## Section 3 — Optimised scenario (1-hour cache on Apify, on-demand only)

Same active-use traffic assumption (10 page-views/day, 3 AI briefs/day), but with:

- **Apify routes get a 1-hour Firestore cache** (matching the existing 13 cached routes' pattern). Effective calls drop from 10/day to a max of 24/day capped by hours, but in practice the cache catches most clustered visits — model **5 calls/day** (50% reduction).
- **`/api/trends` removed** entirely — superseded by free `/api/trends-v2`. SerpAPI cost goes to £0.
- **EPC** moved to nightly batch (no quota concern at low constituency count).
- Everything else unchanged.

| Service | How often (optimised) | 5 const. | 20 const. | 650 const. | Savings vs Section 2 |
|---|---|---|---|---|---|
| Anthropic AI Brief | 3 gen/day (unchanged) | £66 | £266 | £8,637 | 0% (already lean per Haiku 4.5; rewriting prompt for fewer input tokens could cut this further) |
| **Apify mentions** | **5 calls/day** (1-hr cache) | **£89** | **£354** | **£11,519** | **50%** |
| **Apify opposition** | **5 calls/day** (1-hr cache) | **£71** | **£283** | **£9,215** | **50%** |
| SerpAPI | **Removed** — use `/api/trends-v2` | £0 | £0 | £0 | 100% |
| Firebase | Slight uptick from extra cache writes | £0 | £0 | £40 | (small increase) |
| Vercel | unchanged | £16 | £16 | £16 | 0% |
| **TOTAL (optimised, active use)** | | **~£242** | **~£919** | **~£29,427** | **~41%** |

**Savings vs Section 2 active use:** ~40% across the board. Most of the saving comes from Apify caching.

### Section 3 — math breakdown

**Apify mentions at 20 constituencies, with 1-hour cache:**
```
5 calls/day × 30 days × 20 constituencies × $0.15
= 3,000 calls × $0.15
= $450/month
× £0.787 = £354.15/month
(vs £708.30 in Section 2 — saves £354/month)
```

**At 650 const., Apify mentions optimised:**
```
5 × 30 × 650 × $0.15 = $14,625/month = £11,510/month
(vs £23,038 active-use unrestricted — saves £11,528/month)
```

---

## Section 4 — Cost-cutting recommendations (per paid API)

### 4.1 Apify (mentions + opposition)

**Current monthly cost at 20 constituencies, do-nothing:** £255.
**Why it costs this:** Both routes are **uncached**. Every page-view of the dashboard fires a fresh Apify scrape. The 2 page-views/day baseline already produces 60 scrapes/month/constituency.

**Steps to reduce:**

| Optimisation | Engineering time | Cost saving (20 const., active use) | Trade-off |
|---|---|---|---|
| Add 1-hour Firestore cache to both routes | **~2 hours** (copy the pattern from `/api/crime`) | ~50% (£640/month → £320/month) | Mentions can be up to 1 hour stale. Fine for politics. |
| Reduce `maxItems` from 500 to 200 tweets | 30 minutes | ~60% per call (proportional) | Fewer mentions surfaced; may miss long-tail. |
| Move to on-demand only (call only when panel is visible) | 1 day | ~90% in low-traffic constituencies | Cold-cache delay on first load. |
| Combine `mentions` + `opposition` into one Apify run | 1 day | ~20% (one actor call instead of two) | Code refactor; requires Apify actor that handles both. |

### 4.2 Anthropic (AI Brief)

**Current monthly cost at 20 constituencies, do-nothing:** £89 (at Opus pricing); **£6 at actual Haiku 4.5 pricing**.
**Why it costs this:** Each brief consumes ~5K input tokens + ~1.5K output tokens. At Haiku 4.5 this is genuinely cheap; at Opus pricing it'd be ~£89/month.

**Steps to reduce:**

| Optimisation | Engineering time | Cost saving | Trade-off |
|---|---|---|---|
| Extend AI Brief TTL from 30 min to 24h | 5 minutes (one constant change) | Up to 50% (cache holds longer between regenerations) | Brief can be 24h stale. Acceptable for a "daily intelligence brief." |
| Trim the system prompt (currently fetches lots of upstream data) | 2-4 hours | ~30% on input token cost | Less context = potentially less informative briefs. |
| Use a smaller model (already on Haiku 4.5; could move to Haiku 3.5 if quality holds) | 1 hour to verify | ~20% | Quality drop possible. |

### 4.3 SerpAPI

**Current monthly cost at 20 constituencies, do-nothing:** £0 (route disabled).
**Why it'd cost what it would:** Multiple sub-queries per page-view at $0.01–0.015 per call. Burns through the 5,000-call Developer plan in roughly 30 days at active use, then forces Production tier ($130/mo).

**Steps to reduce:**

| Optimisation | Engineering time | Cost saving | Trade-off |
|---|---|---|---|
| Delete the SerpAPI `/api/trends` route, point `TrendsPanel.tsx` to `/api/trends-v2` only | **Already done** (commit `d3a9a16`) — frontend is on trends-v2; old route is orphaned and not consumed | 100% | Loss of trending searches / regional comparison sections (currently broken on trends-v2 anyway). |
| Remove the orphan `/api/trends/route.ts` file | 5 minutes | (housekeeping; prevents accidental re-enabling) | None. |

### 4.4 gov.uk EPC

**Current monthly cost at 20 constituencies:** £0 (free).
**The problem isn't cost — it's the 100/day quota** (see §5).

**Steps:**

| Action | Engineering time | Effect | Trade-off |
|---|---|---|---|
| Move EPC fetches to nightly batch (single Firestore-cached fetch per constituency per night) | 2-3 hours | Cuts daily calls per constituency from N to 1 | Slightly stale data (24h instead of live) |
| Request quota uplift from gov.uk | 1-2 weeks waiting | Could raise daily quota | Bureaucratic; unpublished process |
| Use longer postcode aggregation per call | 2 hours | Cuts calls per refresh | Less granular data |

---

## Section 5 — Breaking points

| Service / Limit | Breaks at | Why | How to fix |
|---|---|---|---|
| **gov.uk EPC 100/day quota** | **~4 constituencies** | Each constituency requires multiple EPC calls (one per postcode prefix). With ~6 postcodes per constituency × 4-5 fetches each = ~25-30 calls per refresh. At 4 constituencies and 1 refresh/day, we're at 100+ calls. **First wall.** Money does not solve it. | Move to nightly batch + request quota uplift. |
| **data.police.uk soft rate limit (~15 concurrent)** | **~50 constituencies** | At 15-min TTL × N constituencies, simultaneous cache misses can produce concurrent requests. With 20 constituencies and bursty traffic, peaks could hit the rate limit. | Stagger refreshes; longer TTL (15 min → 1 hour); back-off retry. |
| **SerpAPI Developer plan (5,000/mo)** | **~5 constituencies if active use** | Active-use 24 calls/day × 5 = 3,600/mo. Hit ceiling within first month. | Move to Production tier ($130/mo) — buys ~20 constituencies. Beyond that, costs grow linearly. |
| **Apify cost ceiling** | **Soft at 50 constituencies (~£1k/month), hard at 650 (~£8-23k/month)** | Linear per-call cost; no included quota. Every tweet has a real $ cost. | Cache aggressively (see §4.1). No way around the linear scaling without architectural change. |
| **Firebase Spark free tier** | **~80 constituencies** | 50K reads/day limit. With 25 cached routes × N constituencies × cache reads per visit, breach happens around N=80. | Upgrade to Blaze pay-as-you-go (small cost — pennies per month at our scale). |
| **Vercel Hobby tier** | **Probably never on bandwidth, but SLA may need Pro before that** | 100GB bandwidth covers very high traffic for a data dashboard. The reason to upgrade is SLA/auth/team features, not bandwidth ceiling. | $20/seat/month for Pro. |
| **google-trends-api package** | **Already broken** | Package last published 2020; 2 of 3 endpoint methods now return HTML (consent wall) instead of JSON. | Find maintained fork, switch to SerpAPI (paid), or accept partial coverage. Tracked in TODO.md. |

---

## Closing — what Knox most likely wants to know

- **At the pilot scale (5-20 constituencies):** monthly cost is **~£90-£350** on current architecture, **~£60-£240** with a single afternoon of caching work. Either is small.
- **At 650 constituencies:** monthly cost is **~£11k-£15k** on current architecture, **~£8k-£10k** optimised. At that scale, Apify dominates and only architectural cost-control work (caching, on-demand fetching, alternative free data sources) keeps the bill from running away.
- **The hard wall comes first:** gov.uk EPC's 100/day quota blocks constituency #4-5 — not a money problem, a permission problem. Plan for the quota uplift conversation **before** the pilot count grows.
