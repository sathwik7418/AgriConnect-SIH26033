const { query } = require('../db');
const supplyDemandMatcher = require('./supplyDemand');
const routingProvider = require('../providers/routing');

class IntelligenceService {
  /**
   * Helper: Get price per kg. Prefers price_per_kg column; falls back to
   * source-specific normalization for rows not yet backfilled.
   */
  _normalizePrice(row) {
    // Prefer the pre-computed price_per_kg column (set at sync time)
    if (row.price_per_kg != null) {
      return Math.round(parseFloat(row.price_per_kg) * 100) / 100;
    }
    // Fallback: source-specific normalization for legacy rows
    const raw = parseFloat(row.modal_price);
    if (isNaN(raw)) return 0;
    const source = row.source || '';
    const quintalSources = ['mandi_api', 'historical_dataset', 'agmarknet_historical', 'government_api', 'seed_demo'];
    if (quintalSources.includes(source)) {
      return Math.round((raw / 100) * 100) / 100;
    }
    return Math.round(raw * 100) / 100;
  }

  /**
   * Helper: Get APMC benchmark for a commodity with multi-tier fallback (district -> state -> national).
   * Supports optional variety filter. When variety is provided, first tries variety-specific
   * benchmark, then falls back to commodity-level and marks scope accordingly.
   */
  async getBenchmarkPrice(commodity, state, district, variety) {
    if (!commodity) return null;
    const comm = commodity.toUpperCase();
    const varFilter = variety ? variety.trim() : null;

    // 1. District level — variety-specific first
    if (state && district) {
      if (varFilter) {
        const distVarRes = await query(
          `SELECT price_per_kg, modal_price, min_price, max_price, source, market, arrival_date, variety
           FROM market_prices
           WHERE UPPER(commodity) = $1 AND UPPER(state) = UPPER($2) AND UPPER(district) = UPPER($3)
             AND UPPER(variety) = UPPER($4)
           ORDER BY arrival_date DESC LIMIT 1`,
          [comm, state, district, varFilter]
        );
        if (distVarRes.rows.length > 0) {
          const row = distVarRes.rows[0];
          return {
            price: this._normalizePrice(row),
            minPrice: this._normalizePrice({ ...row, modal_price: row.min_price, price_per_kg: null }),
            maxPrice: this._normalizePrice({ ...row, modal_price: row.max_price, price_per_kg: null }),
            scope: 'district',
            market: row.market,
            source: row.source,
            arrivalDate: row.arrival_date,
            varietySpecific: true,
            variety: row.variety
          };
        }
      }
      // District commodity-level fallback
      const distRes = await query(
        `SELECT price_per_kg, modal_price, min_price, max_price, source, market, arrival_date, variety
         FROM market_prices
         WHERE UPPER(commodity) = $1 AND UPPER(state) = UPPER($2) AND UPPER(district) = UPPER($3)
         ORDER BY arrival_date DESC LIMIT 1`,
        [comm, state, district]
      );
      if (distRes.rows.length > 0) {
        const row = distRes.rows[0];
        return {
          price: this._normalizePrice(row),
          minPrice: this._normalizePrice({ ...row, modal_price: row.min_price, price_per_kg: null }),
          maxPrice: this._normalizePrice({ ...row, modal_price: row.max_price, price_per_kg: null }),
          scope: 'district',
          market: row.market,
          source: row.source,
          arrivalDate: row.arrival_date,
          varietySpecific: false,
          variety: row.variety || null
        };
      }
    }

    // 2. State level
    if (state) {
      const stateRes = await query(
        `SELECT AVG(price_per_kg) as avg_per_kg,
                COUNT(*) as sample_size,
                MAX(arrival_date) as latest_date
         FROM market_prices
         WHERE UPPER(commodity) = $1 AND UPPER(state) = UPPER($2)
           AND price_per_kg IS NOT NULL AND price_per_kg > 0
           AND arrival_date >= (SELECT MAX(arrival_date) - INTERVAL '7 days' FROM market_prices WHERE UPPER(commodity) = $1 AND UPPER(state) = UPPER($2))`,
        [comm, state]
      );
      if (stateRes.rows.length > 0 && stateRes.rows[0].avg_per_kg) {
        const row = stateRes.rows[0];
        return {
          price: Math.round(parseFloat(row.avg_per_kg) * 100) / 100,
          minPrice: null,
          maxPrice: null,
          scope: 'state',
          market: `${state} State Average`,
          source: 'state_benchmark',
          arrivalDate: row.latest_date,
          varietySpecific: false
        };
      }
    }

    // 3. National level
    const natRes = await query(
      `SELECT AVG(price_per_kg) as avg_per_kg,
              COUNT(*) as sample_size,
              MAX(arrival_date) as latest_date
       FROM market_prices
       WHERE UPPER(commodity) = $1
         AND price_per_kg IS NOT NULL AND price_per_kg > 0
         AND arrival_date >= (SELECT MAX(arrival_date) - INTERVAL '14 days' FROM market_prices WHERE UPPER(commodity) = $1)`,
      [comm]
    );
    if (natRes.rows.length > 0 && natRes.rows[0].avg_per_kg) {
      const row = natRes.rows[0];
      return {
        price: Math.round(parseFloat(row.avg_per_kg) * 100) / 100,
        minPrice: null,
        maxPrice: null,
        scope: 'national',
        market: 'National APMC Benchmark',
        source: 'national_benchmark',
        arrivalDate: row.latest_date,
        varietySpecific: false
      };
    }

    return null;
  }

