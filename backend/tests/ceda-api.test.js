// Unit tests for backend/services/cedaApi.js
// Run with:  NODE_ENV=test node tests/ceda-api.test.js
// These tests do NOT hit the live CEDA API — fetch is mocked.

const assert = require('assert');
const svc = require('../services/cedaApi');
const { _internal } = require('../services/cedaApi');

const savedEnv = { ...process.env };

function setEnv() {
  process.env.CEDA_API_KEY = 'test-key-123';
  process.env.CEDA_API_BASE_URL = 'https://ceda.test/v1';
  process.env.CEDA_MAX_RETRIES = '2';
  process.env.CEDA_RETRY_DELAY_MS = '0';
  process.env.CEDA_TIMEOUT_MS = '5000';
}

function resetEnv() {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('CEDA_')) delete process.env[k];
  }
}

function jsonResponse(data, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(data),
  };
}

async function test_parseEnvelope() {
  const s = _internal.parseEnvelope({ output: { type: 'success', message: 'Data exists', data: [{ a: 1 }] } });
  assert.strictEqual(s.success, true);
  assert.deepStrictEqual(s.data, [{ a: 1 }]);

  const errEnv = _internal.parseEnvelope({ output: { type: 'error', message: 'required', data: [] } });
  assert.strictEqual(errEnv.success, false);
  assert.strictEqual(errEnv.message, 'required');

  const errFlat = _internal.parseEnvelope({ error: 'Invalid indicator specified' });
  assert.strictEqual(errFlat.success, false);
  assert.strictEqual(errFlat.message, 'Invalid indicator specified');

  const rate = _internal.parseEnvelope({ status: 'failure', message: 'Too many requests, please try again later.' });
  assert.strictEqual(rate.success, false);
}

async function test_credentialsMissing() {
  resetEnv();
  await assert.rejects(() => svc.getCommodities(), /CEDA_API_KEY missing/);
}

async function test_commoditiesFetchAndCache() {
  setEnv();
  _internal._clearCache();
  const body = { output: { type: 'success', message: 'ok', data: [{ commodity_id: 1, commodity_name: 'Wheat' }] } };
  const origFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return jsonResponse(body); };
  try {
    const d1 = await svc.getCommodities();
    assert.strictEqual(d1.length, 1);
    assert.strictEqual(d1[0].commodity_name, 'Wheat');
    const d2 = await svc.getCommodities();
    assert.strictEqual(d2.length, 1);
    assert.strictEqual(calls, 1, 'second call should hit cache');
  } finally {
    global.fetch = origFetch;
  }
}

async function test_geographiesFetch() {
  setEnv();
  _internal._clearCache();
  const body = { output: { type: 'success', message: 'ok', data: [{ census_state_id: 1, census_state_name: 'J&K' }] } };
  const origFetch = global.fetch;
  global.fetch = async () => jsonResponse(body);
  try {
    const d = await svc.getGeographies();
    assert.strictEqual(d[0].census_state_name, 'J&K');
  } finally {
    global.fetch = origFetch;
  }
}

async function test_pricesShapeAndUrl() {
  setEnv();
  _internal._clearCache();
  const body = {
    output: {
      type: 'success',
      message: 'Data exists',
      data: [{ date: '2020-03-06T00:00:00.000Z', commodity_id: 1, census_state_id: 3, min_price: 1825, max_price: 1860, modal_price: 1840 }],
    },
  };
  const origFetch = global.fetch;
  let captured;
  global.fetch = async (url, opts) => {
    captured = { url, opts };
    return jsonResponse(body);
  };
  try {
    const d = await svc.getPrices({ commodityId: 1, stateId: 3, fromDate: '2020-03-01', toDate: '2020-03-15' });
    assert.strictEqual(d.length, 1);
    assert.strictEqual(d[0].modal_price, 1840);
    assert.match(captured.url, /agmarknet\/prices$/);
    assert.strictEqual(captured.opts.method, 'POST');
    assert.strictEqual(captured.opts.headers.Authorization, 'Bearer test-key-123');
    const sent = JSON.parse(captured.opts.body);
    assert.deepStrictEqual(sent, { commodity_id: 1, state_id: 3, from_date: '2020-03-01', to_date: '2020-03-15' });
  } finally {
    global.fetch = origFetch;
  }
}

