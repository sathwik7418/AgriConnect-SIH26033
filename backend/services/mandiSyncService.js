/**
 * MandiSyncService — orchestrates the daily market-price sync sweep.
 *
 * Strategy:
 *   1. data.gov.in MANDI_API_KEY = PRIMARY current-price source
 *   2. AGMARKNET legacy endpoint = FALLBACK current-price source (only if primary returns no data)
 *   3. Every successful observation is appended to app_daily_market_history
 *
 * CEDA is NEVER used as a current-price source. Hard guard enforced.
 */

const { query } = require('../db');
const mandiProvider = require('../providers/mandi');
const agmarknetProvider = require('../providers/agmarknet');

const CURRENT_SOURCES = ['mandi_api', 'agmarknet_current', 'government_api'];

// Supported commodity universe — matches backend enum
const COMMODITY_ENUM = [
  'TOMATO', 'ONION', 'POTATO', 'WHEAT', 'RICE', 'CORN',
  'BRINJAL', 'LETTUCE', 'MANGO', 'APPLE', 'BANANA', 'OTHER',
  'BITTER GOURD', 'BENGAL GRAM(GRAM)(WHOLE)', 'SOYABEAN', 'POMEGRANATE'
];

// CEDA source strings — must never appear as current-price source
const CEDA_SOURCES = ['ceda', 'ceda_api', 'ceda_historical', 'ceda_historical_market_data'];

/**
 * Hard guard: reject any attempt to write CEDA data as current price.
 */
function assertNotCeda(source, context = '') {
  if (!source) return;
  const s = source.toLowerCase();
  if (CEDA_SOURCES.some(c => s.includes(c))) {
    const msg = `[CEDA_HARD_GUARD] Rejected attempt to write CEDA data as current price. source="${source}" context="${context}"`;
    console.error(msg);
    throw new Error(msg);
  }
}

/**
 * Classify coverage state for a commodity based on its latest row.
 */
function classifyCoverage(arrivalDate, fetchedAt) {
  if (!arrivalDate) return 'NOT_FETCHED';
  const now = Date.now();
  const age = now - new Date(arrivalDate).getTime();
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
  if (age <= TWO_DAYS) return 'AVAILABLE';
  return 'UNAVAILABLE';
}

/**
 * Compute freshness label from arrival date.
 */
function freshnessLabel(arrivalDate) {
  if (!arrivalDate) return 'UNKNOWN';
  const now = new Date();
  const arrival = new Date(arrivalDate);
  const diffMs = now - arrival;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'YESTERDAY';
  if (diffDays <= 3) return 'RECENT';
  if (diffDays <= 7) return 'STALE';
  return 'OLD';
}

/**
 * Normalize price from Rs./Quintal to Rs./kg.
 * Both data.gov.in and AGMARKNET return prices per quintal.
 */
function pricePerKg(quintalPrice) {
  const raw = parseFloat(quintalPrice);
  if (isNaN(raw) || raw <= 0) return 0;
  return Math.round((raw / 100) * 10) / 10;
}

/**
 * Data-quality validation — reject records that would pollute the dataset.
 * Mirrors mandi.js::validateRecord but returns a reason instead of throwing.
 * Returns { valid: boolean, reason?: string }.
 */
function validateRecord(record, context = '') {
  const type = (t) => typeof t === 'number'
    ? t
    : (t == null || String(t).trim() === '') ? NaN : parseFloat(t);

  const min = type(record.minPrice ?? record.min_price);
  const max = type(record.maxPrice ?? record.max_price);
  const modal = type(record.modalPrice ?? record.modal_price);

  // Never store ₹0 or negative prices.
  if (!Number.isFinite(min) || min <= 0) return { valid: false, reason: `non-positive min price (${min}) ${context}` };
  if (!Number.isFinite(max) || max <= 0) return { valid: false, reason: `non-positive max price (${max}) ${context}` };
  if (!Number.isFinite(modal) || modal <= 0) return { valid: false, reason: `non-positive modal price (${modal}) ${context}` };

  // Min < Modal < Max ordering.
  if (!(min < modal && modal <= max)) {
    // Allow min == modal == max as a single-quote day (suspicious but storable);
    // anything violating ordering is rejected outright.
    if (min >= modal || modal > max) {
      return { valid: false, reason: `price ordering violation min=${min} modal=${modal} max=${max} ${context}` };
    }
  }

  // Future arrival date (beyond tomorrow) is impossible.
  if (record.arrivalDate || record.arrival_date) {
    const d = new Date(record.arrivalDate || record.arrival_date);
    if (!Number.isNaN(d.getTime())) {
      const maxFuture = Date.now() + 24 * 60 * 60 * 1000;
      if (d.getTime() > maxFuture) {
        return { valid: false, reason: `future arrival date ${d.toISOString()} ${context}` };
      }
    }
  }

  return { valid: true };
}