  /**
   * Phase 2 & 5 & 7: Comprehensive Farmer Market Intelligence
   */
  async getFarmerIntelligence(userId) {
    if (!userId) return { error: 'User ID required' };

    // Resolve farmer profile
    const farmerRes = await query('SELECT * FROM farmer_profiles WHERE user_id = $1', [userId]);
    if (farmerRes.rows.length === 0) {
      return { hasProfile: false, listings: [], commodities: [], recommendations: [] };
    }
    const farmer = farmerRes.rows[0];

    // Fetch farmer's active listings
    const listingsRes = await query(
      `SELECT * FROM produce_listings WHERE farmer_id = $1 AND listing_status = 'ACTIVE' ORDER BY created_at DESC`,
      [farmer.id]
    );
    const listings = listingsRes.rows;

    const commodityMap = new Map();
    const listingIntelligence = [];
    const recommendations = [];

    // Analyze each listing
    for (const l of listings) {
      const comm = (l.commodity || '').toUpperCase();
      const askingPrice = parseFloat(l.asking_price) || 0;
      const quantity = parseFloat(l.quantity) || 0;

      // 1. Fetch APMC benchmark
      const benchmark = await this.getBenchmarkPrice(comm, l.state || farmer.state, l.district || farmer.district);
      const benchPrice = benchmark ? benchmark.price : null;

      let priceDiff = null;
      let percentDiff = null;
      let positionText = 'Benchmark unavailable';
      if (benchPrice !== null && benchPrice > 0) {
        priceDiff = Math.round((askingPrice - benchPrice) * 100) / 100;
        percentDiff = Math.round(((askingPrice - benchPrice) / benchPrice) * 1000) / 10;
        if (priceDiff < 0) {
          positionText = `${Math.abs(percentDiff)}% below benchmark`;
        } else if (priceDiff > 0) {
          positionText = `${percentDiff}% above benchmark`;
        } else {
          positionText = 'Matches APMC benchmark';
        }
      }

      // 2. Fetch active demand & available supply in market
      const demandQuery = await query(
        `SELECT COALESCE(SUM(required_quantity), 0) as total_demand, COUNT(*) as demand_count,
                AVG(target_price) as avg_target_price
         FROM buyer_demands
         WHERE UPPER(commodity) = $1 AND demand_status = 'ACTIVE'`,
        [comm]
      );
      const totalDemandKg = parseFloat(demandQuery.rows[0].total_demand) || 0;
      const demandCount = parseInt(demandQuery.rows[0].demand_count) || 0;
      const avgTargetPrice = demandQuery.rows[0].avg_target_price ? Math.round(parseFloat(demandQuery.rows[0].avg_target_price) * 100) / 100 : null;

      const supplyQuery = await query(
        `SELECT COALESCE(SUM(quantity), 0) as total_supply, COUNT(*) as listing_count
         FROM produce_listings
          WHERE UPPER(commodity) = $1 AND listing_status = 'ACTIVE'`,
        [comm]
      );
      const totalSupplyKg = parseFloat(supplyQuery.rows[0].total_supply) || 0;
      const listingCount = parseInt(supplyQuery.rows[0].listing_count) || 0;

      // Demand/Supply Ratio
      let demandSupplyRatio = 1.0;
      let ratioText = '1.00x';
      if (totalSupplyKg > 0) {
        demandSupplyRatio = Math.round((totalDemandKg / totalSupplyKg) * 100) / 100;
        ratioText = `${demandSupplyRatio}x`;
      } else if (totalDemandKg > 0) {
        demandSupplyRatio = 5.0;
        ratioText = '5.00x+ (High Demand)';
      }

      // Market Status
      let marketStatus = 'BALANCED';
      if (demandSupplyRatio >= 1.25 || (totalDemandKg > 0 && totalSupplyKg === 0)) {
        marketStatus = 'HIGH_DEMAND';
      } else if (demandSupplyRatio < 0.75) {
        marketStatus = 'OVERSUPPLIED';
      }

      // Suggested Selling Price Range & Potential Revenue
      let suggestedMin = askingPrice;
      let suggestedMax = askingPrice;
      if (benchPrice !== null) {
        if (marketStatus === 'HIGH_DEMAND') {
          suggestedMin = Math.round(Math.max(benchPrice * 0.95, benchPrice - 2) * 10) / 10;
          suggestedMax = Math.round(Math.max(benchPrice * 1.05, benchPrice + 1) * 10) / 10;
        } else if (marketStatus === 'BALANCED') {
          suggestedMin = Math.round((benchPrice * 0.90) * 10) / 10;
          suggestedMax = Math.round((benchPrice * 0.98) * 10) / 10;
        } else {
          suggestedMin = Math.round((benchPrice * 0.85) * 10) / 10;
          suggestedMax = Math.round((benchPrice * 0.92) * 10) / 10;
        }
      } else if (avgTargetPrice !== null) {
        suggestedMin = Math.round((avgTargetPrice * 0.95) * 10) / 10;
        suggestedMax = Math.round((avgTargetPrice * 1.05) * 10) / 10;
      }
      const suggestedAvg = Math.round(((suggestedMin + suggestedMax) / 2) * 100) / 100;
      const potentialRevenue = Math.round(quantity * suggestedAvg);

      // Transparent explanation
      const whyExplanation = `Recommendation is based on current APMC benchmark (${benchPrice ? '₹' + benchPrice + '/kg' : 'Market average'}), active buyer demand (${totalDemandKg.toLocaleString()} kg across ${demandCount} buyers), and available supply (${totalSupplyKg.toLocaleString()} kg) in your trade region.`;

      // Find direct matching buyer demands for this listing
      const matchingDemandsRes = await query(
        `SELECT d.id, d.commodity, d.variety, d.required_quantity, d.target_price, d.delivery_location,
                bp.name as buyer_name, bp.company_name
         FROM buyer_demands d
         JOIN buyer_profiles bp ON d.buyer_id = bp.id
          WHERE UPPER(d.commodity) = $1 AND d.demand_status = 'ACTIVE' AND d.target_price >= $2
         ORDER BY d.target_price DESC, d.required_quantity DESC LIMIT 5`,
        [comm, askingPrice * 0.85]
      );

      const itemIntel = {
        listingId: l.id,
        commodity: comm,
        variety: l.variety || 'Standard',
        grade: l.grade || 'GRADE_A',
        quantity,
        askingPrice,
        benchmarkPrice: benchPrice,
        benchmarkScope: benchmark?.scope || null,
        benchmarkMarket: benchmark?.market || null,
        priceDifference: priceDiff,
        percentageDifference: percentDiff,
        positionText,
        totalDemandKg,
        demandCount,
        totalSupplyKg,
        listingCount,
        demandSupplyRatio,
        ratioText,
        marketStatus,
        suggestedMinPrice: suggestedMin,
        suggestedMaxPrice: suggestedMax,
        suggestedPriceRange: `₹${suggestedMin}–₹${suggestedMax}/kg`,
        suggestedAvgPrice: suggestedAvg,
        potentialRevenue,
        potentialRevenueText: `${quantity.toLocaleString()} kg × ₹${suggestedAvg}/kg = ₹${potentialRevenue.toLocaleString()}`,
        whyExplanation,
        matchingDemands: matchingDemandsRes.rows
      };

      listingIntelligence.push(itemIntel);

      // Generate smart contextual recommendations
      if (marketStatus === 'HIGH_DEMAND') {
        recommendations.push({
          type: 'HIGH_DEMAND',
          severity: 'success',
          title: `🔥 High Demand for ${comm}`,
          message: `Active buyer demand (${totalDemandKg.toLocaleString()} kg) exceeds available supply by ${ratioText}. Selling velocity in ${l.district || farmer.district} is optimal.`,
          actionLabel: 'Review Suggested Pricing',
          commodity: comm
        });
      }

      if (priceDiff !== null && priceDiff < -2) {
        recommendations.push({
          type: 'PRICE_OPPORTUNITY',
          severity: 'info',
          title: `💰 Revenue Optimization on ${comm}`,
          message: `Your asking price of ₹${askingPrice}/kg is ${Math.abs(priceDiff)}/kg below the APMC benchmark (₹${benchPrice}/kg). You have room to optimize revenue up to ₹${suggestedMax}/kg.`,
          actionLabel: 'Adjust Asking Rate',
          commodity: comm
        });
      }

      if (matchingDemandsRes.rows.length > 0) {
        recommendations.push({
          type: 'BUYER_MATCHES',
          severity: 'primary',
          title: `📦 ${matchingDemandsRes.rows.length} Active Buyer Match${matchingDemandsRes.rows.length > 1 ? 'es' : ''}`,
          message: `Institutional and bulk buyers are ready to procure ${comm} within your target rate bracket.`,
          actionLabel: 'View Buyer Demands',
          commodity: comm
        });
      }
    }

    // Top demanded commodities in farmer's state/region (Demand Intelligence)
    const topDemandsRes = await query(
      `SELECT d.commodity, COUNT(*) as buyer_count, SUM(d.required_quantity) as total_qty,
              AVG(d.target_price) as avg_budget
       FROM buyer_demands d
       WHERE d.demand_status = 'ACTIVE'
       GROUP BY d.commodity
       ORDER BY total_qty DESC LIMIT 6`
    );

    return {
      hasProfile: true,
      farmerId: farmer.id,
      farmerName: farmer.name,
      location: farmer.location,
      district: farmer.district,
      state: farmer.state,
      listingsCount: listings.length,
      listingIntelligence,
      demandOpportunities: topDemandsRes.rows.map(r => ({
        commodity: r.commodity,
        buyerCount: parseInt(r.buyer_count),
        totalQuantityKg: parseFloat(r.total_qty),
        avgTargetPrice: Math.round(parseFloat(r.avg_budget) * 100) / 100
      })),
      recommendations
    };
  }

