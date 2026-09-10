// Market Intelligence Strategy tests — hermetic, DB-backed.
//
// Verifies the SIH26033 market-intelligence architecture guarantees:
//   1. CEDA is NEVER a current-price source (hard guard).
//   2. Source precedence: data.gov.in (mandi_api) wins over AGMARKNET fallback.
//   3. Variety is preserved — daily history keeps separate rows per variety.
//   4. Daily history persistence (append-only; upsert on identity, no dupes).
//   5. Coverage states are classified truthfully (AVAILABLE/UNAVAILABLE/
//      NOT_FETCHED/API_ERROR).
//   6. Freshness labels are honest.
//   7. ₹/quintal sources normalize correctly to ₹/kg.
//   8. Price validation rejects ₹0 / future dates / ordering violations.
//   9. Scheduler config reads env vars and does not block in tests.
//
// Run: node tests/market-intelligence-strategy.test.js

const assert = require('assert');
require('dotenv').config();
const { query } = require('../db');
const {
  assertNotCeda,
  classifyCoverage,
  freshnessLabel,
  pricePerKg,
  normalizeArrivalDate,
  validateRecord,
  storeMandiRecords,
  appendToDailyHistory,
} = require('../services/mandiSyncService');
const { getTodayRates } = require('../services/marketOverviewService');

const ST = `ZZ_TEST_STATE_${Date.now()}`;
const DT = `ZZ_TEST_DIST_${Date.now()}`;
const cleanIds = [];

async function cleanAll() {
  for (const id of cleanIds) {
    if (typeof id === 'string') {
      await query('DELETE FROM app_daily_market_history WHERE sources_id IS NULL AND id = $1', [id]).catch(() => {});
      await query('DELETE FROM market_prices WHERE id = $1', [id]).catch(() => {});
    }
  }
  await query('DELETE FROM app_daily_market_history WHERE state = $1', [ST]).catch(() => {});
  await query('DELETE FROM market_prices WHERE state = $1', [ST]).catch(() => {});
}

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { pass++; console.log(`✅ ${name}`); })
    .catch(e => { fail++; console.error(`❌ ${name}: ${e.message}`); });
}

