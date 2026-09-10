const { query } = require('../db');

class SupplyDemandMatcher {
  async findMatches(commodity, options = {}) {
    const { state, maxPrice, minQuantity, limit = 20 } = options;

    let sql = `
      SELECT
        l.id as listing_id,
        l.commodity,
        l.variety,
        l.grade,
        l.quantity as available_quantity,
        l.unit,
        l.asking_price,
        l.location as listing_location,
        l.state as listing_state,
        l.district as listing_district,
        l.created_at as listed_at,
        fp.name as farmer_name,
        fp.district as farmer_district
      FROM produce_listings l
      JOIN farmer_profiles fp ON l.farmer_id = fp.id
      WHERE l.commodity = $1 AND l.listing_status = 'ACTIVE'
    `;
    const params = [commodity.toUpperCase()];
    let paramCount = 2;

    if (state) {
      sql += ` AND l.state = $${paramCount++}`;
      params.push(state);
    }
    if (maxPrice) {
      sql += ` AND l.asking_price <= $${paramCount++}`;
      params.push(parseFloat(maxPrice));
    }
    if (minQuantity) {
      sql += ` AND l.quantity >= $${paramCount++}`;
      params.push(parseFloat(minQuantity));
    }

    sql += ` ORDER BY l.asking_price ASC, l.quantity DESC LIMIT $${paramCount}`;
    params.push(limit);

    const listings = (await query(sql, params)).rows;

    let demandSql = `
      SELECT
        d.id,
        d.id as demand_id,
        d.commodity,
        d.variety,
        d.required_grade,
        d.required_quantity,
        d.unit,
        d.target_price,
        d.delivery_location,
        d.required_delivery_date,
        d.created_at as demanded_at,
        bp.name as buyer_name,
        bp.company_name
      FROM buyer_demands d
      JOIN buyer_profiles bp ON d.buyer_id = bp.id
      WHERE d.commodity = $1 AND d.demand_status = 'ACTIVE'
    `;
    const demandParams = [commodity.toUpperCase()];
    let demandParamCount = 2;

    if (state) {
      demandSql += ` AND bp.state = $${demandParamCount++}`;
      demandParams.push(state);
    }

    demandSql += ` ORDER BY d.target_price DESC, d.required_quantity ASC`;
    const demands = (await query(demandSql, demandParams)).rows;

    const matches = [];
    for (const listing of listings) {
      for (const demand of demands) {
        const score = this._scoreMatch(listing, demand);
        if (score > 0) {
          matches.push({
            listing,
            demand,
            score,
            matchReasons: this._explainMatch(listing, demand),
          });
        }
      }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit);
  }

  _scoreMatch(listing, demand) {
    let score = 0;

    // Exact commodity match (required — already filtered in SQL)
    score += 40;

    // Price alignment: buyer target >= farmer asking
    const priceRatio = demand.target_price / listing.asking_price;
    if (priceRatio >= 1.0) {
      score += 30;
    } else if (priceRatio >= 0.9) {
      score += 15;
    } else if (priceRatio >= 0.8) {
      score += 5;
    }
    // No score if target < 80% of asking

    // Quantity match
    if (listing.available_quantity >= demand.required_quantity) {
      score += 15;
    } else if (listing.available_quantity >= demand.required_quantity * 0.5) {
      score += 5;
    }

    // Location proximity (same state = bonus)
    if (listing.listing_state === (demand.delivery_location || '').split(',')[0]?.trim()) {
      score += 10;
    }

    // Variety match
    if (demand.variety && listing.variety && listing.variety.toLowerCase() === demand.variety.toLowerCase()) {
      score += 5;
    }

    return score;
  }

