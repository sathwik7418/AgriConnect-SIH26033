# STAGE 2: Implementation Plan

> Reconciled from STAGE 1 audit + Approved Architecture (source of truth).
> Created 2026-09-10. No code modified yet.

---

## RECONCILIATION: Audit vs Architecture

| Topic | Stage 1 Audit Said | Architecture Says | Decision |
|-------|-------------------|-------------------|----------|
| Internal unit | ₹/quintal | **₹/kg** (user pref) | **₹/kg at storage time** |
| Commodity column | Expand enum or VARCHAR | **VARCHAR/TEXT + reference table** | **VARCHAR** |
| market_prices UNIQUE | Add variety | **Add variety + source** | **(state,district,market,commodity,variety,arrival_date,source)** |
| historical_market_prices UNIQUE | Add variety | **Add variety + source** | **(state,district,market,commodity,variety,arrival_date,source)** |
| Resource B | Optional | **Don't replace A, can supplement** | **Skip for now** |
| CEDA | Historical only | **Historical only, confirmed** | **No change** |
| PyPI agmarknet | Dead | **Investigate filters() only** | **Skip (Node already has reference data)** |
| App daily history | Already correct | **Already correct** | **No change** |
| data.gov.in limit:500 | Bug | **Fix with pagination** | **Use limit=5000 + offset** |

---

## FILES TO MODIFY

### Database
1. `backend/setup-db.sql` — commodity enum → VARCHAR migration
2. New: `backend/migrations/012-market-intelligence.sql` — all schema changes

### Providers
3. `backend/providers/mandi.js` — pagination, price normalization to ₹/kg
4. `backend/providers/agmarknet.js` — extract arrivals, normalize to ₹/kg

### Services
5. `backend/services/mandiSyncService.js` — variety-aware UNIQUE upserts, ₹/kg normalization
6. `backend/services/intelligenceService.js` — variety in benchmark queries, remove unit CASE WHEN
7. `backend/services/marketOverviewService.js` — variety in SELECTs, remove commodity enum dependency
8. `backend/services/marketReferenceService.js` — variety in reference queries
9. `backend/services/marketFallbackService.js` — variety in fallback queries
10. `backend/services/ai/recommendationService.js` — variety in APMC benchmark query
11. `backend/services/ai/priceForecastService.js` — variety awareness (historical only)
12. `backend/services/assistantService.js` — variety in market_prices SELECTs

### API Routes
13. `backend/server.js` — add variety to /latest, /ranked, /snapshot, /daily-intelligence SELECTs

### Frontend
14. `frontend/src/pages/MarketPrices.jsx` — variety display, variety filter

### Tests
15. New: `backend/tests/market-intelligence-v2.test.js` — comprehensive variety/unit/source tests

---

## DB MIGRATIONS (012-market-intelligence.sql)

### M1: Convert commodity enum to VARCHAR
```sql
-- Step 1: Add temporary VARCHAR column
ALTER TABLE market_prices ADD COLUMN commodity_v VARCHAR(100);
ALTER TABLE produce_listings ADD COLUMN commodity_v VARCHAR(100);
ALTER TABLE buyer_demands ADD COLUMN commodity_v VARCHAR(100);
ALTER TABLE app_daily_market_history ADD COLUMN commodity_v VARCHAR(100);

-- Step 2: Copy enum values to VARCHAR
UPDATE market_prices SET commodity_v = commodity::text;
UPDATE produce_listings SET commodity_v = commodity::text;
UPDATE buyer_demands SET commodity_v = commodity::text;
UPDATE app_daily_market_history SET commodity_v = commodity::text;

-- Step 3: Drop old enum columns and constraints
ALTER TABLE market_prices DROP COLUMN commodity;
ALTER TABLE produce_listings DROP COLUMN commodity;
ALTER TABLE buyer_demands DROP COLUMN commodity;
ALTER TABLE app_daily_market_history DROP COLUMN commodity;

-- Step 4: Rename new columns
ALTER TABLE market_prices RENAME COLUMN commodity_v TO commodity;
ALTER TABLE produce_listings RENAME COLUMN commodity_v TO commodity;
ALTER TABLE buyer_demands RENAME COLUMN commodity_v TO commodity;
ALTER TABLE app_daily_market_history RENAME COLUMN commodity_v TO commodity;

-- Step 5: Set NOT NULL
ALTER TABLE market_prices ALTER COLUMN commodity SET NOT NULL;
ALTER TABLE produce_listings ALTER COLUMN commodity SET NOT NULL;
ALTER TABLE buyer_demands ALTER COLUMN commodity SET NOT NULL;
ALTER TABLE app_daily_market_history ALTER COLUMN commodity SET NOT NULL;

-- Step 6: Drop the enum type (after all references removed)
DROP TYPE IF EXISTS commodity;
```

