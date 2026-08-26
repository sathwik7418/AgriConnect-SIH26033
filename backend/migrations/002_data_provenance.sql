-- Add data provenance columns to market_prices
ALTER TABLE market_prices
  ADD COLUMN IF NOT EXISTS source_record_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS sync_id UUID,
  ADD COLUMN IF NOT EXISTS raw_response JSONB;

-- Add source badges to forecasts
ALTER TABLE forecasts
  ADD COLUMN IF NOT EXISTS data_source VARCHAR(50) DEFAULT 'seed';

-- Create supply_demand_summary view for quick queries
CREATE OR REPLACE VIEW v_supply_demand_summary AS
SELECT
  l.commodity,
  COUNT(DISTINCT l.id) as supply_listings,
  COALESCE(SUM(l.quantity), 0) as total_supply,
  COUNT(DISTINCT d.id) as demand_count,
  COALESCE(SUM(d.required_quantity), 0) as total_demand,
  CASE
    WHEN COALESCE(SUM(d.required_quantity), 0) = 0 THEN 'NO_DEMAND'
    WHEN COALESCE(SUM(l.quantity), 0) >= COALESCE(SUM(d.required_quantity), 0) THEN 'SURPLUS'
    WHEN COALESCE(SUM(l.quantity), 0) >= COALESCE(SUM(d.required_quantity), 0) * 0.8 THEN 'BALANCED'
    ELSE 'SHORTAGE'
  END as status
FROM produce_listings l
LEFT JOIN buyer_demands d ON l.commodity = d.commodity AND d.demand_status = 'ACTIVE'
WHERE l.listing_status = 'ACTIVE'
GROUP BY l.commodity;
