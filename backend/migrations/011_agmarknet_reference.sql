-- Migration 011: AGMARKNET reference data tables
-- Stores the full AGMARKNET reference universe (states, districts, markets,
-- commodities, varieties) for backend fallback discovery and coverage mapping.
-- Used for reference/discovery only — never displayed as 605 commodities in UI.

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