### M2: Add variety + source to market_prices UNIQUE
```sql
-- Remove old UNIQUE constraint
ALTER TABLE market_prices DROP CONSTRAINT IF EXISTS market_prices_state_district_market_commodity_arrival_date_key;

-- Ensure variety has no NULLs (for UNIQUE to work)
UPDATE market_prices SET variety = '' WHERE variety IS NULL;

-- Add variety-aware + source-aware UNIQUE
ALTER TABLE market_prices ADD CONSTRAINT uq_market_prices_identity
  UNIQUE (state, district, market, commodity, variety, arrival_date, source);
```

### M3: Add variety + source to historical_market_prices UNIQUE
```sql
ALTER TABLE historical_market_prices DROP CONSTRAINT IF EXISTS historical_market_prices_state_district_market_commodity_arrival_date_key;

UPDATE historical_market_prices SET variety = '' WHERE variety IS NULL;

ALTER TABLE historical_market_prices ADD CONSTRAINT uq_historical_identity
  UNIQUE (state, district, market, commodity, variety, arrival_date, source);
```

### M4: Add price_per_kg column + backfill
```sql
-- Add normalized price column
ALTER TABLE market_prices ADD COLUMN price_per_kg DECIMAL;
ALTER TABLE app_daily_market_history ADD COLUMN price_per_kg DECIMAL;
ALTER TABLE historical_market_prices ADD COLUMN price_per_kg DECIMAL;

-- Backfill: normalize existing data to ₹/kg
-- mandi_api / historical_dataset / agmarknet_historical / government_api / seed_demo = stored in ₹/quintal
UPDATE market_prices SET price_per_kg = ROUND(modal_price / 100, 2)
WHERE source IN ('mandi_api', 'historical_dataset', 'agmarknet_historical', 'government_api', 'seed_demo');

-- agmarknet_current = already stored in ₹/kg (mandiSyncService converts)
UPDATE market_prices SET price_per_kg = modal_price
WHERE source = 'agmarknet_current';

-- Same for history tables
UPDATE app_daily_market_history SET price_per_kg = ROUND(modal_price / 100, 2)
WHERE source IN ('mandi_api', 'historical_dataset', 'agmarknet_historical', 'government_api', 'seed_demo');

UPDATE app_daily_market_history SET price_per_kg = modal_price
WHERE source = 'agmarknet_current';

UPDATE historical_market_prices SET price_per_kg = ROUND(modal_price / 100, 2);
```