  /**
   * Phase 3 & 6 & 7: Comprehensive Buyer Procurement Intelligence
   */
  async getBuyerIntelligence(userId) {
    if (!userId) return { error: 'User ID required' };

    const buyerRes = await query('SELECT * FROM buyer_profiles WHERE user_id = $1', [userId]);
    if (buyerRes.rows.length === 0) {
      return { hasProfile: false, demands: [], summary: null, recommendations: [] };
    }
    const buyer = buyerRes.rows[0];

    // Fetch active demands for this buyer
    const demandsRes = await query(
      `SELECT * FROM buyer_demands WHERE buyer_id = $1 AND demand_status = 'ACTIVE' ORDER BY created_at DESC`,
      [buyer.id]
    );
    const demands = demandsRes.rows;

    const demandIntelligence = [];
    const recommendations = [];
    let totalDemandedKg = 0;
    let totalMatchedKg = 0;
    let totalEstimatedSavings = 0;
    let totalActiveSuppliers = 0;

    for (const d of demands) {
      const bundle = await supplyDemandMatcher.bundleDemandSupply(d.id);
      if (!bundle) continue;

      totalDemandedKg += bundle.requestedQuantity;
      totalMatchedKg += bundle.matchedQuantity;
      totalEstimatedSavings += bundle.estimatedSavings;
      totalActiveSuppliers += bundle.farmerCount;

      // Count FPO participants vs independent smallholders
      const fpoSet = new Set();
      let independentCount = 0;
      (bundle.farmers || []).forEach(f => {
        if (f.fpoName) fpoSet.add(f.fpoName);
        else independentCount++;
      });
      const fpoCount = fpoSet.size;

      // Determine best procurement combination
      let bestOption = 'Direct Single Farmer';
      if (fpoCount > 0 && independentCount > 0) {
        bestOption = `${fpoCount} FPO (${Array.from(fpoSet).join(', ')}) + ${independentCount} Farmer${independentCount > 1 ? 's' : ''}`;
      } else if (fpoCount > 0) {
        bestOption = `${fpoCount} FPO Aggregation (${Array.from(fpoSet).join(', ')})`;
      } else if (bundle.farmerCount > 1) {
        bestOption = `Multi-Farmer Aggregation (${bundle.farmerCount} Smallholders)`;
      } else if (bundle.farmerCount === 1) {
        bestOption = 'Direct Farmer Procurement';
      } else {
        bestOption = 'Open Market Discovery Pending';
      }

      // Estimate transport cost for matched produce
      let transportEstimate = 0;
      let distanceKm = 120; // default estimated highway distance
      if (bundle.matchedQuantity > 0) {
        const vehicleClass = bundle.matchedQuantity > 10000 ? 'TRAILER_20T' : bundle.matchedQuantity > 4000 ? 'TRUCK_10T' : bundle.matchedQuantity > 1500 ? 'MINI_TRUCK' : 'PICKUP_LCV';
        const costResult = routingProvider.calculateTransportCost(distanceKm, vehicleClass);
        transportEstimate = costResult.transportCost || Math.round(distanceKm * 18 + 500);
      }
      const produceCost = Math.round(bundle.matchedQuantity * bundle.averagePrice);
      const totalProcurementEstimate = produceCost + transportEstimate;

      const intelItem = {
        demandId: d.id,
        commodity: d.commodity,
        variety: d.variety || 'Any Variety',
        grade: d.required_grade || 'GRADE_A',
        deliveryLocation: d.delivery_location || buyer.location,
        requiredQuantity: bundle.requestedQuantity,
        requestedQuantity: bundle.requestedQuantity,
        quantity: bundle.requestedQuantity,
        matchedQuantity: bundle.matchedQuantity,
        fulfillmentPercentage: bundle.fulfillmentPercentage,
        remainingQuantity: bundle.remainingQuantity,
        farmerCount: bundle.farmerCount,
        fpoCount,
        fpoNames: Array.from(fpoSet),
        independentFarmersCount: independentCount,
        averagePrice: bundle.averagePrice,
        targetPrice: bundle.targetPrice,
        produceSavings: bundle.estimatedSavings,
        transportEstimate,
        totalProcurementEstimate,
        bestOption,
        recommendation: bundle.recommendation,
        farmers: bundle.farmers
      };

      demandIntelligence.push(intelItem);

      // Contextual recommendations
      if (bundle.fulfillmentPercentage >= 80) {
        recommendations.push({
          type: 'HIGH_FULFILLMENT',
          severity: 'success',
          title: `🎯 ${bundle.fulfillmentPercentage}% Supply Matched for ${d.commodity}`,
          message: `${bundle.farmerCount} verified producers can satisfy ${bundle.matchedQuantity.toLocaleString()} kg at an average rate of ₹${bundle.averagePrice}/kg.`,
          actionLabel: 'Execute Procurement Order',
          demandId: d.id
        });
      }

      if (bundle.estimatedSavings > 1000) {
        recommendations.push({
          type: 'SAVINGS_ALERT',
          severity: 'info',
          title: `💰 ₹${bundle.estimatedSavings.toLocaleString()} Estimated Savings`,
          message: `Aggregated direct sourcing delivers ₹${(bundle.targetPrice - bundle.averagePrice).toFixed(2)}/kg cost advantage below your target budget.`,
          demandId: d.id
        });
      }

      if (fpoCount > 0) {
        recommendations.push({
          type: 'FPO_CONSOLIDATION',
          severity: 'primary',
          title: `📦 FPO Consolidated Supply Lot Available`,
          message: `${Array.from(fpoSet).join(', ')} aggregates smallholder produce into a single high-quality wholesale consignment.`,
          demandId: d.id
        });
      }
    }

    return {
      hasProfile: true,
      buyerId: buyer.id,
      buyerName: buyer.name,
      companyName: buyer.company_name,
      location: buyer.location,
      district: buyer.district,
      state: buyer.state,
      demandsCount: demands.length,
      demandIntelligence,
      summary: {
        totalDemandedKg,
        totalMatchedKg,
        overallFulfillmentPct: totalDemandedKg > 0 ? Math.round((totalMatchedKg / totalDemandedKg) * 1000) / 10 : 0,
        totalEstimatedSavings,
        totalActiveSuppliers
      },
      recommendations
    };
  }

