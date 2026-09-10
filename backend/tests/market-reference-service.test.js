// Market reference price tests — the LIVE price source for the farmer listing form.
// Source of truth: CURRENT market_prices pipeline (mandi / Data.gov.in), never CEDA.
// Run with the app server running on port 5001:
//   node tests/market-reference-service.test.js
// Verifies:
//   1. Reference API requires auth (401)
//   2. Authenticated reference API returns district-level price, per-kg normalized
//   3. Service prefers district -> state -> national fallback (real seeded rows)
//   4. Per-quintal sources are normalized to per-kg
//   5. Explicit insufficientRealData when no real rows exist (never fabricates)
//   6. buildSuggestedRange only proposes a range when a real reference exists
//   7. Listing creation is NOT blocked when no real market data exists

const assert = require('assert');
require('dotenv').config();
const { query: db } = require('../db');
const marketReferenceService = require('../services/marketReferenceService');

const BASE = 'http://localhost:5001/api';
const PASSWORD = 'SecurePassword@123';

let token = null;
let profileId = null;
const registeredAccounts = [];
let phoneSeed = 9000000000 + (Date.now() % 400000000);
const createdListingIds = [];
const seededPriceIds = [];

const auth = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

async function json(res) {
  const body = await res.json();
  return { status: res.status, body };
}

