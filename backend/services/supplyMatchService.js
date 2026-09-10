/**
 * AgriConnect Smart Supply Match Engine
 * 
 * Aggregates produce from multiple authentic farmer listings to satisfy a buyer demand.
 * Calculates deterministic multi-farmer volume allocation, committed quantity subtraction,
 * weighted average produce prices, road freight estimation across 4 vehicle tiers,
 * and total landed costs per kilogram.
 */

const { query } = require('../db');

// Standard Indian commercial vehicle fleet tiers
const VEHICLE_TIERS = [
  { id: 'PICKUP_LCV', label: 'Mini Truck (Tata Ace / Mahindra Bolero)', maxKg: 1500, baseRateKm: 18 },
  { id: 'SMALL_TRUCK', label: 'Small Commercial Truck (Eicher 14ft)', maxKg: 4500, baseRateKm: 28 },
  { id: 'MEDIUM_TRUCK', label: 'Medium Transport Truck (Eicher 19ft / 6-Tyre)', maxKg: 9500, baseRateKm: 42 },
  { id: 'HEAVY_TRUCK', label: 'Heavy Freight Truck (10-Tyre / Multi-Axle)', maxKg: 16000, baseRateKm: 65 }
];

function selectVehicle(weightKg) {
  for (const v of VEHICLE_TIERS) {
    if (weightKg <= v.maxKg) return v;
  }
  return VEHICLE_TIERS[VEHICLE_TIERS.length - 1];
}

function estimateDistance(loc1, loc2) {
  if (!loc1 || !loc2) return 60; // Default regional mandi-to-buyer transit (60 km)
  const l1 = loc1.toLowerCase();
  const l2 = loc2.toLowerCase();
  if (l1 === l2) return 25; // Local intra-city delivery
  // Check if same district/state
  const parts1 = l1.split(',').map(s => s.trim());
  const parts2 = l2.split(',').map(s => s.trim());
  const match = parts1.some(p => p && parts2.includes(p));
  if (match) return 45; // Intra-district or intra-state cluster
  return 120; // Inter-district regional route
}

class SupplyMatchService {
  /**
   * Match and aggregate multi-farmer listings for a given buyer demand ID or parameters.
   */
  async matchSupplyForDemand(demandId) {
    if (!demandId) return null;

    // 1. Fetch authentic buyer demand
    const dRes = await query(
      `SELECT d.*, bp.name as buyer_name, bp.company_name, bp.state as buyer_state,
              bp.district as buyer_district, bp.location as buyer_location
       FROM buyer_demands d
       JOIN buyer_profiles bp ON d.buyer_id = bp.id
       WHERE d.id = $1`,
      [demandId]
    );

    if (dRes.rows.length === 0) return null;
    const demand = dRes.rows[0];
    return this.calculateSupplyMatch(demand);
  }

