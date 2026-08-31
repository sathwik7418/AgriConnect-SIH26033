const { query } = require('./db');
const bcrypt = require('bcryptjs');

async function seed() {
  console.log('Seeding database...');
  
  const password = await bcrypt.hash('password123', 10);

  // Users
  const users = [
    { email: 'ramesh@farmer.com', password, role: 'FARMER', phone: '9876543210' },
    { email: 'suresh@farmer.com', password, role: 'FARMER', phone: '9876543211' },
    { email: 'priya@farmer.com', password, role: 'FARMER', phone: '9876543212' },
    { email: 'mahesh@farmer.com', password, role: 'FARMER', phone: '9876543213' },
    { email: 'sunita@farmer.com', password, role: 'FARMER', phone: '9876543214' },
    { email: 'bigbasket@buyer.com', password, role: 'BUYER', phone: '9123456780' },
    { email: 'reliance@buyer.com', password, role: 'BUYER', phone: '9123456781' },
    { email: 'dmart@buyer.com', password, role: 'BUYER', phone: '9123456782' },
    { email: 'vishal@buyer.com', password, role: 'BUYER', phone: '9123456783' },
    { email: 'rahul@consumer.com', password, role: 'CONSUMER', phone: '9123456790' },
    { email: 'admin@sih26033.com', password, role: 'ADMIN', phone: '9123456799' },
  ];

  const userIds = [];
  for (const u of users) {
    const r = await query(
      'INSERT INTO users (email, password, role, phone, is_verified) VALUES ($1, $2, $3, $4, TRUE) RETURNING id, role',
      [u.email, u.password, u.role, u.phone]
    );
    userIds.push(r.rows[0]);
  }
  console.log(`Created ${userIds.length} users`);

  // Farmer profiles
  const farmers = [
    { userId: userIds[0].id, name: 'Ramesh Kumar', state: 'Maharashtra', district: 'Pune', totalLandArea: 5, crops: ['TOMATO', 'ONION', 'POTATO'], contactNumber: '9876543210' },
    { userId: userIds[1].id, name: 'Suresh Patil', state: 'Maharashtra', district: 'Nashik', totalLandArea: 8, crops: ['ONION', 'WHEAT'], contactNumber: '9876543211' },
    { userId: userIds[2].id, name: 'Priya Devi', state: 'Karnataka', district: 'Bangalore Rural', totalLandArea: 3, crops: ['TOMATO', 'BRINJAL', 'LETTUCE'], contactNumber: '9876543212' },
    { userId: userIds[3].id, name: 'Mahesh Singh', state: 'Madhya Pradesh', district: 'Indore', totalLandArea: 10, crops: ['WHEAT', 'RICE', 'CORN'], contactNumber: '9876543213' },
    { userId: userIds[4].id, name: 'Sunita Bai', state: 'Rajasthan', district: 'Jaipur', totalLandArea: 4, crops: ['MANGO', 'BANANA', 'APPLE'], contactNumber: '9876543214' },
  ];

  const farmerIds = [];
  for (const f of farmers) {
    const r = await query(
      'INSERT INTO farmer_profiles (user_id, name, state, district, total_land_area, crops, contact_number) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [f.userId, f.name, f.state, f.district, f.totalLandArea, f.crops, f.contactNumber]
    );
    farmerIds.push(r.rows[0].id);
  }
  console.log(`Created ${farmerIds.length} farmer profiles`);

  // Buyer profiles
  const buyers = [
    { userId: userIds[5].id, name: 'BigBasket', companyName: 'BigBasket Pvt Ltd', organizationType: 'retail_chain', state: 'Karnataka', district: 'Bangalore Urban', location: 'Bangalore', annualCapacity: 100000, contactNumber: '9123456780' },
    { userId: userIds[6].id, name: 'Reliance Fresh', companyName: 'Reliance Retail', organizationType: 'retail_chain', state: 'Maharashtra', district: 'Mumbai', location: 'Mumbai', annualCapacity: 200000, contactNumber: '9123456781' },
    { userId: userIds[7].id, name: 'DMart', companyName: 'Avenue Supermarts', organizationType: 'retail_chain', state: 'Maharashtra', district: 'Mumbai', location: 'Mumbai', annualCapacity: 150000, contactNumber: '9123456782' },
    { userId: userIds[8].id, name: 'Vishal Megamart', companyName: 'Vishal Retail', organizationType: 'bulk_buyer', state: 'Delhi', district: 'New Delhi', location: 'Delhi', annualCapacity: 80000, contactNumber: '9123456783' },
  ];

  const buyerIds = [];
  for (const b of buyers) {
    const r = await query(
      'INSERT INTO buyer_profiles (user_id, name, company_name, organization_type, state, district, location, annual_capacity, contact_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [b.userId, b.name, b.companyName, b.organizationType, b.state, b.district, b.location, b.annualCapacity, b.contactNumber]
    );
    buyerIds.push(r.rows[0].id);
  }
  console.log(`Created ${buyerIds.length} buyer profiles`);

  // Consumer profile
  await query(
    'INSERT INTO consumer_profiles (user_id, name, email, address, preferences) VALUES ($1, $2, $3, $4, $5)',
    [userIds[9].id, 'Rahul Verma', 'rahul@consumer.com', 'Delhi', JSON.stringify({ preferredCommodities: ['TOMATO', 'POTATO'], deliveryRadius: 5 })]
  );
  console.log('Created 1 consumer profile');

  // Produce listings
  const listings = [
    { farmerId: farmerIds[0], commodity: 'TOMATO', variety: 'Roma', grade: 'GRADE_A', quantity: 200, askingPrice: 40, location: 'Pune', state: 'Maharashtra', district: 'Pune' },
    { farmerId: farmerIds[0], commodity: 'ONION', variety: 'Red', grade: 'GRADE_B', quantity: 500, askingPrice: 25, location: 'Pune', state: 'Maharashtra', district: 'Pune' },
    { farmerId: farmerIds[0], commodity: 'POTATO', variety: 'Regular', grade: 'GRADE_A', quantity: 300, askingPrice: 20, location: 'Pune', state: 'Maharashtra', district: 'Pune' },
    { farmerId: farmerIds[1], commodity: 'ONION', variety: 'White', grade: 'PREMIUM', quantity: 400, askingPrice: 35, location: 'Nashik', state: 'Maharashtra', district: 'Nashik' },
    { farmerId: farmerIds[1], commodity: 'WHEAT', variety: 'Sharbati', grade: 'PREMIUM', quantity: 1000, askingPrice: 28, location: 'Nashik', state: 'Maharashtra', district: 'Nashik' },
    { farmerId: farmerIds[2], commodity: 'TOMATO', variety: 'Cherry', grade: 'PREMIUM', quantity: 100, askingPrice: 60, location: 'Bangalore', state: 'Karnataka', district: 'Bangalore Rural' },
    { farmerId: farmerIds[2], commodity: 'BRINJAL', variety: 'Black Beauty', grade: 'GRADE_A', quantity: 150, askingPrice: 30, location: 'Bangalore', state: 'Karnataka', district: 'Bangalore Rural' },
    { farmerId: farmerIds[2], commodity: 'LETTUCE', variety: 'Iceberg', grade: 'GRADE_A', quantity: 80, askingPrice: 45, location: 'Bangalore', state: 'Karnataka', district: 'Bangalore Rural' },
    { farmerId: farmerIds[3], commodity: 'WHEAT', variety: 'HD-2967', grade: 'GRADE_A', quantity: 2000, askingPrice: 22, location: 'Indore', state: 'Madhya Pradesh', district: 'Indore' },
    { farmerId: farmerIds[3], commodity: 'RICE', variety: 'Basmati', grade: 'PREMIUM', quantity: 1500, askingPrice: 45, location: 'Indore', state: 'Madhya Pradesh', district: 'Indore' },
    { farmerId: farmerIds[3], commodity: 'CORN', variety: 'Sweet Corn', grade: 'GRADE_B', quantity: 800, askingPrice: 18, location: 'Indore', state: 'Madhya Pradesh', district: 'Indore' },
    { farmerId: farmerIds[4], commodity: 'MANGO', variety: 'Alphonso', grade: 'PREMIUM', quantity: 500, askingPrice: 120, location: 'Jaipur', state: 'Rajasthan', district: 'Jaipur' },
    { farmerId: farmerIds[4], commodity: 'BANANA', variety: 'Cavendish', grade: 'GRADE_A', quantity: 600, askingPrice: 25, location: 'Jaipur', state: 'Rajasthan', district: 'Jaipur' },
    { farmerId: farmerIds[4], commodity: 'APPLE', variety: 'Shimla', grade: 'GRADE_A', quantity: 300, askingPrice: 80, location: 'Jaipur', state: 'Rajasthan', district: 'Jaipur' },
  ];

  const listingIds = [];
  for (const l of listings) {
    const r = await query(
      `INSERT INTO produce_listings (farmer_id, commodity, variety, grade, quantity, asking_price, location, state, district) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [l.farmerId, l.commodity, l.variety, l.grade, l.quantity, l.askingPrice, l.location, l.state, l.district]
    );
    listingIds.push(r.rows[0].id);
  }
  console.log(`Created ${listingIds.length} produce listings`);

  // Buyer demands
  const demands = [
    { buyerId: buyerIds[0], commodity: 'TOMATO', requiredQuantity: 500, targetPrice: 35, deliveryLocation: 'Bangalore' },
    { buyerId: buyerIds[0], commodity: 'ONION', requiredQuantity: 1000, targetPrice: 22, deliveryLocation: 'Bangalore' },
    { buyerId: buyerIds[1], commodity: 'TOMATO', requiredQuantity: 2000, targetPrice: 38, deliveryLocation: 'Mumbai' },
    { buyerId: buyerIds[1], commodity: 'POTATO', requiredQuantity: 1500, targetPrice: 18, deliveryLocation: 'Mumbai' },
    { buyerId: buyerIds[1], commodity: 'RICE', requiredQuantity: 3000, targetPrice: 40, deliveryLocation: 'Mumbai' },
    { buyerId: buyerIds[2], commodity: 'ONION', requiredQuantity: 1500, targetPrice: 20, deliveryLocation: 'Mumbai' },
    { buyerId: buyerIds[2], commodity: 'WHEAT', requiredQuantity: 2000, targetPrice: 25, deliveryLocation: 'Mumbai' },
    { buyerId: buyerIds[3], commodity: 'MANGO', requiredQuantity: 800, targetPrice: 100, deliveryLocation: 'Delhi' },
    { buyerId: buyerIds[3], commodity: 'APPLE', requiredQuantity: 500, targetPrice: 70, deliveryLocation: 'Delhi' },
    { buyerId: buyerIds[3], commodity: 'WHEAT', requiredQuantity: 5000, targetPrice: 21, deliveryLocation: 'Delhi' },
  ];

  for (const d of demands) {
    await query(
      `INSERT INTO buyer_demands (buyer_id, commodity, required_quantity, target_price, delivery_location) 
       VALUES ($1, $2, $3, $4, $5)`,
      [d.buyerId, d.commodity, d.requiredQuantity, d.targetPrice, d.deliveryLocation]
    );
  }
  console.log(`Created ${demands.length} buyer demands`);

  // Market prices (simulated government mandi data)
  const states = ['Maharashtra', 'Karnataka', 'Madhya Pradesh', 'Rajasthan', 'Delhi'];
  const markets = ['Pune', 'Nashik', 'Bangalore', 'Indore', 'Jaipur', 'Delhi'];
  const commodities = ['TOMATO', 'ONION', 'POTATO', 'WHEAT', 'RICE'];
  
  for (const commodity of commodities) {
    for (const state of states) {
      for (const market of markets) {
        const basePrice = commodity === 'TOMATO' ? 40 : commodity === 'ONION' ? 25 : commodity === 'POTATO' ? 20 : commodity === 'WHEAT' ? 25 : 40;
        const variation = Math.floor(Math.random() * 15) - 7;
        const modalPrice = basePrice + variation;
        const minPrice = modalPrice - Math.floor(Math.random() * 10);
        const maxPrice = modalPrice + Math.floor(Math.random() * 10);
        
        await query(
          `INSERT INTO market_prices (state, district, market, commodity, modal_price, min_price, max_price, source, arrival_date, data_freshness)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'seed_demo', NOW(), 'fresh')`,
          [state, market, market, commodity, modalPrice, minPrice, maxPrice]
        );
      }
    }
  }
  console.log('Created market prices for all states/markets/commodities');

  // Forecasts
  const forecastData = [
    { commodity: 'TOMATO', location: 'Maharashtra', predictedDemand: 15000, confidenceScore: 85 },
    { commodity: 'ONION', location: 'Maharashtra', predictedDemand: 25000, confidenceScore: 90 },
    { commodity: 'WHEAT', location: 'Madhya Pradesh', predictedDemand: 50000, confidenceScore: 88 },
    { commodity: 'RICE', location: 'Karnataka', predictedDemand: 20000, confidenceScore: 82 },
    { commodity: 'MANGO', location: 'Rajasthan', predictedDemand: 8000, confidenceScore: 75 },
    { commodity: 'TOMATO', location: 'Karnataka', predictedDemand: 12000, confidenceScore: 87 },
    { commodity: 'POTATO', location: 'Delhi', predictedDemand: 18000, confidenceScore: 92 },
    { commodity: 'ONION', location: 'Rajasthan', predictedDemand: 10000, confidenceScore: 80 },
  ];

  for (const f of forecastData) {
    await query(
      `INSERT INTO forecasts (commodity, location, forecast_horizon, predicted_demand, confidence_score, model_version, notes, data_source)
       VALUES ($1, $2, 'next_7_days', $3, $4, 'DEMO', 'Synthetic forecast data for demo — no historical data loaded', 'seed_demo')`,
      [f.commodity, f.location, f.predictedDemand, f.confidenceScore]
    );
  }
  console.log(`Created ${forecastData.length} forecasts`);

  // Routes
  const routeData = [
    { origin: 'Pune', destination: 'Mumbai', distanceKm: 150, estimatedTime: '3 hours', estimatedCost: 2500, vehicleType: 'truck_1ton' },
    { origin: 'Nashik', destination: 'Mumbai', distanceKm: 200, estimatedTime: '4 hours', estimatedCost: 3000, vehicleType: 'truck_1ton' },
    { origin: 'Bangalore', destination: 'Chennai', distanceKm: 350, estimatedTime: '6 hours', estimatedCost: 5000, vehicleType: 'truck_5ton' },
    { origin: 'Indore', destination: 'Delhi', distanceKm: 800, estimatedTime: '12 hours', estimatedCost: 12000, vehicleType: 'truck_5ton' },
    { origin: 'Jaipur', destination: 'Delhi', distanceKm: 280, estimatedTime: '5 hours', estimatedCost: 4000, vehicleType: 'truck_1ton' },
    { origin: 'Pune', destination: 'Bangalore', distanceKm: 850, estimatedTime: '13 hours', estimatedCost: 13000, vehicleType: 'truck_5ton' },
  ];

  for (const r of routeData) {
    await query(
      `INSERT INTO routes (origin, destination, distance_km, estimated_time, estimated_cost, vehicle_type) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [r.origin, r.destination, r.distanceKm, r.estimatedTime, r.estimatedCost, r.vehicleType]
    );
  }
  console.log(`Created ${routeData.length} routes`);

  // Impact metrics
  const now = new Date();
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

  const metrics = [
    { metricType: 'farmers_connected', metricValue: 150, unit: 'count' },
    { metricType: 'buyers_connected', metricValue: 25, unit: 'count' },
    { metricType: 'orders_completed', metricValue: 340, unit: 'count' },
    { metricType: 'total_trade_value', metricValue: 8500000, unit: 'INR' },
    { metricType: 'avg_farmer_income_increase', metricValue: 22, unit: 'percent' },
    { metricType: 'transport_cost_saved', metricValue: 1200000, unit: 'INR' },
    { metricType: 'avg_delivery_time', metricValue: 2.5, unit: 'days' },
    { metricType: 'waste_reduction', metricValue: 15, unit: 'percent' },
  ];

  for (const m of metrics) {
    await query(
      'INSERT INTO impact_metrics (metric_type, metric_value, unit, period_start, period_end) VALUES ($1, $2, $3, $4, $5)',
      [m.metricType, m.metricValue, m.unit, periodStart, now]
    );
  }
  console.log(`Created ${metrics.length} impact metrics`);

  // A few orders
  const orderData = [
    { buyerId: buyerIds[0], listingId: listingIds[0], quantity: 100, finalPrice: 40, deliveryLocation: 'Bangalore' },
    { buyerId: buyerIds[1], listingId: listingIds[3], quantity: 200, finalPrice: 35, deliveryLocation: 'Mumbai' },
    { buyerId: buyerIds[2], listingId: listingIds[1], quantity: 300, finalPrice: 25, deliveryLocation: 'Mumbai' },
  ];

  for (const o of orderData) {
    const totalRevenue = o.finalPrice * o.quantity;
    const transportCost = 500;
    const netRealization = totalRevenue - transportCost;
    await query(
      `INSERT INTO orders (buyer_id, listing_id, quantity, final_price, transport_cost, net_realization, delivery_location, order_status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETED')`,
      [o.buyerId, o.listingId, o.quantity, o.finalPrice, transportCost, netRealization, o.deliveryLocation]
    );
  }
  console.log(`Created ${orderData.length} completed orders`);

  console.log('\nSeed completed successfully!');
  console.log('\nTest credentials:');
  console.log('  Farmer: ramesh@farmer.com / password123');
  console.log('  Buyer:  bigbasket@buyer.com / password123');
  console.log('  Admin:  admin@sih26033.com / password123');
  
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