async function registerOnboard(role, name, onboardBody) {
  const email = `${role.toLowerCase()}_mkt_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.com`;
  const reg = await json(await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, role, name }),
  }));
  assert.ok([200, 201].includes(reg.status), `registration failed: ${JSON.stringify(reg.body)}`);
  assert.ok(reg.body.devOtp, 'registration must return a dev OTP');

  const verify = await json(await fetch(`${BASE}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp: reg.body.devOtp }),
  }));
  assert.strictEqual(verify.status, 200, 'email verification should succeed');
  token = verify.body.token;

  const onboard = await json(await fetch(`${BASE}/profiles/onboard`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ ...onboardBody, contactNumber: `9${String(phoneSeed++).slice(-9)}` }),
  }));
  assert.strictEqual(onboard.status, 201, `onboarding failed: ${JSON.stringify(onboard.body)}`);
  profileId = (onboard.body.profile || onboard.body).id;

  const table = role === 'BUYER' ? 'buyer_profiles' : 'farmer_profiles';
  const userRes = await db(`SELECT user_id FROM ${table} WHERE id = $1`, [profileId]);
  assert.ok(userRes.rows[0], 'profile row must exist');
  registeredAccounts.push({ profileId, userId: userRes.rows[0].user_id, email, role, name });
}

const BUYER_ONBOARD = {
  name: 'Mkt Buyer',
  state: 'Maharashtra',
  district: 'Mumbai',
  location: 'Mumbai Central',
  contactNumber: '8888900003',
  companyName: 'Mkt Foods Co',
  organizationType: 'bulk_buyer',
  annualCapacity: 3000,
};

// ------------------------------------------------ seeded, deterministic price set
const ts = Date.now();
const S_A = `ZZDEMO_STATE_${ts}`;
const D_A = `ZZDEMO_DIST_${ts}`;
const S_OTHER = `ZZDEMO_NAT_${ts}`;

async function seedRows() {
  const insert = async (market, state, district, modal, min, max, pricePerKg) => {
    const r = await db(
      `INSERT INTO market_prices (state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, price_per_kg, source, data_freshness)
       VALUES ($1, $2, $3, 'TOMATO', 'Demo Variety', 'GRADE_A', NOW() + INTERVAL '2 day', $5, $6, $4, $7, 'mandi_api', 'fresh')
       RETURNING id`,
      [state, district, market, modal, min, max, pricePerKg]
    );
    seededPriceIds.push(r.rows[0].id);
  };
  // district-level (per-quintal raw values -> price_per_kg normalized to ₹/kg)
  await insert('ZZ MKT DIST', S_A, D_A, 2500, 2400, 2600, 25);
  // state-level
  await insert('ZZ MKT STATE', S_A, null, 3000, 2900, 3200, 30);
  // national-level (other state)
  await insert('ZZ MKT NAT', S_OTHER, null, 3500, 3400, 3600, 35);
}

async function cleanup() {
  for (const id of seededPriceIds) {
    await db('DELETE FROM market_prices WHERE id = $1', [id]);
  }
  for (const listingId of createdListingIds) {
    await db('DELETE FROM orders WHERE listing_id = $1', [listingId]);
    await db('DELETE FROM produce_listings WHERE id = $1', [listingId]);
  }
  for (const acc of registeredAccounts) {
    await db('DELETE FROM buyer_demands WHERE buyer_id = $1', [acc.profileId]);
    await db('DELETE FROM demand_offers WHERE farmer_id = $1', [acc.profileId]);
    await db('DELETE FROM buyer_profiles WHERE id = $1', [acc.profileId]);
    await db('DELETE FROM farmer_profiles WHERE id = $1', [acc.profileId]);
    await db('DELETE FROM users WHERE id = $1', [acc.userId]);
  }
}

async function test_unauthorizedReference() {
  const r = await json(await fetch(`${BASE}/market-data/reference?commodity=TOMATO`));
  assert.strictEqual(r.status, 401, 'reference API requires auth -> 401');
}

async function test_authenticatedReferenceDistrict() {
  const r = await json(await fetch(
    `${BASE}/market-data/reference?commodity=TOMATO&state=${encodeURIComponent(S_A)}&district=${encodeURIComponent(D_A)}`,
    { headers: auth() }
  ));
  assert.strictEqual(r.status, 200, `reference API accessible: ${JSON.stringify(r.body)}`);
  assert.ok(r.body.reference, 'reference object returned');
  assert.strictEqual(r.body.reference.scope, 'district', 'district price preferred');
  assert.strictEqual(r.body.reference.modalPrice, 25, 'per-quintal source normalized to ₹25/kg');
  assert.ok(r.body.suggestedRange.available, 'suggested range derived from real reference');
}

async function test_serviceFallbackChain() {
  // district still present -> district
  let ref = await marketReferenceService.getReferencePrice({ commodity: 'TOMATO', state: S_A, district: D_A });
  assert.strictEqual(ref.scope, 'district', 'service returns district first');
  assert.strictEqual(ref.modalPrice, 25, 'district modal per kg');

  // remove district coverage -> state fallback
  await db('DELETE FROM market_prices WHERE state = $1 AND district = $2', [S_A, D_A]);
  ref = await marketReferenceService.getReferencePrice({ commodity: 'TOMATO', state: S_A, district: D_A });
  assert.strictEqual(ref.scope, 'state', 'state fallback used when no district data');
  assert.strictEqual(ref.modalPrice, 30, 'state modal per kg');

  // remove state coverage -> national fallback
  await db('DELETE FROM market_prices WHERE state = $1 AND district IS NULL', [S_A]);
  ref = await marketReferenceService.getReferencePrice({ commodity: 'TOMATO', state: S_A, district: D_A });
  assert.strictEqual(ref.scope, 'national', 'national fallback used when no state data');
  assert.strictEqual(ref.modalPrice, 35, 'national modal per kg');
}

async function test_normalizationAndInsufficient() {
  const { normalizeToKg } = marketReferenceService._internal;
  assert.strictEqual(normalizeToKg(2500, 'mandi_api'), 25, 'mandi_api per-quintal -> per-kg');
  assert.strictEqual(normalizeToKg(3000, 'agmarknet_historical'), 30, 'agmarknet per-quintal -> per-kg');
  assert.strictEqual(normalizeToKg(42, 'government_api'), 0.42, 'government_api is per-quintal -> per-kg');
  assert.strictEqual(normalizeToKg(42, 'other_sz'), 42, 'per-kg source unchanged');
  assert.strictEqual(normalizeToKg('not-a-number', 'government_api'), null, 'invalid number -> null');

  const noData = await marketReferenceService.getReferencePrice({ commodity: '', state: 'ZZNOWHERE', district: 'ZZNOWHERE' });
  assert.strictEqual(noData.available, false, 'no-data result is not available');
  assert.strictEqual(noData.insufficientRealData, true, 'explicit insufficientRealData — never fabricates');
  assert.strictEqual(noData.modalPrice, null, 'no fabricated price');
}

async function test_suggestedRangeOnlyWhenReal() {
  const ok = marketReferenceService.buildSuggestedRange({ available: true, modalPrice: 25 });
  assert.strictEqual(ok.suggested, true, 'suggestion derived from real price');
  assert.strictEqual(ok.min, 23.75, 'lower bound = 95% of modal');
  assert.strictEqual(ok.max, 26.25, 'upper bound = 105% of modal');

  const none = marketReferenceService.buildSuggestedRange({ available: false, modalPrice: null });
  assert.strictEqual(none.suggested, false, 'no suggestion when no real reference');
}

const FARMER_ONBOARD_NO_DATA = {
  name: 'NoData Farmer',
  state: `ZZNODATA_STATE_${ts}`,
  district: `ZZNODATA_DIST_${ts}`,
  location: 'K R Puram, Bangalore',
  contactNumber: '7777900005',
};

async function test_listingNotBlockedWithoutData() {
  for (const id of seededPriceIds) {
    await db('DELETE FROM market_prices WHERE id = $1', [id]);
  }
  const farmer = registeredAccounts.find(a => a.name === 'NoData Farmer');
  await login(farmer.email);
  const r = await json(await fetch(`${BASE}/listings`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({
      commodity: 'LETTUCE',
      variety: 'Robusta',
      grade: 'GRADE_A',
      quantity: 80,
      unit: 'kg',
      askingPrice: 20,
      description: 'market reference no-data listing test',
    }),
  }));
  assert.strictEqual(r.status, 201, `listing still created without market data: ${JSON.stringify(r.body)}`);
  assert.strictEqual(r.body.reference?.available, false, 'reference explicitly unavailable (no fabrication)');
  createdListingIds.push(r.body.id);
  const row = await db('SELECT reference_modal_price FROM produce_listings WHERE id = $1', [r.body.id]);
  assert.strictEqual(row.rows[0].reference_modal_price, null, 'reference columns stay NULL without real data');
}

async function login(email) {
  const r = await json(await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  }));
  assert.strictEqual(r.status, 200, 'login should succeed');
  token = r.body.token;
}

(async () => {
  let pass = 0, fail = 0;
  const tests = [
    ['reference API requires auth (401)', test_unauthorizedReference],
    ['authenticated reference API returns district price (per-kg)', test_authenticatedReferenceDistrict],
    ['service fallback district -> state -> national', test_serviceFallbackChain],
    ['per-quintal normalization + insufficientRealData guard', test_normalizationAndInsufficient],
    ['suggested range only when real reference exists', test_suggestedRangeOnlyWhenReal],
    ['listing creation not blocked when no market data', test_listingNotBlockedWithoutData],
  ];

  try {
    await registerOnboard('BUYER', 'Mkt Buyer', BUYER_ONBOARD);
    await seedRows();
    await registerOnboard('FARMER', 'NoData Farmer', FARMER_ONBOARD_NO_DATA);
    for (const [name, fn] of tests) {
      try {
        await fn();
        pass++;
      } catch (e) {
        fail++;
        console.error(`❌ ${name}: ${e.message}`);
      }
    }
  } finally {
    await cleanup();
  }
  console.log(`\nMarket reference service integration tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
  console.log('All Market reference integration tests passed ✅');
  process.exit(0);
})();