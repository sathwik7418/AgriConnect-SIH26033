/**
 * MarketFallbackService — market data fallback with district→state→national priority
 * 
 * Implements graceful degradation for market data:
 * - District → State → National fallback chain
 * - Clear labeling of historical vs current data
 * - Honest empty states
 * - Never fabricate prices
 * 
 * Phase 3B: Fallback + Graceful Degradation
 */

const pool = require('../db');
// Use console for logging
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

class MarketFallbackService {
  /**
   * Get market prices with fallback chain
   * Priority: District → State → National
   * Returns with clear labeling of data freshness
   */
  async getPricesWithFallback(commodity, options = {}) {
    const { district, state, source, limit = 50 } = options;

    // Try district-level first
    if (district) {
      const districtPrices = await this._queryPrices(commodity, { district }, limit);
      if (districtPrices.length > 0) {
        return this._formatResponse(districtPrices, 'DISTRICT', district);
      }
    }

    // Try state-level fallback
    if (state || district) {
      const statePrices = await this._queryPrices(commodity, { state }, limit);
      if (statePrices.length > 0) {
        return this._formatResponse(statePrices, 'STATE', state || district);
      }
    }

    // Try national fallback
    const nationalPrices = await this._queryPrices(commodity, {}, limit);
    if (nationalPrices.length > 0) {
      return this._formatResponse(nationalPrices, 'NATIONAL', 'India');
    }

    // No data at any level
    return {
      success: true,
      data: null,
      status: 'NO_DATA',
      message: `No recent verified market data available for ${commodity}.`,
      commodity,
      scope: 'NONE',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get daily intelligence with fallback chain
   */
  async getDailyIntelligenceWithFallback(commodity, options = {}) {
    const { district, state, market } = options;

    // Try district-level
    if (district && district !== 'ALL') {
      const districtIntel = await this._getIntelligence(commodity, { district });
      if (districtIntel) {
        return { ...districtIntel, scope: 'DISTRICT', scopeLabel: district };
      }
    }

    // Try state-level
    if (state && state !== 'ALL') {
      const stateIntel = await this._getIntelligence(commodity, { state });
      if (stateIntel) {
        return { ...stateIntel, scope: 'STATE', scopeLabel: state };
      }
    }

    // Try national
    const nationalIntel = await this._getIntelligence(commodity, {});
    if (nationalIntel) {
      return { ...nationalIntel, scope: 'NATIONAL', scopeLabel: 'India' };
    }

    // No data
    return {
      success: true,
      data: null,
      status: 'NO_DATA',
      message: `No price intelligence available for ${commodity}. Data may not have been synced recently.`,
      commodity,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format response with data freshness labeling
   */
  _formatResponse(prices, scope, scopeLabel) {
    const now = new Date();
    const latestDate = prices[0]?.arrival_date;
    const daysSinceUpdate = latestDate
      ? Math.floor((now - new Date(latestDate)) / (1000 * 60 * 60 * 24))
      : null;

    let dataFreshness = 'CURRENT';
    if (daysSinceUpdate !== null) {
      if (daysSinceUpdate === 0) dataFreshness = 'CURRENT';
      else if (daysSinceUpdate <= 7) dataFreshness = 'RECENT';
      else if (daysSinceUpdate <= 30) dataFreshness = 'HISTORICAL';
      else dataFreshness = 'OUTDATED';
    }

    return {
      success: true,
      data: prices,
      status: 'OK',
      scope,
      scopeLabel,
      dataFreshness,
      daysSinceUpdate,
      count: prices.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Query prices from database
   */
  async _queryPrices(commodity, filters, limit) {
    let sql = 'SELECT * FROM market_prices WHERE UPPER(commodity) = UPPER($1)';
    const params = [commodity];
    let paramCount = 2;

    if (filters.district) {
      sql += ` AND district = $${paramCount++}`;
      params.push(filters.district);
    }
    if (filters.state) {
      sql += ` AND state = $${paramCount++}`;
      params.push(filters.state);
    }

    sql += ` ORDER BY fetched_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    try {
      const result = await pool.query(sql, params);
      return result.rows || [];
    } catch (error) {
      logger.error('[MarketFallbackService] Query error:', error.message);
      return [];
    }
  }

  /**
   * Get intelligence data
   */
  async _getIntelligence(commodity, filters) {
    // This is a simplified version - actual implementation would use intelligenceService
    try {
      let sql = `
        SELECT 
          commodity,
          AVG(price_per_kg) as avg_price,
          MIN(price_per_kg) as min_price,
          MAX(price_per_kg) as max_price,
          COUNT(*) as data_points,
          MAX(arrival_date) as latest_date
        FROM market_prices 
        WHERE UPPER(commodity) = UPPER($1) AND price_per_kg IS NOT NULL AND price_per_kg > 0
      `;
      const params = [commodity];
      let paramCount = 2;

      if (filters.district) {
        sql += ` AND district = $${paramCount++}`;
        params.push(filters.district);
      }
      if (filters.state) {
        sql += ` AND state = $${paramCount++}`;
        params.push(filters.state);
      }

      sql += ' GROUP BY commodity';

      const result = await pool.query(sql, params);
      if (result.rows.length === 0) return null;

      return {
        commodity,
        averagePrice: result.rows[0].avg_price,
        minPrice: result.rows[0].min_price,
        maxPrice: result.rows[0].max_price,
        dataPoints: result.rows[0].data_points,
        latestDate: result.rows[0].latest_date
      };
    } catch (error) {
      logger.error('[MarketFallbackService] Intelligence query error:', error.message);
      return null;
    }
  }
}

module.exports = new MarketFallbackService();
