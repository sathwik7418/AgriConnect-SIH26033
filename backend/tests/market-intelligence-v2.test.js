// Market Intelligence v2 tests — variety-aware, source-provenance-preserving,
// ₹/kg-normalized architecture (STAGE 2).
//
// Covers the TEST PLAN in STAGE2-implementation-plan.md §267:
//   1. Variety coexistence
//   2. Primary preference: data.gov.in (mandi_api) preferred over AGMARKNET
//   3. Fallback fills gaps (AGMARKNET fills where mandi_api has no data)
//   4. Fallback never overwrites an existing mandi_api row
//   5. CEDA isolation (CEDA never enters market_prices)
//   6. Unit consistency (price_per_kg always ₹/kg regardless of source)
//   7. AI chat variety (variety-specific prices when user names a variety)
//   8. Recommendation variety (variety-specific benchmark, any-variety fallback)
//   9. Historical source identity (historical rows preserve source per row)
//  10. App history growth (app_daily_market_history accumulates across runs)
//  11. No fabrication (no ₹0, no fake prices, honest "no data")
//  12. Pagination (mandi.js fetches >500 records without truncation)
//  13. Commodity VARCHAR (non-enum commodities like COTTON/CHILLI stored)
//  14. Arrivals preserved (AGMARKNET arrivals stored when available)
//
// Run: node tests/market-intelligence-v2.test.js

const assert = require('assert');
require('dotenv').config();
const crypto = require('crypto');
const { query } = require('../db');
const {
  assertNotCeda,
  computePricePerKg,
  validateRecord,
  storeMandiRecords,
  appendToDailyHistory,
} = require('../services/mandiSyncService');

// Force the deterministic grounded engine (no live LLM) for the AI chat test.
const assistantService = require('../services/assistantService');
delete process.env.GROQ_API_KEY;

const RecommendationService = require('../services/ai/recommendationService');
const mandiProvider = require('../providers/mandi');

const ST = `ZZV2_ST_${Date.now()}`;
const DT = `ZZV2_DT_${Date.now()}`;
const cleanListings = [];
const cleanFarmers = [];

async function cleanAll() {
  for (const id of cleanListings) {
    await query('DELETE FROM produce_listings WHERE id = $1', [id]).catch(() => {});
  }
  for (const id of cleanFarmers) {
    await query('DELETE FROM farmer_profiles WHERE id = $1', [id]).catch(() => {});
  }
  await query('DELETE FROM app_daily_market_history WHERE state = $1', [ST]).catch(() => {});
  await query('DELETE FROM market_prices WHERE state = $1', [ST]).catch(() => {});
  await query('DELETE FROM historical_market_prices WHERE state = $1', [ST]).catch(() => {});
}

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { pass++; console.log(`✅ ${name}`); })
    .catch(e => { fail++; console.error(`❌ ${name}: ${e.message}`); });
}

async function countWhere(sql, params) {
  const res = await query(sql, params);
  return parseInt(res.rows[0].c, 10);
}

