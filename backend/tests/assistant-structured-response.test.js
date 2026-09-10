// Assistant structured-response tests (Part 1A/1B) + Market table real-data checks (Part 2)
// + structured presentation blocks + multi-commodity overview (Part 2/4).
// Verifies:
//   A. Hermetic service-level (no server / no network):
//      1. detectIntent classifies known commodities/intents
//      2. _buildCitationsFromContext emits source/market/commodity/location citations and no_data fallback
//      3. processQuery returns the structured {message, intent, data, actions, citations, blocks} envelope with real rows
//      4. processQuery returns honest no-data fallback (never fabricates prices) when zero market rows
//      5. processQuery emits presentation `blocks` grounded in the same rows (MARKET_PRICE_CARD + SOURCE_FOOTNOTE)
//      6. no-data fallback emits a WARNING_CAVEAT block, never a price card
//   B. Live endpoint (requires server on port 5001):
//      7. Assistant chat requires auth (401) and rejects empty queries (400)
//      8. Authenticated chat returns success + structured keys (message, intent, data, actions, citations, blocks)
//      9. "Show today's wholesale rates" -> CHECK_PRICE + multi-commodity overview blocks (KEY_VALUE) with no fabricated prices
//     10. Market table endpoint returns real BANANA rows sorted desc; honest empty array for CORN (no fabrication)
// Run with the server running:  node tests/assistant-structured-response.test.js

const assert = require('assert');
require('dotenv').config();

const assistantService = require('../services/assistantService');

// Force the deterministic grounded engine in THIS test process. This must happen
// AFTER requiring the service (transitive dotenv loads in child modules would
// otherwise re-inject the Groq key). The live server process keeps its own env.
delete process.env.GROQ_API_KEY;

const BASE = 'http://localhost:5001/api';
const PASSWORD = 'SecurePassword@123';

// ------------------------------------------------ hermetic helpers

function rowsForDb(requests) {
  return async (sql, params) => {
    if (sql.includes('FROM market_prices') && params && params[0]) {
      if (requests[params[0]]) return { rows: requests[params[0]] };
    }
    return { rows: [] };
  };
}

const BANANA_ROW = {
  commodity: 'BANANA',
  market_name: 'Hyderabad Mandi',
  market: 'Hyderabad Mandi',
  state: 'Telangana',
  district: 'Hyderabad',
  modal_price: 2400,
  price_per_kg: 24,
  min_price: 2300,
  max_price: 2500,
  source: 'mandi_api',
  arrival_date: '2026-08-28T00:00:00.000Z',
};

// ------------------------------------------------ Section A: hermetic service

async function test_detectIntent() {
  const price = assistantService.detectIntent('What is the price of bananas?', 'FARMER');
  assert.strictEqual(price.intent, 'CHECK_PRICE', 'price query routes to CHECK_PRICE');
  assert.strictEqual(price.commodity, 'BANANA', 'commodity synonym resolves to BANANA');

  const sell = assistantService.detectIntent('I want to sell 500 kg of wheat', 'FARMER');
  assert.strictEqual(sell.commodity, 'WHEAT', 'wheat synonym resolves');

  const calc = assistantService.detectIntent('How much will I earn for 1000 kg at 30 rupees?', 'FARMER');
  assert.ok(['CALCULATION_QUERY', 'CHECK_PRICE'].includes(calc.intent), 'calculation intent detected');
}

