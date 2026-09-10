// Today's Market Rates endpoint tests — driver for the Assistant's
// "Today's Market Rates" right-column panel.
//
// Guards the fix for the panel showing only a single item:
//   1. The endpoint enumerates EVERY supported commodity (discovered from the
//      DB — commodity enum + marketplace tables), not just whatever rows happen
//      to exist in market_prices.
//   2. Prices come ONLY from the current market pipeline (mandi/Data.gov.in
//      family). CEDA / historical / seed_demo rows are never treated as "today".
//   3. Per-commodity location priority district -> state -> national.
//   4. Commodities without current real data get an explicit no-data entry
//      (available:false) — never a fabricated price.
//
// Run with the app server running on port 5001:
//   node tests/today-market-rates.test.js

const assert = require('assert');
require('dotenv').config();

const BASE = 'http://localhost:5001/api';
const PASSWORD = 'SecurePassword@123';

let token = null;

const CURRENT_PIPELINE_SOURCES = new Set([
  'mandi_api',
  'government_api',
  'agmarknet_current',
  'data_gov_in',
]);

async function loginForTesting() {
  const email = `rates_${Date.now()}@test.com`;
  const register = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Rates Test', email, password: PASSWORD, role: 'BUYER' }),
  });
  const regJson = await register.json().catch(() => ({}));
  if (register.ok && regJson.devOtp) {
    const verify = await fetch(`${BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp: regJson.devOtp }),
    });
    await verify.json();
    const login = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    const loginJson = await login.json();
    return loginJson.token;
  }
  // Fall back to an existing known-good account if registration path varies.
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'vbrowser_848164@test.com', password: PASSWORD }),
  });
  const loginJson = await login.json();
  return loginJson.token;
}

async function getTodayRates(tokenValue, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/market-prices/today-rates?${qs}`, {
    headers: { Authorization: `Bearer ${tokenValue}` },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  token = await loginForTesting();
  assert.ok(token, 'Should obtain an auth token');

  // 1. Auth required.
  const anon = await fetch(`${BASE}/market-prices/today-rates`);
  assert.strictEqual(anon.status, 401, 'Unauthenticated request must be 401');

  // 2. Returns the full supported commodity universe, not just rows present.
  const national = await getTodayRates(token);
  assert.strictEqual(national.status, 200, 'Authenticated request returns 200');
  assert.ok(Array.isArray(national.body.rates), 'rates is an array');
  const count = national.body.rates.length;
  assert.ok(count >= 10, `Panel enumerates the full supported set (got ${count}, expected >= 10)`);
  const names = national.body.rates.map(r => String(r.commodity).toUpperCase());
  for (const required of ['TOMATO', 'ONION', 'POTATO', 'BANANA', 'RICE', 'WHEAT']) {
    assert.ok(names.includes(required), `Supported set includes ${required}`);
  }
  assert.ok(!names.includes('OTHER'), 'Excludes generic OTHER bucket');

  // 3. Every available price must come from the current pipeline, never CEDA/
  //    historical/seed_demo. Every entry is either priced or an explicit no-data.
  for (const r of national.body.rates) {
    if (r.available) {
      assert.ok(r.pricePerKg > 0, `${r.commodity} has a positive price`);
      assert.ok(CURRENT_PIPELINE_SOURCES.has(r.source), `${r.commodity} source ${r.source} is current pipeline`);
      assert.ok(r.arrivalDate, `${r.commodity} has arrival date`);
      assert.ok(r.scope, `${r.commodity} has a scope`);
      assert.ok(['district', 'state', 'national'].includes(r.scope), `${r.commodity} scope valid`);
    } else {
      assert.strictEqual(r.available, false, `${r.commodity} explicitly marked unavailable (no fabrication)`);
      assert.strictEqual(r.pricePerKg, undefined, `${r.commodity} has NO fabricated price`);
    }
  }

  // 4. Location priority: requesting Hyderabad/Telangana should surface the
  //    banana district row as 'district' scope (it exists in market_prices).
  //    Coverage is honest: a stale row is surfaced with available=false and
  //    never a fabricated price, while a fresh row shows its real price.
  const hyderabad = await getTodayRates(token, { state: 'Telangana', district: 'Hyderabad' });
  const bananaInHyderabad = hyderabad.body.rates.find(r => r.commodity.toUpperCase() === 'BANANA');
  assert.ok(bananaInHyderabad, 'BANANA surfaced for Hyderabad/Telangana');
  if (bananaInHyderabad && bananaInHyderabad.scope) {
    assert.strictEqual(bananaInHyderabad.scope, 'district',
      'District market preferred over state/national when district data exists');
  }
  if (bananaInHyderabad.available) {
    assert.ok(bananaInHyderabad.pricePerKg > 0, 'Fresh BANANA district row carries its real price');
    assert.ok(bananaInHyderabad.arrivalDate, 'Fresh BANANA district row carries arrival date');
  } else {
    assert.strictEqual(bananaInHyderabad.available, false,
      'Stale district row is honestly marked unavailable (never shown as live)');
    assert.strictEqual(bananaInHyderabad.pricePerKg, undefined,
      'Stale row carries NO price (no fabrication)');
  }

  // 5. The panel metadata is present and honest.
  assert.strictEqual(typeof national.body.availableCount, 'number');
  assert.strictEqual(typeof national.body.insufficientRealData, 'boolean');
  assert.ok(national.body.message, 'Has a human message');

  console.log(`PASS today-market-rates: ${count} supported commodities, ${national.body.availableCount} with real current data`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('FAIL today-market-rates:', err.message);
  process.exit(1);
});