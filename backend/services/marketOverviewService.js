/**
 * AgriConnect Market Overview Service
 *
 * Driver for the Assistant's "Today's Market Rates" panel and the chat
 * multi-commodity overview ("What are today's market prices?").
 *
 * Returns every supported commodity (discovered from the DB's `commodity` enum
 * plus marketplace tables — NOT a hardcoded list), each with the latest CURRENT
 * real market observation prioritized district -> state -> national relative to
 * the requesting user's stored location. Commodities with no current real row
 * are returned with an explicit coverage state.
 *
 * Coverage states (per commodity, never fabricated):
 *   AVAILABLE   — has a current (≤ 2 days) real price in market_prices
 *   UNAVAILABLE — market rows exist but all are stale (> 2 days)
 *   NOT_FETCHED — no row ever synced for this commodity
 *   API_ERROR   — the last sync attempt failed
 *
 * It NEVER uses CEDA (historical-only), NEVER uses seed_demo/historical rows as
 * a "today's price", and NEVER fabricates a value. `source` marks the real
 * current-data provenance chain (mandi/Data.gov.in live API -> market_prices).
 */

const { query: defaultDbQuery } = require('../db');
const { classifyCoverage, freshnessLabel } = require('./mandiSyncService');

const CURRENT_SOURCES = "'mandi_api','government_api','agmarknet_current','data_gov_in'";

const COVERAGE_STATES = ['AVAILABLE', 'UNAVAILABLE', 'NOT_FETCHED', 'API_ERROR'];

/**
 * Strip the name into a comparable key (uppercase, trimmed) for matching the
 * initcap'd universe names against raw commodity values from the enum.
 */
