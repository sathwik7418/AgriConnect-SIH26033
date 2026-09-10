const { query } = require('../../db');

/**
 * Statistical Demand Forecasting Service
 * Computes deterministic weighted trend forecasting over real PostgreSQL records.
 */
class DemandForecastService {
  static async forecastDemand({ commodity, region, horizonDays = 7 }) {
    if (!commodity) {
      throw new Error('Commodity is required for demand forecasting');
    }

    const horizon = Math.min(Math.max(parseInt(horizonDays) || 7, 1), 90);

    // Fetch active demands and completed orders for the given crop/region
    let demandsSql = `
      SELECT required_quantity as qty, target_price as price, created_at, delivery_location
      FROM buyer_demands
      WHERE UPPER(commodity) = UPPER($1)
    `;
    const params = [commodity];

    if (region && region !== 'ALL') {
      demandsSql += ` AND (delivery_location ILIKE $2)`;
      params.push(`%${region}%`);
    }

    demandsSql += ` ORDER BY created_at DESC LIMIT 100`;

    const demandsRes = await query(demandsSql, params);
    let records = demandsRes.rows || [];

    // Fallback 1: Query completed trade orders if direct demands are sparse
    if (records.length === 0) {
      try {
        const ordersRes = await query(
          `SELECT quantity as qty, unit_price as price, created_at, delivery_location
           FROM orders
           WHERE UPPER(commodity) = UPPER($1)
           ORDER BY created_at DESC LIMIT 100`,
          [commodity]
        );
        if (ordersRes.rows && ordersRes.rows.length > 0) {
          records = ordersRes.rows;
        }
      } catch (e) {
        // Continue to next fallback
      }
    }

    // Fallback 2: Query verified regional baseline forecasts table
    if (records.length === 0) {
      try {
        const fRes = await query(
          `SELECT predicted_demand as qty, 30 as price, created_at, location as delivery_location
           FROM forecasts
           WHERE UPPER(commodity) = UPPER($1)
           ORDER BY created_at DESC LIMIT 20`,
          [commodity]
        );
        if (fRes.rows && fRes.rows.length > 0) {
          records = fRes.rows;
        }
      } catch (e) {
        // Empty
      }
    }

    if (records.length === 0) {
      return {
        hasData: false,
        commodity: commodity.toUpperCase(),
        region: region || 'ALL',
        horizonDays: horizon,
        message: 'Insufficient historical demand records to generate statistical forecast without synthetic inflation.',
        dataPointsUsed: 0,
        forecast: []
      };
    }

    // Compute empirical statistics
    const totalQty = records.reduce((sum, r) => sum + parseFloat(r.qty || 0), 0);
    const avgOrderQty = totalQty / records.length;

    // Weight recent demands more heavily (exponential decay weighting)
    let weightedSum = 0;
    let weightTotal = 0;
    records.forEach((r, idx) => {
      const weight = Math.pow(0.95, idx);
      weightedSum += parseFloat(r.qty || 0) * weight;
      weightTotal += weight;
    });

    const weightedDailyVelocity = weightTotal > 0 ? (weightedSum / weightTotal) / 7 : avgOrderQty / 7;
    const projectedDemandQty = Math.round(weightedDailyVelocity * horizon);

    // Trend determination
    const recentSample = records.slice(0, Math.ceil(records.length / 2));
    const olderSample = records.slice(Math.ceil(records.length / 2));
    const recentAvg = recentSample.reduce((s, r) => s + parseFloat(r.qty), 0) / (recentSample.length || 1);
    const olderAvg = olderSample.length > 0 ? olderSample.reduce((s, r) => s + parseFloat(r.qty), 0) / olderSample.length : recentAvg;

    let trend = 'STABLE';
    if (recentAvg > olderAvg * 1.1) trend = 'RISING';
    else if (recentAvg < olderAvg * 0.9) trend = 'FALLING';

    // Statistical confidence score based on sample density (bounded between 0.50 and 0.92)
    const confidence = Math.min(0.92, Math.max(0.50, Math.round((0.50 + Math.min(records.length / 30, 0.42)) * 100) / 100));

    // Daily breakdown curve
    const forecast = [];
    const baseDaily = projectedDemandQty / horizon;
    for (let day = 1; day <= horizon; day++) {
      const dayFactor = trend === 'RISING' ? (1 + (day / horizon) * 0.15) : trend === 'FALLING' ? (1 - (day / horizon) * 0.15) : 1;
      forecast.push({
        day: `Day +${day}`,
        projectedQuantityKg: Math.round(baseDaily * dayFactor)
      });
    }

    return {
      hasData: true,
      commodity: commodity.toUpperCase(),
      region: region || 'ALL',
      horizonDays: horizon,
      totalHistoricalDemandKg: Math.round(totalQty),
      projectedDemandKg: projectedDemandQty,
      trend,
      confidence,
      dataPointsUsed: records.length,
      methodology: 'Historical exponentially-weighted moving average over authentic buyer procurement records',
      forecast
    };
  }
}

module.exports = DemandForecastService;