  /**
   * Pure aggregation calculation over active database produce listings
   */
  async calculateSupplyMatch(demand) {
    const demandId = demand.id;
    const reqQty = parseFloat(demand.required_quantity);
    const targetPrice = parseFloat(demand.target_price) || 0;
    const commodity = (demand.commodity || '').toUpperCase();
    const destination = demand.delivery_location || 'Commercial Hub';

    // 2. Fetch authentic active listings, deducting committed quantities from pending/in-transit orders
    const listingsRes = await query(
      `SELECT l.id as listing_id, l.farmer_id, l.commodity, l.variety, l.grade,
              l.quantity as initial_quantity,
              l.asking_price, l.location, l.state, l.district,
              fp.name as farmer_name, fp.fpo_name, fp.district as farmer_district, fp.state as farmer_state,
              COALESCE(SUM(o.quantity), 0) as committed_quantity
       FROM produce_listings l
       JOIN farmer_profiles fp ON l.farmer_id = fp.id
       LEFT JOIN orders o ON o.listing_id = l.id AND o.order_status IN ('PENDING', 'CONFIRMED', 'PICKUP_READY', 'IN_TRANSIT')
       WHERE UPPER(l.commodity) = $1
         AND l.listing_status = 'ACTIVE'
       GROUP BY l.id, fp.name, fp.fpo_name, fp.district, fp.state
       HAVING (l.quantity - COALESCE(SUM(o.quantity), 0)) > 0
       ORDER BY l.asking_price ASC, (l.quantity - COALESCE(SUM(o.quantity), 0)) DESC`,
      [commodity]
    );

    const listings = listingsRes.rows.map(r => ({
      ...r,
      asking_price: parseFloat(r.asking_price),
      available_quantity: Math.max(0, parseFloat(r.initial_quantity) - parseFloat(r.committed_quantity))
    })).filter(l => l.available_quantity > 0);

    // Empty state: zero matching farmers
    if (listings.length === 0) {
      return {
        demandId,
        commodity: demand.commodity,
        variety: demand.variety || null,
        grade: demand.required_grade || 'GRADE_A',
        deliveryLocation: destination,
        requestedQuantity: reqQty,
        matchedQuantity: 0,
        fulfillmentPercentage: 0,
        remainingQuantity: reqQty,
        farmerCount: 0,
        farmers: [],
        weightedAveragePrice: 0,
        targetPrice,
        produceCost: 0,
        estimatedLogisticsCost: 0,
        estimatedLandedCost: 0,
        landedCostPerKg: 0,
        estimatedSavings: 0,
        recommendedVehicle: 'Mini Truck (Up to 3T)',
        recommendation: 'No matching farmers currently available with active listings for this commodity.'
      };
    }

    // 3. Multi-factor scoring (Price, Grade, Variety, Proximity)
    const scored = listings.map(l => {
      let score = 50;

      // Price alignment: asking <= target gets bonus
      if (targetPrice > 0) {
        if (l.asking_price <= targetPrice) {
          score += 35 + Math.min(20, ((targetPrice - l.asking_price) / targetPrice) * 30);
        } else {
          score -= Math.min(35, ((l.asking_price - targetPrice) / targetPrice) * 35);
        }
      }

      // Grade match
      if (demand.required_grade && l.grade && l.grade.toUpperCase() === demand.required_grade.toUpperCase()) {
        score += 15;
      }

      // Variety match
      if (demand.variety && l.variety && l.variety.toLowerCase() === demand.variety.toLowerCase()) {
        score += 10;
      }

      // Proximity score
      const buyerState = demand.buyer_state || (destination || '').split(',').pop()?.trim();
      if (buyerState && l.state && l.state.toLowerCase() === buyerState.toLowerCase()) {
        score += 15;
        if (demand.buyer_district && l.district && l.district.toLowerCase() === demand.buyer_district.toLowerCase()) {
          score += 10;
        }
      }

      const dist = estimateDistance(l.location || l.district, destination);

      return {
        ...l,
        distanceKm: dist,
        score
      };
    });

    // Sort by primary factors: lowest asking price first, then highest score, then larger quantity
    scored.sort((a, b) => {
      if (Math.abs(a.asking_price - b.asking_price) > 0.01) {
        return a.asking_price - b.asking_price;
      }
      if (Math.abs(b.score - a.score) > 0.1) {
        return b.score - a.score;
      }
      return b.available_quantity - a.available_quantity;
    });

    // 4. Deterministic multi-farmer allocation (Greedy supply consolidation)
    let remaining = reqQty;
    let matched = 0;
    let totalProduceCost = 0;
    let totalWeightedDistance = 0;
    const selectedFarmers = [];

    for (const l of scored) {
      if (remaining <= 0.0001) break;

      const take = Math.min(remaining, l.available_quantity);
      if (take <= 0) continue;

      const contribPct = Math.round((take / reqQty) * 1000) / 10;
      const farmerProduceCost = Math.round(take * l.asking_price * 100) / 100;

      selectedFarmers.push({
        farmerId: l.farmer_id,
        farmerName: l.farmer_name,
        fpoName: l.fpo_name || null,
        listingId: l.listing_id,
        quantity: Math.round(take * 100) / 100,
        askingPrice: l.asking_price,
        contributionPercentage: contribPct,
        location: l.location,
        district: l.district,
        state: l.state,
        grade: l.grade,
        variety: l.variety,
        distanceKm: l.distanceKm,
        lineTotal: farmerProduceCost
      });

      matched += take;
      remaining -= take;
      totalProduceCost += farmerProduceCost;
      totalWeightedDistance += l.distanceKm * take;
    }

    const matchedQuantity = Math.round(matched * 100) / 100;
    const remainingQuantity = Math.max(0, Math.round((reqQty - matched) * 100) / 100);
    const fulfillmentPercentage = Math.min(100, Math.round((matchedQuantity / reqQty) * 1000) / 10);
    const weightedAveragePrice = matchedQuantity > 0 ? Math.round((totalProduceCost / matchedQuantity) * 100) / 100 : 0;

    // 5. Logistics freight and landed cost computation
    const avgDistance = matchedQuantity > 0 ? Math.round(totalWeightedDistance / matchedQuantity) : 50;
    const vehicle = selectVehicle(matchedQuantity);
    const estimatedLogisticsCost = Math.round(avgDistance * vehicle.baseRateKm);
    const estimatedLandedCost = Math.round((totalProduceCost + estimatedLogisticsCost) * 100) / 100;
    const landedCostPerKg = matchedQuantity > 0 ? Math.round((estimatedLandedCost / matchedQuantity) * 100) / 100 : 0;

    // Economic savings compared to buyer target budget
    const estimatedSavings = targetPrice > weightedAveragePrice && matchedQuantity > 0
      ? Math.round((targetPrice - weightedAveragePrice) * matchedQuantity * 100) / 100
      : 0;

    let recommendation = '';
    if (fulfillmentPercentage >= 100) {
      recommendation = `100% fulfillable via ${selectedFarmers.length} verified farmer supplier${selectedFarmers.length > 1 ? 's' : ''} at an average farm-gate rate of ₹${weightedAveragePrice}/kg (Landed: ₹${landedCostPerKg}/kg).`;
    } else if (fulfillmentPercentage >= 50) {
      recommendation = `Partial supply available (${fulfillmentPercentage}% fulfilled with ${matchedQuantity.toLocaleString()} kg). You can proceed with this multi-farmer lot or adjust your budget.`;
    } else {
      recommendation = `Low immediate supply coverage (${fulfillmentPercentage}%). Sourcing ${matchedQuantity.toLocaleString()} kg from ${selectedFarmers.length} farmer(s). Additional local harvest listings required.`;
    }

    return {
      demandId,
      commodity: demand.commodity,
      variety: demand.variety || null,
      grade: demand.required_grade || 'GRADE_A',
      deliveryLocation: destination,
      requestedQuantity: reqQty,
      matchedQuantity,
      fulfillmentPercentage,
      remainingQuantity,
      farmerCount: selectedFarmers.length,
      farmers: selectedFarmers,
      averagePrice: weightedAveragePrice, // backward compatibility with existing components
      weightedAveragePrice,
      targetPrice,
      produceCost: totalProduceCost,
      avgDistanceKm: avgDistance,
      vehicleClass: vehicle.id,
      recommendedVehicle: vehicle.label,
      estimatedLogisticsCost,
      estimatedLandedCost,
      landedCostPerKg,
      estimatedSavings,
      recommendation
    };
  }