  _explainMatch(listing, demand) {
    const reasons = [];
    const priceRatio = demand.target_price / listing.asking_price;

    if (priceRatio >= 1.0) {
      reasons.push(`Buyer willing to pay Rs${demand.target_price}/kg (asking: Rs${listing.asking_price}/kg)`);
    } else {
      reasons.push(`Price gap: buyer target Rs${demand.target_price}/kg vs asking Rs${listing.asking_price}/kg`);
    }

    if (listing.available_quantity >= demand.required_quantity) {
      reasons.push(`Supply covers demand: ${listing.available_quantity}kg available, ${demand.required_quantity}kg needed`);
    } else {
      reasons.push(`Partial supply: ${listing.available_quantity}kg available, ${demand.required_quantity}kg needed`);
    }

    if (listing.listing_state === (demand.delivery_location || '').split(',')[0]?.trim()) {
      reasons.push('Same state — lower transport cost');
    }

    return reasons;
  }

  async findDemandsForFarmer(farmerId, options = {}) {
    if (!farmerId) return [];
    
    // Get farmer profile details
    const farmerRes = await query('SELECT state, district, crops FROM farmer_profiles WHERE id = $1', [farmerId]);
    if (farmerRes.rows.length === 0) return [];
    const farmer = farmerRes.rows[0];

    // Get active listings for this farmer
    const listingsRes = await query(
      `SELECT id, commodity, variety, grade, quantity, asking_price, state, district, location 
       FROM produce_listings 
       WHERE farmer_id = $1 AND listing_status = 'ACTIVE'`,
      [farmerId]
    );
    const listings = listingsRes.rows;
    const commodities = listings.length > 0 
      ? [...new Set(listings.map(l => l.commodity.toUpperCase()))]
      : (farmer.crops || []).map(c => c.toUpperCase());

    if (commodities.length === 0) {
      // If no listings and no crops, return top active demands in the state
      const allDemandsRes = await query(
        `SELECT d.*, bp.name as buyer_name, bp.company_name, bp.state as buyer_state
         FROM buyer_demands d
         JOIN buyer_profiles bp ON d.buyer_id = bp.id
         WHERE d.demand_status = 'ACTIVE'
         ORDER BY d.created_at DESC LIMIT 10`
      );
      return allDemandsRes.rows.map(d => ({
        demand: d,
        listing: null,
        score: 50,
        matchReasons: ['Active demand in open marketplace']
      }));
    }

    const matches = [];
    for (const commodity of commodities) {
      const commMatches = await this.findMatches(commodity, { state: options.state || undefined, limit: 10 });
      for (const m of commMatches) {
        // If farmer has matching listing, check if this listing belongs to this farmer or is for same commodity
        const farmerListing = listings.find(l => l.commodity.toUpperCase() === commodity) || null;
        matches.push({
          demand: m.demand,
          listing: farmerListing || m.listing,
          score: m.score,
          matchReasons: m.matchReasons
        });
      }
    }

    // Deduplicate demands by demand_id
    const seen = new Set();
    const uniqueMatches = [];
    for (const m of matches) {
      const id = m.demand?.demand_id || m.demand?.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        uniqueMatches.push(m);
      }
    }