### M5: Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_mp_variety ON market_prices(commodity, variety, state);
CREATE INDEX IF NOT EXISTS idx_mp_source ON market_prices(source, arrival_date);
CREATE INDEX IF NOT EXISTS idx_admh_variety ON app_daily_market_history(commodity, variety, price_date);
CREATE INDEX IF NOT EXISTS idx_hmp_variety ON historical_market_prices(commodity, variety, arrival_date);
```

---

## PROVIDER CHANGES

### mandi.js
- **Pagination**: Replace `limit: 500` with paginated fetch. data.gov.in supports `limit` up to 5000. Use `limit=5000` + `offset` loop until all records fetched.
- **Price normalization**: Store ₹/kg from the start. In `_normalizeRecord()`, divide all prices by 100 (quintal→kg).
- **Arrivals**: data.gov.in doesn't have arrivals in its schema — no change needed.

### agmarknet.js
- **Arrivals extraction**: Currently dropped. Extract `row.arrivals` from nested response.
- **Price normalization**: Currently the provider returns raw ₹/quintal. Keep raw. Let `mandiSyncService` normalize to ₹/kg (existing behavior).

---

## SYNC PIPELINE CHANGES (mandiSyncService.js)

### storeMandiRecords()
- **UNIQUE constraint**: ON CONFLICT now references `(state, district, market, commodity, variety, arrival_date, source)` — variety-aware + source-aware.
- **price_per_kg**: Always compute and store `price_per_kg = modal_price / 100` for quintal sources, or `modal_price` for kg sources. This becomes the canonical internal price.
- **Fallback safety**: AGMARKNET fallback `DO NOTHING` on conflict — never overwrites primary.

### appendToDailyHistory()
- No schema change needed (already has variety-aware UNIQUE).
- Ensure `price_per_kg` is stored.

### syncCommodity()
- **Pagination**: Call `mandiProvider.fetchPrices({ commodity, limit: 5000 })` instead of `limit: 500`.
- Add retry with backoff on API failure.

---

## QUERY SERVICE CHANGES

### intelligenceService.js
- **Benchmark queries**: Add `variety` to SELECT and WHERE clauses where commodity+variety-specific queries are needed.
- **Remove unit CASE WHEN**: With `price_per_kg` column, use it directly instead of source-specific division.
- **_normalizePrice()**: Simplify to just return `price_per_kg` when available, fallback to source-specific logic.

### marketOverviewService.js
- **Commodity universe**: Remove dependency on `commodity` enum. Query `DISTINCT commodity FROM market_prices` instead.
- **Variety**: Add variety to today-rates SELECTs.
- **Remove CASE WHEN**: Use `price_per_kg` directly.

### marketReferenceService.js
- **Variety**: Add variety parameter to `latestByCommodity()`.
- **Remove CASE WHEN**: Use `price_per_kg`.
- **Variety relaxation**: First try commodity+variety, then fall back to commodity-only. Mark when benchmark is commodity-level vs variety-specific.

### marketFallbackService.js
- **Variety**: Add variety to fallback queries.

### recommendationService.js
- **Variety**: Add variety to APMC benchmark query. Try commodity+variety first, then commodity-only.
- **Mark scope**: When variety is relaxed, explicitly note "commodity-level benchmark".

### priceForecastService.js
- **Variety**: Add variety awareness to historical queries. Use `price_per_kg` for consistent units.
- **Source awareness**: Don't mix CEDA state-level with AGMARKNET market-level as equivalent.

### assistantService.js
- **Variety in SELECTs**: Add `variety` to the market_prices queries in `buildContext()`.
- **Variety in CHECK_PRICE**: Include variety in price retrieval.
- **Variety in prompts**: When variety is detected in user query, include it in the context.

---

## API ENDPOINT CHANGES (server.js)

### /api/market-prices/latest (line 3212)
Add `variety` to SELECT. Change DISTINCT ON to include variety.

### /api/market-prices/ranked (line 3232)
Add `variety` to SELECT in loadLatest.

### /api/market-prices/snapshot (line 3161)
Add `variety` to SELECT.

### /api/market-prices/daily-intelligence (line 2997)
Add `variety` to SELECTs. Remove source-specific CASE WHEN (use `price_per_kg`).

### normalizeMarketPriceRow (used by all endpoints)
Add `variety` to the normalized output object.

---

## FRONTEND CHANGES (MarketPrices.jsx)

- **Variety column**: Display variety in card view and table view.
- **Variety filter**: Add variety dropdown/search that filters by selected commodity's varieties.
- **Provenance**: Show source label more prominently. Distinguish "current" vs "historical".
- **Unit display**: Always show ₹/kg with original unit in tooltip if different.

---

## RISKS

| Risk | Severity | Mitigation |
|------|----------|------------|
| Enum→VARCHAR migration may break queries using `commodity::text` cast | HIGH | Test all queries; `::text` cast works on VARCHAR too |
| UNIQUE constraint change may lock table briefly | MEDIUM | Use `DROP CONSTRAINT` + `ADD CONSTRAINT` (not ALTER TYPE) |
| Existing ₹/quintal data needs backfill to price_per_kg | MEDIUM | One-time SQL UPDATE, idempotent |
| Frontend may break if commodity column type changes | LOW | `::text` cast in SQL handles both enum and VARCHAR |
| AI prompts may need updating for variety context | LOW | Add variety to context building, not prompt structure |

## ROLLBACK STRATEGY

Each migration step is reversible:
- M1: Re-add enum, copy VARCHAR back, drop VARCHAR column
- M2/M3: Drop new constraint, re-add old constraint
- M4: Drop price_per_kg columns
- M5: Drop new indexes

Backup before migration: `pg_dump sih26033 > backup_012.sql`

---

## TEST PLAN

1. **Variety coexistence**: Two varieties of same commodity/market/date coexist in market_prices
2. **Primary preference**: data.gov.in (mandi_api) preferred over AGMARKNET fallback
3. **Fallback fills gaps**: AGMARKNET fills observations where data.gov.in has no data
4. **Fallback never overwrites**: AGMARKNET DO NOTHING on conflict with existing mandi_api row
5. **CEDA isolation**: CEDA data never enters market_prices
6. **Unit consistency**: All price_per_kg values are in ₹/kg regardless of source
7. **AI chat variety**: AI retrieves variety-specific prices when asked
8. **Recommendation variety**: Recommendations use variety-specific benchmarks
9. **Historical source identity**: historical_market_prices preserves source per row
10. **App history growth**: app_daily_market_history accumulates across multiple sync runs
11. **No fabrication**: No ₹0, no fake prices, explicit "no data" when unavailable
12. **Pagination**: mandi.js fetches >500 records without truncation
13. **Commodity VARCHAR**: Non-enum commodities (e.g., "COTTON", "CHILLI") stored successfully
14. **Arrivals preserved**: AGMARKNET arrivals stored when available
