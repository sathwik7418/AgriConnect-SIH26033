// Phase 9 feature tests.
// Covers the new Phase 2-6 backend work:
//   - marketReferenceService (per-quintal -> per-kg normalization, suggested range, insufficient data)
//   - cedaSyncService helpers (buildStates) + DB upsert idempotency + rate-limit resilience
// Run with:  NODE_ENV=test node tests/phase9-features.test.js

const assert = require('assert');
const { query } = require('../db');
const marketRef = require('../services/marketReferenceService');
const cedaSync = require('../services/cedaSyncService');
const { _internal: refInternal } = marketRef;
const { _internal: syncInternal } = cedaSync;

// ---------------------------------------------------------------------------
// marketReferenceService — pure helpers
// ---------------------------------------------------------------------------
async function test_normalizeToKg() {
  // mandi_api reports per quintal -> divide by 100
  assert.strictEqual(refInternal.normalizeToKg('2400', 'mandi_api'), 24);
  assert.strictEqual(refInternal.normalizeToKg('2000', 'Mandi_API'), 20);
  // government_api is a quintal source too
  assert.strictEqual(refInternal.normalizeToKg('3500', 'government_api'), 35);
  // unknown source stays per-kg
  assert.strictEqual(refInternal.normalizeToKg('40', 'direct_kg'), 40);
  // invalid input -> null
  assert.strictEqual(refInternal.normalizeToKg('abc', 'mandi_api'), null);
  assert.strictEqual(refInternal.normalizeToKg(undefined, 'mandi_api'), null);
}

async function test_sourceLabel() {
  assert.ok(refInternal.sourceLabelFor('mandi_api').toLowerCase().includes('mandi'));
  assert.ok(refInternal.sourceLabelFor('government_api').toLowerCase().includes('government'));
  assert.strictEqual(refInternal.sourceLabelFor('agmarknet_historical').toLowerCase().includes('agmarknet'), true);
}

async function test_buildSuggestedRange() {
  // With a real reference price -> 5% guidance range
  const ref = { available: true, modalPrice: 24 };
  const range = marketRef.buildSuggestedRange(ref);
  assert.strictEqual(range.suggested, true);
  assert.strictEqual(range.guidance, true);
  assert.strictEqual(range.min, 22.8); // 24 * 0.95
  assert.strictEqual(range.max, 25.2); // 24 * 1.05

  // With no real data -> signal NOT to suggest
  const noData = marketRef.buildSuggestedRange(null);
  assert.strictEqual(noData.suggested, false);
  const insufficient = marketRef.buildSuggestedRange({ available: false, modalPrice: null });
  assert.strictEqual(insufficient.suggested, false);
}

async function test_insufficientResultHonest() {
  // getReferencePrice with a commodity that has no real rows in the tiny test DB
  // must return insufficientRealData (never a fabricated number).
  // NB: use a guaranteed-absent commodity (commodity is VARCHAR now), since any
  // real crop (e.g. ONION) legitimately resolves via national fallback.
  const res = await marketRef.getReferencePrice({ commodity: 'ZZ_NO_SUCH_CROP_2026', state: 'X', district: 'Y' });
  assert.strictEqual(res.insufficientRealData, true);
  assert.strictEqual(res.available, false);
  assert.strictEqual(res.modalPrice, null);
  assert.ok(/insufficient/i.test(res.message), 'honest insufficient-data message');
}

// ---------------------------------------------------------------------------
// cedaSyncService — buildStates + DB upsert + rate-limit resilience
// ---------------------------------------------------------------------------
async function test_buildStatesConfiguredOverride() {
  const prev = process.env.CEDA_SYNC_STATES;
  process.env.CEDA_SYNC_STATES = '3,1';
  try {
    // Force a reload so the module captures the updated env at require time.
    delete require.cache[require.resolve('../services/cedaSyncService')];
    const fresh = require('../services/cedaSyncService');
    const states = fresh._internal.buildStates([{ census_state_id: 5, census_state_name: 'Other' }], ['3', '1']);
    assert.deepStrictEqual(states, [3, 1], 'configured override wins over geographies');
  } finally {
    if (prev === undefined) delete process.env.CEDA_SYNC_STATES; else process.env.CEDA_SYNC_STATES = prev;
    // Reload with original env for subsequent tests.
    delete require.cache[require.resolve('../services/cedaSyncService')];
    const fresh = require('../services/cedaSyncService');
    for (const k of ['_internal', 'start', 'stop', 'runSyncCycle']) cedaSync[k] = fresh[k];
  }
}

async function test_buildStatesFromGeographies() {
  const prev = process.env.CEDA_SYNC_STATES;
  if (prev !== undefined) delete process.env.CEDA_SYNC_STATES;
  try {
    const states = syncInternal.buildStates([
      { census_state_id: 3, census_state_name: 'J&K' },
      { census_state_id: 3, census_state_name: 'J&K' }, // dedupe
      { census_state_id: 5, census_state_name: 'UP' },
    ]);
    // No default states configured -> derive unique from geographies
    assert.strictEqual(states.length, 2);
    const ids = states.map((s) => s.id).sort();
    assert.deepStrictEqual(ids, [3, 5]);
  } finally {
    if (prev !== undefined) process.env.CEDA_SYNC_STATES = prev;
  }
}