async function test_buildCitations() {
  const sources = assistantService._buildCitationsFromContext({
    commodity: 'BANANA',
    marketPrices: [BANANA_ROW],
    listings: [],
    demands: [],
  });
  assert.ok(sources.length >= 1, 'citations built from market prices');
  const c = sources[0];
  assert.strictEqual(c.source, 'mandi_api', 'citation records raw source');
  assert.strictEqual(c.commodity, 'BANANA', 'citation records commodity');
  assert.strictEqual(c.market, 'Hyderabad Mandi', 'citation records market');
  assert.strictEqual(c.location, 'Hyderabad', 'citation records district as location');
  assert.ok(c.date, 'citation records arrival date');

  const empty = assistantService._buildCitationsFromContext({ commodity: 'TOMATO', marketPrices: [], listings: [], demands: [] });
  assert.strictEqual(empty.length, 1, 'no-data context still returns a transparent citation');
  assert.strictEqual(empty[0].source, 'no_data', 'explicit no_data source — nothing fabricated');
}

async function test_processQueryStructuredWithData() {
  const out = await assistantService.processQuery(
    'What is the price of banana in Hyderabad?',
    { role: 'FARMER', name: 'Test Farmer' },
    rowsForDb({ BANANA: [BANANA_ROW] })
  );

  assert.strictEqual(out.intent, 'CHECK_PRICE', 'intent surfaced in envelope');
  assert.ok(typeof out.message === 'string' && out.message.length > 0, 'message present');
  assert.ok(Array.isArray(out.actions), 'actions is an array');
  assert.ok(Array.isArray(out.citations), 'citations is an array');
  assert.ok(out.citations.length > 0, 'citations populated from real rows');
  assert.strictEqual(out.citations[0].commodity, 'BANANA', 'citation commodity matches query');
  assert.ok(out.data, 'data present');
  assert.strictEqual(out.reply, out.message, 'legacy reply mirrors message');
  assert.strictEqual(out.databaseContext.marketPrices.length, 1, 'grounding context holds the real BANANA row');
  assert.strictEqual(out.confidenceScore, 0.95, 'high confidence when real market rows grounding');
}

async function test_processQueryNoDataHonestFallback() {
  const out = await assistantService.processQuery(
    'What is the price of tomato?',
    { role: 'FARMER', name: 'Test Farmer' },
    rowsForDb({ TOMATO: [] })
  );

  assert.strictEqual(out.intent, 'CHECK_PRICE', 'intent preserved on fallback');
  assert.ok(typeof out.message === 'string' && out.message.length > 0, 'fallback message present');
  const msg = out.message.toLowerCase();
  assert.ok(!msg.includes('₹'), 'no fabricated price in no-data fallback');
  assert.ok(Array.isArray(out.citations), 'citations array present');
  assert.strictEqual(out.databaseContext.marketPrices.length, 0, 'no fabricated market rows in grounding context');
  assert.strictEqual(out.confidenceScore, 0.85, 'lower confidence when no market rows');
}

async function test_blocksStructuredData() {
  const out = await assistantService.processQuery(
    'What is the price of banana?',
    { role: 'FARMER', name: 'Test Farmer' },
    rowsForDb({ BANANA: [BANANA_ROW] })
  );

  assert.ok(Array.isArray(out.blocks) && out.blocks.length > 0, 'blocks array present');
  const types = out.blocks.map(b => b.type);
  assert.ok(types.includes('MARKET_PRICE_CARD'), 'price check emits MARKET_PRICE_CARD block');
  assert.ok(types.includes('SOURCE_FOOTNOTE'), 'transparency footnote present');
  const card = out.blocks.find(b => b.type === 'MARKET_PRICE_CARD');
  assert.strictEqual(card.commodity, 'BANANA', 'price card commodity matches query');
  assert.strictEqual(card.pricePerKg, 24, 'quintal value 2400 rendered as ₹24/kg');
  assert.strictEqual(card.minPerKg, 23, 'min price converted to per kg');
  assert.strictEqual(card.maxPerKg, 25, 'max price converted to per kg');
  assert.strictEqual(card.source, 'mandi_api', 'price card records provenance source');
  assert.ok(card.date, 'price card records observation date');
  assert.strictEqual(out.message, out.reply, 'message/reply contract preserved alongside blocks');
}

