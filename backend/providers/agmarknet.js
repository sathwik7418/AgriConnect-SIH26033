const https = require('https');
const http = require('http');

class AGMARKNETProvider {
  constructor() {
    this.name = 'agmarknet';
    this.baseUrl = 'https://api.agmarknet.gov.in/v1';
  }

  isConfigured() {
    // AGMARKNET API does not require API key - it's a public government API
    return true;
  }

  async getStates(page = 1, pageSize = 100) {
    const url = `${this.baseUrl}/location/state?page=${page}&page_size=${pageSize}`;
    try {
      const data = await this._httpGet(url);
      if (data.error) return { success: false, error: data.error, states: [] };
      return { success: true, states: data.states || data.data || [], count: data.count || data.pagination?.total_states || 0 };
    } catch (error) {
      return { success: false, error: error.message, states: [] };
    }
  }

  async getCommodities(pageSize = 500) {
    const url = `${this.baseUrl}/commodities?page_size=${pageSize}`;
    try {
      const data = await this._httpGet(url);
      if (data.error) return { success: false, error: data.error, commodities: [] };
      return { success: true, commodities: data.commodities || data.data || [], count: data.count || 0 };
    } catch (error) {
      return { success: false, error: error.message, commodities: [] };
    }
  }

  async getPricesByDate(year, month, stateId, commodityId) {
    const url = `${this.baseUrl}/prices-and-arrivals/date-wise/specific-commodity?year=${year}&month=${month}&stateId=${stateId}&commodityId=${commodityId}`;
    try {
      const data = await this._httpGet(url);
      if (!data || data.error) return { success: false, error: (data && data.error) || 'API error', records: [] };
      // Flatten AGMARKNET nested shape: markets[] -> dates[] -> data[] (per-variety price rows)
      const records = [];
      for (const market of data.markets || []) {
        for (const dateEntry of market.dates || []) {
          for (const row of dateEntry.data || []) {
            records.push({
              state: null,
              district: market.district || '',
              market: market.marketName || '',
              variety: row.variety || null,
              arrival_date: dateEntry.arrivalDate,
              min_price: row.minimumPrice ?? row.min_price ?? 0,
              max_price: row.maximumPrice ?? row.max_price ?? 0,
              modal_price: row.modalPrice ?? row.modal_price ?? 0,
            });
          }
        }
      }
      if (records.length === 0 && (data.records || data.data)) {
        return { success: true, records: data.records || data.data, count: (data.records || data.data).length };
      }
      return { success: true, records, count: records.length };
    } catch (error) {
      return { success: false, error: error.message, records: [] };
    }
  }

  async fetchHistoricalData(filters = {}) {
    const { year, month, stateId, commodityId } = filters;

    if (!year || !month || !stateId || !commodityId) {
      return { success: false, error: 'Missing required parameters: year, month, stateId, commodityId', records: [] };
    }

    const result = await this.getPricesByDate(year, month, stateId, commodityId);

    if (!result.success || !result.records || result.records.length === 0) {
      return result;
    }

    const records = result.records.map(r => this._normalizeRecord(r));
    let stored = 0;

    for (const r of records) {
      try {
        await query(
          `INSERT INTO historical_market_prices (state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, source, fetched_at, data_period, source_record_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'agmarknet_historical',NOW(),'agmarknet_2008_2022',$11)
           ON CONFLICT (state, district, market, commodity, arrival_date) DO UPDATE SET
             min_price = EXCLUDED.min_price,
             max_price = EXCLUDED.max_price,
             modal_price = EXCLUDED.modal_price`,
          [r.state, r.district, r.market, r.commodity, r.variety, r.grade, r.arrivalDate, r.minPrice, r.maxPrice, r.modalPrice, r.sourceRecordId || null]
        );
        stored++;
      } catch (err) {
        // skip duplicates silently
      }
    }

    return { success: true, records: stored, total: result.records.length, source: 'agmarknet_api' };
  }

  _normalizeRecord(raw) {
    const arrivalDate = this._parseDate(raw.arrival_date || raw.Arrival_Date || raw.Date || '');
    return {
      state: raw.state || raw.State || raw.State_Name || '',
      district: raw.district || raw.District || raw.District_Name || '',
      market: raw.market || raw.Market || raw.Market_Name || raw.APMC || '',
      commodity: (raw.commodity || raw.Commodity || raw.Commodity_Name || '').toUpperCase(),
      variety: raw.variety || raw.Variety || raw.Variety_Name || null,
      grade: raw.grade || raw.Grade || raw.Grade_Type || null,
      arrivalDate,
      minPrice: parseFloat(raw.min_price || raw.Min_Price || raw.min || raw.Min || 0),
      maxPrice: parseFloat(raw.max_price || raw.Max_Price || raw.max || raw.Max || 0),
      modalPrice: parseFloat(raw.modal_price || raw.Modal_Price || raw.modal || raw.Modal || 0),
    };
  }

  _parseDate(dateStr) {
    if (!dateStr) return new Date().toISOString();
    // Handle various date formats: YYYY-MM-DD, DD-MM-YYYY, MM-DD-YYYY, DD/MM/YYYY
    if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) {
      // YYYY-MM-DD format
      return new Date(dateStr).toISOString();
    }
    // Handle DD-MM-YYYY or MM-DD-YYYY
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      // If first part is 1-12, it might be MM-DD-YYYY, otherwise DD-MM-YYYY
      const first = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);
      if (first >= 1 && first <= 12 && second > 12) {
        // MM-DD-YYYY
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      } else {
        // DD-MM-YYYY
        return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
    }
    // Try parsing as-is
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
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid JSON from AGMARKNET API'));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('AGMARKNET API timeout')); });
    });
  }
}

module.exports = new AGMARKNETProvider();