-- Migration 010: App-owned daily market history table
-- Append-only historical dataset for AgriConnect's own market intelligence.
-- Each row represents a single price observation from a daily sync run.
-- NEVER automatically deleted — this dataset grows over time.
--
-- `variety` is NOT NULL DEFAULT '' in this table ('' = "variety not
-- specified") so a plain UNIQUE constraint can preserve the identity
-- (commodity + market + date + variety + source). Different varieties never
-- overwrite each other.

CREATE TABLE IF NOT EXISTS app_daily_market_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state VARCHAR(100) NOT NULL,
  district VARCHAR(100),
  market VARCHAR(255) NOT NULL,
  commodity VARCHAR(100) NOT NULL,
  variety VARCHAR(100) NOT NULL DEFAULT '',
  grade VARCHAR(50),
  price_date DATE NOT NULL,
  min_price DECIMAL NOT NULL,
  max_price DECIMAL NOT NULL,
  modal_price DECIMAL,
  arrivals DECIMAL,
  source VARCHAR(50) NOT NULL,
  source_record_id VARCHAR(255),
  sync_id UUID,
  fetched_at TIMESTAMP DEFAULT NOW() NOT NULL,
  CONSTRAINT uq_admh_identity UNIQUE (state, district, market, commodity, variety, price_date, source)
);

CREATE INDEX IF NOT EXISTS idx_admh_commodity_date ON app_daily_market_history(commodity, price_date);
CREATE INDEX IF NOT EXISTS idx_admh_state_commodity ON app_daily_market_history(state, commodity, price_date);
CREATE INDEX IF NOT EXISTS idx_admh_source ON app_daily_market_history(source, fetched_at);
CREATE INDEX IF NOT EXISTS idx_admh_price_date ON app_daily_market_history(price_date);