  /**
   * Phase 4: Price Trend Intelligence (7-day / 30-day historical data)
   */
  async getPriceTrend(commodity, state, district, days = 30) {
    if (!commodity) return { error: 'Commodity is required' };
    const comm = commodity.toUpperCase();
    const windowDays = parseInt(days) || 30;

    let sql = `
      SELECT arrival_date,
             AVG(price_per_kg) as avg_per_kg,
             COUNT(*) as sample_count
      FROM market_prices
      WHERE UPPER(commodity) = $1 AND price_per_kg IS NOT NULL AND price_per_kg > 0
    `;
    const params = [comm];
    let paramCount = 2;

    if (state && state !== 'ALL') {
      sql += ` AND UPPER(state) = UPPER($${paramCount++})`;
      params.push(state);
    }
    if (district && district !== 'ALL') {
      sql += ` AND UPPER(district) = UPPER($${paramCount++})`;
      params.push(district);
    }

    sql += ` GROUP BY arrival_date ORDER BY arrival_date ASC LIMIT $${paramCount}`;
    params.push(windowDays);

    let rows = (await query(sql, params)).rows;

    // If recent records are insufficient, check historical_market_prices
    if (rows.length < 2) {
      let histSql = `
        SELECT arrival_date,
               AVG(price_per_kg) as avg_per_kg,
               COUNT(*) as sample_count
        FROM historical_market_prices
        WHERE UPPER(commodity) = $1 AND price_per_kg IS NOT NULL AND price_per_kg > 0
      `;
      const histParams = [comm];
      let histParamCount = 2;
      if (state && state !== 'ALL') {
        histSql += ` AND UPPER(state) = UPPER($${histParamCount++})`;
        histParams.push(state);
      }
      if (district && district !== 'ALL') {
        histSql += ` AND UPPER(district) = UPPER($${histParamCount++})`;
        histParams.push(district);
      }
      histSql += ` GROUP BY arrival_date ORDER BY arrival_date DESC LIMIT $${histParamCount}`;
      histParams.push(windowDays);

      const histRows = (await query(histSql, histParams)).rows;
      if (histRows.length >= 2) {
        rows = histRows.reverse();
      }
    }

    // If still fewer than 2 data points, return explicit graceful empty state (NEVER fabricate data)
    if (rows.length < 2) {
      return {
        hasData: false,
        commodity: comm,
        state: state || 'All',
        district: district || 'All',
        days: windowDays,
        message: 'Insufficient historical data for trend analysis.',
        dataPoints: []
      };
    }

    const dataPoints = rows.map(r => {
      const dStr = new Date(r.arrival_date).toISOString().split('T')[0];
      const p = Math.round(parseFloat(r.avg_per_kg) * 100) / 100;
      return {
        date: dStr,
        price: p,
        sampleCount: parseInt(r.sample_count)
      };
    });

    const prices = dataPoints.map(d => d.price);
    const oldestPrice = prices[0];
    const latestPrice = prices[prices.length - 1];
    const sumPrice = prices.reduce((a, b) => a + b, 0);
    const avgPrice = Math.round((sumPrice / prices.length) * 100) / 100;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const priceChange = Math.round((latestPrice - oldestPrice) * 100) / 100;
    const percentageChange = oldestPrice > 0 ? Math.round(((latestPrice - oldestPrice) / oldestPrice) * 1000) / 10 : 0;

    let trend = 'STABLE';
    if (percentageChange >= 2.0) {
      trend = 'RISING';
    } else if (percentageChange <= -2.0) {
      trend = 'FALLING';
    }

    return {
      hasData: true,
      commodity: comm,
      state: state || 'All',
      district: district || 'All',
      days: windowDays,
      currentPrice: latestPrice,
      averagePrice: avgPrice,
      minPrice,
      maxPrice,
      priceChange,
      percentageChange,
      trend,
      dataPoints
    };
  }
}

module.exports = new IntelligenceService();
