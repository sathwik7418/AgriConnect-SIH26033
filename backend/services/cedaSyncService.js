// cedaSyncService.js
// Background/cache-based CEDA Agmarknet HISTORICAL data synchronization pipeline.
//
// IMPORTANT real-data rules:
//  - CEDA is used ONLY as a HISTORICAL data source (expanding historical coverage
//    for trends/forecasts). It is NEVER used for current/today's prices.
//  - Current prices come exclusively from the mandi / Data.gov.in pipeline
//    (market_prices table consumed by marketReferenceService).
//  - This service never fabricates data. If CEDA is rate-limited, it backs off
//    gracefully, logs the rate-limit, and retries on the next cycle.
//
// CEDA state-level endpoints return daily aggregates per commodity+state:
//   prices    -> { date, commodity_id, census_state_id, min_price, max_price, modal_price }
//   quantities-> { date, commodity_id, census_state_id, quantity }

const { query } = require('../db');
const cedaApi = require('./cedaApi');

const ENV_INTERVAL_MS = parseInt(process.env.CEDA_SYNC_INTERVAL_MS || '0', 10);
const ENV_YEAR_SPAN = parseInt(process.env.CEDA_SYNC_YEAR_SPAN || '1', 10);
const ENV_STATES = (process.env.CEDA_SYNC_STATES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let timer = null;
let running = false;

// ─── Persisted config & status helpers ────────────────────────────────────

async function _loadRow(key) {
  try {
    const res = await query('SELECT value FROM ceda_sync_state WHERE key = $1', [key]);
    return res.rows.length > 0 ? res.rows[0].value : null;
  } catch { return null; }
}

async function _saveRow(key, value) {
  await query(
    `INSERT INTO ceda_sync_state (key, value, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
    [key, JSON.stringify(value)]
  );
}

function _envConfig() {
  return {
    enabled: ENV_INTERVAL_MS > 0 && !!process.env.CEDA_API_KEY,
    intervalMs: ENV_INTERVAL_MS,
    yearSpan: ENV_YEAR_SPAN,
    maxCommodities: parseInt(process.env.CEDA_SYNC_MAX_COMMODITIES || '8', 10),
    maxStates: parseInt(process.env.CEDA_SYNC_MAX_STATES || '5', 10),
    states: ENV_STATES,
    commodities: (process.env.CEDA_SYNC_COMMODITIES || '').split(',').filter(Boolean),
  };
}

// Public: read effective config (merged env defaults with persisted overrides)
async function getConfig() {
  const saved = await _loadRow('config');
  if (!saved) return _envConfig();
  // Merge: saved overrides env defaults, but never store API key
  return { ..._envConfig(), ...saved };
}

// Public: update config (admin UI)
async function setConfig(patch) {
  const current = await getConfig();
  const next = { ...current, ...patch };
  // Never persist API key in DB
  delete next.apiKey;
  await _saveRow('config', next);
  // Restart the scheduler with new config
  stop();
  if (next.enabled && next.intervalMs > 0) {
    startWithConfig(next);
  }
  return next;
}

async function getStatus() {
  const saved = await _loadRow('status');
  return saved || {
    running: false, lastRunAt: null, lastStatus: 'NONE',
    lastInserted: 0, lastError: null, totalSynced: 0,
  };
}

async function _updateStatus(patch) {
  const current = await getStatus();
  const next = { ...current, ...patch };
  if (patch.lastInserted !== undefined && patch.lastInserted !== null) {
    next.totalSynced = (current.totalSynced || 0) + patch.lastInserted;
  }
  await _saveRow('status', next);
}

function enabled() {
  return ENV_INTERVAL_MS > 0 && !!process.env.CEDA_API_KEY;
}

function log(...args) {
  console.log('[cedaSync]', ...args);
}

async function upsertPriceRecord({ commodityId, commodityName, stateId, stateName, item }) {
  const date = String(item.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { inserted: 0, updated: 0 };
  return query(
    `INSERT INTO ceda_historical_market_data
       (commodity_id, commodity_name, census_state_id, state_name, data_date,
        min_price, max_price, modal_price, unit, indicator, quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'per quintal', 'price', NULL)
     ON CONFLICT (commodity_id, census_state_id, data_date, indicator)
     DO UPDATE SET min_price = EXCLUDED.min_price,
                   max_price = EXCLUDED.max_price,
                   modal_price = EXCLUDED.modal_price,
                   fetched_at = CURRENT_TIMESTAMP`,
    [commodityId, commodityName, stateId, stateName, date, item.min_price, item.max_price, item.modal_price]
  ).then((res) => ({ inserted: res.rowCount || 0, updated: 0 }));
}

async function upsertQuantityRecord({ commodityId, commodityName, stateId, stateName, item }) {
  const date = String(item.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { inserted: 0, updated: 0 };
  return query(
    `INSERT INTO ceda_historical_market_data
       (commodity_id, commodity_name, census_state_id, state_name, data_date,
        min_price, max_price, modal_price, unit, indicator, quantity)
     VALUES ($1, $2, $3, $4, $5, NULL, NULL, NULL, 'per quintal', 'quantity', $6)
     ON CONFLICT (commodity_id, census_state_id, data_date, indicator)
     DO UPDATE SET quantity = EXCLUDED.quantity,
                   fetched_at = CURRENT_TIMESTAMP`,
    [commodityId, commodityName, stateId, stateName, date, item.quantity]
  ).then((res) => ({ inserted: res.rowCount || 0, updated: 0 }));
}

async function syncCommoditiesAndStates() {
  let commodities, geographies;
  try {
    commodities = await cedaApi.getCommodities();
  } catch (e) {
    log('commodities fetch failed (will retry next cycle):', e.message);
    commodities = [];
  }
  try {
    geographies = await cedaApi.getGeographies();
  } catch (e) {
    log('geographies fetch failed (will retry next cycle):', e.message);
    geographies = [];
  }

  // Persist reference caches.
  for (const c of commodities || []) {
    if (c && c.commodity_id) {
      try {
        await query(
          `INSERT INTO ceda_commodities (commodity_id, commodity_name)
           VALUES ($1, $2) ON CONFLICT (commodity_id) DO UPDATE SET commodity_name = EXCLUDED.commodity_name, fetched_at = CURRENT_TIMESTAMP`,
          [c.commodity_id, c.commodity_name]
        );
      } catch (e) { /* ignore per-row */ }
    }
  }
  for (const g of geographies || []) {
    if (g && g.census_state_id != null && g.census_district_id != null) {
      try {
        await query(
          `INSERT INTO ceda_geographies (census_state_id, census_state_name, census_district_id, census_district_name)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (census_state_id, census_district_id) DO UPDATE SET census_state_name = EXCLUDED.census_state_name, census_district_name = EXCLUDED.census_district_name, fetched_at = CURRENT_TIMESTAMP`,
          [g.census_state_id, g.census_state_name, g.census_district_id, g.census_district_name]
        );
      } catch (e) { /* ignore per-row */ }
    }
  }

  return { commodities, geographies };
}

function buildStates(geographies, configuredStates) {
  if (configuredStates && configuredStates.length > 0) {
    return configuredStates.map(Number).filter((n) => Number.isFinite(n));
  }
  const unique = new Map();
  for (const g of geographies || []) {
    if (g.census_state_id != null) unique.set(g.census_state_id, g.census_state_name);
  }
  return [...unique.entries()].map(([id, name]) => ({ id, name }));
}

// Pulls historical prices + quantities for the configured commodities/states.
// Bounded by year span and a per-run cap so we never hammer a rate-limited API.
async function runSyncCycle(overrideConfig) {
  if (running) { log('previous sync still running, skipping this cycle'); return; }
  running = true;
  await _updateStatus({ running: true, lastStatus: 'RUNNING' });
  log('starting historical sync cycle');
  const jobId = `${Date.now()}`;
  let inserted = 0;

  try {
    const cfg = overrideConfig || await getConfig();
    const { commodities, geographies } = await syncCommoditiesAndStates();

    // Determine which commodities to sync: all from CEDA cache (bounded), or a
    // configured subset. Fall back to all known commodities.
    let commList = commodities || [];
    if (cfg.commodities && cfg.commodities.length > 0) {
      commList = commList.filter((c) =>
        cfg.commodities.some((w) => String(w) === String(c.commodity_id) || String(w) === String(c.commodity_name))
      );
    }
    // Bound commodity count to avoid hammering.
    commList = commList.slice(0, cfg.maxCommodities || 8);

    const stateList = buildStates(geographies, cfg.states).slice(0, cfg.maxStates || 5);
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setFullYear(toDate.getFullYear() - (cfg.yearSpan || 1));

    const toDateStr = toDate.toISOString().slice(0, 10);
    const fromDateStr = fromDate.toISOString().slice(0, 10);

    let rateLimited = false;

    for (const c of commList) {
      for (const s of stateList) {
        const stateId = Number(s.id ?? s);
        const stateName = typeof s === 'object' ? s.name : undefined;
        let job = await query(
          `INSERT INTO ceda_sync_log (job_id, status, commodity_id, state_id, from_date, to_date)
           VALUES ($1,'RUNNING',$2,$3,$4,$5) RETURNING id`,
          [jobId, c.commodity_id, stateId, fromDateStr, toDateStr]
        );

        // Prices
        try {
          const data = await cedaApi.getPrices({ commodityId: c.commodity_id, stateId, fromDate: fromDateStr, toDate: toDateStr });
          for (const item of data || []) {
            const r = await upsertPriceRecord({ commodityId: c.commodity_id, commodityName: c.commodity_name, stateId, stateName, item });
            inserted += r.inserted;
          }
        } catch (e) {
          rateLimited = rateLimited || /rate limit|too many/i.test(e.message);
          await query(`UPDATE ceda_sync_log SET status='FAILED', error_message=$2, rate_limited=$3, completed_at=CURRENT_TIMESTAMP WHERE id=$1`,
            [job.rows[0].id, e.message, /rate limit|too many/i.test(e.message)]);
          continue;
        }

        // Quantities
        try {
          const data = await cedaApi.getQuantities({ commodityId: c.commodity_id, stateId, fromDate: fromDateStr, toDate: toDateStr });
          for (const item of data || []) {
            const r = await upsertQuantityRecord({ commodityId: c.commodity_id, commodityName: c.commodity_name, stateId, stateName, item });
            inserted += r.inserted;
          }
        } catch (e) {
          rateLimited = rateLimited || /rate limit|too many/i.test(e.message);
        }

        await query(`UPDATE ceda_sync_log SET status='SUCCESS', records_inserted=$2, records_updated=$3, rate_limited=$4, completed_at=CURRENT_TIMESTAMP WHERE id=$1`,
          [job.rows[0].id, inserted, 0, rateLimited]);
      }
    }

    await _updateStatus({ running: false, lastRunAt: new Date().toISOString(), lastStatus: rateLimited ? 'RATE_LIMITED' : 'SUCCESS', lastInserted: inserted, lastError: null });
    log(`sync cycle complete: +${inserted} historical rows${rateLimited ? ' (rate-limited, backed off)' : ''}`);
  } catch (e) {
    log('sync cycle error:', e.message);
    await _updateStatus({ running: false, lastRunAt: new Date().toISOString(), lastStatus: 'ERROR', lastInserted: inserted, lastError: e.message });
  } finally {
    running = false;
  }
}

function startWithConfig(cfg) {
  if (!cfg.enabled || !process.env.CEDA_API_KEY) {
    log('CEDA historical sync is disabled (from config).');
    return;
  }
  if (timer) return;
  log(`starting background CEDA historical sync every ${cfg.intervalMs}ms`);
  setTimeout(() => runSyncCycle(cfg), parseInt(process.env.CEDA_SYNC_STARTUP_DELAY_MS || '15000', 10));
  timer = setInterval(() => runSyncCycle(cfg), cfg.intervalMs);
  timer.unref && timer.unref();
}

async function start() {
  const cfg = await getConfig();
  if (!cfg.enabled) {
    log('CEDA historical sync is disabled. Set CEDA_API_KEY and CEDA_SYNC_INTERVAL_MS (ms) to enable.');
    return;
  }
  startWithConfig(cfg);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = {
  start,
  stop,
  runSyncCycle,
  getConfig,
  setConfig,
  getStatus,
  _internal: { upsertPriceRecord, upsertQuantityRecord, buildStates, syncCommoditiesAndStates },
};
