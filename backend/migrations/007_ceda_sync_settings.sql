-- Migration 007: CEDA sync config & runtime status (admin-controlled)

CREATE TABLE IF NOT EXISTS ceda_sync_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed default config row (no API key stored in DB — always from env)
INSERT INTO ceda_sync_state (key, value)
VALUES ('config', jsonb_build_object(
  'enabled', false,
  'intervalMs', 0,
  'yearSpan', 1,
  'maxCommodities', 8,
  'maxStates', 5,
  'states', '[]'::jsonb,
  'commodities', '[]'::jsonb
))
ON CONFLICT (key) DO NOTHING;

-- Seed default status row
INSERT INTO ceda_sync_state (key, value)
VALUES ('status', jsonb_build_object(
  'running', false,
  'lastRunAt', null,
  'lastStatus', 'NONE',
  'lastInserted', 0,
  'lastError', null,
  'totalSynced', 0
))
ON CONFLICT (key) DO NOTHING;
