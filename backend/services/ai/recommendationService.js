const { query } = require('../../db');
const DemandForecastService = require('./demandForecastService');
const PriceForecastService = require('./priceForecastService');
const SupplyDemandPredictionService = require('./supplyDemandPredictionService');

/**
 * Explainable AI Recommendation Service
 * Produces structured recommendations backed by transparent evidence and deterministic metrics.
 */
class RecommendationService {
  static async getFarmerRecommendations(farmerId) {
    const recs = [];

    // Get farmer profile
    const farmerRes = await query('SELECT * FROM farmer_profiles WHERE id = $1', [farmerId]);
    if (farmerRes.rows.length === 0) return recs;
    const farmer = farmerRes.rows[0];

    // Get farmer's active listings
    const listingsRes = await query(
      `SELECT * FROM produce_listings WHERE farmer_id = $1 AND listing_status = 'ACTIVE'`,
      [farmerId]
    );
    const listings = listingsRes.rows;

    // 1. If farmer has active listings, analyze each crop
    for (const listing of listings) {
      const crop = listing.commodity;
      const price = parseFloat(listing.asking_price);

      // 1. Check APMC Mandi benchmark (variety-aware: prefer the listing's own
      //    variety when a variety-specific observation exists, then fall back to
      //    any-variety rows so a missing variety never blocks a real comparison).
      const runBenchmark = async (varietyFilter) => {
        const p = [crop, farmer.state || ''];
        let vWhere = '';
        if (varietyFilter) {
          p.push(varietyFilter);
          vWhere = ` AND UPPER(COALESCE(variety, '')) = UPPER($${p.length})`;
        }
        return query(
          `SELECT price_per_kg, modal_price, source, variety FROM market_prices 
           WHERE UPPER(commodity) = UPPER($1) AND (state ILIKE $2 OR state = 'ALL')
             AND price_per_kg IS NOT NULL AND price_per_kg > 0${vWhere}
           ORDER BY arrival_date DESC LIMIT 1`,
          p
        );
      };

      let apmcRes = {};
      if (listing.variety) {
        apmcRes = await runBenchmark(listing.variety);
        if (apmcRes.rows.length === 0) apmcRes = await runBenchmark(null);
      } else {
        apmcRes = await runBenchmark(null);
      }

      if (apmcRes.rows.length > 0) {
        const row = apmcRes.rows[0];
        const apmcPrice = parseFloat(row.price_per_kg) || (parseFloat(row.modal_price) / 100);
        const varietyLabel = row.variety ? ` (${row.variety} variety)` : '';
        if (price < apmcPrice * 0.90) {
          const diff = Math.round((apmcPrice - price) * 10) / 10;
          const percent = Math.round(((apmcPrice - price) / apmcPrice) * 100);
          recs.push({
            id: `price_below_${listing.id}`,
            category: 'PRICE_OPTIMIZATION',
            type: 'PRICE_BENCHMARK',
            title: `Your asking price for ${crop} is ${percent}% below Mandi benchmark`,
            description: `You are asking ₹${price}/kg while local Mandi traders are transacting at ₹${apmcPrice}/kg${varietyLabel}. You could safely raise your price by up to ₹${diff}/kg.`,
            reason: `Local APMC benchmark modal price is currently ₹${apmcPrice}/kg${varietyLabel}.`,
            underlyingValues: {
              yourPrice: price,
              mandiBenchmark: apmcPrice,
              potentialGainPerKg: diff,
              quantityKg: parseFloat(listing.quantity),
              variety: row.variety || null
            },
            dataSource: 'APMC',
            trustType: 'CALCULATED',
            confidence: 0.90
          });
        }
      }

      // Check matching buyer demands
      const demandRes = await query(
        `SELECT COUNT(*) as count, COALESCE(SUM(required_quantity), 0) as total_qty, COALESCE(AVG(target_price), 0) as avg_target
         FROM buyer_demands
         WHERE UPPER(commodity) = UPPER($1) AND demand_status = 'ACTIVE'`,
        [crop]
      );

      const matchCount = parseInt(demandRes.rows[0].count);
      const totalDemandKg = parseFloat(demandRes.rows[0].total_qty);
      const avgTarget = Math.round(parseFloat(demandRes.rows[0].avg_target) * 10) / 10;

      if (matchCount > 0) {
        recs.push({
          id: `demand_match_${listing.id}`,
          category: 'DEMAND_MATCH',
          type: 'DEMAND_MATCH',
          title: `${matchCount} active buyer demands match your ${crop} harvest`,
          description: `Buyers have posted verified requirements for ${totalDemandKg.toLocaleString()} kg of ${crop} at an average target price of ₹${avgTarget}/kg.`,
          reason: `Direct requirement posted on the platform with zero commission deductions.`,
          underlyingValues: {
            activeBuyersCount: matchCount,
            totalDemandedKg: totalDemandKg,
            averageBuyerTarget: avgTarget
          },
          dataSource: 'DB',
          trustType: 'REAL',
          confidence: 0.95
        });
      }
    }

    // 2. Regional Market Trend & Sowing Opportunity
    const topDemandRes = await query(
      `SELECT commodity, SUM(required_quantity) as total_qty, COUNT(*) as buyers_count
       FROM buyer_demands
       WHERE demand_status = 'ACTIVE'
       GROUP BY commodity
       ORDER BY total_qty DESC LIMIT 1`
    );

    if (topDemandRes.rows.length > 0) {
      const top = topDemandRes.rows[0];
      recs.push({
        id: `regional_top_${top.commodity}`,
        category: 'MARKET_OPPORTUNITY',
        type: 'MARKET_TREND',
        title: `High wholesale demand for ${top.commodity}`,
        description: `Wholesale procurement is surging for ${top.commodity} with ${parseFloat(top.total_qty).toLocaleString()} kg requested by ${top.buyers_count} verified buyers.`,
        reason: `Highest aggregate buyer procurement volume currently active across the marketplace.`,
        underlyingValues: {
          demandedCrop: top.commodity,
          totalQuantityKg: parseFloat(top.total_qty),
          buyersCount: parseInt(top.buyers_count)
        },
        dataSource: 'DB',
        trustType: 'REAL',
        confidence: 0.88
      });
    }

    // 3. FPO Collective Advantage
    const fpoMemberRes = await query(`SELECT * FROM fpo_members WHERE farmer_id = $1`, [farmerId]);
    if (fpoMemberRes.rows.length === 0) {
      const fpoListRes = await query(`SELECT name, district FROM fpo_profiles LIMIT 1`);
      if (fpoListRes.rows.length > 0) {
        recs.push({
          id: 'join_fpo_rec',
          category: 'FPO_AGGREGATION',
          type: 'FPO_OPPORTUNITY',
          title: 'Join an FPO to fulfill multi-tonne wholesale contracts',
          description: `Aggregating supply with organizations like ${fpoListRes.rows[0].name} enables smallholders to fulfill institutional multi-truckload buyer contracts.`,
          reason: `FPO aggregated supply lots attract wholesale institutional procurement rates.`,
          underlyingValues: {
            recommendedFpo: fpoListRes.rows[0].name,
            region: fpoListRes.rows[0].district
          },
          dataSource: 'FPO_COLLECTIVE',
          trustType: 'CALCULATED',
          confidence: 0.85
        });
      }
    }

    return recs;
  }

