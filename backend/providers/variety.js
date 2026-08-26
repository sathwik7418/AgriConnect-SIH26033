const https = require('https');
const http = require('http');

class VarietyProvider {
  constructor() {
    this.name = 'variety';
    this.apiKey = process.env.VARIETY_API_KEY;
    this.apiUrl = process.env.VARIETY_API_URL || 'https://api.data.gov.in';
    this.resourceId = process.env.VARIETY_RESOURCE_ID;
  }

  isConfigured() {
    return !!(this.apiKey && this.resourceId && this.apiUrl);
  }

  async fetchVarietyPrices(filters = {}) {
    if (!this.isConfigured()) {
      return { success: false, error: 'Variety API not configured', records: [], source: 'unavailable' };
    }

    const params = new URLSearchParams({
      'api-key': this.apiKey,
      format: 'json',
      ...(filters.state && { 'filters[State]': filters.state }),
      ...(filters.commodity && { 'filters[Commodity]': filters.commodity.toUpperCase() }),
      ...(filters.district && { 'filters[District]': filters.district }),
      ...(filters.variety && { 'filters[Variety]': filters.variety }),
      limit: filters.limit || 500,
    });

    const url = `${this.apiUrl}/resource/${this.resourceId}?${params.toString()}`;

    try {
      const data = await this._httpGet(url);
      if (data.error) {
        return { success: false, error: data.error, records: [], source: 'variety_api' };
      }
      const records = (data.records || []).map(r => this._normalizeRecord(r));
      return { success: true, records, source: 'variety_api', fetchedAt: new Date() };
    } catch (error) {
      console.error('Variety API error:', error.message);
      return { success: false, error: error.message, records: [], source: 'variety_api' };
    }
  }

  _normalizeRecord(raw) {
    const arrivalDate = this._parseDate(raw.Arrival_Date || raw.arrival_date || '');
    return {
      state: raw.State || '',
      district: raw.District || '',
      market: raw.Market || '',
      commodity: (raw.Commodity || '').toUpperCase(),
      variety: raw.Variety || null,
      grade: raw.Grade || null,
      arrivalDate,
      minPrice: parseFloat(raw.Min_Price || 0),
      maxPrice: parseFloat(raw.Max_Price || 0),
      modalPrice: parseFloat(raw.Modal_Price || 0),
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

  _httpGet(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, { timeout: 15000 }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Invalid JSON from Variety API')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Variety API timeout')); });
    });
  }
}

module.exports = new VarietyProvider();