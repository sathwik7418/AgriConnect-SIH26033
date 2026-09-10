const { query } = require('../../db');

/**
 * Statistical Price Forecasting Service
 * Derives statistical price trends and volatility-bounded predictive ranges from authentic Mandi records.
 */
class PriceForecastService {
  static async forecastPrice({ commodity, state, district, horizonDays = 7 }) {
    if (!commodity) {
      throw new Error('Commodity is required for price forecasting');
    }

    const horizon = Math.min(Math.max(parseInt(horizonDays) || 7, 1), 30);

    // Query historical Mandi prices (price_per_kg is normalized ₹/kg at ingest time)
    let historySql = `
      SELECT price_per_kg as price, arrival_date as price_date, market, district, state
      FROM historical_market_prices
      WHERE UPPER(commodity) = UPPER($1) AND price_per_kg IS NOT NULL AND price_per_kg > 0
    `;
    const params = [commodity];

    if (state && state !== 'ALL') {
      historySql += ` AND (state ILIKE $2)`;
      params.push(`%${state}%`);
      if (district && district !== 'ALL') {
        historySql += ` AND (district ILIKE $3)`;
        params.push(`%${district}%`);
      }
    }

    historySql += ` ORDER BY arrival_date ASC LIMIT 120`;

    const histRes = await query(historySql, params);
    let records = histRes.rows || [];

    // Phase 11: Fill the 2021→2026 gap with AgriConnect's own daily history.
    // app_daily_market_history is append-only and grows from our syncs.
    let dailyHistorySql = `
      SELECT price_per_kg as price, price_date as price_date, market, district, state
      FROM app_daily_market_history
      WHERE UPPER(commodity) = UPPER($1) AND price_per_kg IS NOT NULL AND price_per_kg > 0
    `;
    const dailyHistoryParams = [commodity];
    if (state && state !== 'ALL') {
      dailyHistorySql += ` AND (state ILIKE $2)`;
      dailyHistoryParams.push(`%${state}%`);
      if (district && district !== 'ALL') {
        dailyHistorySql += ` AND (district ILIKE $3)`;
        dailyHistoryParams.push(`%${district}%`);
      }
    }
    dailyHistorySql += ` ORDER BY price_date ASC LIMIT 120`;

    const dailyRes = await query(dailyHistorySql, dailyHistoryParams);
    const dailyRows = dailyRes.rows || [];

    // Merge daily history (newer period) with historical dataset (older period),
    // de-duplicating by price_date so the union is meaningful.
    if (dailyRows.length > 0) {
      const seenDates = new Set(records.map(r => new Date(r.price_date).toISOString().slice(0, 10)));
      const merged = [
        ...records,
        ...dailyRows.filter(r => {
          const key = new Date(r.price_date).toISOString().slice(0, 10);
          if (seenDates.has(key)) return false;
          seenDates.add(key);
          return true;
        })
      ].sort((a, b) => new Date(a.price_date) - new Date(b.price_date)).slice(-120);
      records = merged;
    }

    // Fallback: Also query market_prices table if historical records are few
    if (records.length < 2) {
      let mpSql = `
        SELECT price_per_kg as price, arrival_date as price_date, market, district, state
        FROM market_prices
        WHERE UPPER(commodity) = UPPER($1) AND price_per_kg IS NOT NULL AND price_per_kg > 0
      `;
      const mpParams = [commodity];
      if (state && state !== 'ALL') {
        mpSql += ` AND (state ILIKE $2)`;
        mpParams.push(`%${state}%`);
      }
      mpSql += ` ORDER BY arrival_date ASC LIMIT 120`;
      const mpRes = await query(mpSql, mpParams);
      if (mpRes.rows.length > 0) {
        records = records.concat(mpRes.rows);
      }
    }

    if (records.length < 2) {
      return {
        hasData: false,
        commodity: commodity.toUpperCase(),
        state: state || 'ALL',
        district: district || 'ALL',
        horizonDays: horizon,
        message: 'Insufficient historical Mandi price series to generate forecast without artificial fabrication.',
        dataPointsUsed: records.length,
        confidenceLabel: 'LOW',
        dataGaps: [],
        predictedRange: null,
        methodology: 'Linear slope regression bounded by standard price variance over authentic Mandi historical records'
      };
    }

    const prices = records.map(r => parseFloat(r.price));
    const currentPrice = prices[prices.length - 1];
    const meanPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    // Calculate sample variance and standard deviation
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - meanPrice, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);

    // Linear trend slope calculation
    const n = prices.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += prices[i];
      sumXY += i * prices[i];
      sumXX += i * i;
    }
    const slope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) : 0;
    const projectedChange = slope * (horizon / 2);

    const projectedBase = currentPrice + projectedChange;
    const volatilityMargin = Math.max(stdDev * 0.75, currentPrice * 0.04);

    const minPrice = Math.max(1, Math.round((projectedBase - volatilityMargin) * 10) / 10);
    const maxPrice = Math.round((projectedBase + volatilityMargin) * 10) / 10;

    let trend = 'STABLE';
    if (slope > 0.15) trend = 'RISING';
    else if (slope < -0.15) trend = 'FALLING';

    const confidence = Math.min(0.90, Math.max(0.55, Math.round((0.55 + Math.min(records.length / 40, 0.35)) * 100) / 100));

    // Confidence label based on data coverage (honest about gaps).
    // HIGH: ≥ 52 weeks of contiguous weeks, MEDIUM: 12–51, LOW: < 12 or gap > 30d.
    let confidenceLabel = 'HIGH';
    let dataGaps = [];
    const sortedDates = records
      .map(r => new Date(r.price_date).getTime())
      .filter(Boolean)
      .sort((a, b) => a - b);
    if (sortedDates.length > 1) {
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      for (let i = 1; i < sortedDates.length; i++) {
        const gapDays = (sortedDates[i] - sortedDates[i - 1]) / (24 * 60 * 60 * 1000);
        if (gapDays > 30) {
          dataGaps.push({
            from: new Date(sortedDates[i - 1]).toISOString().slice(0, 10),
            to: new Date(sortedDates[i]).toISOString().slice(0, 10),
            days: Math.round(gapDays)
          });
        }
      }
      const spanWeeks = (sortedDates[sortedDates.length - 1] - sortedDates[0]) / weekMs;
      const coverageWeeks = sortedDates.length * (7 / 52); // rows are daily-ish
      if (dataGaps.length > 0 || spanWeeks < 12) confidenceLabel = 'LOW';
      else if (spanWeeks < 52) confidenceLabel = 'MEDIUM';
    } else {
      confidenceLabel = 'LOW';
    }

    return {
      hasData: true,
      commodity: commodity.toUpperCase(),
      state: state || 'ALL',
      district: district || 'ALL',
      horizonDays: horizon,
      currentModalPrice: currentPrice,
      historicalAveragePrice: Math.round(meanPrice * 10) / 10,
      predictedRange: {
        min: minPrice,
        max: maxPrice,
        unit: '₹/kg'
      },
      trendDirection: trend,
      confidence,
      confidenceLabel,
      dataGaps: dataGaps.slice(0, 5),
      dataPointsUsed: records.length,
      methodology: 'Linear slope regression bounded by standard price variance over authentic Mandi historical records'
    };
  }
}

module.exports = PriceForecastService;