  static async getBuyerRecommendations(buyerId) {
    const recs = [];

    // Get buyer profile
    const buyerRes = await query('SELECT * FROM buyer_profiles WHERE id = $1', [buyerId]);
    if (buyerRes.rows.length === 0) return recs;

    // Get active demands
    const demandsRes = await query(
      `SELECT * FROM buyer_demands WHERE buyer_id = $1 AND demand_status = 'ACTIVE'`,
      [buyerId]
    );
    const demands = demandsRes.rows;

    for (const demand of demands) {
      const crop = demand.commodity;
      const targetPrice = parseFloat(demand.target_price);
      const reqQty = parseFloat(demand.required_quantity);

      // Check available supply
      const supplyRes = await query(
        `SELECT l.*, f.state as farmer_state, f.name as farmer_name, fp.name as fpo_name
         FROM produce_listings l
         JOIN farmer_profiles f ON l.farmer_id = f.id
         LEFT JOIN fpo_members fm ON fm.farmer_id = f.id
         LEFT JOIN fpo_profiles fp ON fm.fpo_id = fp.id
         WHERE UPPER(l.commodity) = UPPER($1) AND l.listing_status = 'ACTIVE'
         ORDER BY l.asking_price ASC`,
        [crop]
      );
      const supply = supplyRes.rows;

      if (supply.length > 0) {
        const totalAvail = supply.reduce((sum, s) => sum + parseFloat(s.quantity), 0);
        const fpoListings = supply.filter(s => s.fpo_name);
        const individualListings = supply.filter(s => !s.fpo_name);

        const coveragePercent = Math.min(100, Math.round((totalAvail / reqQty) * 100));
        const cheapest = supply[0];
        const cheapestPrice = parseFloat(cheapest.asking_price);

        recs.push({
          id: `procurement_plan_${demand.id}`,
          category: 'PROCUREMENT_SOURCING',
          type: 'OPTIMAL_SOURCING',
          title: `${coveragePercent}% of your ${reqQty.toLocaleString()} kg ${crop} demand can be fulfilled immediately`,
          description: `Direct farm-gate supply of ${totalAvail.toLocaleString()} kg is available starting from ₹${cheapestPrice}/kg (Target: ₹${targetPrice}/kg).`,
          reason: `Identified ${supply.length} available listings matching commodity specifications.`,
          underlyingValues: {
            demandQtyKg: reqQty,
            availableSupplyKg: totalAvail,
            fulfillmentPercentage: coveragePercent,
            cheapestRatePerKg: cheapestPrice,
            fpoSuppliersCount: fpoListings.length,
            individualFarmersCount: individualListings.length
          },
          dataSource: 'MARKETPLACE',
          trustType: 'CALCULATED',
          confidence: 0.92
        });

        if (fpoListings.length > 0) {
          const fpoQty = fpoListings.reduce((sum, s) => sum + parseFloat(s.quantity), 0);
          recs.push({
            id: `fpo_bulk_${demand.id}`,
            category: 'FPO_AGGREGATION',
            type: 'BULK_AGGREGATION',
            title: `Procure ${fpoQty.toLocaleString()} kg from FPO lots in a single consolidated dispatch`,
            description: `FPO aggregated supply reduces multiple pickup stops and streamlines transit handling.`,
            reason: `FPO collective lots consolidate multi-farmer lots into single wholesale dispatch points.`,
            underlyingValues: {
              fpoSupplyKg: fpoQty,
              fpoCount: fpoListings.length
            },
            dataSource: 'FPO_COLLECTIVE',
            trustType: 'CALCULATED',
            confidence: 0.90
          });
        }
      }
    }

    return recs;
  }
}

module.exports = RecommendationService;
