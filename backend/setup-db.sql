-- Create enum types
CREATE TYPE user_role AS ENUM ('FARMER', 'FPO', 'BUYER', 'CONSUMER', 'ADMIN');
CREATE TYPE commodity AS ENUM ('TOMATO', 'ONION', 'POTATO', 'WHEAT', 'RICE', 'CORN', 'BRINJAL', 'LETTUCE', 'MANGO', 'APPLE', 'BANANA', 'OTHER');
CREATE TYPE grade AS ENUM ('GRADE_A', 'GRADE_B', 'GRADE_C', 'PREMIUM');
CREATE TYPE listing_status AS ENUM ('ACTIVE', 'INACTIVE', 'SOLD');
CREATE TYPE demand_status AS ENUM ('ACTIVE', 'MATCHED', 'COMPLETED', 'CANCELLED');
CREATE TYPE order_status AS ENUM ('PENDING', 'CONFIRMED', 'PICKUP_READY', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED');
CREATE TYPE sync_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
CREATE TYPE validation_status AS ENUM ('VALID', 'INVALID', 'SUSPICIOUS');
CREATE TYPE forecast_model_version AS ENUM ('DEMO', 'SYNTHETIC', 'REAL');

-- Create tables

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'FARMER',
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE farmer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  fpo_name VARCHAR(255),
  location VARCHAR(255),
  state VARCHAR(100),
  district VARCHAR(100),
  total_land_area DECIMAL,
  crops TEXT[],
  contact_number VARCHAR(50),
  bank_details VARCHAR(255),
  verification_status BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE fpo_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  registration_number VARCHAR(100) UNIQUE,
  location VARCHAR(255),
  state VARCHAR(100),
  district VARCHAR(100),
  total_farmers INT,
  contact_number VARCHAR(50),
  verification_status BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE buyer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  organization_type VARCHAR(100),
  location VARCHAR(255),
  state VARCHAR(100),
  district VARCHAR(100),
  annual_capacity DECIMAL,
  contact_number VARCHAR(50),
  email VARCHAR(255),
  verification_status BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE consumer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  address TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE produce_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID REFERENCES farmer_profiles(id) ON DELETE CASCADE,
  commodity commodity NOT NULL,
  variety VARCHAR(100),
  grade grade,
  quantity DECIMAL NOT NULL,
  unit VARCHAR(20) DEFAULT 'kg',
  asking_price DECIMAL NOT NULL,
  location VARCHAR(255) NOT NULL,
  state VARCHAR(100) NOT NULL,
  district VARCHAR(100),
  expected_harvest_date TIMESTAMP,
  availability_date TIMESTAMP DEFAULT NOW(),
  description TEXT,
  listing_status listing_status DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE buyer_demands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES buyer_profiles(id) ON DELETE CASCADE,
  commodity commodity NOT NULL,
  variety VARCHAR(100),
  required_quantity DECIMAL NOT NULL,
  unit VARCHAR(20) DEFAULT 'kg',
  required_grade grade,
  target_price DECIMAL,
  delivery_location VARCHAR(255) NOT NULL,
  required_delivery_date TIMESTAMP,
  demand_status demand_status DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES buyer_profiles(id) ON DELETE SET NULL,
  listing_id UUID REFERENCES produce_listings(id) ON DELETE SET NULL,
  demand_id UUID REFERENCES buyer_demands(id) ON DELETE SET NULL,
  quantity DECIMAL NOT NULL,
  unit VARCHAR(20) DEFAULT 'kg',
  final_price DECIMAL,
  transport_cost DECIMAL DEFAULT 0,
  net_realization DECIMAL,
  delivery_location VARCHAR(255),
  delivery_date TIMESTAMP,
  delivery_mode VARCHAR(50) DEFAULT 'TRANSPORT_PARTNER',
  order_status order_status DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  produce_listing_id UUID REFERENCES produce_listings(id),
  quantity DECIMAL NOT NULL,
  unit VARCHAR(20) DEFAULT 'kg',
  price DECIMAL NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state VARCHAR(100) NOT NULL,
  district VARCHAR(100),
  market VARCHAR(255) NOT NULL,
  commodity commodity NOT NULL,
  variety VARCHAR(100),
  grade grade,
  arrival_date TIMESTAMP NOT NULL,
  min_price DECIMAL NOT NULL,
  max_price DECIMAL NOT NULL,
  modal_price DECIMAL,
  source VARCHAR(50) DEFAULT 'government_api' NOT NULL,
  fetched_at TIMESTAMP DEFAULT NOW() NOT NULL,
  validation_status validation_status DEFAULT 'VALID',
  validation_error TEXT,
  data_freshness VARCHAR(20) DEFAULT 'unknown',
  UNIQUE(state, district, market, commodity, arrival_date)
);