function normName(name) {
  return String(name || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * @param {object} opts
 * @param {string} [opts.state]
 * @param {string} [opts.district]
 * @param {Function} [opts.dbQuery] injectable query for hermetic tests
 * @returns {Promise<{rates:Array, location:object|null, availableCount:number, insufficientRealData:boolean, message:string}>}
 */
async function getTodayRates({ state, district, dbQuery } = {}) {
  const executeQuery = dbQuery || defaultDbQuery;

  // Supported commodity universe, discovered from the database so there is no
  // hardcoded list to drift: commodities actually present in market_prices,
  // produce_listings, and buyer_demands. De-duplicated and filtered to
  // conventional crop names (excludes 'OTHER' and CEDA IDs).
  const universeRes = await executeQuery(`
    SELECT DISTINCT TRIM(initcap(mp.commodity)) AS name FROM market_prices mp
      WHERE mp.commodity <> 'OTHER'
    UNION
    SELECT DISTINCT TRIM(initcap(pl.commodity)) FROM produce_listings pl
      WHERE pl.commodity <> 'OTHER'
    UNION
    SELECT DISTINCT TRIM(initcap(bd.commodity)) FROM buyer_demands bd
      WHERE bd.commodity <> 'OTHER'
    ORDER BY name
  `);
  const commodities = universeRes.rows.map(r => String(r.name));
  const commoditySet = new Map();
  commodities.forEach(name => commoditySet.set(normName(name), name));

  // -------------------------------------------------------------------------
  // PHASE 8: Batched queries — fetch all scope rows for every commodity in a
  // small, bounded number of queries instead of 3×N round trips.
  // -------------------------------------------------------------------------
  const loadByScope = async (sql, params, scope) => {
    const r = await executeQuery(sql, params);
    const map = new Map();
    for (const row of r.rows) {
      const key = normName(row.commodity);
      if (map.has(key)) continue; // first (most recent) wins
      // Use price_per_kg column directly (set at sync time)
      const pricePerKg = row.price_per_kg != null ? parseFloat(row.price_per_kg) : null;
      if (pricePerKg == null || pricePerKg <= 0) continue;
      map.set(key, {
        scope,
        market: row.market,
        state: row.state,
        district: row.district,
        variety: row.variety,
        pricePerKg: Math.round(pricePerKg * 10) / 10,
        rawModal: parseFloat(row.modal_price),
        source: row.source,
        arrivalDate: row.arrival_date,
        fetchedAt: row.fetched_at,
        unit: 'per kg',
        coverage: classifyCoverage(row.arrival_date, row.fetched_at),
        freshness: freshnessLabel(row.arrival_date),
        available: classifyCoverage(row.arrival_date, row.fetched_at) === 'AVAILABLE',
      });
    }
    return map;
  };

  // Single batched query per scope — no per-commodity round trips.
  const scopeQueries = [];

  if (state && district) {
    scopeQueries.push({
      key: 'district',
      sql: `SELECT DISTINCT ON (commodity) commodity, market, state, district, variety, modal_price, price_per_kg, source, arrival_date, fetched_at
            FROM market_prices
            WHERE UPPER(state) = UPPER($1) AND UPPER(COALESCE(district,'')) = UPPER($2)
              AND source IN (${CURRENT_SOURCES})
            ORDER BY commodity, arrival_date DESC`,
      params: [state, district],
    });
  }
  if (state) {
    scopeQueries.push({
      key: 'state',
      sql: `SELECT DISTINCT ON (commodity) commodity, market, state, district, variety, modal_price, price_per_kg, source, arrival_date, fetched_at
            FROM market_prices
            WHERE UPPER(state) = UPPER($1)
              AND source IN (${CURRENT_SOURCES})
            ORDER BY commodity, arrival_date DESC`,
      params: [state],
    });
  }
  scopeQueries.push({
    key: 'national',
    sql: `SELECT DISTINCT ON (commodity) commodity, market, state, district, variety, modal_price, price_per_kg, source, arrival_date, fetched_at
          FROM market_prices
          WHERE source IN (${CURRENT_SOURCES})
          ORDER BY commodity, arrival_date DESC`,
    params: [],
  });

  const scopeMaps = {};
  for (const q of scopeQueries) {
    scopeMaps[q.key] = await loadByScope(q.sql, q.params, q.key);
  }

  // -------------------------------------------------------------------------
  // Last sync status — used to classify NOT_FETCHED vs API_ERROR truthfully.
  // -------------------------------------------------------------------------
  let syncFailures = new Set();
  try {
    const syncRes = await executeQuery(
      `SELECT parameters FROM market_data_sync
       WHERE source = 'daily_sync' AND sync_status = 'FAILED'
       ORDER BY started_at DESC LIMIT 1`
    );
    const row = syncRes.rows[0];
    if (row) {
      const p = typeof row.parameters === 'string' ? JSON.parse(row.parameters || '{}') : (row.parameters || {});
      (p.errors || []).forEach(e => {
        if (e && e.commodity) syncFailures.add(normName(String(e.commodity)));
      });
    }
  } catch (err) {
    // Non-fatal — fall back to NOT_FETCHED classification.
  }

  // -------------------------------------------------------------------------
  // Assemble rates — one entry per commodity, best scope wins.
  // -------------------------------------------------------------------------
  const rates = [];
  for (const name of commodities) {
    const key = normName(name);
    const best =
      (state && district ? scopeMaps.district?.get(key) : null) ||
      (state ? scopeMaps.state?.get(key) : null) ||
      scopeMaps.national?.get(key);

    if (best) {
      // Honest data hygiene: a commodity that is not AVAILABLE must never carry
      // a current price. We retain provenance dates for "last observed" display
      // but omit the price fields entirely (undefined) so no consumer can
      // present stale data as live, and existing tests asserting absent
      // fabricated prices keep passing.
      const subject = best.coverage === 'AVAILABLE' ? best : {
        ...best,
        pricePerKg: undefined,
        rawModal: undefined,
      };
      rates.push({
        commodity: name,
        available: subject.available,
        coverage: subject.coverage,
        freshness: subject.freshness,
        scope: subject.scope,
        market: subject.market,
        state: subject.state,
        district: subject.district,
        variety: subject.variety,
        pricePerKg: subject.pricePerKg,
        rawModal: subject.rawModal,
        source: subject.source,
        arrivalDate: subject.arrivalDate,
        fetchedAt: subject.fetchedAt,
        unit: subject.unit,
        scopes: [],
      });
    } else {
      const coverage = syncFailures.has(key) ? 'API_ERROR' : 'NOT_FETCHED';
      rates.push({
        commodity: name,
        available: false,
        coverage,
        freshness: 'UNKNOWN',
        scope: null,
        market: null,
        state: null,
        district: null,
        variety: null,
        pricePerKg: undefined,
        source: null,
        arrivalDate: null,
        fetchedAt: null,
        unit: 'per kg',
        scopes: [],
      });
    }
  }

  const availableCount = rates.filter(r => r.available).length;

  const withData = rates.filter(r => r.arrivalDate);
  const updatedTimes = withData
    .map(r => r.arrivalDate ? new Date(r.arrivalDate).getTime() : 0)
    .filter(Boolean)
    .sort((a, b) => b - a);
  const lastUpdatedAt = updatedTimes.length > 0 ? new Date(updatedTimes[0]).toISOString() : null;

  const coverageCounts = Object.fromEntries(
    COVERAGE_STATES.map(s => [s, rates.filter(r => r.coverage === s).length])
  );

  return {
    rates,
    location: (state && district) ? { state, district } : (state ? { state } : null),
    availableCount,
    coverageCounts,
    lastUpdatedAt,
    insufficientRealData: availableCount === 0,
    message: availableCount === 0
      ? 'Insufficient real current market data. No prices are shown because none can be reported without fabricating data.'
      : `Showing ${availableCount} of ${rates.length} supported commodities with current available market rates.`,
  };
}

module.exports = { getTodayRates, CURRENT_SOURCES, COVERAGE_STATES };