-- Migration 012: Market Intelligence Architecture
-- Converts commodity enum to VARCHAR, adds variety+source-aware UNIQUE constraints,
-- adds price_per_kg column for consistent internal unit (₹/kg).
--
-- REVERSIBLE: Each step can be undone. Backup first: pg_dump sih26033 > backup_012.sql

BEGIN;

-- ============================================================================
-- M1: Convert commodity enum to VARCHAR(100)
-- ============================================================================

-- 1a. Add temporary VARCHAR columns
ALTER TABLE market_prices ADD COLUMN commodity_v VARCHAR(100);
ALTER TABLE produce_listings ADD COLUMN commodity_v VARCHAR(100);
ALTER TABLE buyer_demands ADD COLUMN commodity_v VARCHAR(100);
ALTER TABLE forecasts ADD COLUMN commodity_v VARCHAR(100);

-- 1b. Copy enum values to VARCHAR
UPDATE market_prices SET commodity_v = commodity::text;
UPDATE produce_listings SET commodity_v = commodity::text;
UPDATE buyer_demands SET commodity_v = commodity::text;
UPDATE forecasts SET commodity_v = commodity::text;

-- 1c. Drop old enum columns
ALTER TABLE market_prices DROP COLUMN commodity;
ALTER TABLE produce_listings DROP COLUMN commodity;
ALTER TABLE buyer_demands DROP COLUMN commodity;
ALTER TABLE forecasts DROP COLUMN commodity;

-- 1d. Rename new columns
ALTER TABLE market_prices RENAME COLUMN commodity_v TO commodity;
ALTER TABLE produce_listings RENAME COLUMN commodity_v TO commodity;
ALTER TABLE buyer_demands RENAME COLUMN commodity_v TO commodity;
ALTER TABLE forecasts RENAME COLUMN commodity_v TO commodity;

-- 1e. Set NOT NULL + defaults
ALTER TABLE market_prices ALTER COLUMN commodity SET NOT NULL;
ALTER TABLE produce_listings ALTER COLUMN commodity SET NOT NULL;
ALTER TABLE buyer_demands ALTER COLUMN commodity SET NOT NULL;
ALTER TABLE forecasts ALTER COLUMN commodity SET NOT NULL;

-- 1f. Drop the enum type (no longer referenced)
DROP TYPE IF EXISTS commodity;

-- 1g. Recreate indexes that referenced the enum
DROP INDEX IF EXISTS idx_market_prices_commodity;
CREATE INDEX idx_market_prices_commodity ON market_prices(commodity, state, district);

-- ============================================================================
-- M2: Add variety + source to market_prices UNIQUE constraint
-- ============================================================================

-- 2a. Remove old UNIQUE constraint
ALTER TABLE market_prices DROP CONSTRAINT IF EXISTS market_prices_state_district_market_commodity_arrival_date_key;

-- 2b. Ensure variety has no NULLs
UPDATE market_prices SET variety = '' WHERE variety IS NULL;

-- 2c. Add variety-aware + source-aware UNIQUE
ALTER TABLE market_prices ADD CONSTRAINT uq_market_prices_identity
  UNIQUE (state, district, market, commodity, variety, arrival_date, source);

-- ============================================================================
-- M3: Add variety + source to historical_market_prices UNIQUE constraint
-- ============================================================================

-- 3a. Remove old UNIQUE constraint
ALTER TABLE historical_market_prices DROP CONSTRAINT IF EXISTS historical_market_prices_state_district_market_commodity_ar_key;

-- 3b. Ensure variety has no NULLs
UPDATE historical_market_prices SET variety = '' WHERE variety IS NULL;

-- 3c. Add variety-aware + source-aware UNIQUE
ALTER TABLE historical_market_prices ADD CONSTRAINT uq_historical_identity
  UNIQUE (state, district, market, commodity, variety, arrival_date, source);

-- ============================================================================
-- M4: Add price_per_kg column and backfill
-- ============================================================================

-- 4a. Add column to current prices
ALTER TABLE market_prices ADD COLUMN price_per_kg DECIMAL;

-- 4b. Backfill: sources stored in ₹/quintal → divide by 100
UPDATE market_prices SET price_per_kg = ROUND(modal_price / 100, 2)
WHERE source IN ('mandi_api', 'historical_dataset', 'agmarknet_historical', 'government_api', 'seed_demo')
  AND modal_price IS NOT NULL AND modal_price > 0;

-- 4c. Backfill: agmarknet_current already stored in ₹/kg (converted by mandiSyncService)
UPDATE market_prices SET price_per_kg = modal_price
WHERE source = 'agmarknet_current'
  AND modal_price IS NOT NULL AND modal_price > 0;

-- 4d. Same for app_daily_market_history
ALTER TABLE app_daily_market_history ADD COLUMN price_per_kg DECIMAL;

UPDATE app_daily_market_history SET price_per_kg = ROUND(modal_price / 100, 2)
WHERE source IN ('mandi_api', 'historical_dataset', 'agmarknet_historical', 'government_api', 'seed_demo')
  AND modal_price IS NOT NULL AND modal_price > 0;

UPDATE app_daily_market_history SET price_per_kg = modal_price
WHERE source = 'agmarknet_current'
  AND modal_price IS NOT NULL AND modal_price > 0;

-- 4e. Same for historical_market_prices
ALTER TABLE historical_market_prices ADD COLUMN price_per_kg DECIMAL;

UPDATE historical_market_prices SET price_per_kg = ROUND(modal_price / 100, 2)
WHERE modal_price IS NOT NULL AND modal_price > 0;

-- ============================================================================
-- M5: Performance indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_mp_variety ON market_prices(commodity, variety, state);
CREATE INDEX IF NOT EXISTS idx_mp_source ON market_prices(source, arrival_date);
CREATE INDEX IF NOT EXISTS idx_admh_variety ON app_daily_market_history(commodity, variety, price_date);
CREATE INDEX IF NOT EXISTS idx_hmp_variety ON historical_market_prices(commodity, variety, arrival_date);

COMMIT;
