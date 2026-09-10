const { query } = require('../../db');

/**
 * Supply-Demand Pressure Prediction Service
 * Quantifies market tightness and price pressure from live PostgreSQL marketplace balances.
 */
class SupplyDemandPredictionService {
  static async calculatePressure({ commodity, state }) {
    let supplySql = `
      SELECT COALESCE(SUM(quantity), 0) as total_supply, COUNT(*) as listing_count
      FROM produce_listings
      WHERE listing_status = 'ACTIVE'
    `;
    let demandSql = `
      SELECT COALESCE(SUM(required_quantity), 0) as total_demand, COUNT(*) as demand_count
      FROM buyer_demands
      WHERE demand_status = 'ACTIVE'
    `;
    const supplyParams = [];
    const demandParams = [];

    if (commodity && commodity !== 'ALL') {
      supplySql += ` AND UPPER(commodity) = UPPER($1)`;
      supplyParams.push(commodity);
      demandSql += ` AND UPPER(commodity) = UPPER($1)`;
      demandParams.push(commodity);
    }

    const [supplyRes, demandRes] = await Promise.all([
      query(supplySql, supplyParams),
      query(demandSql, demandParams)
    ]);

    const supplyQty = parseFloat(supplyRes.rows[0].total_supply) || 0;
    const demandQty = parseFloat(demandRes.rows[0].total_demand) || 0;
    const listingCount = parseInt(supplyRes.rows[0].listing_count) || 0;
    const demandCount = parseInt(demandRes.rows[0].demand_count) || 0;

    let ratio = 1.0;
    if (supplyQty > 0) {
      ratio = Math.round((demandQty / supplyQty) * 100) / 100;
    } else if (demandQty > 0) {
      ratio = 9.9;
    } else {
      ratio = 1.0;
    }

    let classification = 'BALANCED';
    let explanation = '';

    if (ratio < 0.7) {
      classification = 'LOW';
      explanation = 'Available harvest supply comfortably exceeds current buyer demands. FPO aggregation recommended to negotiate bulk institutional contracts.';
    } else if (ratio <= 1.3) {
      classification = 'BALANCED';
      explanation = 'Supply and demand volumes are balanced near market equilibrium. Fair price realization expected across standard APMC benchmarks.';
    } else if (ratio <= 2.5) {
      classification = 'HIGH';
      explanation = 'Buyer procurement demand is outpacing local supply. Farmers hold favorable pricing power and rapid fulfillment velocity.';
    } else {
      classification = 'CRITICAL';
      explanation = 'Severe procurement supply deficit. Multi-farmer demand bundling and regional FPO dispatch strongly advised.';
    }

    const confidence = (listingCount > 0 || demandCount > 0) ? 0.85 : 0.50;

    return {
      commodity: commodity ? commodity.toUpperCase() : 'ALL',
      state: state || 'ALL',
      supplyQuantityKg: supplyQty,
      demandQuantityKg: demandQty,
      activeListingsCount: listingCount,
      activeDemandsCount: demandCount,
      pressureRatio: ratio,
      classification,
      explanation,
      confidence,
      calculatedAt: new Date()
    };
  }
}

module.exports = SupplyDemandPredictionService;
