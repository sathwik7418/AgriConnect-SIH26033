const assert = require('assert');
const { query } = require('../db');
const rp = require('../providers/routing');

const BASE_URL = 'http://localhost:5001/api';

async function runRegression() {
  console.log('🏁 Starting Comprehensive E2E Regression Suite...\n');

  const rand = Math.floor(Math.random() * 1000000);
  const farmerEmail = `farmer_reg_${rand}@test.com`;
  const buyerEmail = `buyer_reg_${rand}@test.com`;
  const consumerEmail = `consumer_reg_${rand}@test.com`;
  const passwordValid = 'SecurePassword@123';
  const passwordWeak = '123';

  // 1. Invalid registration input check
  console.log('Test 1: Weak Password & Malformed Email');
  const regBadPass = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: farmerEmail, password: passwordWeak, role: 'FARMER', name: 'Farmer Bob' })
  });
  assert.strictEqual(regBadPass.status, 400);
  const regBadPassBody = await regBadPass.json();
  assert.ok(regBadPassBody.error.includes('Password'), 'Should reject weak password');

  const regBadEmail = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bademail', password: passwordValid, role: 'FARMER', name: 'Farmer Bob' })
  });
  assert.strictEqual(regBadEmail.status, 400);
  console.log('✅ Weak password and bad email rejected successfully.');

  // 2. Successful Registration
  console.log('\nTest 2: Successful Registration & Verification Status');
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: farmerEmail, password: passwordValid, role: 'FARMER', name: 'Farmer Bob' })
  });
  assert.strictEqual(regRes.status, 201);
  const regBody = await regRes.json();
  assert.strictEqual(regBody.requiresVerification, true);
  const devOtp = regBody.devOtp;
  assert.ok(devOtp, 'Development OTP must be present');
  console.log(`✅ Registration response returned dev OTP: ${devOtp}`);

  // Verify database record is unverified
  const dbUser = await query('SELECT * FROM users WHERE email = $1', [farmerEmail]);
  assert.strictEqual(dbUser.rows.length, 1);
  assert.strictEqual(dbUser.rows[0].is_verified, false, 'User must initially be unverified');
  console.log('✅ PostgreSQL user record created in unverified state.');

  // 3. Unverified User Login Attempt
  console.log('\nTest 3: Block Login of Unverified Account');
  const loginUnv = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: farmerEmail, password: passwordValid })
  });
  assert.strictEqual(loginUnv.status, 403, 'Unverified accounts must be forbidden');
  console.log('✅ Unverified login blocked successfully.');

  // 4. Invalid OTP Attempt & Lockout
  console.log('\nTest 4: Wrong OTP limit & lockouts');
  for (let i = 1; i <= 3; i++) {
    const wrongRes = await fetch(`${BASE_URL}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: farmerEmail, otp: '000000' })
    });
    const wrongBody = await wrongRes.json();
    assert.strictEqual(wrongRes.status, 400);
    if (i === 3) {
      assert.ok(wrongBody.error.includes('Too many incorrect attempts'), 'Third attempt should lock user out');
    }
  }
  console.log('✅ Lockout triggered on third wrong OTP attempt.');

  // Verify correct OTP fails after lockout
  const postLockoutRes = await fetch(`${BASE_URL}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: farmerEmail, otp: devOtp })
  });
  assert.strictEqual(postLockoutRes.status, 400, 'Locked account must reject correct OTP');
  console.log('✅ Correct OTP rejected on locked account.');

  // 5. Cooldown Check
  console.log('\nTest 5: Resend Cooldown Check');
  const resendCooldown = await fetch(`${BASE_URL}/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: farmerEmail })
  });
  assert.strictEqual(resendCooldown.status, 429, 'Subsequent OTP resends within cooldown window must reject');
  console.log('✅ Resend cooldown rate limit triggered.');

  // Reset attempt count and cooldown to allow E2E progression
  await query('UPDATE users SET otp_attempts = 0, otp_cooldown_until = NULL WHERE email = $1', [farmerEmail]);
  
  // Request a fresh OTP since the lockout test invalidated the previous one
  const freshOtpRes = await fetch(`${BASE_URL}/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: farmerEmail })
  });
  if (freshOtpRes.status !== 200) {
    const errBody = await freshOtpRes.json();
    console.error('DEBUG: freshOtpRes failed with status:', freshOtpRes.status, 'body:', errBody);
  }
  assert.strictEqual(freshOtpRes.status, 200);
  const freshOtpBody = await freshOtpRes.json();
  const freshOtp = freshOtpBody.devOtp;
  assert.ok(freshOtp, 'Fresh OTP must be generated');

  // 6. Verify successful validation & login session
  console.log('\nTest 6: Valid OTP Submission');
  const verifyRes = await fetch(`${BASE_URL}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: farmerEmail, otp: freshOtp })
  });
  assert.strictEqual(verifyRes.status, 200);
  const verifyBody = await verifyRes.json();
  const farmerToken = verifyBody.token;
  assert.ok(farmerToken);
  console.log('✅ Email verified successfully with fresh OTP.');

  // 7. Onboarding - Location Validation & Coordinate Storage
  console.log('\nTest 7: Farmer Onboarding (Location Geocoding)');
  // Bad location onboarding must fail
  const onboardBadLoc = await fetch(`${BASE_URL}/profiles/onboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${farmerToken}` },
    body: JSON.stringify({
      name: 'Bob',
      state: 'nonexistent_state',
      district: 'nonexistent_district',
      location: 'nonexistent_location',
      contactNumber: '9999999999'
    })
  });
  assert.strictEqual(onboardBadLoc.status, 400);
  console.log('✅ Onboarding with invalid location rejected.');

  // Good location onboarding
  const onboardGoodLoc = await fetch(`${BASE_URL}/profiles/onboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${farmerToken}` },
    body: JSON.stringify({
      name: 'Bob',
      state: 'Maharashtra',
      district: 'Pune',
      location: 'Pune City',
      contactNumber: '9999999999'
    })
  });
  assert.strictEqual(onboardGoodLoc.status, 201);
  const farmerProfile = (await onboardGoodLoc.json()).profile;
  assert.ok(farmerProfile.latitude);
  assert.ok(farmerProfile.longitude);
  console.log(`✅ Good location onboarded. Coordinates stored: ${farmerProfile.latitude}, ${farmerProfile.longitude}`);

  // 8. New Profile Stats Isolation
  console.log('\nTest 8: New Farmer Stats Baseline (Zero Seed Isolation)');
  const statsRes = await fetch(`${BASE_URL}/dashboard/stats`, {
    headers: { 'Authorization': `Bearer ${farmerToken}` }
  });
  assert.strictEqual(statsRes.status, 200);
  const statsBody = await statsRes.json();
  assert.strictEqual(statsBody.totalListings, 0);
  assert.strictEqual(statsBody.totalSales, 0);
  console.log('✅ Fresh farmer dashboard isolates seeded metrics successfully (starts clean at 0).');

  // 9. Listing Creation & Location Pre-population
  console.log('\nTest 9: Listing Creation');
  const listRes = await fetch(`${BASE_URL}/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${farmerToken}` },
    body: JSON.stringify({
      commodity: 'TOMATO',
      variety: 'Hybrid',
      grade: 'GRADE_A',
      quantity: 500,
      askingPrice: 35,
      description: 'Fresh organic tomatoes'
    })
  });
  assert.strictEqual(listRes.status, 201);
  const listing = await listRes.json();
  assert.strictEqual(listing.location, 'Pune City', 'Listing should inherit farmer profile location');
  assert.strictEqual(parseFloat(listing.latitude), parseFloat(farmerProfile.latitude), 'Listing should inherit coordinates');
  console.log('✅ Listing pre-populated location and coordinates correctly.');

  // 10. Buyer Onboarding & Demands
  console.log('\nTest 10: Buyer Onboarding & Demand isolation');
  // Register & verify buyer
  const regBuyerRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: buyerEmail, password: passwordValid, role: 'BUYER', name: 'Buyer Alice' })
  });
  const buyerOtp = (await regBuyerRes.json()).devOtp;
  const buyerVerifyRes = await fetch(`${BASE_URL}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: buyerEmail, otp: buyerOtp })
  });
  const buyerToken = (await buyerVerifyRes.json()).token;

  // Onboard buyer
  const buyerOnboardRes = await fetch(`${BASE_URL}/profiles/onboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${buyerToken}` },
    body: JSON.stringify({
      name: 'Alice',
      state: 'Maharashtra',
      district: 'Mumbai',
      location: 'Mumbai Central',
      contactNumber: '8888888888',
      companyName: 'OrganicFoods Corp',
      organizationType: 'bulk_buyer',
      annualCapacity: 5000
    })
  });
  assert.strictEqual(buyerOnboardRes.status, 201);
  const buyerProfile = (await buyerOnboardRes.json()).profile;
  console.log('✅ Buyer onboarded successfully.');

  // Create demand
  const demandRes = await fetch(`${BASE_URL}/demands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${buyerToken}` },
    body: JSON.stringify({
      commodity: 'TOMATO',
      requiredQuantity: 200,
      targetPrice: 40,
      deliveryLocation: 'Mumbai Central',
      requiredGrade: 'GRADE_A'
    })
  });
  assert.strictEqual(demandRes.status, 201);
  console.log('✅ Buyer demand created successfully.');

  // Check buyer stats isolation
  const buyerStatsRes = await fetch(`${BASE_URL}/dashboard/stats`, {
    headers: { 'Authorization': `Bearer ${buyerToken}` }
  });
  const buyerStats = await buyerStatsRes.json();
  assert.strictEqual(buyerStats.totalSpent, 0);
  assert.strictEqual(buyerStats.totalOrders, 0);
  console.log('✅ Buyer stats verified clean.');

  // 11. Consumer Onboarding (Unified buying profiles validation)
  console.log('\nTest 11: Consumer Onboarding (Unified buy architecture)');
  const regConsumerRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: consumerEmail, password: passwordValid, role: 'CONSUMER', name: 'Consumer Rahul' })
  });
  const consumerOtp = (await regConsumerRes.json()).devOtp;
  const consumerVerifyRes = await fetch(`${BASE_URL}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: consumerEmail, otp: consumerOtp })
  });
  const consumerToken = (await consumerVerifyRes.json()).token;

  // Onboard consumer
  const consumerOnboardRes = await fetch(`${BASE_URL}/profiles/onboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${consumerToken}` },
    body: JSON.stringify({
      name: 'Rahul',
      state: 'Maharashtra',
      district: 'Pune',
      location: 'Pune University Road',
      contactNumber: '7777777777'
    })
  });
  assert.strictEqual(consumerOnboardRes.status, 201);
  const consumerProfile = (await consumerOnboardRes.json()).profile;
  
  // Verify consumer profile resides in buyer_profiles table with organization_type INDIVIDUAL
  const dbConsumerCheck = await query('SELECT * FROM buyer_profiles WHERE user_id = (SELECT id FROM users WHERE email = $1)', [consumerEmail]);
  assert.strictEqual(dbConsumerCheck.rows.length, 1);
  assert.strictEqual(dbConsumerCheck.rows[0].organization_type, 'INDIVIDUAL', 'Consumer must be registered in buyer_profiles as INDIVIDUAL');
  console.log('✅ Verified Consumer registered in buyer_profiles as INDIVIDUAL.');

  // 12. Marketplace Discovery
  console.log('\nTest 12: Marketplace Listing Discovery');
  const marketListingsRes = await fetch(`${BASE_URL}/listings`);
  const marketListings = await marketListingsRes.json();
  const foundListing = marketListings.find(l => l.id === listing.id);
  assert.ok(foundListing, 'Farmer listing should be discoverable in the marketplace');
  console.log('✅ Listing discovered in public marketplace search.');

  // 13. Route Estimate (Before order creation, Transient validation)
  console.log('\nTest 13: Route Estimate Transient Verification');
  // Get initial row counts for orders and routes
  const initialOrdersCount = parseInt((await query('SELECT COUNT(*) FROM orders')).rows[0].count);
  const initialRoutesCount = parseInt((await query('SELECT COUNT(*) FROM routes')).rows[0].count);

  const estimateRes = await fetch(`${BASE_URL}/routes/estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${buyerToken}` },
    body: JSON.stringify({
      origin: listing.location,
      destination: buyerProfile.location
    })
  });
  assert.strictEqual(estimateRes.status, 200);
  const estimate = await estimateRes.json();
  assert.ok(estimate.distanceKm);
  assert.ok(estimate.estimatedCost);
  console.log(`✅ Transient route estimated: ${estimate.distanceKm} km, Cost: Rs ${estimate.estimatedCost}`);

  // Verify no new db rows created
  const postEstimateOrdersCount = parseInt((await query('SELECT COUNT(*) FROM orders')).rows[0].count);
  const postEstimateRoutesCount = parseInt((await query('SELECT COUNT(*) FROM routes')).rows[0].count);
  assert.strictEqual(postEstimateOrdersCount, initialOrdersCount, 'Estimate must not insert order records');
  assert.strictEqual(postEstimateRoutesCount, initialRoutesCount, 'Estimate must not insert route records');
  console.log('✅ Confirmed zero database persistence during route estimation.');

  // 13b. Invalid geocoding / route estimation during checkout verification
  console.log('\nTest 13b: Invalid Geocoding & Order Rejection Check');
  const badOrderRes = await fetch(`${BASE_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${buyerToken}` },
    body: JSON.stringify({
      listingId: listing.id,
      quantity: 10,
      deliveryLocation: 'UnverifiableLoc@@@@'
    })
  });
  assert.strictEqual(badOrderRes.status, 400, 'Must reject order placement with invalid location');
  const badOrderData = await badOrderRes.json();
  assert.strictEqual(badOrderData.error, "We couldn't verify this location. Please check the address.", 'Should return correct location verification message');
  console.log('✅ Correctly blocked order creation for unverifiable destination address.');

  // 13c. BUYER_PICKUP order placement and transport cost verification
  console.log('\nTest 13c: BUYER_PICKUP Order Placement & Free Transport check');
  const pickupOrderRes = await fetch(`${BASE_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${buyerToken}` },
    body: JSON.stringify({
      listingId: listing.id,
      quantity: 10,
      deliveryLocation: buyerProfile.location,
      deliveryMode: 'BUYER_PICKUP'
    })
  });
  assert.strictEqual(pickupOrderRes.status, 201, 'Should place BUYER_PICKUP order successfully');
  const pickupOrder = await pickupOrderRes.json();
  assert.strictEqual(parseFloat(pickupOrder.transport_cost), 0, 'Transport cost for BUYER_PICKUP must be 0');
  console.log('✅ Successfully placed BUYER_PICKUP order and locked transport cost at ₹0.');

  // 14. Order Placement (Server-side routing & transport cost calculation)
  console.log('\nTest 14: Order Placement & Route Lock');
  const orderRes = await fetch(`${BASE_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${buyerToken}` },
    body: JSON.stringify({
      listingId: listing.id,
      quantity: 100,
      deliveryLocation: buyerProfile.location
    })
  });
  assert.strictEqual(orderRes.status, 201);
  const order = await orderRes.json();
  
  // Verify route row was created and linked to order_id
  const dbRoute = await query('SELECT * FROM routes WHERE order_id = $1', [order.id]);
  assert.strictEqual(dbRoute.rows.length, 1);
  assert.strictEqual(parseFloat(dbRoute.rows[0].estimated_cost), parseFloat(order.transport_cost));
  console.log(`✅ Order placed and route locked successfully. Linked Route ID: ${dbRoute.rows[0].id}`);

  // 14a. Notification & Privacy Verification
  console.log('\nTest 14a: Notification & Phone Number Privacy Check');
  const farmerNotifications = await query('SELECT * FROM notifications WHERE user_id = (SELECT id FROM users WHERE email = $1)', [farmerEmail]);
  assert.ok(farmerNotifications.rows.length > 0, 'Notification must be created for the farmer');
  assert.strictEqual(farmerNotifications.rows[0].type, 'NEW_ORDER');
  console.log('✅ In-app notification successfully created for farmer.');

  const buyerOrdersRes = await fetch(`${BASE_URL}/orders/buyer/${buyerProfile.id}`, {
    headers: { 'Authorization': `Bearer ${buyerToken}` }
  });
  const buyerOrders = await buyerOrdersRes.json();
  const pendingOrder = buyerOrders.find(o => o.id === order.id);
  assert.strictEqual(pendingOrder.farmer_phone, null, 'Farmer phone must be masked/null for PENDING orders');
  console.log('✅ Farmer contact details successfully masked on PENDING.');

  // 14b. Order Status Machine & Transition Checks
  console.log('\nTest 14b: Order Status Transitions (PENDING -> CONFIRMED -> PICKUP_READY -> IN_TRANSIT)');
  const confirmRes = await fetch(`${BASE_URL}/orders/${order.id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${farmerToken}` },
    body: JSON.stringify({ status: 'CONFIRMED' })
  });
  assert.strictEqual(confirmRes.status, 200, 'Farmer must be able to confirm order');

  const buyerOrdersConfirmedRes = await fetch(`${BASE_URL}/orders/buyer/${buyerProfile.id}`, {
    headers: { 'Authorization': `Bearer ${buyerToken}` }
  });
  const buyerOrdersConfirmed = await buyerOrdersConfirmedRes.json();
  const confirmedOrder = buyerOrdersConfirmed.find(o => o.id === order.id);
  assert.ok(confirmedOrder.farmer_phone !== null, 'Farmer phone must be revealed for CONFIRMED orders');
  console.log('✅ Farmer contact details successfully revealed on CONFIRMED.');

  const pickupReadyRes = await fetch(`${BASE_URL}/orders/${order.id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${farmerToken}` },
    body: JSON.stringify({ status: 'PICKUP_READY' })
  });
  assert.strictEqual(pickupReadyRes.status, 200, 'Farmer must be able to mark ready for pickup');
  console.log('✅ Order successfully transitioned to PICKUP_READY.');

  const inTransitRes = await fetch(`${BASE_URL}/orders/${order.id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${farmerToken}` },
    body: JSON.stringify({ status: 'IN_TRANSIT' })
  });
  assert.strictEqual(inTransitRes.status, 200, 'Farmer must be able to dispatch order');
  console.log('✅ Order successfully transitioned to IN_TRANSIT.');

  // 15. Listing Quantity Deduction
  console.log('\nTest 15: Quantity Deduction Check');
  const updatedListingRes = await query('SELECT quantity FROM produce_listings WHERE id = $1', [listing.id]);
  assert.strictEqual(parseFloat(updatedListingRes.rows[0].quantity), 390, 'Listing stock quantity should decrement from 500 to 390');
  console.log('✅ Listing quantity decremented correctly.');

  // 16. Logistics Privacy Checks
  console.log('\nTest 16: Logistics Privacy (Attempting ID Manipulation)');
  const otherUserReg = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `other_buyer_${rand}@test.com`, password: passwordValid, role: 'BUYER', name: 'Other Buyer' })
  });
  const otherOtp = (await otherUserReg.json()).devOtp;
  const otherVerify = await fetch(`${BASE_URL}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `other_buyer_${rand}@test.com`, otp: otherOtp })
  });
  const otherToken = (await otherVerify.json()).token;

  // Attempt to fetch routes as User B
  const routesResB = await fetch(`${BASE_URL}/routes`, {
    headers: { 'Authorization': `Bearer ${otherToken}` }
  });
  const routesB = await routesResB.json();
  const routeFound = routesB.find(r => r.order_id === order.id);
  assert.ok(!routeFound, 'User B must not see logistics routes of User A');
  console.log('✅ Route privacy successfully enforced (User B blocked).');

  // 17. Admin Authorizations (APMC Sync block)
  console.log('\nTest 17: Admin Authorization Check (Sync Block)');
  const syncResNonAdmin = await fetch(`${BASE_URL}/market-data/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${buyerToken}` }
  });
  assert.strictEqual(syncResNonAdmin.status, 403, 'APMC Sync must be forbidden for non-admins');
  console.log('✅ Non-admin APMC Sync access blocked successfully.');

  // 18. Localized Market Price Intelligence & Fallback check
  console.log('\nTest 18: Localized Market Price Intelligence & Fallback check');
  
  const testPrices = [
    { state: 'Telangana', district: 'Hyderabad', market: 'Hyderabad Mandi', commodity: 'BANANA', modal_price: 2400, arrival_date: new Date('2026-08-28T00:00:00Z'), source: 'mandi_api' },
    { state: 'Telangana', district: 'Hyderabad', market: 'Hyderabad Mandi', commodity: 'BANANA', modal_price: 2200, arrival_date: new Date('2026-08-27T00:00:00Z'), source: 'mandi_api' },
    { state: 'Telangana', district: 'Rangareddy', market: 'Secunderabad Mandi', commodity: 'BANANA', modal_price: 2500, arrival_date: new Date('2026-08-28T00:00:00Z'), source: 'mandi_api' },
    { state: 'Andhra Pradesh', district: 'Kurnool', market: 'Kurnool Mandi', commodity: 'BANANA', modal_price: 2000, arrival_date: new Date('2026-08-28T00:00:00Z'), source: 'mandi_api' }
  ];

  for (const tp of testPrices) {
    await query(
      `INSERT INTO market_prices (state, district, market, commodity, modal_price, min_price, max_price, arrival_date, source, data_freshness)
       VALUES ($1, $2, $3, $4, $5, $5, $5, $6, $7, 'fresh')
       ON CONFLICT (state, district, market, commodity, arrival_date) DO UPDATE SET modal_price = EXCLUDED.modal_price`,
      [tp.state, tp.district, tp.market, tp.commodity, tp.modal_price, tp.arrival_date, tp.source]
    );
  }

  // A. Query market level: crop + state + district + market
  const resMarket = await fetch(`${BASE_URL}/market-prices/daily-intelligence?commodity=BANANA&state=Telangana&district=Hyderabad&market=Hyderabad Mandi`);
  const dataMarket = await resMarket.json();
  assert.strictEqual(dataMarket.status, 'success', 'Daily intel should return success');
  assert.strictEqual(dataMarket.scope, 'market', 'Scope should be market');
  assert.strictEqual(parseFloat(dataMarket.todayPrice), 24, 'Today price should be normalized (2400 / 100 = 24)');
  assert.strictEqual(parseFloat(dataMarket.yesterdayPrice), 22, 'Yesterday price should be normalized (2200 / 100 = 22)');
  assert.strictEqual(dataMarket.difference, 2, 'Difference should be 2');

  // B. Query district level: crop + state + district
  const resDistrict = await fetch(`${BASE_URL}/market-prices/daily-intelligence?commodity=BANANA&state=Telangana&district=Hyderabad`);
  const dataDistrict = await resDistrict.json();
  assert.strictEqual(dataDistrict.scope, 'district', 'Scope should fallback to district');
  assert.strictEqual(parseFloat(dataDistrict.todayPrice), 24, 'Today price should be 24');

  // C. Query state level: crop + state
  const resState = await fetch(`${BASE_URL}/market-prices/daily-intelligence?commodity=BANANA&state=Telangana`);
  const dataState = await resState.json();
  assert.strictEqual(dataState.scope, 'state', 'Scope should fallback to state');
  // Today's average in Telangana: (2400 + 2500) / 2 = 2450 / 100 = 24.5
  assert.strictEqual(parseFloat(dataState.todayPrice), 24.5, 'Today average in state should be 24.5');

  // D. Query national fallback: crop + unavailable state
  const resNational = await fetch(`${BASE_URL}/market-prices/daily-intelligence?commodity=BANANA&state=Kerala`);
  const dataNational = await resNational.json();
  assert.strictEqual(dataNational.scope, 'national', 'Scope should fallback to national');
  // Today's average nationally (all 3 latest: Hyderabad, Secunderabad, Kurnool): (2400 + 2500 + 2000) / 3 = 6900 / 3 = 2300 / 100 = 23
  assert.strictEqual(parseFloat(dataNational.todayPrice), 23, 'Today average nationally should be 23');

  console.log('✅ Localized price intelligence and unit normalizations verified successfully.');

  // 19. Clean up created data
  console.log('\n🧹 Cleaning up test accounts and listings...');
  await query("DELETE FROM market_prices WHERE commodity = 'BANANA' AND source = 'mandi_api'");
  await query('DELETE FROM routes WHERE order_id = $1', [order.id]);
  await query('DELETE FROM orders WHERE id = $1', [order.id]);
  await query('DELETE FROM produce_listings WHERE id = $1', [listing.id]);
  await query('DELETE FROM buyer_demands WHERE buyer_id = $1', [buyerProfile.id]);
  await query('DELETE FROM buyer_profiles WHERE user_id IN (SELECT id FROM users WHERE email IN ($1, $2, $3))', [buyerEmail, consumerEmail, `other_buyer_${rand}@test.com`]);
  await query('DELETE FROM farmer_profiles WHERE user_id = (SELECT id FROM users WHERE email = $1)', [farmerEmail]);
  await query('DELETE FROM users WHERE email IN ($1, $2, $3, $4)', [farmerEmail, buyerEmail, consumerEmail, `other_buyer_${rand}@test.com`]);
  console.log('✅ Test cleanups completed.');

  console.log('\n🌟 ALL E2E COMPREHENSIVE REGRESSION TESTS PASSED! 🌟');
}

runRegression().catch(err => {
  console.error('\n❌ E2E REGRESSION SUITE FAILED:', err);
  process.exit(1);
});
