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
}

module.exports = new SupplyDemandMatcher();
