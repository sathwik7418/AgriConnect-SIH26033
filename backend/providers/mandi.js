const https = require('https');
const http = require('http');
const { query } = require('../db');

// CEDA is NEVER a current-price source. Any attempt to write CEDA data into the
// current prices table is rejected at the provider boundary (hard guard).
const CEDA_MARKERS = ['ceda', 'historical'];

class MandiProvider {
  constructor() {
    this.name = 'mandi';
    this.apiKey = process.env.MANDI_API_KEY;
    this.apiUrl = process.env.MANDI_API_URL || 'https://api.data.gov.in';
    this.resourceId = process.env.MANDI_RESOURCE_ID;
    this.format = process.env.MANDI_API_FORMAT || 'json';
  }

  isConfigured() {
    return !!(this.apiKey && this.resourceId && this.apiUrl);
  }

  async fetchPrices(filters = {}) {
    if (!this.isConfigured()) {
      return { success: false, error: 'Mandi API not configured', records: [], source: 'unavailable' };
    }

    const allRecords = [];
    const pageLimit = Math.min(filters.limit || 5000, 5000);
    let offset = 0;
    const maxPages = 10; // Safety cap: 10 pages × 5000 = 50K records max

    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({
        'api-key': this.apiKey,
        format: this.format,
        ...(filters.state && { 'filters[state]': filters.state }),
        ...(filters.commodity && { 'filters[commodity]': filters.commodity.toUpperCase() }),
        ...(filters.district && { 'filters[district]': filters.district }),
        limit: pageLimit,
        offset: offset,
      });

      const url = `${this.apiUrl}/resource/${this.resourceId}?${params.toString()}`;

      try {
        const data = await this._httpGet(url);
        if (data.error) {
          if (page === 0) return { success: false, error: data.error, records: [], source: 'mandi_api' };
          break;
        }
        const pageRecords = (data.records || []).map(r => this._normalizeRecord(r));
        allRecords.push(...pageRecords);

        // If fewer records than limit, we've fetched all available data
        if (pageRecords.length < pageLimit) break;
        offset += pageLimit;
      } catch (error) {
        if (page === 0) {
          console.error('Mandi API error:', error.message);
          return { success: false, error: error.message, records: [], source: 'mandi_api' };
        }
        break;
      }
    }

    return { success: allRecords.length > 0, records: allRecords, source: 'mandi_api', fetchedAt: new Date() };
  }

  _normalizeRecord(raw) {
    const arrivalDate = this._parseDate(raw.arrival_date || raw.Arrival_Date || '');
    return {
      state: raw.state || raw.State || '',
      district: raw.district || raw.District || '',
      market: raw.market || raw.Market || '',
      commodity: (raw.commodity || raw.Commodity || '').toUpperCase(),
      variety: raw.variety || raw.Variety || null,
      grade: raw.grade || raw.Grade || null,
      arrivalDate,
      minPrice: parseFloat(raw.min_price || raw.Min_Price || raw.min || 0),
      maxPrice: parseFloat(raw.max_price || raw.Max_Price || raw.max || 0),
      modalPrice: parseFloat(raw.modal_price || raw.Modal_Price || raw.modal || 0),
    };
  }

  _parseDate(dateStr) {
    if (!dateStr) return new Date().toISOString();
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  _guardNotCeda(source, context) {
    if (!source) return;
    const s = String(source).toLowerCase();
    if (CEDA_MARKERS.includes(s)) {
      const msg = `[CEDA_HARD_GUARD] Blocked attempt to write CEDA data as current price. source="${source}" context="${context}"`;
      console.error(msg);
      throw new Error(msg);
    }
  }

  async storeRecords(records, syncId) {
    let stored = 0;
    let skipped = 0;

    for (const r of records) {
      // CEDA hard guard: never allow CEDA/historical rows to enter current prices.
      this._guardNotCeda('mandi_api', `${r.commodity || ''}/${r.market || ''}`);
      try {
        await query(
          `INSERT INTO market_prices (state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, source, fetched_at, data_freshness, source_record_id, sync_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'mandi_api',NOW(),'fresh',$11,$12)
           ON CONFLICT (state, district, market, commodity, arrival_date) DO UPDATE SET
             min_price = EXCLUDED.min_price,
             max_price = EXCLUDED.max_price,
             modal_price = EXCLUDED.modal_price,
             variety = COALESCE(EXCLUDED.variety, market_prices.variety),
             fetched_at = NOW(),
             data_freshness = 'fresh'`,
          [r.state, r.district, r.market, r.commodity, r.variety, r.grade, r.arrivalDate, r.minPrice, r.maxPrice, r.modalPrice, null, syncId]
        );
        stored++;
      } catch (err) {
        // CEDA guard failures must never be silently swallowed.
        if (String(err.message || '').includes('CEDA_HARD_GUARD')) throw err;
        skipped++;
        if (skipped <= 3) console.warn('Store record error:', err.message);
      }
    }

    return { stored, skipped, total: records.length };
  }

  _httpGet(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, { timeout: 15000 }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid JSON from Mandi API'));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Mandi API timeout')); });
    });
  }
}

module.exports = new MandiProvider();