const fs = require('fs');
const path = require('path');
const { query } = require('../db');

class HistoricalDataProvider {
  constructor() {
    this.name = 'historical';
    this.dataPath = process.env.HISTORICAL_DATA_PATH;
    this.apiBase = 'https://api.agmarknet.gov.in/v1';
  }

  isConfigured() {
    if (!this.dataPath || this.dataPath.trim() === '') return false;
    try {
      return fs.existsSync(path.resolve(this.dataPath));
    } catch {
      return false;
    }
  }

  // Public async method - must be called with await
  async importData() {
    // Try CSV import first if dataPath is configured
    if (this.dataPath && this.dataPath.trim() !== '') {
      return this._importFromCSV();
    }

    // If HISTORICAL_DATA_PATH is not set, try API-based import
    if (!this.dataPath) {
      return this._importFromAPI();
    }

    return { success: false, error: 'Historical dataset path not found', records: 0 };
  }

  // CSV import - async
  async _importFromCSV() {
    const filePath = path.resolve(this.dataPath);
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.csv') {
      return this._importCSVFile(filePath);
    } else if (ext === '.json') {
      return this._importJSONFile(filePath);
    } else {
      return { success: false, error: `Unsupported file format: ${ext}. Use .csv or .json`, records: 0 };
    }
  }

  // CSV file import
  async _importCSVFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length < 2) return { success: false, error: 'Empty CSV', records: 0 };

    const headers = lines[0].split(',').map(h => h.trim());
    let inserted = 0;
    let skipped = 0;

    // Process rows sequentially with promise-based inserts
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
      const record = {};

      headers.forEach((header, index) => {
        record[header] = values[index] || null;
      });

      try {
        const arrivalDate = this._parseCSVDate(record.arrival_date || record.Arrival_Date || '');
        await query(
          `INSERT INTO historical_market_prices (state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, source, fetched_at, data_period, source_record_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'agmarknet_historical',NOW(),'agmarknet_2008_2022',$11)`,
          [record.state || '', record.district || '', record.market || '', 
            (record.commodity || '').toUpperCase(), 
            record.variety || null, 
            record.grade || null,
            arrivalDate,
            parseFloat(record.min_price || 0),
            parseFloat(record.max_price || 0),
            parseFloat(record.modal_price || 0)]
        );
        inserted++;
      } catch (err) {
        skipped++;
      }
    }

    return { success: inserted > 0, inserted, skipped, total: lines.length - 1 };
  }

  // JSON file import
  async _importJSONFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const records = JSON.parse(raw);
    let inserted = 0;

    for (const r of records) {
      try {
        const arrivalDate = this._parseDate(r.arrival_date || r.Arrival_Date || '');
        await query(
          `INSERT INTO historical_market_prices (state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, source, fetched_at, data_period, source_record_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'agmarknet_historical',NOW(),'agmarknet_2008_2022',$11)`,
          [r.state || '', r.district || '', r.market || '', 
            (r.commodity || '').toUpperCase(), 
            r.variety || null, 
            r.grade || null,
            arrivalDate,
            parseFloat(r.min_price || 0),
            parseFloat(r.max_price || 0),
            parseFloat(r.modal_price || 0)]
        );
        inserted++;
      } catch (err) {
        // skip
      }
    }

    return { success: inserted > 0, inserted, total: records.length };
  }

  _parseCSVDate(dateStr) {
    if (!dateStr) return new Date();
    // Try YYYY-MM-DD
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return new Date(dateStr);
    }
    // Try DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(m) && !isNaN(y)) {
        return new Date(y, m - 1, day);
      }
    }
    // Try MM/DD/YYYY
    const parts2 = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (parts2) {
      return new Date(parseInt(parts2[3], 10), parseInt(parts2[1], 10) - 1, parseInt(parts2[2], 10));
    }
    return new Date(dateStr);
  }

  // API-based import
  async _importFromAPI() {
    const yearStart = parseInt(process.env.YEAR_START) || 2008;
    const yearEnd = parseInt(process.env.YEAR_END) || 2022;

    let totalDownloaded = 0;
    let totalParsed = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalDuplicates = 0;
    let totalInvalid = 0;
    const stateCounts = {};
    const commodityCounts = {};
    const yearCounts = {};

    for (let year = yearStart; year <= yearEnd; year++) {
      for (let month = 1; month <= 12; month++) {
        try {
          const result = await this._fetchMonthlyData(year, month);
          if (result.success && result.records && result.records.length > 0) {
            const storeResult = await this._storeMonthlyRecords(result.records, year, month);
            totalDownloaded += result.records.length;
            totalParsed += result.records.length;
            totalInserted += storeResult.inserted;
            totalSkipped += storeResult.skipped;
            totalDuplicates += storeResult.duplicates;

            for (const r of result.records) {
              const state = r.state || 'UNKNOWN';
              stateCounts[state] = (stateCounts[state] || 0) + 1;
              const commodity = r.commodity || 'UNKNOWN';
              commodityCounts[commodity] = (commodityCounts[commodity] || 0) + 1;
              yearCounts[year] = (yearCounts[year] || 0) + 1;
            }
          }
        } catch (err) {
          totalInvalid++;
        }
      }
    }

    return {
      success: totalInserted > 0,
      totalDownloaded,
      totalParsed,
      totalInserted,
      totalSkipped,
      totalDuplicates,
      totalInvalid,
      stateCounts,
      commodityCounts,
      yearCounts,
    };
  }

  async _fetchMonthlyData(year, month) {
    const statesResult = await this._getStates();
    const commoditiesResult = await this._getCommodities();

    if (!statesResult.success || !commoditiesResult.success) {
      return { success: false, error: 'Failed to fetch states/commodities', records: [] };
    }

    const states = statesResult.states || [];
    const commodities = commoditiesResult.commodities || [];

    const records = [];
    const statesToProcess = states.slice(0, 2);
    const commoditiesToProcess = commodities.slice(0, 3);

    for (const state of statesToProcess) {
      for (const commodity of commoditiesToProcess) {
        try {
          const result = await this._fetchPricesForCommodity(state, commodity, year, month);
          if (result.success && result.records && result.records.length > 0) {
            records.push(...result.records);
          }
        } catch (err) {
          // Skip on error
        }
      }
    }

    return { success: records.length > 0, records, count: records.length };
  }

  async _getStates() {
    const url = `${this.apiBase}/location/state?page=1`;
    return this._httpGet(url);
  }

  async _getCommodities() {
    const url = `${this.apiBase}/commodities?page_size=500`;
    return this._httpGet(url);
  }

  async _fetchPricesForCommodity(stateId, commodityId, year, month) {
    const url = `${this.apiBase}/prices-and-arrivals/date-wise/specific-commodity?year=${year}&month=${month}&stateId=${stateId}&commodityId=${commodityId}`;
    const result = await this._httpGet(url);

    if (!result.success || !result.records || result.records.length === 0) {
      return { success: false, error: 'No records', records: [] };
    }

    const normalized = result.records.map(r => this._normalizeRecord(r));
    return { success: true, records: normalized };
  }

  _normalizeRecord(raw) {
    const arrivalDate = this._parseDate(raw.arrival_date || raw.Arrival_Date || '');
    return {
      state: raw.state || raw.State || '',
      district: raw.district || raw.District || '',
      market: raw.market || raw.Market || raw.APMC || '',
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
    if (!dateStr) return new Date();
    if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) {
      return new Date(dateStr);
    }
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(m) && !isNaN(y)) {
        return new Date(y, month - 1, day);
      }
    }
    return new Date(dateStr);
  }

  async _storeMonthlyRecords(records, year, month) {
    let inserted = 0;
    let skipped = 0;
    let duplicates = 0;

    for (const r of records) {
      try {
        const existing = await query(
          `SELECT id FROM historical_market_prices WHERE state = $1 AND district = $2 AND market = $3 AND commodity = $4 AND arrival_date = $5`,
          [r.state, r.district, r.market, r.commodity, r.arrivalDate]
        );

        if (existing.rows.length > 0) {
          duplicates++;
          skipped++;
          continue;
        }

        await query(
          `INSERT INTO historical_market_prices (state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, source, fetched_at, data_period, source_record_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'agmarknet_historical',NOW(),'agmarknet_2008_2022',$11)`,
          [r.state, r.district, r.market, r.commodity, r.variety, r.grade, r.arrivalDate, r.minPrice, r.maxPrice, r.modalPrice, null]
        );
        inserted++;
      } catch (err) {
        skipped++;
      }
    }

    return { inserted, skipped, duplicates };
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
            resolve({ success: false, error: 'Invalid JSON', records: [] });
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('API timeout')); });
    });
  }
}

module.exports = new HistoricalDataProvider();