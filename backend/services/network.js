// Bounded fetch helper: every outbound HTTP call must fail fast rather than
// hang the request chain (Groq, satellite/CDSE, Open-Meteo weather + geocoding).
// On timeout/abort the caller receives the same error it would on a provider
// outage — routes already fall back honestly (no fabricated data ever).

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * fetch with AbortController timeout. signature-compatible with global fetch:
 *   fetchWithTimeout(url, { method, headers, body }, timeoutMs)
 * Rejects with an Error('... timed out') when the deadline passes.
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const timeout = timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...(options || {}), signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      const e = new Error(`Request to ${url} timed out after ${timeout}ms`);
      e.code = 'ECONNABORTED';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchWithTimeout, DEFAULT_TIMEOUT_MS };