async function test_blocksNoDataHonest() {
  const out = await assistantService.processQuery(
    'What is the price of tomato?',
    { role: 'FARMER', name: 'Test Farmer' },
    rowsForDb({ TOMATO: [] })
  );

  assert.ok(Array.isArray(out.blocks) && out.blocks.length > 0, 'blocks present even when no data');
  const types = out.blocks.map(b => b.type);
  assert.ok(types.includes('WARNING_CAVEAT'), 'no-data fallback emits a WARNING_CAVEAT block');
  assert.ok(!types.includes('MARKET_PRICE_CARD'), 'no price card when no verified data — nothing fabricated');
  const caveat = out.blocks.find(b => b.type === 'WARNING_CAVEAT');
  assert.ok(!caveat.text.includes('₹'), 'caveat text carries no fabricated price');
}

// ------------------------------------------------ Section B/C: live endpoint

let token = null;
let userId = null;
const auth = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

async function json(res) {
  const body = await res.json();
  return { status: res.status, body };
}

async function registerVerified() {
  const email = `assist_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.com`;
  const reg = await json(await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, role: 'FARMER', name: 'Assist Test' }),
  }));
  assert.ok([200, 201].includes(reg.status), `registration failed: ${JSON.stringify(reg.body)}`);
  assert.ok(reg.body.devOtp, 'must return dev OTP');
  const verify = await json(await fetch(`${BASE}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp: reg.body.devOtp }),
  }));
  assert.strictEqual(verify.status, 200, 'email verification should succeed');
  token = verify.body.token;
  userId = verify.body.user?.id || reg.body.user?.id || null;
}

async function test_assistantUnauth() {
  const r = await json(await fetch(`${BASE}/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'What is the price of banana?' }),
  }));
  assert.strictEqual(r.status, 401, 'assistant chat requires auth');
}

async function test_assistantEmptyQuery() {
  const r = await json(await fetch(`${BASE}/assistant/chat`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ query: '   ' }),
  }));
  assert.strictEqual(r.status, 400, 'empty query rejected');
}

async function test_assistantChatStructured() {
  const r = await json(await fetch(`${BASE}/assistant/chat`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ query: 'What is the price of banana in Hyderabad?' }),
  }));
  assert.strictEqual(r.status, 200, `chat should succeed: ${JSON.stringify(r.body)}`);
  assert.strictEqual(r.body.success, true, 'success flag true');
  assert.ok(typeof r.body.message === 'string' && r.body.message.length > 0, 'message string');
  assert.ok(Array.isArray(r.body.actions), 'actions array');
  assert.ok(Array.isArray(r.body.citations), 'citations array');
  assert.ok(r.body.intent, 'intent present');
  assert.ok(r.body.data, 'data present');
  assert.ok(r.body.confidenceScore, 'legacy confidenceScore preserved');
}

async function test_assistantChatOverviewBlocks() {
  const r = await json(await fetch(`${BASE}/assistant/chat`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ query: 'Show today\'s wholesale market rates' }),
  }));
  assert.strictEqual(r.status, 200, `overview chat should succeed: ${JSON.stringify(r.body)}`);
  assert.strictEqual(r.body.intent, 'CHECK_PRICE', 'open-ended rates inquiry routes to CHECK_PRICE');
  assert.ok(Array.isArray(r.body.blocks) && r.body.blocks.length > 0, 'overview returns structured blocks');
  const types = r.body.blocks.map(b => b.type);
  assert.ok(types.includes('KEY_VALUE'), 'overview renders a KEY_VALUE table of commodities');
  const kv = r.body.blocks.find(b => b.type === 'KEY_VALUE');
  assert.ok(kv.rows.length >= 10, `overview enumerates the full supported set (got ${kv.rows.length})`);
  const known = kv.rows.find(row => String(row.k).toUpperCase() === 'BANANA');
  assert.ok(known, 'BANANA present in the overview');
  assert.ok(/₹[\d.]+\/kg/.test(known.v), 'available BANANA shows a real per-kg price');
  const missing = kv.rows.find(row => String(row.k).toUpperCase() === 'CORN');
  assert.ok(missing && (missing.v === '—' || missing.v.includes('—')), 'unverified commodity shows em-dash, never a fabricated number');
  assert.ok(typeof r.body.message === 'string' && r.body.message.length > 0, 'overview message preserved');
  assert.ok(Array.isArray(r.body.actions), 'overview actions preserved');
  assert.ok(r.body.data, 'overview data preserved');
}