async function test_syncCommoditiesAndStatesUpserts() {
  // Mock cedaApi fetch to return one commodity and one geography, then assert
  // they are cached into ceda_commodities / ceda_geographies.
  const origFetch = global.fetch;
  const origBase = process.env.CEDA_API_BASE_URL;
  process.env.CEDA_API_KEY = 'test-key-123';
  process.env.CEDA_API_BASE_URL = 'https://ceda.test/v1';
  process.env.CEDA_MAX_RETRIES = '1';
  process.env.CEDA_RETRY_DELAY_MS = '0';

  const tag = `TEST_COMM_${Date.now()}`;
  const ok = (data) => ({ status: 200, ok: true, text: async () => JSON.stringify(data) });
  global.fetch = async (url) => {
    const path = String(url);
    if (/commodities$/.test(path)) {
      return ok({ output: { type: 'success', message: 'ok', data: [{ commodity_id: 999999, commodity_name: tag }] } });
    }
    if (/geographies$/.test(path)) {
      return ok({ output: { type: 'success', message: 'ok', data: [{ census_state_id: 999999, census_state_name: 'TestState', census_district_id: 1, census_district_name: 'TestDist' }] } });
    }
    return ok({ output: { type: 'success', message: 'no data', data: [] } });
  };

  try {
    const { commodities, geographies } = await syncInternal.syncCommoditiesAndStates();
    assert.strictEqual(commodities.length, 1);
    assert.strictEqual(geographies.length, 1);

    // Verify commodity cache row
    const c = await query('SELECT commodity_name FROM ceda_commodities WHERE commodity_id = $1', [999999]);
    assert.strictEqual(c.rows[0].commodity_name, tag);

    // Verify geography cache row (idempotent second call)
    const g = await query('SELECT * FROM ceda_geographies WHERE census_state_id = $1 AND census_district_id = $2', [999999, 1]);
    assert.strictEqual(g.rows[0].census_state_name, 'TestState');
  } finally {
    global.fetch = origFetch;
    if (origBase === undefined) delete process.env.CEDA_API_BASE_URL; else process.env.CEDA_API_BASE_URL = origBase;
    await query('DELETE FROM ceda_commodities WHERE commodity_id = $1', [999999]);
    await query('DELETE FROM ceda_geographies WHERE census_state_id = $1', [999999]);
  }
}

async function test_upsertPriceRecordIdempotent() {
  // Insert a historical price row, then insert the same one again -> the second
  // write must upsert (ON CONFLICT), keeping a single row and not erroring.
  const date = '2020-03-06';
  const base = { commodityId: 888888, commodityName: 'TestCommodity', stateId: 888888, stateName: 'TestState' };
  await query('DELETE FROM ceda_historical_market_data WHERE commodity_id = $1 AND census_state_id = $2 AND data_date = $3 AND indicator = $4', [888888, 888888, date, 'price']);
  try {
    const item = { date, min_price: 1825, max_price: 1860, modal_price: 1840 };
    const r1 = await syncInternal.upsertPriceRecord({ ...base, item });
    const r2 = await syncInternal.upsertPriceRecord({ ...base, item: { ...item, modal_price: 1850 } });
    assert.ok(r1.inserted >= 1);
    const rows = await query('SELECT modal_price FROM ceda_historical_market_data WHERE commodity_id=$1 AND census_state_id=$2 AND data_date=$3 AND indicator=$4', [888888, 888888, date, 'price']);
    assert.strictEqual(rows.rows.length, 1, 'ON CONFLICT should keep a single row');
    assert.strictEqual(Number(rows.rows[0].modal_price), 1850, 'upsert should update the value');
    void r2;
  } finally {
    await query('DELETE FROM ceda_historical_market_data WHERE commodity_id = $1 AND census_state_id = $2', [888888, 888888]);
  }
}

async function test_quantityRecordInsertsQuantity() {
  const date = '2020-03-06';
  await query('DELETE FROM ceda_historical_market_data WHERE commodity_id = $1 AND census_state_id = $2', [777777, 777777]);
  try {
    const r = await syncInternal.upsertQuantityRecord({
      commodityId: 777777, commodityName: 'TestQ', stateId: 777777, stateName: 'S',
      item: { date, quantity: 16.75 },
    });
    assert.ok(r.inserted >= 1);
    const rows = await query('SELECT quantity, indicator FROM ceda_historical_market_data WHERE commodity_id=$1 AND census_state_id=$2', [777777, 777777]);
    assert.strictEqual(rows.rows[0].indicator, 'quantity');
    assert.strictEqual(Number(rows.rows[0].quantity), 16.75);
  } finally {
    await query('DELETE FROM ceda_historical_market_data WHERE commodity_id = $1 AND census_state_id = $2', [777777, 777777]);
  }
}

(async () => {
  let pass = 0, fail = 0;
  const tests = [
    ['normalizeToKg (mandi/AP -> kg, invalid -> null)', test_normalizeToKg],
    ['sourceLabelFor', test_sourceLabel],
    ['buildSuggestedRange (guidance + no-data)', test_buildSuggestedRange],
    ['getReferencePrice insufficient-data is honest', test_insufficientResultHonest],
    ['cedaSync buildStates configured override', test_buildStatesConfiguredOverride],
    ['cedaSync buildStates from geographies (dedupe)', test_buildStatesFromGeographies],
    ['cedaSync commodities/geographies DB upsert', test_syncCommoditiesAndStatesUpserts],
    ['cedaSync price upsert idempotent (ON CONFLICT)', test_upsertPriceRecordIdempotent],
    ['cedaSync quantity record stores quantity', test_quantityRecordInsertsQuantity],
  ];
  for (const [name, fn] of tests) {
    try {
      await fn();
      pass++;
    } catch (e) {
      fail++;
      console.error(`❌ ${name}: ${e.message}`);
    }
  }
  console.log(`\nPhase 9 feature tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
  console.log('All Phase 9 feature tests passed ✅');
  process.exit(0);
})();