    uniqueMatches.sort((a, b) => b.score - a.score);
    return uniqueMatches.slice(0, 15);
  }

  async findMatchesForBuyer(buyerId, options = {}) {
    if (!buyerId) return [];

    const demandsRes = await query(
      `SELECT id, commodity, variety, required_grade, required_quantity, target_price, delivery_location
       FROM buyer_demands
       WHERE buyer_id = $1 AND demand_status = 'ACTIVE'`,
      [buyerId]
    );
    const demands = demandsRes.rows;
    if (demands.length === 0) return [];

    const allMatches = [];
    for (const demand of demands) {
      const matches = await this.findMatches(demand.commodity, {
        maxPrice: demand.target_price,
        minQuantity: 1,
        limit: 10
      });
      for (const m of matches) {
        allMatches.push({
          ...m,
          buyerDemandId: demand.id
        });
      }
    }

    // Deduplicate listings by listing_id
    const seen = new Set();
    const unique = [];
    for (const m of allMatches) {
      const id = m.listing?.listing_id || m.listing?.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        unique.push(m);
      }
    }

    unique.sort((a, b) => b.score - a.score);
    return unique.slice(0, 15);
  }

  async getSupplyDemandSummary() {
    const commodities = ['TOMATO', 'ONION', 'POTATO', 'WHEAT', 'RICE', 'CORN', 'MANGO', 'APPLE', 'BANANA', 'BRINJAL', 'LETTUCE'];
    const summary = [];

    for (const commodity of commodities) {
      const supply = await query(
        `SELECT COALESCE(SUM(quantity), 0) as total, COUNT(*) as listings
         FROM produce_listings WHERE commodity = $1 AND listing_status = 'ACTIVE'`,
        [commodity]
      );
      const demand = await query(
        `SELECT COALESCE(SUM(required_quantity), 0) as total, COUNT(*) as demands
         FROM buyer_demands WHERE commodity = $1 AND demand_status = 'ACTIVE'`,
        [commodity]
      );

      const supplyTotal = parseFloat(supply.rows[0].total);
      const demandTotal = parseFloat(demand.rows[0].total);
      const ratio = demandTotal > 0 ? supplyTotal / demandTotal : supplyTotal > 0 ? Infinity : 0;

      summary.push({
        commodity,
        supply: supplyTotal,
        demand: demandTotal,
        surplus: supplyTotal - demandTotal,
        ratio: ratio === Infinity ? 'surplus' : ratio,
        supplyListings: parseInt(supply.rows[0].listings),
        demandCount: parseInt(demand.rows[0].demands),
        status: ratio === 'surplus' ? 'SURPLUS' : ratio > 1 ? 'SURPLUS' : ratio > 0.8 ? 'BALANCED' : ratio > 0 ? 'SHORTAGE' : 'NO_DATA',
      });
    }

    return summary.filter(s => s.supply > 0 || s.demand > 0);
  }

  async bundleDemandSupply(demandId) {
    if (!demandId) return null;

    // 1. Fetch buyer demand
    const demandRes = await query(
      `SELECT d.*, bp.name as buyer_name, bp.company_name, bp.state as buyer_state, bp.district as buyer_district, bp.location as buyer_location, bp.latitude as buyer_lat, bp.longitude as buyer_lng
       FROM buyer_demands d
       JOIN buyer_profiles bp ON d.buyer_id = bp.id
       WHERE d.id = $1`,
      [demandId]
    );

    if (demandRes.rows.length === 0) return null;
    const demand = demandRes.rows[0];
    const reqQty = parseFloat(demand.required_quantity);
    const targetPrice = parseFloat(demand.target_price) || 0;
    const commodity = (demand.commodity || '').toUpperCase();

    // 2. Fetch compatible active listings
    const listingsRes = await query(
      `SELECT l.id as listing_id, l.farmer_id, l.commodity, l.variety, l.grade,
              l.quantity as available_quantity, l.asking_price, l.location, l.state, l.district,
              l.latitude, l.longitude, l.created_at,
              fp.name as farmer_name, fp.fpo_name, fp.district as farmer_district, fp.state as farmer_state
       FROM produce_listings l
       JOIN farmer_profiles fp ON l.farmer_id = fp.id
       WHERE UPPER(l.commodity) = $1 AND l.listing_status = 'ACTIVE' AND l.quantity > 0
       ORDER BY l.asking_price ASC, l.quantity DESC`,
      [commodity]
    );

    const listings = listingsRes.rows;
    if (listings.length === 0) {
      return {
        demandId: demand.id,
        commodity: demand.commodity,
        variety: demand.variety || null,
        grade: demand.required_grade || 'GRADE_A',
        deliveryLocation: demand.delivery_location,
        requestedQuantity: reqQty,
        matchedQuantity: 0,
        fulfillmentPercentage: 0,
        averagePrice: 0,
        targetPrice,
        estimatedSavings: 0,
        remainingQuantity: reqQty,
        farmerCount: 0,
        farmers: [],
        recommendation: 'No matching farmers currently available with active listings for this commodity.'
      };
    }

    // 3. Score and prioritize listings using deterministic greedy rules
    const scoredListings = listings.map(l => {
      let score = 50;
      const asking = parseFloat(l.asking_price);
      const avlQty = parseFloat(l.available_quantity);

      // Price alignment: Target >= Asking gets bonus; cheaper produce is prioritized
      if (targetPrice > 0) {
        if (asking <= targetPrice) {
          score += 30 + ((targetPrice - asking) / targetPrice) * 20;
        } else {
          score -= ((asking - targetPrice) / targetPrice) * 30;
        }
      } else {
        score += Math.max(0, 30 - asking);
      }

      // Variety match
      if (demand.variety && l.variety && l.variety.toLowerCase() === demand.variety.toLowerCase()) {
        score += 15;
      }

      // Grade match
      if (demand.required_grade && l.grade && l.grade.toUpperCase() === demand.required_grade.toUpperCase()) {
        score += 10;
      }

      // Proximity match
      const buyerState = demand.buyer_state || (demand.delivery_location || '').split(',').pop()?.trim();
      if (buyerState && l.state && l.state.toLowerCase() === buyerState.toLowerCase()) {
        score += 15;
        if (demand.buyer_district && l.district && l.district.toLowerCase() === demand.buyer_district.toLowerCase()) {
          score += 10;
        }
      }

      return {
        ...l,
        asking_price: asking,
        available_quantity: avlQty,
        matchScore: score
      };
    });

    // Sort: Price ascending is primary, then higher match score, then larger quantity
    scoredListings.sort((a, b) => {
      if (Math.abs(a.asking_price - b.asking_price) > 0.01) {
        return a.asking_price - b.asking_price;
      }
      if (Math.abs(b.matchScore - a.matchScore) > 0.1) {
        return b.matchScore - a.matchScore;
      }
      return b.available_quantity - a.available_quantity;
    });

    // 4. Deterministic greedy allocation
    let remaining = reqQty;
    let matched = 0;
    let totalCost = 0;
    const contributingFarmers = [];

    for (const l of scoredListings) {
      if (remaining <= 0.0001) break;

      const take = Math.min(remaining, l.available_quantity);
      if (take <= 0) continue;

      const contributionPct = Math.round((take / reqQty) * 1000) / 10;
      contributingFarmers.push({
        farmerId: l.farmer_id,
        farmerName: l.farmer_name,
        fpoName: l.fpo_name || null,
        listingId: l.listing_id,
        quantity: Math.round(take * 100) / 100,
        askingPrice: l.asking_price,
        contributionPercentage: contributionPct,
        location: l.location,
        district: l.district,
        state: l.state,
        grade: l.grade,
        variety: l.variety
      });

      matched += take;
      remaining -= take;
      totalCost += take * l.asking_price;
    }

    const matchedQuantity = Math.round(matched * 100) / 100;
    const remainingQuantity = Math.max(0, Math.round((reqQty - matched) * 100) / 100);
    const fulfillmentPercentage = Math.min(100, Math.round((matchedQuantity / reqQty) * 1000) / 10);
    const averagePrice = matchedQuantity > 0 ? Math.round((totalCost / matchedQuantity) * 100) / 100 : 0;
    const estimatedSavings = targetPrice > averagePrice && matchedQuantity > 0
      ? Math.round((targetPrice - averagePrice) * matchedQuantity * 100) / 100
      : 0;

    let recommendation = '';
    if (fulfillmentPercentage >= 100) {
      recommendation = `100% fulfillable via ${contributingFarmers.length} direct farmer${contributingFarmers.length > 1 ? 's' : ''} at an average price of ₹${averagePrice}/kg.`;
    } else if (fulfillmentPercentage >= 50) {
      recommendation = `Partial supply available (${fulfillmentPercentage}%). You can accept partial supply (${matchedQuantity} kg) or wait for more listings.`;
    } else {
      recommendation = `Low supply coverage (${fulfillmentPercentage}%). Additional farmer produce listings needed to fulfill this procurement volume.`;
    }

    return {
      demandId: demand.id,
      commodity: demand.commodity,
      variety: demand.variety || null,
      grade: demand.required_grade || 'GRADE_A',
      deliveryLocation: demand.delivery_location,
      requestedQuantity: reqQty,
      matchedQuantity,
      fulfillmentPercentage,
      averagePrice,
      targetPrice,
      estimatedSavings,
      remainingQuantity,
      farmerCount: contributingFarmers.length,
      farmers: contributingFarmers,
      recommendation
    };
  }
}

module.exports = new SupplyDemandMatcher();