  /**
   * Multi-farmer order execution: creates a primary order linked to the demand
   * with individual order_items for each contributing farmer.
   */
  async executeMultiFarmerOrder(demandId, buyerId, deliveryLocation, deliveryMode = 'TRANSPORT_PARTNER') {
    const match = await this.matchSupplyForDemand(demandId);
    if (!match || match.farmers.length === 0) {
      throw new Error('No compatible farmer supply available for this requirement.');
    }

    // Begin multi-farmer order transaction
    const client = await query('BEGIN');
    try {
// 1. Create primary order (destination = buyer-selected demand delivery location;
    //    buyer profile location is never substituted as the delivery destination)
    const dest = deliveryLocation || match.deliveryLocation;
    if (!dest || !String(dest).trim()) {
      throw new Error('Delivery destination is required.');
    }
    const orderRes = await query(
      `INSERT INTO orders (buyer_id, demand_id, quantity, final_price, transport_cost, net_realization, delivery_location, delivery_destination, delivery_mode, order_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'CONFIRMED')
       RETURNING *`,
      [
        buyerId,
        demandId,
        match.matchedQuantity,
        match.weightedAveragePrice,
        match.estimatedLogisticsCost,
        match.produceCost,
        String(dest).trim(),
        String(dest).trim(),
        deliveryMode
      ]
    );
      const order = orderRes.rows[0];

      // 2. Insert order_items for each contributing farmer
      for (const f of match.farmers) {
        await query(
          `INSERT INTO order_items (order_id, produce_listing_id, quantity, price)
           VALUES ($1, $2, $3, $4)`,
          [order.id, f.listingId, f.quantity, f.askingPrice]
        );
      }

      // 3. Mark demand as MATCHED if 100% or update status
      if (match.fulfillmentPercentage >= 100) {
        await query(`UPDATE buyer_demands SET demand_status = 'MATCHED', updated_at = NOW() WHERE id = $1`, [demandId]);
      }

      await query('COMMIT');
      return { success: true, order, match };
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }
  }
}

module.exports = new SupplyMatchService();
