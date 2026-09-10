const DEFAULT_BASE_URL = 'https://api.ceda.ashoka.edu.in/v1';
const REQUEST_TIMEOUT_MS = parseInt(process.env.CEDA_TIMEOUT_MS || '30000', 10);
const MAX_RETRIES = parseInt(process.env.CEDA_MAX_RETRIES || '2', 10);
const RETRY_DELAY_MS = parseInt(process.env.CEDA_RETRY_DELAY_MS || '1000', 10);

// Optional in-memory cache for reference lists (commodities / geographies).
const CACHE = new Map();
const CACHE_TTL_MS = parseInt(process.env.CEDA_CACHE_TTL_MS || '300000', 10);
const REFERENCE_CACHE_KEYS = ['commodities', 'geographies'];

function baseUrl() {
  return process.env.CEDA_API_BASE_URL || DEFAULT_BASE_URL;
}

function apiKey() {
  return process.env.CEDA_API_KEY;
}

function validateCredentials() {
  if (!apiKey()) {
    throw new Error('CEDA API not configured: CEDA_API_KEY missing');
  }
}

// AbortController-based timeout so long-hanging responses fail fast.
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Parse the CEDA response envelope. All CEDA responses wrap success data as
// { output: { type, message, data } }. Errors may appear as { error },
// { type: "error", message }, or { status: "failure", message } (rate limit).
function parseEnvelope(raw) {
  const out = raw && raw.output;
  if (out && out.type === 'success') {
    return { success: true, data: Array.isArray(out.data) ? out.data : [], message: out.message || '' };
  }
  if (out && out.type === 'error') {
    return { success: false, data: [], message: out.message || 'CEDA request failed', raw };
  }
  if (raw && typeof raw.error === 'string') {
    return { success: false, data: [], message: raw.error, raw };
  }
  if (raw && raw.status === 'failure') {
    return { success: false, data: [], message: raw.message || 'CEDA request failed', raw };
  }
  return { success: false, data: [], message: 'Unexpected CEDA response', raw };
}

async function request(method, path, body) {
  validateCredentials();

  const url = `${baseUrl()}${path}`;
  const headers = {
    Authorization: `Bearer ${apiKey()}`,
    Accept: 'application/json',
  };
  const options = { method, headers };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
    }
    try {
      const res = await fetchWithTimeout(url, options);

      // Never log the API key.
      console.log(`[cedaApi] ${method} ${path} -> ${res.status} (try ${attempt + 1}/${MAX_RETRIES + 1})`);

      if (res.status === 401 || res.status === 403) {
        throw new Error('CEDA authentication failed — please check CEDA_API_KEY');
      }
      if (res.status === 429) {
        throw new Error('CEDA rate limit reached — please try again shortly');
      }

      const text = await res.text().catch(() => '');
      let raw;
      try {
        raw = text ? JSON.parse(text) : {};
      } catch {
        raw = {};
      }

      const parsed = parseEnvelope(raw);
      if (!parsed.success) {
        // Rate-limit style failure bodies should use the retry path.
        if (parsed.message && /too many requests/i.test(parsed.message)) {
          throw new Error('CEDA rate limit reached — please try again shortly');
        }
        throw new Error(parsed.message || `CEDA request failed (${res.status})`);
      }

      return parsed.data;
    } catch (err) {
      lastError = err;
      const finalTry = attempt === MAX_RETRIES;
      console.error(`[cedaApi] ${method} ${path} error (try ${attempt + 1}): ${err.message}`);
      // Do not retry auth failures or 4xx validation errors.
      if (!finalTry && !isRetryable(err)) break;
    }
  }
  throw lastError || new Error('CEDA request failed');
}

function isRetryable(err) {
  const m = (err && err.message) || '';
  // Retry rate limits and transient network errors, not auth/config errors.
  if (/rate limit|too many requests/i.test(m)) return true;
  if (/fetch failed|abort|ECONNRESET|ENOTFOUND|timeout/i.test(m)) return true;
  return false;
}

async function getCached(key, loader) {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return hit.data;
  }
  const data = await loader();
  CACHE.set(key, { data, ts: Date.now() });
  return data;
}

async function getCommodities() {
  return getCached('commodities', () => request('GET', '/agmarknet/commodities'));
}

async function getGeographies() {
  return getCached('geographies', () => request('GET', '/agmarknet/geographies'));
}

// POST /agmarknet/prices
// body: { commodity_id, state_id, from_date, to_date }
// returns [{ date, commodity_id, census_state_id, min_price, max_price, modal_price }]
async function getPrices({ commodityId, stateId, fromDate, toDate }) {
  return request('POST', '/agmarknet/prices', {
    commodity_id: Number(commodityId),
    state_id: Number(stateId),
    from_date: fromDate,
    to_date: toDate,
  });
}

// POST /agmarknet/quantities
// returns [{ date, commodity_id, census_state_id, quantity }]
async function getQuantities({ commodityId, stateId, fromDate, toDate }) {
  return request('POST', '/agmarknet/quantities', {
    commodity_id: Number(commodityId),
    state_id: Number(stateId),
    from_date: fromDate,
    to_date: toDate,
  });
}

// POST /agmarknet/markets
// Requires an `indicator` ("price" | "quantity") plus commodity/state/date.
async function getMarkets({ indicator, commodityId, stateId, fromDate, toDate }) {
  if (!indicator || (indicator !== 'price' && indicator !== 'quantity')) {
    throw new Error('CEDA markets requires indicator "price" or "quantity"');
  }
  const body = { indicator };
  if (commodityId !== undefined && commodityId !== null) body.commodity_id = Number(commodityId);
  if (stateId !== undefined && stateId !== null) body.state_id = Number(stateId);
  if (fromDate) body.from_date = fromDate;
  if (toDate) body.to_date = toDate;
  return request('POST', '/agmarknet/markets', body);
}

module.exports = {
  getCommodities,
  getGeographies,
  getPrices,
  getQuantities,
  getMarkets,
  _internal: {
    parseEnvelope,
    request,
    _clearCache() {
      CACHE.clear();
    },
    _setCache(key, data) {
      CACHE.set(key, { data, ts: Date.now() });
    },
    _getCache(key) {
      const hit = CACHE.get(key);
      return hit ? hit.data : undefined;
    },
  },
};