async function test_quantitiesShape() {
  setEnv();
  _internal._clearCache();
  const body = { output: { type: 'success', message: 'ok', data: [{ date: '2020-03-06T00:00:00.000Z', commodity_id: 1, census_state_id: 3, quantity: 16.75 }] } };
  const origFetch = global.fetch;
  global.fetch = async () => jsonResponse(body);
  try {
    const d = await svc.getQuantities({ commodityId: 1, stateId: 3, fromDate: '2020-03-01', toDate: '2020-03-15' });
    assert.strictEqual(d[0].quantity, 16.75);
  } finally {
    global.fetch = origFetch;
  }
}

async function test_marketsIndicatorValidation() {
  setEnv();
  await assert.rejects(() => svc.getMarkets({ indicator: 'nope', commodityId: 1 }), /indicator "price" or "quantity"/);
  await assert.rejects(() => svc.getMarkets({}), /indicator "price" or "quantity"/);
}

async function test_marketsBuildsBody() {
  setEnv();
  _internal._clearCache();
  const body = { output: { type: 'success', message: 'No data exists', data: [] } };
  const origFetch = global.fetch;
  let captured;
  global.fetch = async (url, opts) => { captured = { url, opts }; return jsonResponse(body); };
  try {
    const d = await svc.getMarkets({ indicator: 'price', commodityId: 1, stateId: 3, fromDate: '2020-01-01', toDate: '2020-02-01' });
    assert.deepStrictEqual(d, []);
    const sent = JSON.parse(captured.opts.body);
    assert.strictEqual(sent.indicator, 'price');
    assert.strictEqual(sent.commodity_id, 1);
    assert.match(captured.url, /agmarknet\/markets$/);
  } finally {
    global.fetch = origFetch;
  }
}

async function test_authFailureNoLeak() {
  setEnv();
  const origFetch = global.fetch;
  global.fetch = async () => jsonResponse({}, 401);
  try {
    await assert.rejects(() => svc.getCommodities(), /CEDA authentication failed/);
  } finally {
    global.fetch = origFetch;
  }
}

async function test_rateLimitRetry() {
  setEnv();
  _internal._clearCache();
  const origFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    if (calls < 3) return jsonResponse({ status: 'failure', message: 'Too many requests, please try again later.' }, 429);
    return jsonResponse({ output: { type: 'success', message: 'ok', data: [{ commodity_id: 1, commodity_name: 'Wheat' }] } });
  };
  try {
    const d = await svc.getCommodities();
    assert.strictEqual(d.length, 1);
    assert.ok(calls >= 2, 'retry should happen on rate limit');
  } finally {
    global.fetch = origFetch;
  }
}

(async () => {
  let pass = 0, fail = 0;
  const tests = [
    ['parseEnvelope', test_parseEnvelope],
    ['credentials missing', test_credentialsMissing],
    ['commodities fetch + cache', test_commoditiesFetchAndCache],
    ['geographies fetch', test_geographiesFetch],
    ['prices shape + auth header', test_pricesShapeAndUrl],
    ['quantities shape', test_quantitiesShape],
    ['markets indicator validation', test_marketsIndicatorValidation],
    ['markets body build', test_marketsBuildsBody],
    ['auth failure no leak', test_authFailureNoLeak],
    ['rate limit retry', test_rateLimitRetry],
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
  resetEnv();
  console.log(`\nCEDA API service unit tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
  console.log('All CEDA API service unit tests passed ✅');
})();
