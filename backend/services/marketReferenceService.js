// marketReferenceService.js
// Retrieves the latest REAL market reference price from the *current* market-price
// pipeline (market_prices table, populated from the mandi / Data.gov.in source).
// This is the source of truth for produce-publish reference prices and suggested
// price ranges. It NEVER uses CEDA (CEDA is historical-only) and NEVER fabricates values.
// If no real data exists for a commodity/region, it returns an explicit
// insufficientRealData result rather than inventing numbers.

const { query } = require('../db');

// AGMARKNET / mandi prices are reported per quintal; convert to per-kg (INR) for display.
// Retained for backwards compatibility with tests and legacy callers; the primary
// path now uses the pre-computed price_per_kg column.
const QUINTAL_SOURCES = new Set([
  'mandi_api',
  'historical_dataset',
  'agmarknet_historical',
  'government_api',
  'seed_demo',
]);

function normalizeToKg(price, source) {
  const raw = parseFloat(price);
  if (isNaN(raw) || raw == null) return null;
  const key = String(source || '').toLowerCase();
  const perKg = QUINTAL_SOURCES.has(key) ? raw / 100 : raw;
  return Math.round(perKg * 100) / 100;
}

function sourceLabelFor(source) {
  const key = String(source || '').toLowerCase();
  if (key.includes('mandi')) return 'Mandi (Data.gov.in current rates)';
  if (key.includes('govt') || key.includes('government')) return 'Government market rates (Data.gov.in)';
  if (key.includes('agmarknet')) return 'AGMARKNET historical';
  if (key.includes('historical')) return 'Historical market data';
  return source || 'Market price service';
}

function insufficientResult(commodity, state, district) {
  return {
    commodity,
    available: false,
    insufficientRealData: true,
    scope: null,
    market: null,
    source: null,
    modalPrice: null,
    minPrice: null,
    maxPrice: null,
    message: 'Insufficient real market data is currently available for this commodity and location. No price can be shown without fabricating data.',
    requested: { state, district },
  };
}

function buildResult({ commodity, scope, market, source, arrivalDate, modal, minP, maxP }) {
  return {
    commodity,
    available: true,
    insufficientRealData: false,
    scope,
    market,
    source,
    sourceLabel: sourceLabelFor(source),
    arrivalDate,
    modalPrice: modal,
    minPrice: minP,
    maxPrice: maxP,
    unit: 'per kg (INR)',
    currency: 'INR',
  };
}

// Prioritize the latest real row for a commodity (district -> state -> national).
// Supports optional variety filter for variety-specific benchmarks.
async function latestByCommodity(comm, state, district, variety) {
  const params = [comm];
  let where = 'UPPER(commodity) = $1 AND price_per_kg IS NOT NULL AND price_per_kg > 0';
  let scope = 'national';
  let market = 'National average';

  if (state && district) {
    params.push(state, district);
    where += ' AND UPPER(state) = UPPER($2) AND UPPER(district) = UPPER($3)';
    scope = 'district';
    market = 'District market';
  } else if (state) {
    params.push(state);
    where += ' AND UPPER(state) = UPPER($2)';
    scope = 'state';
    market = 'State average';
  }

  if (variety) {
    params.push(variety);
    where += ` AND UPPER(variety) = UPPER($${params.length})`;
  }

  const res = await query(
    `SELECT price_per_kg, modal_price, market, source, arrival_date, variety
     FROM market_prices
     WHERE ${where}
     ORDER BY arrival_date DESC NULLS LAST
     LIMIT 1`,
    params
  );

  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  const pricePerKg = parseFloat(r.price_per_kg);
  if (isNaN(pricePerKg) || pricePerKg <= 0) return null;
  return {
    commodity: comm,
    scope,
    market: r.market || market,
    source: r.source,
    sourceLabel: sourceLabelFor(r.source),
    arrivalDate: r.arrival_date,
    modalPrice: Math.round(pricePerKg * 100) / 100,
    minPrice: null,
    maxPrice: null,
    unit: 'per kg (INR)',
    currency: 'INR',
    variety: r.variety || null,
    available: true,
    insufficientRealData: false,
  };
}

/**
 * Get the latest REAL reference price for a commodity, prioritizing the farmer's
 * district, then state, then national. Supports optional variety filter.
 * Returns an explicit insufficientRealData result when no real rows exist.
 */
async function getReferencePrice({ commodity, state, district, variety }) {
  const comm = String(commodity || '').toUpperCase().trim();
  if (!comm) return insufficientResult(null, state, district);

  // If variety provided, try variety-specific first at each scope level
  if (variety) {
    if (state && district) {
      const dv = await latestByCommodity(comm, state, district, variety);
      if (dv) return dv;
    }
    if (state) {
      const sv = await latestByCommodity(comm, state, null, variety);
      if (sv) return sv;
    }
    const nv = await latestByCommodity(comm, null, null, variety);
    if (nv) return nv;
  }

  // 1. District-level (the farmer's own district market — most preferred).
  if (state && district) {
    const d = await latestByCommodity(comm, state, district);
    if (d) return d;
  }
  // 2. State-level (other markets in the same state).
  if (state) {
    const s = await latestByCommodity(comm, state, null);
    if (s) return s;
  }
  // 3. National-level (other Indian markets).
  const n = await latestByCommodity(comm, null, null);
  if (n) return n;

  return insufficientResult(comm, state, district);
}

/**
 * Build an optional suggested asking-price range from the real reference price,
 * clearly labelled as guidance rather than a guaranteed price. Returns
 * { suggested: false } when no real reference exists.
 */
function buildSuggestedRange(reference, { lowerFactor = 0.95, upperFactor = 1.05 } = {}) {
  if (!reference || !reference.available || reference.modalPrice == null) {
    return { available: false, suggested: false };
  }
  const modal = reference.modalPrice;
  return {
    available: true,
    suggested: true,
    guidance: true,
    min: Math.round(modal * lowerFactor * 100) / 100,
    max: Math.round(modal * upperFactor * 100) / 100,
    label: 'Suggested asking-price range (guidance only, not a guaranteed price)',
  };
}

module.exports = {
  getReferencePrice,
  buildSuggestedRange,
  _internal: { normalizeToKg, latestByCommodity, sourceLabelFor },
};