/**
 * Sync AGMARKNET reference data (states/commodities and, where available, their
 * nested children) into agmarknet_reference. Reference/discovery only.
 * Returns counts per type.
 */
async function syncAgmarknetReference(provider = agmarknetProvider) {
  const counts = {};
  const upsertReference = async (rows, refType, sourceIdKey, sourceNameKeys) => {
    for (const r of rows || []) {
      const id = String(r[sourceIdKey] ?? r.id ?? name);
      const name = String(
        sourceNameKeys
          .map((k) => r[k])
          .find((v) => v != null && String(v).trim() !== '') ?? r.id ?? ''
      ).trim();
      if (!name) continue;
      const details = Object.assign({}, r);
      const agrId = `${refType}:${id}`;
      await query(
        `INSERT INTO agmarknet_reference (id, ref_type, agmarknet_id, name, parent_type, parent_id, details)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, agmarknet_id = EXCLUDED.agmarknet_id, details = EXCLUDED.details, synced_at = NOW()`,
        [agrId, refType, id, name, null, null, JSON.stringify(details)]
      ).catch(() => {});
      counts[refType] = (counts[refType] || 0) + 1;
    }
  };

  const states = await provider.getStates(1, 100);
  if (states.success) {
    const rows = (states.states || []).map((s) => ({ ...s, id: s.id }));
    await upsertReference(rows, 'state', 'id', ['state_name', 'name']);
  }
  const commodities = await provider.getCommodities(1000);
  if (commodities.success) {
    const rows = (commodities.commodities || []).map((c) => ({ ...c, id: c.id }));
    await upsertReference(rows, 'commodity', 'id', ['cmdt_name', 'commodityName', 'commodity_name', 'name']);
  }

  return { counts, statesCount: (states.states || []).length, commoditiesCount: (commodities.commodities || []).length };
}

/**
 * Run the full sync sweep across all supported commodities.
 * Returns summary: { total, success, fallback, failed, errors[] }
 */
async function runSyncSweep() {
  const syncId = require('crypto').randomUUID();
  const startedAt = new Date();
  let successCount = 0;
  let fallbackCount = 0;
  let failedCount = 0;
  const errors = [];

  for (const commodity of COMMODITY_ENUM) {
    try {
      const result = await syncCommodity(commodity, syncId);
      if (result.source === 'mandi_api') successCount++;
      else if (result.source === 'agmarknet_current') fallbackCount++;
      else failedCount++;
    } catch (err) {
      failedCount++;
      errors.push({ commodity, error: err.message });
      console.error(`[MandiSync] Failed to sync ${commodity}:`, err.message);
    }
  }

  // Log sync run
  try {
    await query(
      `INSERT INTO market_data_sync (source, endpoint, parameters, record_count, sync_status, started_at, completed_at)
       VALUES ('daily_sync', 'sweep', $1, $2, $3, $4, NOW())`,
      [JSON.stringify({ commodities: COMMODITY_ENUM.length, syncId }), successCount + fallbackCount, failedCount > 0 ? 'PARTIAL' : 'SUCCESS', startedAt]
    );
  } catch (err) {
    console.error('[MandiSync] Failed to log sync run:', err.message);
  }

  return {
    syncId,
    total: COMMODITY_ENUM.length,
    success: successCount,
    fallback: fallbackCount,
    failed: failedCount,
    errors,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString()
  };
}

/**
 * Fetch current AGMARKNET prices for one commodity via the legacy open API.
 * Resolves stateId/commodityId from agmarknet_reference (synced from AGMARKNET
 * itself), so this never fabricates an ID or falls back to empty calls.
 *
 * Returns normalized camelCase records (₹/kg, ISO dates) or null when the
 * fallback has no usable data. Never throws.
 */