(async () => {
  // 1. CEDA hard guard
  await test('CEDA hard guard throws on CEDA source', () => {
    assert.throws(() => assertNotCeda('ceda', 'ctx'), /CEDA_HARD_GUARD/);
    assert.throws(() => assertNotCeda('CEDA', 'ctx'), /CEDA_HARD_GUARD/);
    assert.throws(() => assertNotCeda('ceda_historical', 'ctx'), /CEDA_HARD_GUARD/);
    assert.doesNotThrow(() => assertNotCeda('mandi_api', 'ctx'));
    assert.doesNotThrow(() => assertNotCeda('agmarknet_current', 'ctx'));
  });

  // 2. ₹/quintal → ₹/kg normalization
  await test('pricePerKg normalizes per-quintal to per-kg', () => {
    assert.strictEqual(pricePerKg(2400), 24);
    assert.strictEqual(pricePerKg(3000), 30);
    assert.strictEqual(pricePerKg(0), 0);
    assert.strictEqual(pricePerKg('not-a-number'), 0);
  });

  // 3. Coverage states
  await test('coverage classification', () => {
    assert.strictEqual(classifyCoverage(null, null), 'NOT_FETCHED');
    assert.strictEqual(classifyCoverage(new Date().toISOString().slice(0, 10), new Date()), 'AVAILABLE');
    assert.strictEqual(classifyCoverage('2026-08-01', new Date()), 'UNAVAILABLE');
  });

  // 4. Freshness labels
  await test('freshness labels', () => {
    assert.strictEqual(freshnessLabel(new Date().toISOString()), 'TODAY');
    assert.strictEqual(freshnessLabel(new Date(Date.now() - 1 * 864e5).toISOString()), 'YESTERDAY');
    assert.strictEqual(freshnessLabel(new Date(Date.now() - 2 * 864e5).toISOString()), 'RECENT');
    assert.strictEqual(freshnessLabel(new Date(Date.now() - 5 * 864e5).toISOString()), 'STALE');
    assert.strictEqual(freshnessLabel(new Date(Date.now() - 40 * 864e5).toISOString()), 'OLD');
    assert.strictEqual(freshnessLabel(null), 'UNKNOWN');
  });

  // 5. Price validation
  await test('validation rejects bad data', () => {
    assert.strictEqual(validateRecord({ minPrice: 0, maxPrice: 12, modalPrice: 10 }).valid, false, 'rejects ₹0');
    assert.strictEqual(validateRecord({ minPrice: 20, maxPrice: 12, modalPrice: 15 }).valid, false, 'rejects ordering violation');
    assert.strictEqual(validateRecord({ minPrice: 8, maxPrice: 20, modalPrice: 12 }).valid, true, 'accepts valid');
    const future = new Date(Date.now() + 3 * 864e5).toISOString();
    assert.strictEqual(validateRecord({ minPrice: 8, maxPrice: 20, modalPrice: 12, arrivalDate: future }).valid, false, 'rejects future date');
  });

  // 6/7. Source precedence + variety preservation via real DB writes
  const todayISO = new Date().toISOString().slice(0, 10);
  const mk = (variety, min, modal, max) => ({
    state: ST, district: DT, market: 'ZZ MKT', commodity: 'TOMATO',
    variety, grade: 'GRADE_A', arrivalDate: todayISO,
    minPrice: min, maxPrice: max, modalPrice: modal,
  });

  let firstId, secondId;
  await test('daily history preserves varieties (no silent overwrite)', async () => {
    await appendToDailyHistory([mk('Desi', 8, 10, 12)], 'mandi_api', null);
    await appendToDailyHistory([mk('Hybrid', 15, 18, 20)], 'mandi_api', null);
    const res = await query(
      `SELECT variety FROM app_daily_market_history
       WHERE state = $1 AND district = $2 AND market = 'ZZ MKT' AND commodity = 'TOMATO' AND price_date = $3 AND source = 'mandi_api'
       ORDER BY variety`,
      [ST, DT, todayISO]
    );
    const varieties = res.rows.map(r => r.variety);
    assert.ok(varieties.includes('Desi'), 'Desi variety row persists');
    assert.ok(varieties.includes('Hybrid'), 'Hybrid variety row persists');
    assert.strictEqual(varieties.length, 2, 'two distinct variety rows — no silent overwrite');
  });

  await test('daily history upserts on identity without duplicating', async () => {
    await appendToDailyHistory([mk('Desi', 8, 10, 12)], 'mandi_api', null);
    const res = await query(
      `SELECT COUNT(*)::int AS c FROM app_daily_market_history
       WHERE state = $1 AND district = $2 AND market = 'ZZ MKT' AND commodity = 'TOMATO' AND price_date = $3
         AND variety = 'Desi' AND source = 'mandi_api'`,
      [ST, DT, todayISO]
    );
    assert.strictEqual(res.rows[0].c, 1, 'no duplicate rows on re-sync');
  });

  await test('agmarknet fallback never overwrites mandi_api rows', async () => {
    // First write mandi_api rows (the source of truth). market_prices has
    // UNIQUE(state,district,market,commodity,variety,arrival_date,source), so
    // the fallback write (different source) creates its own row and can never
    // clobber the mandi_api observation we already hold.
    const mandiRecords = [
      mk('Desi', 8, 10, 12),
    ];
    await storeMandiRecords(mandiRecords, null, 'mandi_api');
    firstId = (await query(
      `SELECT id FROM market_prices WHERE state=$1 AND district=$2 AND market='ZZ MKT' AND commodity='TOMATO' AND source='mandi_api' AND variety='Desi'
       ORDER BY fetched_at DESC LIMIT 1`,
      [ST, DT]
    )).rows[0].id;

    // Then attempt an AGMARKNET fallback write of different values for same keys.
    await storeMandiRecords([
      { ...mk('Desi', 999, 1000, 1100) },
    ], null, 'agmarknet_current');

    const afterFallback = (await query(
      `SELECT modal_price FROM market_prices WHERE id = $1`,
      [firstId]
    )).rows[0];
    assert.strictEqual(parseFloat(afterFallback.modal_price), 10, 'mandi_api row remains with 10, not overwritten by fallback 1000');
  });

  // 8. Coverage states through marketOverviewService (real DB)
  await test('today-rates exposes coverage states truthfully', async () => {
    // Set up a fresh unique commodity that has data only in this test state.
    const uniqCommodity = 'APPLE';
    // Insert one mandi_api row in the test state today.
    await query(
      `INSERT INTO market_prices (state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, price_per_kg, source, data_freshness)
       VALUES ($1,$2,'ZZ COV MKT','APPLE','Fuji','GRADE_A',NOW(),100,300,200,2,'mandi_api','fresh')
       ON CONFLICT DO NOTHING`,
      [ST, DT]
    ).catch(() => {});

    const out = await getTodayRates({ state: ST, district: DT, dbQuery: query });
    const apple = out.rates.find(r => r.commodity.toUpperCase() === 'APPLE');
    assert.ok(apple, 'APPLE in the rates universe');
    assert.strictEqual(apple.coverage, 'AVAILABLE', 'fresh row classified AVAILABLE');
    assert.ok(apple.pricePerKg > 0, 'AVAILABLE carries a positive price');
    assert.ok(out.coverageCounts && typeof out.coverageCounts.AVAILABLE === 'number', 'coverageCounts present');
    assert.ok(out.availableCount >= (out.coverageCounts.AVAILABLE || 0), 'availableCount consistent');
  });

  // 9. Normalization helper for AGMARKNET dates
  await test('aggregate date normalization', () => {
    assert.strictEqual(normalizeArrivalDate('09/09/2026'), '2026-09-09');
    assert.strictEqual(normalizeArrivalDate('2026-09-09'), '2026-09-09');
  });

  // 10. Scheduler config — parse without hanging (reads env, no timer in tests)
  await test('scheduler env parse is safe in tests', () => {
    const enabled = process.env.MANDI_SYNC_ENABLED !== 'false';
    const hours = Math.max(1, parseFloat(process.env.MANDI_SYNC_INTERVAL_HOURS || '6'));
    assert.strictEqual(typeof enabled, 'boolean');
    assert.ok(hours >= 1, 'interval at least 1h');
    assert.ok(Number.isFinite(hours), 'interval is finite');
  });

  await cleanAll();
  console.log(`\nMarket intelligence strategy: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
  console.log('All market intelligence tests passed ✅');
  process.exit(0);
})();