CREATE TABLE historical_market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state VARCHAR(100) NOT NULL,
  district VARCHAR(100),
  market VARCHAR(255) NOT NULL,
  commodity VARCHAR(100) NOT NULL,
  variety VARCHAR(100),
  grade VARCHAR(50),
  arrival_date TIMESTAMP NOT NULL,
  min_price DECIMAL NOT NULL,
  max_price DECIMAL NOT NULL,
  modal_price DECIMAL,
  source VARCHAR(50) NOT NULL DEFAULT 'agmarknet_historical',
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
  data_period VARCHAR(50) NOT NULL DEFAULT 'agmarknet_2008_2022',
  data_source VARCHAR(100),
  source_record_id VARCHAR(255),
  location VARCHAR(255),
  UNIQUE(state, district, market, commodity, arrival_date)
);

CREATE TABLE market_data_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) DEFAULT 'government_api' NOT NULL,
  endpoint TEXT,
  parameters JSONB DEFAULT '{}',
  record_count INT DEFAULT 0,
  valid_count INT DEFAULT 0,
  suspicious_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  sync_status sync_status DEFAULT 'PENDING',
  started_at TIMESTAMP DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commodity commodity NOT NULL,
  location VARCHAR(255) NOT NULL,
  forecast_horizon VARCHAR(50) NOT NULL,
  predicted_demand DECIMAL NOT NULL,
  confidence_score DECIMAL DEFAULT 0,
  model_version forecast_model_version DEFAULT 'DEMO',
  generated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  notes TEXT,
  UNIQUE(commodity, location, forecast_horizon)
);

CREATE TABLE routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin VARCHAR(255) NOT NULL,
  destination VARCHAR(255) NOT NULL,
  distance_km DECIMAL NOT NULL,
  estimated_time VARCHAR(50),
  estimated_cost DECIMAL DEFAULT 0,
  vehicle_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'planned',
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE impact_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type VARCHAR(100) NOT NULL,
  metric_value DECIMAL NOT NULL,
  unit VARCHAR(50),
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'info',
  related_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_produce_listings_commodity ON produce_listings(commodity, state, listing_status);
CREATE INDEX idx_produce_listings_farmer ON produce_listings(farmer_id);
CREATE INDEX idx_buyer_demands_commodity ON buyer_demands(commodity, demand_status);
CREATE INDEX idx_buyer_demands_buyer ON buyer_demands(buyer_id);
CREATE INDEX idx_orders_buyer ON orders(buyer_id, order_status);
CREATE INDEX idx_orders_listing ON orders(listing_id);
CREATE INDEX idx_market_prices_commodity ON market_prices(commodity, state, district);
CREATE INDEX idx_market_prices_freshness ON market_prices(data_freshness, fetched_at);
CREATE INDEX idx_forecasts_commodity ON forecasts(commodity, location);
CREATE INDEX idx_impact_metrics_type ON impact_metrics(metric_type, period_start);
CREATE INDEX idx_notifications_user_id ON notifications(user_id, is_read);

-- App-owned daily market history (append-only; grows over time as AgriConnect
-- builds its own historical market-price intelligence). Never auto-deleted.
-- `variety` is NOT NULL DEFAULT '' so a plain UNIQUE constraint preserves the
-- commodity+market+date+variety+source identity (different varieties never
-- overwrite each other).
CREATE TABLE app_daily_market_history (
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

CREATE INDEX idx_admh_commodity_date ON app_daily_market_history(commodity, price_date);
CREATE INDEX idx_admh_state_commodity ON app_daily_market_history(state, commodity, price_date);
CREATE INDEX idx_admh_source ON app_daily_market_history(source, fetched_at);
CREATE INDEX idx_admh_price_date ON app_daily_market_history(price_date);

-- AGMARKNET reference data (migration 011): stores the AGMARKNET reference
-- universe (states, districts, markets, commodities, varieties) for backend
-- fallback discovery and coverage mapping. Reference/discovery only — the 605
-- AGMARKNET commodities are never displayed as the UI-supported set.
CREATE TABLE IF NOT EXISTS agmarknet_reference (
  id VARCHAR(255) PRIMARY KEY,
  ref_type VARCHAR(20) NOT NULL CHECK (ref_type IN ('state','district','market','commodity','variety','grade','group')),
  agmarknet_id VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  parent_type VARCHAR(20),
  parent_id VARCHAR(50),
  details JSONB DEFAULT '{}',
  synced_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agr_type ON agmarknet_reference(ref_type, name);
CREATE INDEX IF NOT EXISTS idx_agr_parent ON agmarknet_reference(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_agr_name ON agmarknet_reference(name);