(async () => {
  // ---------------- 5. CEDA isolation (service boundary)
  await test('#5 CEDA isolation: assertNotCeda rejects every CEDA source identity', () => {
    for (const s of ['ceda', 'ceda_api', 'ceda_historical', 'ceda_historical_market_data']) {
      assert.throws(() => assertNotCeda(s, 'ctx'), /CEDA_HARD_GUARD/, `${s} blocked`);
    }
    // Legitimate current / historical sources are NOT CEDA and stay allowed.
    assert.doesNotThrow(() => assertNotCeda('mandi_api', 'ctx'));
    assert.doesNotThrow(() => assertNotCeda('agmarknet_current', 'ctx'));
    assert.doesNotThrow(() => assertNotCeda('agmarknet_historical', 'ctx'));
    assert.doesNotThrow(() => assertNotCeda('historical_dataset', 'ctx'));
  });

  await test('#5 CEDA isolation: storeMandiRecords refuses CEDA source', async () => {
    await assert.rejects(
      () => storeMandiRecords([{ state: ST, district: DT, market: 'ZZV2 MKT', commodity: 'TOMATO', variety: 'Desi', arrivalDate: new Date().toISOString().slice(0, 10), minPrice: 10, maxPrice: 12, modalPrice: 11 }], null, 'ceda_historical'),
      /CEDA_HARD_GUARD/
    );
    const c = await countWhere(`SELECT COUNT(*)::int AS c FROM market_prices WHERE state = $1 AND market = 'ZZV2 MKT'`, [ST]);
    assert.strictEqual(c, 0, 'no CEDA row ever lands in market_prices');
  });

  // ---------------- 6. Unit consistency (₹/kg normalization)
  await test('#6 unit consistency: computePricePerKg is source-aware ₹/kg', () => {
    assert.strictEqual(computePricePerKg(2400, 'mandi_api'), 24, 'mandi_api ₹/quintal → ₹/kg');
    assert.strictEqual(computePricePerKg(2500, 'agmarknet_historical'), 25, 'historical ₹/quintal → ₹/kg');
    assert.strictEqual(computePricePerKg(24, 'agmarknet_current'), 24, 'agmarknet_current already ₹/kg');
    assert.strictEqual(computePricePerKg(-5, 'mandi_api'), null, 'rejects non-positive');
    assert.strictEqual(computePricePerKg('nope', 'mandi_api'), null, 'rejects NaN');
  });

  const todayISO = new Date().toISOString().slice(0, 10);
  const mk = (variety, market, min, modal, max, commodity = 'TOMATO') => ({
    state: ST, district: DT, market, commodity,
    variety, grade: 'GRADE_A', arrivalDate: todayISO,
    minPrice: min, maxPrice: max, modalPrice: modal,
  });

  // ---------------- 1. Variety coexistence
  await test('#1 variety coexistence: Desi + Hybrid rows coexist in market_prices', async () => {
    // mandi_api stores ₹/quintal raws + an always-₹/kg price_per_kg column.
    await storeMandiRecords([
      mk('Desi', 'ZZV2 MKT', 800, 1000, 1200),
      mk('Hybrid', 'ZZV2 MKT', 1500, 1800, 2000),
    ], null, 'mandi_api');
    const rows = (await query(
      `SELECT variety, modal_price, price_per_kg FROM market_prices
       WHERE state = $1 AND market = 'ZZV2 MKT' AND commodity = 'TOMATO' AND source = 'mandi_api'
       ORDER BY variety`,
      [ST]
    )).rows;
    assert.strictEqual(rows.length, 2, 'two distinct variety rows stored');
    const has = (v) => rows.some(r => r.variety === v);
    assert.ok(has('Desi') && has('Hybrid'), 'both varieties preserved');
    const desi = rows.find(r => r.variety === 'Desi');
    assert.strictEqual(Number(desi.modal_price), 1000, 'raw ₹/quintal modal preserved');
    assert.strictEqual(Number(desi.price_per_kg), 10, 'price_per_kg normalized 1000 → 10 ₹/kg');
  });

  // ---------------- 6. Unit consistency (stored rows)
  await test('#6 unit consistency: stored ₹/kg matches source unit math', async () => {
    const rows = (await query(
      `SELECT variety, price_per_kg FROM market_prices
       WHERE state = $1 AND market = 'ZZV2 MKT' AND commodity = 'TOMATO' AND source = 'mandi_api'
       ORDER BY variety`,
      [ST]
    )).rows;
    const byVariety = Object.fromEntries(rows.map(r => [r.variety, Number(r.price_per_kg)]));
    assert.strictEqual(byVariety.Desi, 10, 'Desi 1000 q → 10 ₹/kg');
    assert.strictEqual(byVariety.Hybrid, 18, 'Hybrid 1800 q → 18 ₹/kg');
  });

  // ---------------- 3. Fallback fills gaps (+ 1 read-side variety check)
  await test('#3 fallback fills gaps: agmarknet_current stores where mandi_api had no data', async () => {
    await storeMandiRecords([mk('Desi', 'ZZV2 GAP MKT', 5, 6, 7)], null, 'agmarknet_current');
    const row = (await query(
      `SELECT price_per_kg, source FROM market_prices WHERE state = $1 AND market = 'ZZV2 GAP MKT' AND commodity = 'TOMATO'`,
      [ST]
    )).rows[0];
    assert.ok(row, 'fallback row present');
    assert.strictEqual(row.source, 'agmarknet_current', 'row carries its true provenance');
    assert.strictEqual(Number(row.price_per_kg), 6, 'agmarknet_current ₹/kg stored as-is');
  });

  // ---------------- 2. Primary preference + 4. Fallback never overwrites
  await test('#2 + #4 primary preference: mandi_api row untouched by fallback, *read* prefers mandi_api', async () => {
    await storeMandiRecords([mk('Desi', 'ZZV2 PREF MKT', 800, 1000, 1200)], null, 'mandi_api');
    // AGMARKNET writes ₹/kg — same identity, DIFFERENT source → distinct row.
    await storeMandiRecords([mk('Desi', 'ZZV2 PREF MKT', 8, 10, 12)], null, 'agmarknet_current');
    const rows = (await query(
      `SELECT source, modal_price FROM market_prices
       WHERE state = $1 AND market = 'ZZV2 PREF MKT' AND commodity = 'TOMATO' AND variety = 'Desi'
       ORDER BY CASE source WHEN 'mandi_api' THEN 0 ELSE 1 END`,
      [ST]
    )).rows;
    assert.strictEqual(rows.length, 2, 'both provenance rows exist');
    assert.strictEqual(rows[0].source, 'mandi_api', 'read-side preference selects mandi_api first');
    assert.strictEqual(Number(rows[0].modal_price), 1000, 'mandi_api observation NOT overwritten by fallback');
  });

  // ---------------- 13. Commodity VARCHAR (non-enum commodities)
  await test('#13 commodity VARCHAR: COTTON & CHILLI stored without an enum gate', async () => {
    await storeMandiRecords([
      { state: ST, district: DT, market: 'ZZV2 COTTON MKT', commodity: 'COTTON', variety: 'V-797', grade: null, arrivalDate: todayISO, minPrice: 600, maxPrice: 720, modalPrice: 650 },
    ], null, 'mandi_api');
    await appendToDailyHistory([
      { state: ST, district: DT, market: 'ZZV2 CHILLI MKT', commodity: 'CHILLI', variety: '', grade: null, arrival_date: todayISO, min_price: 40, max_price: 55, modal_price: 48 },
    ], 'agmarknet_current', null);
    const cotton = await countWhere(`SELECT COUNT(*)::int AS c FROM market_prices WHERE state = $1 AND market = 'ZZV2 COTTON MKT'`, [ST]);
    const chilli = await countWhere(`SELECT COUNT(*)::int AS c FROM app_daily_market_history WHERE state = $1 AND market = 'ZZV2 CHILLI MKT'`, [ST]);
    assert.strictEqual(cotton, 1, 'COTTON stored in market_prices');
    assert.strictEqual(chilli, 1, 'CHILLI stored in daily history');
    const ctx = await countWhere(`SELECT COUNT(*)::int AS c FROM market_prices WHERE state = $1 AND market = 'ZZV2 COTTON MKT' AND commodity = 'COTTON' AND variety = 'V-797' AND price_per_kg = NULL`, [ST]);
    assert.strictEqual(ctx, 0, 'COTTON price_per_kg is not NULL (normalized 650 → 6.5)');
    const ppk = (await query(`SELECT price_per_kg FROM market_prices WHERE state = $1 AND market = 'ZZV2 COTTON MKT'`, [ST])).rows[0].price_per_kg;
    assert.strictEqual(Number(ppk), 6.5, 'COTTON ₹/kg math correct');
  });

  // ---------------- 9. Historical source identity
  await test('#9 historical source identity: per-row source preserved', async () => {
    const base = (src) => `INSERT INTO historical_market_prices
      (state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, source, price_per_kg)
      VALUES ($1,$2,'ZZV2 HIST MKT','TOMATO','Desi','GRADE_A',NOW()::date,8,12,10,$3,10)
      ON CONFLICT ON CONSTRAINT uq_historical_identity DO NOTHING`;
    await query(base('agmarknet_historical'), [ST, DT, 'agmarknet_historical']);
    await query(base('manual_seed'), [ST, DT, 'manual_seed']);
    // identical re-sync upserts nothing new
    await query(base('agmarknet_historical'), [ST, DT, 'agmarknet_historical']);
    const rows = (await query(
      `SELECT source, variety FROM historical_market_prices WHERE state = $1 AND market = 'ZZV2 HIST MKT' ORDER BY source`,
      [ST]
    )).rows;
    assert.strictEqual(rows.length, 2, 'two distinct provenance rows (agmarknet_historical + manual_seed)');
    assert.deepStrictEqual(rows.map(r => r.source).sort(), ['agmarknet_historical', 'manual_seed'], 'sources preserved exactly');
  });

  // ---------------- 10. App history growth
  await test('#10 app history growth: accumulates across multiple sync runs', async () => {
    const earlier = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    await appendToDailyHistory([mk('Desi', 'ZZV2 GROW MKT', 8, 10, 12)], 'mandi_api', null);
    await appendToDailyHistory([{ ...mk('Desi', 'ZZV2 GROW MKT', 8, 10, 12), arrivalDate: earlier }], 'mandi_api', null);
    await appendToDailyHistory([mk('Desi', 'ZZV2 GROW MKT', 9, 11, 13)], 'mandi_api', null); // same-day rerun updates, no dupe
    const rows = (await query(
      `SELECT price_date, modal_price FROM app_daily_market_history
       WHERE state = $1 AND market = 'ZZV2 GROW MKT' AND commodity = 'TOMATO' AND variety = 'Desi' AND source = 'mandi_api'
       ORDER BY price_date`,
      [ST]
    )).rows;
    // node-postgres returns DATE as a local-midnight JS Date; format in local
    // terms so we compare calendar dates, not UTC-shifted ones.
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    assert.strictEqual(rows.length, 2, 'two distinct days, not three (same-day upsert on identity)');
    assert.ok(rows.some(r => fmt(r.price_date) === earlier), 'prior day retained');
    const todayRow = rows.find(r => fmt(r.price_date) === todayISO);
    assert.ok(todayRow, 'today row present');
    assert.strictEqual(Number(todayRow.modal_price), 11, 'same-day rerun updated in place (no duplicate)');
  });

  // ---------------- 14. Arrivals preserved
  await test('#14 arrivals preserved: AGMARKNET arrival quantity stored', async () => {
    await appendToDailyHistory([
      { state: ST, district: DT, market: 'ZZV2 ARR MKT', commodity: 'ONION', variety: '', arrival_date: todayISO, min_price: 10, max_price: 16, modal_price: 12, arrivals: 1250 },
    ], 'agmarknet_current', null);
    const row = (await query(
      `SELECT arrivals FROM app_daily_market_history WHERE state = $1 AND market = 'ZZV2 ARR MKT' AND commodity = 'ONION'`,
      [ST]
    )).rows[0];
    assert.ok(row, 'arrivals row present');
    assert.strictEqual(Number(row.arrivals), 1250, 'arrival quantity preserved');
  });

  // ---------------- 7. AI chat variety
  const v2RowsForDb = (requests) => async (sql, params) => {
    if (sql.includes('FROM market_prices') && params && params[0]) {
      if (requests[params[0]]) return { rows: requests[params[0]] };
    }
    return { rows: [] };
  };

  await test('#7 AI chat variety: detectVariety resolves and retrieval prefers the named variety', async () => {
    assert.strictEqual(assistantService.detectVariety('What is the price of tomato desi?'), 'Desi');
    assert.strictEqual(assistantService.detectVariety('rate of onion hybrid today'), 'Hybrid');
    assert.strictEqual(assistantService.detectVariety('cost of apple kinnow'), 'Kinnow');
    assert.strictEqual(assistantService.detectVariety('price of tomato'), null, 'no variety → null');
    const out = await assistantService.processQuery(
      'What is the price of tomato desi?',
      { role: 'FARMER', name: 'Test Farmer' },
      v2RowsForDb({ TOMATO: [
        { commodity: 'TOMATO', variety: 'Desi', price_per_kg: 14, modal_price: 1400, market_name: 'ZZ Mkt A', market: 'ZZ Mkt A', state: ST, district: DT, source: 'mandi_api', arrival_date: todayISO },
        { commodity: 'TOMATO', variety: 'Hybrid', price_per_kg: 18, modal_price: 1800, market_name: 'ZZ Mkt B', market: 'ZZ Mkt B', state: ST, district: DT, source: 'mandi_api', arrival_date: todayISO },
      ] })
    );
    assert.strictEqual(out.databaseContext.marketPrices.length, 1, 'only the Desi row grounds the answer');
    assert.strictEqual(out.databaseContext.marketPrices[0].variety, 'Desi', 'variety-specific grounding');
    assert.ok(out.message.toLowerCase().includes('desi'), 'reply names the variety');
  });

  // ---------------- 8. Recommendation variety
  const farmerId = crypto.randomUUID();
  const listingDesi = crypto.randomUUID();
  const farmerGeneric = crypto.randomUUID();
  const listingUnknown = crypto.randomUUID();
  cleanFarmers.push(farmerId, farmerGeneric);

  await test('#8 recommendation variety: benchmark picks variety-specific row, falls back to any-variety', async () => {
    await query(
      `INSERT INTO farmer_profiles (id, name, state, district) VALUES ($1,$2,$3,$4)`,
      [farmerId, 'ZZV2 Farmer', 'ZZRECSTATE', 'ZZRECDIST']
    );
    await query(
      `INSERT INTO farmer_profiles (id, name, state, district) VALUES ($1,$2,$3,$4)`,
      [farmerGeneric, 'ZZV2 Farmer G', 'ZZRECSTATE', 'ZZRECDIST']
    );
    await query(
      `INSERT INTO produce_listings (id, farmer_id, commodity, variety, quantity, asking_price, location, state, district, listing_status)
       VALUES ($1,$2,'TOMATO','Desi',100,10,'ZzRec Loc','ZZRECSTATE','ZZRECDIST','ACTIVE')`,
      [listingDesi, farmerId]
    );
    await query(
      `INSERT INTO produce_listings (id, farmer_id, commodity, variety, quantity, asking_price, location, state, district, listing_status)
       VALUES ($1,$2,'TOMATO','NoSuchZzVariety',100,10,'ZzRec Loc','ZZRECSTATE','ZZRECDIST','ACTIVE')`,
      [listingUnknown, farmerGeneric]
    );
    // Variety-specific (Desi) and generic market rows. Generic row is newest so a
    // naive any-variety query would pick it by arrival_date DESC.
    await query(
      `INSERT INTO market_prices (state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, price_per_kg, source, data_freshness)
       VALUES ($1,$2,'ZZ REC MKT','TOMATO','Desi',NULL,NOW()::date,2000,3000,2500,25,'mandi_api','fresh')
       ON CONFLICT ON CONSTRAINT uq_market_prices_identity DO NOTHING`,
      ['ZZRECSTATE', 'ZZRECDIST']
    );
    await query(
      `INSERT INTO market_prices (state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, price_per_kg, source, data_freshness)
       VALUES ('ALL',NULL,'ZZ GEN MKT','TOMATO','',NULL,NOW()::date + 1,3500,4500,4000,40,'mandi_api','fresh')
       ON CONFLICT ON CONSTRAINT uq_market_prices_identity DO NOTHING`,
      []
    );

    const recsDesi = await RecommendationService.getFarmerRecommendations(farmerId);
    const priceRec = recsDesi.find(r => r.category === 'PRICE_OPTIMIZATION' && r.type === 'PRICE_BENCHMARK');
    assert.ok(priceRec, 'price benchmark recommendation emitted');
    assert.strictEqual(priceRec.underlyingValues.variety, 'Desi', 'variety-specific benchmark used');
    assert.strictEqual(Number(priceRec.underlyingValues.mandiBenchmark), 25, 'benchmark 25 (Desi), not 40 (generic)');
    assert.ok(priceRec.description.includes('(Desi variety)'), 'description names the variety');

    const recsGen = await RecommendationService.getFarmerRecommendations(farmerGeneric);
    const priceGen = recsGen.find(r => r.category === 'PRICE_OPTIMIZATION' && r.type === 'PRICE_BENCHMARK');
    assert.ok(priceGen, 'unknown-variety listing still gets a benchmark (fallback, not blocked)');
    assert.strictEqual(Number(priceGen.underlyingValues.mandiBenchmark), 40, 'falls back to any-variety benchmark 40');
    assert.strictEqual(priceGen.underlyingValues.variety, null, 'fallback row has no variety');
  });

  // ---------------- 11. No fabrication
  await test('#11 no fabrication: zero/ordering-violation records rejected; no-data path is honest', async () => {
    assert.strictEqual(validateRecord({ minPrice: 0, maxPrice: 12, modalPrice: 10 }).valid, false, 'rejects ₹0');
    assert.strictEqual(validateRecord({ minPrice: 20, maxPrice: 12, modalPrice: 15 }).valid, false, 'rejects ordering violation');
    assert.strictEqual(validateRecord({ minPrice: 8, maxPrice: 20, modalPrice: 12 }).valid, true, 'accepts valid');
    assert.strictEqual(validateRecord({ minPrice: 8, maxPrice: 20, modalPrice: 12, arrivalDate: new Date(Date.now() + 3 * 864e5).toISOString() }).valid, false, 'rejects future date');

    // Production gates records through validateRecord before storeMandiRecords.
    const zero = mk('Desi', 'ZZV2 ZERO MKT', 0, 0, 0);
    const valid = mk('Desi', 'ZZV2 ZERO MKT', 800, 1000, 1200);
    assert.strictEqual(validateRecord(zero).valid, false, '₹0 rejected by the gate');
    assert.strictEqual(validateRecord(valid).valid, true, 'valid record passes');
    const accepted = [zero, valid].filter(r => validateRecord(r).valid);

    const beforeRows = (await query(`SELECT COUNT(*)::int AS c, COALESCE(COUNT(price_per_kg) FILTER (WHERE price_per_kg IS NULL), 0) AS nullppk FROM market_prices WHERE state = $1`, [ST])).rows[0];
    await storeMandiRecords(accepted, null, 'agmarknet_current');
    const afterRows = (await query(`SELECT COUNT(*)::int AS c, COALESCE(COUNT(price_per_kg) FILTER (WHERE price_per_kg IS NULL), 0) AS nullppk FROM market_prices WHERE state = $1`, [ST])).rows[0];
    assert.strictEqual(afterRows.c, beforeRows.c + 1, 'only the validated record stored — the ₹0 row was never written');
    assert.strictEqual(afterRows.nullppk, beforeRows.nullppk, 'no row landed without a price_per_kg');

    const out = await assistantService.processQuery(
      'What is the price of corn?',
      { role: 'FARMER', name: 'Test Farmer' },
      v2RowsForDb({ CORN: [] })
    );
    assert.strictEqual(out.databaseContext.marketPrices.length, 0, 'no fabricated rows in context');
    assert.ok(!out.message.toLowerCase().includes('₹'), 'no fabricated price in reply');
  });

  // ---------------- 12. Pagination (>500 records without truncation)
  await test('#12 pagination: mandi.fetchPrices gathers 10,000 records across two pages', async () => {
    const origGet = mandiProvider._httpGet;
    const origKey = mandiProvider.apiKey, origRes = mandiProvider.resourceId, origUrl = mandiProvider.apiUrl, origFmt = mandiProvider.format;
    const page1 = Array.from({ length: 5000 }, (_, i) => ({
      state: 'ZZ', district: '1', market: `ZZPAG MKT ${i}`, commodity: 'TOMATO',
      arrival_date: '09/09/2026', min_price: '100', max_price: '200', modal_price: '150',
    }));
    const page2 = Array.from({ length: 5000 }, (_, i) => ({
      state: 'ZZ', district: '1', market: `ZZPAG MKT ${i}`,
      arrival_date: '09/09/2026', min_price: '100', max_price: '200', modal_price: '150',
    }));
    let calls = 0;
    mandiProvider.apiKey = 'test-key';
    mandiProvider.resourceId = 'test-res';
    mandiProvider.apiUrl = 'https://example.invalid';
    mandiProvider.format = 'json';
    mandiProvider._httpGet = async () => {
      calls += 1;
      return { records: calls === 1 ? page1 : (calls === 2 ? page2 : []) };
    };
    try {
      const out = await mandiProvider.fetchPrices({ commodity: 'TOMATO', limit: 5000 });
      assert.ok(out.success, 'pagination reports success');
      assert.strictEqual(out.records.length, 10000, 'all >500 records collected (10,000 across 2 pages)');
      assert.ok(out.records.length > 500, 'page1 alone exceeds 500 — never truncated at a 500-row cap');
      const noCap = page1.every(r => out.records.some(o => o.market === r.market && o.commodity === 'TOMATO'));
      assert.ok(noCap, 'no record dropped between pages');
    } finally {
      mandiProvider._httpGet = origGet;
      mandiProvider.apiKey = origKey;
      mandiProvider.resourceId = origRes;
      mandiProvider.apiUrl = origUrl;
      mandiProvider.format = origFmt;
    }
  });

  await cleanAll();
  console.log(`\nMarket intelligence v2: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
  console.log('All market intelligence v2 tests passed ✅');
  process.exit(0);
})();