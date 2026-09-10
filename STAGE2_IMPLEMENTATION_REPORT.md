# STAGE 2 Implementation Report — Variety-Aware Market Intelligence

**Project:** AgriConnect (SIH26033) · **Scope:** STAGE 2 plan (`STAGE2-implementation-plan.md`, 2026-09-10)
**Date:** 2026-09-11 · **Verification:** tests + live backend (:5001) + browser (dev :5173)

---

## 1. Context

STAGE 1 audit flagged four integrity gaps in the current-price pipeline: mixed ₹/quintal vs ₹/kg,
a commodity enum that could not hold non-enum crops, uniqueness that ignored `variety`/`source`,
and a 500-record data.gov.in fetch cap. This stage makes the pipeline **variety-aware,
source-provenance-preserving, and internally unit-consistent (₹/kg)** without ever fabricating a price.

## 2. Architecture decisions (as approved)

| Decision | Implementation |
|---|---|
| Internal unit | **₹/kg at storage time**; raw sources preserved in raw columns |
| Commodity | `VARCHAR(100)` (migration 012) — `COTTON`, `CHILLI`, etc. no longer enum-locked |
| market_prices UNIQUE | `(state, district, market, commodity, variety, arrival_date, source)` |
| historical UNIQUE | `(state, district, market, commodity, variety, arrival_date, source)` |
| app history UNIQUE | `uq_admh_identity` — same identity incl. variety + source |
| Source precedence | data.gov.in (`mandi_api`) primary; AGMARKNET fallback (`agmarknet_current`) **never overwrites** |
| CEDA | Historical only — hard guard at provider + service boundary |
| Pagination | data.gov.in `limit=5000` + `offset`, multi-page, 10-page safety cap |

## 3. Changes delivered

### Database (`backend/migrations/012-market-intelligence.sql` — applied; pre-migration dump `backend/backup_pre_012.sql`)
- `commodity` → VARCHAR(100) on `market_prices` and related tables.
- Added `price_per_kg` (and historical/`app_daily_market_history` equivalents), backfilled from `modal_price`/100 or ₹/kg sources.
- Variety-aware UNIQUE constraints (listed above) replace the old commodity-only conflict targets.
- Indexes for variety lookups; `arrivals` preserved in daily history.

### Services
| File | Change |
|---|---|
| `backend/services/mandiSyncService.js` | `storeMandiRecords` (variety+source upsert, ₹/kg via `computePricePerKg`), `appendToDailyHistory` (identity upsert, arrivals, price_per_kg), `assertNotCeda` hard guard, `validateRecord` (rejects ₹0, ordering violations, future dates), `fetchAgmarknetCurrent`, `syncCommodity` (primary→fallback) |
| `backend/services/assistantService.js` | `VARIETY_SYNONYMS` + `detectVariety(queryText)`; `buildGroundedContext` prefers named-variety rows with any-variety fallback; deterministic CHECK_PRICE message + `_buildBlocks` MARKET_PRICE_CARD derive min/max from the stored raw unit factor so 2300/2400/2500 → ₹23/24/25/kg and always prefer `price_per_kg`; mentions variety when present |
| `backend/services/ai/recommendationService.js` | APMC benchmark is variety-aware: variety-specific-first with any-variety fallback; `variety` included in the recommendation's label + `underlyingValues` |
| `backend/services/marketReferenceService.js` | reference query now selects `price_per_kg` |
| `backend/services/cedaSyncService.js` | CEDA kept strictly historical (never a current-price source) |
| `backend/server.js` | manual sync mandi path switched from the legacy `mandiProvider.storeRecords` (old conflict target + missing price_per_kg) to `storeMandiRecords` |

### Providers
`backend/providers/mandi.js` pagination (`limit=5000` + `offset`, verified multi-page) already in place; now exercised by tests.

### Frontend (`frontend/src/pages/MarketPrices.jsx`)
- Card view: variety badge inline.
- Mobile stacked card: `· {variety}` in the sub-line.
- Desktop table: new **Variety** column (`<td>{p.variety || <span>—</span>}</td>`).
- `getPriceDetails(..., pricePerKg)` prefers `price_per_kg` over the ₹/quintal heuristic.

## 4. Verification

### Tests (all run with `NODE_ENV=test node tests/<file>.test.js`)
| Suite | Result |
|---|---|
| `market-intelligence-v2.test.js` (**new**, 14 TEST-PLAN categories: variety coexistence, primary preference, fallback fills gaps, fallback never overwrites, CEDA isolation, ₹/kg unit consistency, AI chat variety, recommendation variety, historical source identity, history growth, no fabrication, >500-record pagination, non-enum commodity VARCHAR, arrivals preserved) | **15 passed, 0 failed** |
| `market-intelligence-strategy.test.js` | 11 passed, 0 failed |
| `market-reference-service.test.js` (updated seed rows → `price_per_kg`) | 6 passed, 0 failed |
| `phase9-features.test.js` | 9 passed, 0 failed |
| `today-market-rates.test.js` | PASS (38 supported, 37 with real current data) |
| `assistant-structured-response.test.js` — Section A hermetic | 6 passed — blocks/min-max unit fix verified |
| `assistant-structured-response.test.js` — Section B live | Blocked by **pre-existing** email-verification setup `404` (unrelated to STAGE 2) |
| Frontend build | `npx vite build` ✓ (2.5s, only chunk-size warnings) |

### Live backend (:5001, dev `--watch` auto-reload)
- `/api/health` ok; `/api/market-prices/snapshot` returns `variety` + `price_per_kg` (e.g. TOMATO Jowai APMC "017" ₹42.5/kg, Doraha "Deshi" ₹22.5/kg).

### Browser (dev :5173, logged-in farmer/buyer)
- **Cards view:** 36 live quotes + 2 honest "We won't guess the price" cards — variety shows in sub-line.
- **Table view:** Varieties column populated.
- **Mobile (390px):** stacked cards + table both show variety.
- **Console:** 0 errors.

## 5. Known limitations (honest)
- Assistant live (Section B) auth-setup test fails on an unrelated pre-existing email-verify `404` endpoint — not a regression.
- Legacy raw artifact: "Onion Green" shows ₹0.1/kg from an old ₹/quintal record; displayed without fabrication (pre-existing data, not introduced here).
- `/snapshot` returns one row per (commodity, variety); consumers should group by commodity if a single row is expected.

## 6. Git status
Entire STAGE 2 backend is a set of **new (untracked)** files (`mandiSyncService.js`, `assistantService.js`, `recommendationService.js`, `marketReferenceService.js`, `cedaSyncService.js`, migration 012, tests) plus tracked-file edits (`providers/mandi.js`, `server.js`, `MarketPrices.jsx`). The repo's working tree also contains many unrelated pre-existing uncommitted changes and reports from earlier milestones. **Not committed — awaiting user approval** before commit/push.