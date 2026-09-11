-- Add geocoding/provenance fields expected by the current profile onboarding API

ALTER TABLE farmer_profiles
  ADD COLUMN IF NOT EXISTS latitude DECIMAL,
  ADD COLUMN IF NOT EXISTS longitude DECIMAL,
  ADD COLUMN IF NOT EXISTS geo_provider VARCHAR(100),
  ADD COLUMN IF NOT EXISTS verification_timestamp TIMESTAMP;

ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS latitude DECIMAL,
  ADD COLUMN IF NOT EXISTS longitude DECIMAL,
  ADD COLUMN IF NOT EXISTS geo_provider VARCHAR(100),
  ADD COLUMN IF NOT EXISTS verification_timestamp TIMESTAMP;