async function fetchAgmarknetCurrent(commodity, { stateName } = {}) {
  const comm = String(commodity || '').toUpperCase().trim();
  if (!comm) return null;

  try {
    const refComm = await query(
      `SELECT agmarknet_id FROM agmarknet_reference
       WHERE ref_type = 'commodity' AND UPPER(name) = $1 LIMIT 1`,
      [comm]
    );
    const commodityId = refComm.rows[0]?.agmarknet_id;
    if (!commodityId) {
      console.warn(`[MandiSync] No AGMARKNET commodity id for ${comm} — skipping fallback`);
      return null;
    }

    // Default to the primary pilot state (Maharashtra) unless caller asked for
    // a specific state we can resolve in the reference table.
    let stateId = null;
    let stName = stateName;
    if (stName) {
      const refSt = await query(
        `SELECT agmarknet_id FROM agmarknet_reference
         WHERE ref_type = 'state' AND UPPER(name) = UPPER($1) LIMIT 1`,
        [stName]
      );
      stateId = refSt.rows[0]?.agmarknet_id || null;
    }
    if (!stateId) {
      const mh = await query(
        `SELECT agmarknet_id FROM agmarknet_reference
         WHERE ref_type = 'state' AND UPPER(name) = 'MAHARASHTRA' LIMIT 1`
      );
      stateId = mh.rows[0]?.agmarknet_id || null;
      if (!stateId) return null;
      stName = 'Maharashtra';
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const agResult = await agmarknetProvider.getPricesByDate(year, month, stateId, commodityId);
    if (!agResult.success || !agResult.records || agResult.records.length === 0) return null;

    const normalized = agResult.records.map((r) => ({
      state: stName,
      district: r.district || '',
      market: r.market || '',
      commodity: comm,
      variety: r.variety || null,
      grade: null,
      arrivalDate: normalizeArrivalDate(r.arrival_date),
      minPrice: pricePerKg(r.min_price),
      maxPrice: pricePerKg(r.max_price),
      modalPrice: pricePerKg(r.modal_price),
    }));

    const clean = normalized.filter((r) => validateRecord(r, `agmarknet/${comm}`).valid);
    return clean.length > 0 ? { records: clean, state: stName, commodityId } : null;
  } catch (err) {
    console.error(`[MandiSync] AGMARKNET fallback error for ${comm}:`, err.message);
    return null;
  }
}

/**
 * Sync a single commodity: try data.gov.in first, then AGMARKNET fallback.
 */
async function syncCommodity(commodity, syncId) {
  // Phase 1: Try data.gov.in (PRIMARY)
  let primaryResult = null;
  try {
    primaryResult = await mandiProvider.fetchPrices({ commodity, limit: 5000 });
    if (primaryResult.success && primaryResult.records.length > 0) {
      const clean = primaryResult.records.filter(r => validateRecord(r, `data.gov.in/${commodity}`).valid);
      if (clean.length > 0) {
        const storeResult = await storeMandiRecords(clean, syncId);
        await appendToDailyHistory(clean, 'mandi_api', syncId);
        return { source: 'mandi_api', count: storeResult.stored, commodity };
      }
    }
  } catch (err) {
    console.error(`[MandiSync] data.gov.in failed for ${commodity}:`, err.message);
  }

  // Phase 2: AGMARKNET fallback (only if primary returned no data)
  try {
    const ag = await fetchAgmarknetCurrent(commodity);
    if (ag && ag.records.length > 0) {
      const mapped = ag.records.map(r => ({
        state: r.state, district: r.district, market: r.market,
        commodity: r.commodity, variety: r.variety, grade: r.grade,
        arrivalDate: r.arrivalDate, minPrice: r.minPrice, maxPrice: r.maxPrice, modalPrice: r.modalPrice
      }));
      const storeResult = await storeMandiRecords(mapped, syncId, 'agmarknet_current');
      await appendToDailyHistory(mapped.map(r => ({
        state: r.state, district: r.district, market: r.market,
        commodity: r.commodity, variety: r.variety, grade: r.grade,
        arrival_date: r.arrivalDate, min_price: r.minPrice, max_price: r.maxPrice, modal_price: r.modalPrice
      })), 'agmarknet_current', syncId);
      return { source: 'agmarknet_current', count: storeResult.stored, commodity, state: ag.state };
    }
  } catch (err) {
    console.error(`[MandiSync] AGMARKNET fallback failed for ${commodity}:`, err.message);
  }

  return { source: 'none', count: 0, commodity };
}

/**
 * Compute price_per_kg from modal_price depending on source unit.
 * Sources storing ₹/quintal: mandi_api, historical_dataset, agmarknet_historical, government_api, seed_demo
 * Sources storing ₹/kg: agmarknet_current (already converted by fetchAgmarknetCurrent)
 */
function computePricePerKg(modalPrice, source) {
  const raw = parseFloat(modalPrice);
  if (isNaN(raw) || raw <= 0) return null;
  const quintalSources = ['mandi_api', 'historical_dataset', 'agmarknet_historical', 'government_api', 'seed_demo'];
  if (quintalSources.includes(source)) {
    return Math.round((raw / 100) * 100) / 100;
  }
  return Math.round(raw * 100) / 100;
}

/**
 * Store records into market_prices with variety-aware + source-aware conflict handling.
 * UNIQUE constraint: (state, district, market, commodity, variety, arrival_date, source)
 * For agmarknet_current: never overwrite a valid mandi_api row (different source = different row).
 * For mandi_api: upsert on same identity.
 */
async function storeMandiRecords(records, syncId, sourceOverride = 'mandi_api') {
  let stored = 0;
  let skipped = 0;

  for (const r of records) {
    const source = sourceOverride || 'mandi_api';
    assertNotCeda(source, `storeMandiRecords:${r.commodity}`);

    const pricePerKg = computePricePerKg(r.modalPrice ?? r.modal_price, source);
    const minPriceKg = computePricePerKg(r.minPrice ?? r.min_price, source);
    const maxPriceKg = computePricePerKg(r.maxPrice ?? r.max_price, source);

    try {
      await query(
        `INSERT INTO market_prices (state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, price_per_kg, source, fetched_at, data_freshness, sync_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),$13,$14)
         ON CONFLICT (state, district, market, commodity, variety, arrival_date, source) DO UPDATE SET
           min_price = EXCLUDED.min_price,
           max_price = EXCLUDED.max_price,
           modal_price = EXCLUDED.modal_price,
           price_per_kg = EXCLUDED.price_per_kg,
           grade = COALESCE(EXCLUDED.grade, market_prices.grade),
           fetched_at = NOW(),
           data_freshness = 'fresh'`,
        [r.state, r.district, r.market, r.commodity, r.variety || '', r.grade, r.arrivalDate, r.minPrice, r.maxPrice, r.modalPrice, pricePerKg, source, 'fresh', syncId]
      );
      stored++;
    } catch (err) {
      skipped++;
      if (skipped <= 5) console.warn(`[MandiSync] Store error (${r.commodity}):`, err.message);
    }
  }

  return { stored, skipped, total: records.length };
}

/**
 * Append successful observations to app_daily_market_history.
 * This is AgriConnect's own growing historical dataset.
 * Records may arrive in camelCase (provider-normalized) or snake_case form.
 * Stores price_per_kg for consistent internal unit.
 */
async function appendToDailyHistory(records, source, syncId) {
  let appended = 0;
  const priceDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const pick = (r, ...keys) => {
    for (const k of keys) {
      if (r[k] != null && r[k] !== '') return r[k];
    }
    return null;
  };

  for (const r of records) {
    assertNotCeda(source, `appendToDailyHistory:${r.commodity}`);
    const state = pick(r, 'state') || '';
    const district = pick(r, 'district') || null;
    const market = pick(r, 'market') || '';
    const commodity = String(pick(r, 'commodity') || '').toUpperCase();
    const variety = pick(r, 'variety') || ''; // '' = "variety not specified" (table constraint requires non-null)
    const grade = pick(r, 'grade') || null;
    const arrival = pick(r, 'arrival_date', 'arrivalDate') || priceDate;
    const minPrice = pick(r, 'min_price', 'minPrice');
    const maxPrice = pick(r, 'max_price', 'maxPrice');
    const modalPrice = pick(r, 'modal_price', 'modalPrice');
    if (!market || !commodity) continue;
    if (minPrice == null || maxPrice == null || modalPrice == null) continue;

    const pricePerKg = computePricePerKg(modalPrice, source);

    try {
      await query(
        `INSERT INTO app_daily_market_history (state, district, market, commodity, variety, grade, price_date, min_price, max_price, modal_price, price_per_kg, arrivals, source, source_record_id, sync_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT ON CONSTRAINT uq_admh_identity DO UPDATE SET
           min_price = EXCLUDED.min_price,
           max_price = EXCLUDED.max_price,
           modal_price = EXCLUDED.modal_price,
           price_per_kg = EXCLUDED.price_per_kg,
           arrivals = EXCLUDED.arrivals,
           fetched_at = NOW()`,
        [
          state, district, market, commodity,
          variety, grade,
          arrival,
          minPrice, maxPrice, modalPrice, pricePerKg,
          pick(r, 'arrivals') || null, source, pick(r, 'source_record_id', 'sourceRecordId') || null, syncId
        ]
      );
      appended++;
    } catch (err) {
      // Skip duplicates / conflicts silently (expected for re-runs).
    }
  }

  return { appended };
}

/**
 * Normalize various date formats to YYYY-MM-DD.
 */
function normalizeArrivalDate(dateStr) {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  // DD/MM/YYYY
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  // YYYY-MM-DD
  if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) {
    return dateStr.slice(0, 10);
  }
  return new Date(dateStr).toISOString().slice(0, 10);
}

module.exports = {
  runSyncSweep,
  syncCommodity,
  syncAgmarknetReference,
  fetchAgmarknetCurrent,
  storeMandiRecords,
  appendToDailyHistory,
  assertNotCeda,
  classifyCoverage,
  freshnessLabel,
  pricePerKg,
  computePricePerKg,
  normalizeArrivalDate,
  validateRecord,
  COMMODITY_ENUM,
  CEDA_SOURCES,
  CURRENT_SOURCES
};
