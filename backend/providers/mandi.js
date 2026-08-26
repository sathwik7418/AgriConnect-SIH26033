const https = require('https');
const http = require('http');
const { query } = require('../db');

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

    const params = new URLSearchParams({
      'api-key': this.apiKey,
      format: this.format,
      ...(filters.state && { 'filters[state]': filters.state }),
      ...(filters.commodity && { 'filters[commodity]': filters.commodity.toUpperCase() }),
      ...(filters.district && { 'filters[district]': filters.district }),
      limit: filters.limit || 500,
    });

    const url = `${this.apiUrl}/resource/${this.resourceId}?${params.toString()}`;

    try {
      const data = await this._httpGet(url);
      if (data.error) {
        return { success: false, error: data.error, records: [], source: 'mandi_api' };
      }
      const records = (data.records || []).map(r => this._normalizeRecord(r));
      return { success: true, records, source: 'mandi_api', fetchedAt: new Date() };
    } catch (error) {
      console.error('Mandi API error:', error.message);
      return { success: false, error: error.message, records: [], source: 'mandi_api' };
    }
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

  async storeRecords(records, syncId) {
    let stored = 0;
    let skipped = 0;

    for (const r of records) {
      try {
        await query(
          `INSERT INTO market_prices (state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, source, fetched_at, data_freshness, source_record_id, sync_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'mandi_api',NOW(),'fresh',$11,$12)
           ON CONFLICT (state, district, market, commodity, arrival_date) DO UPDATE SET
             min_price = EXCLUDED.min_price,
             max_price = EXCLUDED.max_price,
             modal_price = EXCLUDED.modal_price,
             fetched_at = NOW(),
             data_freshness = 'fresh'`,
          [r.state, r.district, r.market, r.commodity, r.variety, r.grade, r.arrivalDate, r.minPrice, r.maxPrice, r.modalPrice, null, syncId]
        );
        stored++;
      } catch (err) {
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