async function test_marketTableRealData() {
  const ban = await json(await fetch(`${BASE}/market-prices?commodity=BANANA`));
  assert.strictEqual(ban.status, 200, 'market-prices table endpoint reachable');
  assert.ok(Array.isArray(ban.body), 'returns an array of rows');
  assert.ok(ban.body.length > 0, 'BANANA has real current market rows');
  const row = ban.body[0];
  assert.ok(row.modal_price != null, 'row exposes modal_price for display');
  assert.ok(row.state, 'row exposes state');
  assert.ok(row.market, 'row exposes market');
  assert.ok(row.arrival_date || row.fetched_at, 'row exposes freshness timestamp');

  const arr = ban.body.map(r => new Date(r.fetched_at || r.arrival_date).getTime());
  const sorted = arr.every((t, i) => i === 0 || arr[i - 1] >= t);
  assert.ok(sorted, 'rows sorted by recency (newest first)');

  const tom = await json(await fetch(`${BASE}/market-prices?commodity=CORN`));
  assert.strictEqual(tom.status, 200, 'CORN table endpoint reachable');
  assert.ok(Array.isArray(tom.body), 'CORN returns an array');
  assert.strictEqual(tom.body.length, 0, 'CORN has no current rows today -> honest empty array, never fabricated');
}

// ------------------------------------------------ runner

(async () => {
  let pass = 0, fail = 0;
  const tests = [
    ['detectIntent commodity/intent classification', test_detectIntent],
    ['_buildCitationsFromContext citations + no_data fallback', test_buildCitations],
    ['processQuery structured envelope with real rows', test_processQueryStructuredWithData],
    ['processQuery honest no-data fallback (no fabricated price)', test_processQueryNoDataHonestFallback],
    ['processQuery emits grounded presentation blocks (MARKET_PRICE_CARD + footnote)', test_blocksStructuredData],
    ['no-data fallback emits WARNING_CAVEAT block (no fabricated price card)', test_blocksNoDataHonest],
    ['assistant chat requires auth (401)', test_assistantUnauth],
    ['assistant chat rejects empty query (400)', test_assistantEmptyQuery],
    ['assistant chat returns structured response (200)', test_assistantChatStructured],
    ['assistant chat multi-commodity overview blocks (KEY_VALUE, no fabrication)', test_assistantChatOverviewBlocks],
    ['market table real rows + honest empty (BANANA>0, CORN=0)', test_marketTableRealData],
  ];

  try {
    // Hermetic section runs first (no server dependency)
    for (const [name, fn] of tests.slice(0, 6)) {
      try { await fn(); pass++; } catch (e) { fail++; console.error(`❌ ${name}: ${e.message}`); }
    }
    // Live section
    await registerVerified();
    for (const [name, fn] of tests.slice(6)) {
      try { await fn(); pass++; } catch (e) { fail++; console.error(`❌ ${name}: ${e.message}`); }
    }
  } catch (e) {
    fail++;
    console.error(`❌ Setup error: ${e.message}`);
  } finally {
    if (userId) {
      try { await (await import('../db')).query('DELETE FROM users WHERE id = $1', [userId]); } catch (e) { /* cleanup best-effort */ }
    }
  }
  console.log(`\nAssistant & market structured tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
  console.log('All assistant & market structured tests passed ✅');
  process.exit(0);
})();