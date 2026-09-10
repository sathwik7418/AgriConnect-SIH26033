-- Migration 006: CEDA Agmarknet historical market data (background sync pipeline)
-- CEDA is used ONLY as a HISTORICAL data source. These tables store CEDA's
-- published historical price/quantity time series (state-level daily aggregates).
-- This data must NEVER be presented as "current/today's" prices — current prices
-- come from the mandi / Data.gov.in pipeline (market_prices table).

-- CEDA historical prices (state-level daily aggregates, per commodity).
CREATE TABLE IF NOT EXISTS ceda_historical_market_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commodity_id INT NOT NULL,
  commodity_name VARCHAR(100),
  census_state_id INT NOT NULL,
  state_name VARCHAR(100),
  data_date DATE NOT NULL,
  min_price DECIMAL,
  max_price DECIMAL,
  modal_price DECIMAL,
  unit VARCHAR(20) DEFAULT 'per quintal',
  indicator VARCHAR(20) DEFAULT 'price',
  quantity DECIMAL,
  source VARCHAR(50) DEFAULT 'ceda_agmarknet',
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(commodity_id, census_state_id, data_date, indicator)
);
CREATE INDEX IF NOT EXISTS idx_ceda_hist_commodity_state
  ON ceda_historical_market_data(commodity_id, census_state_id, data_date);

-- CEDA commodities reference cache (mirrors CEDA /agmarknet/commodities).
CREATE TABLE IF NOT EXISTS ceda_commodities (
  commodity_id INT PRIMARY KEY,
  commodity_name VARCHAR(100) NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- CEDA geographies reference cache (mirrors CEDA /agmarknet/geographies).
CREATE TABLE IF NOT EXISTS ceda_geographies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  census_state_id INT NOT NULL,
  census_state_name VARCHAR(100),
  census_district_id INT NOT NULL,
  census_district_name VARCHAR(100),
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(census_state_id, census_district_id)
);

-- CEDA sync run log (supports graceful rate-limit tracking).
CREATE TABLE IF NOT EXISTS ceda_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'RUNNING',
  commodity_id INT,
  state_id INT,
  from_date DATE,
  to_date DATE,
  records_inserted INT DEFAULT 0,
  records_updated INT DEFAULT 0,
  error_message TEXT,
  rate_limited BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_ceda_sync_log_status ON ceda_sync_log(status, started_at);
