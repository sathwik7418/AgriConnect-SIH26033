const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const { query } = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const { validateConfig, printConfigReport } = require('./config');
const mandiProvider = require('./providers/mandi');
const varietyProvider = require('./providers/variety');
const historicalProvider = require('./providers/historical');
const routingProvider = require('./providers/routing');
const supplyDemandMatcher = require('./services/supplyDemand');

dotenv.config();

// Validate configuration at startup
const configStatus = validateConfig();
printConfigReport(configStatus);

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'sih26033-secret-key-change-in-production';

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));

// Auth middleware
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Health check
app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString(), db: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString(), db: 'disconnected' });
  }
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  const { email, password, role, phone } = req.body;
  try {
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO users (email, password, role, phone) VALUES ($1, $2, $3, $4) RETURNING id, email, role',
      [email, hashedPassword, role || 'FARMER', phone]
    );
    
    const token = jwt.sign({ userId: result.rows[0].id, role: result.rows[0].role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ user: result.rows[0], token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await query('SELECT id, email, password, role FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: { id: user.id, email: user.email, role: user.role }, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Farmer profile routes
app.post('/api/farmers', authenticate, async (req, res) => {
  const { name, state, district, totalLandArea, crops, contactNumber } = req.body;
  try {
    const result = await query(
      'INSERT INTO farmer_profiles (user_id, name, state, district, total_land_area, crops, contact_number) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.userId, name, state, district, totalLandArea || 0, crops || [], contactNumber]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create farmer error:', error);
    res.status(500).json({ error: 'Failed to create farmer profile' });
  }
});

app.get('/api/farmers/me', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM farmer_profiles WHERE user_id = $1', [req.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Farmer profile not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get farmer error:', error);
    res.status(500).json({ error: 'Failed to fetch farmer profile' });
  }
});

app.get('/api/farmers/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM farmer_profiles WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Farmer profile not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get farmer by ID error:', error);
    res.status(500).json({ error: 'Failed to fetch farmer profile' });
  }
});

// Produce listing routes
app.post('/api/listings', authenticate, async (req, res) => {
  const { commodity, variety, grade, quantity, unit, askingPrice, location, state, district, expectedHarvestDate, availabilityDate, description } = req.body;
  try {
    // Resolve farmer_profiles.id from user_id
    const farmerResult = await query('SELECT id FROM farmer_profiles WHERE user_id = $1', [req.userId]);
    if (farmerResult.rows.length === 0) {
      return res.status(400).json({ error: 'Farmer profile not found. Create a profile first.' });
    }
    const farmerProfileId = farmerResult.rows[0].id;
    
    const result = await query(
      `INSERT INTO produce_listings (farmer_id, commodity, variety, grade, quantity, unit, asking_price, location, state, district, expected_harvest_date, availability_date, description) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        farmerProfileId,
        commodity,
        variety,
        grade,
        parseFloat(quantity),
        unit || 'kg',
        parseFloat(askingPrice),
        location,
        state,
        district,
        expectedHarvestDate ? new Date(expectedHarvestDate) : null,
        availabilityDate ? new Date(availabilityDate) : new Date(),
        description
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create listing error:', error);
    res.status(500).json({ error: 'Failed to create listing' });
  }
});

app.get('/api/listings', async (req, res) => {
  try {
    const result = await query(
      `SELECT l.*, fp.name as farmer_name, fp.state as farmer_state 
       FROM produce_listings l 
       JOIN farmer_profiles fp ON l.farmer_id = fp.id 
       WHERE l.listing_status = 'ACTIVE'
       ORDER BY l.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get listings error:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

app.get('/api/listings/commodity/:commodity', async (req, res) => {
  try {
    const result = await query(
      `SELECT l.*, fp.name as farmer_name 
       FROM produce_listings l 
       JOIN farmer_profiles fp ON l.farmer_id = fp.id 
       WHERE l.commodity = $1 AND l.listing_status = 'ACTIVE'`,
      [req.params.commodity.toUpperCase()]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get listings by commodity error:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

app.get('/api/listings/farmer/:farmerId', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM produce_listings WHERE farmer_id = $1 ORDER BY created_at DESC',
      [req.params.farmerId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get farmer listings error:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

app.put('/api/listings/:id', authenticate, async (req, res) => {
  const { status, askingPrice, quantity } = req.body;
  try {
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (status) {
      updates.push(`listing_status = $${paramCount++}`);
      values.push(status);
    }
    if (askingPrice) {
      updates.push(`asking_price = $${paramCount++}`);
      values.push(parseFloat(askingPrice));
    }
    if (quantity) {
      updates.push(`quantity = $${paramCount++}`);
      values.push(parseFloat(quantity));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);
    
    const result = await query(
      `UPDATE produce_listings SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update listing error:', error);
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

// Buyer demand routes
app.post('/api/demands', authenticate, async (req, res) => {
  const { commodity, requiredQuantity, targetPrice, deliveryLocation, requiredDeliveryDate, requiredGrade, variety } = req.body;
  try {
    // Resolve buyer_profiles.id from user_id
    const buyerResult = await query('SELECT id FROM buyer_profiles WHERE user_id = $1', [req.userId]);
    if (buyerResult.rows.length === 0) {
      return res.status(400).json({ error: 'Buyer profile not found. Create a profile first.' });
    }
    const buyerProfileId = buyerResult.rows[0].id;
    
    const result = await query(
      `INSERT INTO buyer_demands (buyer_id, commodity, required_quantity, target_price, delivery_location, required_delivery_date, required_grade, variety) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        buyerProfileId,
        commodity,
        parseFloat(requiredQuantity),
        parseFloat(targetPrice),
        deliveryLocation,
        requiredDeliveryDate ? new Date(requiredDeliveryDate) : null,
        requiredGrade,
        variety
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create demand error:', error);
    res.status(500).json({ error: 'Failed to create demand' });
  }
});

app.get('/api/demands', async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, bp.name as buyer_name 
       FROM buyer_demands d 
       JOIN buyer_profiles bp ON d.buyer_id = bp.id 
       WHERE d.demand_status = 'ACTIVE'
       ORDER BY d.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get demands error:', error);
    res.status(500).json({ error: 'Failed to fetch demands' });
  }
});

app.get('/api/demands/commodity/:commodity', async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, bp.name as buyer_name 
       FROM buyer_demands d 
       JOIN buyer_profiles bp ON d.buyer_id = bp.id 
       WHERE d.commodity = $1 AND d.demand_status = 'ACTIVE'`,
      [req.params.commodity.toUpperCase()]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get demands by commodity error:', error);
    res.status(500).json({ error: 'Failed to fetch demands' });
  }
});

// Buyer profile routes
app.post('/api/buyers', authenticate, async (req, res) => {
  const { name, companyName, organizationType, state, district, location, annualCapacity, contactNumber } = req.body;
  try {
    const result = await query(
      `INSERT INTO buyer_profiles (user_id, name, company_name, organization_type, state, district, location, annual_capacity, contact_number) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.userId, name, companyName, organizationType, state, district, location, annualCapacity || 0, contactNumber]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create buyer error:', error);
    res.status(500).json({ error: 'Failed to create buyer profile' });
  }
});

app.get('/api/buyers/me', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM buyer_profiles WHERE user_id = $1', [req.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Buyer profile not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get buyer error:', error);
    res.status(500).json({ error: 'Failed to fetch buyer profile' });
  }
});

// Order routes
app.post('/api/orders', authenticate, async (req, res) => {
  const { listingId, quantity, deliveryLocation, deliveryDate } = req.body;
  try {
    // Resolve buyer_profiles.id from user_id
    const buyerResult = await query('SELECT id FROM buyer_profiles WHERE user_id = $1', [req.userId]);
    if (buyerResult.rows.length === 0) {
      return res.status(400).json({ error: 'Buyer profile not found. Create a profile first.' });
    }
    const buyerProfileId = buyerResult.rows[0].id;
    
    // Find the listing
    const listingResult = await query('SELECT * FROM produce_listings WHERE id = $1 AND listing_status = $2', [listingId, 'ACTIVE']);
    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found or inactive' });
    }
    
    const listing = listingResult.rows[0];
    const transportCost = 0; // Will be calculated by logistics
    const netRealization = parseFloat(listing.asking_price) - transportCost;
    
    const result = await query(
      `INSERT INTO orders (buyer_id, listing_id, quantity, final_price, transport_cost, net_realization, delivery_location, delivery_date) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        buyerProfileId,
        listingId,
        parseFloat(quantity),
        parseFloat(listing.asking_price),
        transportCost,
        netRealization,
        deliveryLocation || listing.location,
        deliveryDate ? new Date(deliveryDate) : null
      ]
    );
    
    // Update listing status
    await query('UPDATE produce_listings SET listing_status = $1 WHERE id = $2', ['SOLD', listingId]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.get('/api/orders/buyer/:buyerId', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT o.*, l.commodity, l.location as listing_location 
       FROM orders o 
       LEFT JOIN produce_listings l ON o.listing_id = l.id 
       WHERE o.buyer_id = $1 
       ORDER BY o.created_at DESC`,
      [req.params.buyerId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get buyer orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.put('/api/orders/:id/status', authenticate, async (req, res) => {
  const { status } = req.body;
  try {
    const result = await query(
      'UPDATE orders SET order_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Market price routes
app.get('/api/market-prices', async (req, res) => {
  try {
    const { commodity, state, district } = req.query;
    let sql = 'SELECT * FROM market_prices WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (commodity) {
      sql += ` AND commodity = $${paramCount++}`;
      params.push(commodity.toUpperCase());
    }
    if (state) {
      sql += ` AND state = $${paramCount++}`;
      params.push(state);
    }
    if (district) {
      sql += ` AND district = $${paramCount++}`;
      params.push(district);
    }
    
    sql += ' ORDER BY fetched_at DESC LIMIT 100';
    
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get market prices error:', error);
    res.status(500).json({ error: 'Failed to fetch market prices' });
  }
});

app.get('/api/market-prices/latest', async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT ON (commodity, state, district) 
       commodity, state, district, market, modal_price, min_price, max_price, fetched_at
       FROM market_prices 
       ORDER BY commodity, state, district, fetched_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get latest prices error:', error);
    res.status(500).json({ error: 'Failed to fetch latest prices' });
  }
});

// Market data sync
app.post('/api/market-data/sync', async (req, res) => {
  try {
    const syncResult = await query(
      'INSERT INTO market_data_sync (source, sync_status) VALUES ($1, $2) RETURNING *',
      ['mandi_api', 'PENDING']
    );
    const syncId = syncResult.rows[0].id;

    if (!mandiProvider.isConfigured()) {
      await query(
        'UPDATE market_data_sync SET sync_status = $1, error_message = $2, completed_at = NOW() WHERE id = $3',
        ['FAILED', 'MANDI_API_KEY or MANDI_RESOURCE_ID not configured', syncId]
      );
      return res.status(400).json({
        message: 'Mandi API not configured',
        syncId,
        hint: 'Set MANDI_API_KEY and MANDI_RESOURCE_ID in .env — see .env.example',
      });
    }

    const result = await mandiProvider.fetchPrices({
      state: req.body?.state,
      commodity: req.body?.commodity,
      limit: req.body?.limit || 500,
    });

    if (!result.success) {
      await query(
        'UPDATE market_data_sync SET sync_status = $1, error_message = $2, completed_at = NOW() WHERE id = $3',
        ['FAILED', result.error, syncId]
      );
      return res.status(502).json({ message: 'Mandi API fetch failed', error: result.error, syncId });
    }

    const storeResult = await mandiProvider.storeRecords(result.records, syncId);

    await query(
      'UPDATE market_data_sync SET sync_status = $1, record_count = $2, valid_count = $3, completed_at = NOW() WHERE id = $4',
      ['SUCCESS', storeResult.total, storeResult.stored, syncId]
    );

    res.json({
      message: 'Sync completed',
      syncId,
      records: storeResult.stored,
      skipped: storeResult.skipped,
      source: 'mandi_api',
      fetchedAt: result.fetchedAt,
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Configuration status
app.get('/api/config/status', (req, res) => {
  res.json({
    mandiApi: { configured: mandiProvider.isConfigured() },
    varietyApi: { configured: varietyProvider.isConfigured() },
    historicalData: { configured: historicalProvider.isConfigured() },
    routing: { configured: routingProvider.isConfigured(), provider: process.env.ROUTING_PROVIDER || null },
  });
});

// Supply-demand summary
app.get('/api/supply-demand/summary', async (req, res) => {
  try {
    const summary = await supplyDemandMatcher.getSupplyDemandSummary();
    res.json(summary);
  } catch (error) {
    console.error('Supply-demand summary error:', error);
    res.status(500).json({ error: 'Failed to compute supply-demand summary' });
  }
});

// Supply-demand matching
app.get('/api/supply-demand/match/:commodity', async (req, res) => {
  try {
    const matches = await supplyDemandMatcher.findMatches(req.params.commodity, {
      state: req.query.state,
      maxPrice: req.query.maxPrice,
      minQuantity: req.query.minQuantity,
      limit: parseInt(req.query.limit) || 20,
    });
    res.json(matches);
  } catch (error) {
    console.error('Match error:', error);
    res.status(500).json({ error: 'Failed to find matches' });
  }
});

// Forecasts
app.get('/api/forecasts', async (req, res) => {
  try {
    const { commodity, location } = req.query;
    
    // Check for historical data existence first
    const histSql = `
      SELECT COUNT(*) as cnt FROM historical_market_prices 
      WHERE 1=1`;
    const histParams = [];
    let histParamCount = 1;
    
    if (commodity) {
      histSql += ` AND commodity = $${histParamCount++}`;
      histParams.push(commodity.toUpperCase());
    }
    if (location) {
      histSql += ` AND state = $${histParamCount++}`;
      histParams.push(location);
    }
    
    const histResult = await query(histSql, histParams);
    const hasHistoricalData = histResult.rows[0].cnt > 0;
    
    // If historical data exists, return historical records with source info
    if (hasHistoricalData) {
      const resultSql = `
        SELECT commodity, state as location, 
               AVG(min_price) as min_price, 
               AVG(max_price) as max_price,
               AVG(modal_price) as modal_price,
               COUNT(*) as record_count,
               'historical_dataset' as data_source,
           'HISTORICAL' as model_version
        FROM historical_market_prices 
        WHERE 1=1`;
      const resultParams = [];
      let resultParamCount = 1;
      
      if (commodity) {
        resultSql += ` AND commodity = $${resultParamCount++}`;
        resultParams.push(commodity.toUpperCase());
      }
      if (location) {
        resultSql += ` AND state = $${resultParamCount++}`;
        resultParams.push(location);
      }
      
      resultSql += ' GROUP BY commodity, state';
      const result = await query(resultSql, resultParams);
      res.json(result.rows);
    } else {
      // Fall back to existing forecasts table
      let sql = 'SELECT * FROM forecasts WHERE 1=1';
      const params = [];
      let paramCount = 1;
      
      if (commodity) {
        sql += ` AND commodity = $${paramCount++}`;
        params.push(commodity.toUpperCase());
      }
      if (location) {
        sql += ` AND location = $${paramCount++}`;
        params.push(location);
      }
      
      sql += ' ORDER BY generated_at DESC';
      const result = await query(sql, params);
      res.json(result.rows);
    }
  } catch (error) {
    console.error('Get forecasts error:', error);
    res.status(500).json({ error: 'Failed to fetch forecasts' });
  }
});

// Impact metrics
app.get('/api/impact', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM impact_metrics ORDER BY recorded_at DESC LIMIT 50'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get impact metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch impact metrics' });
  }
});

app.get('/api/impact/summary', async (req, res) => {
  try {
    const farmersConnected = await query(
      `SELECT COUNT(DISTINCT user_id) as count FROM farmer_profiles`
    );
    const ordersCompleted = await query(
      `SELECT COUNT(*) as count FROM orders WHERE order_status = 'COMPLETED'`
    );
    const totalTradeValue = await query(
      `SELECT COALESCE(SUM(final_price * quantity), 0) as total FROM orders WHERE order_status = 'COMPLETED'`
    );
    
    res.json({
      farmersConnected: parseInt(farmersConnected.rows[0].count),
      ordersCompleted: parseInt(ordersCompleted.rows[0].count),
      totalTradeValue: parseFloat(totalTradeValue.rows[0].total)
    });
  } catch (error) {
    console.error('Get impact summary error:', error);
    res.status(500).json({ error: 'Failed to fetch impact summary' });
  }
});

// Routes (logistics)
app.post('/api/routes', authenticate, async (req, res) => {
  const { origin, destination, distanceKm, estimatedTime, estimatedCost, vehicleType } = req.body;
  try {
    const result = await query(
      `INSERT INTO routes (origin, destination, distance_km, estimated_time, estimated_cost, vehicle_type) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [origin, destination, parseFloat(distanceKm), estimatedTime, parseFloat(estimatedCost) || 0, vehicleType]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create route error:', error);
    res.status(500).json({ error: 'Failed to create route' });
  }
});

app.get('/api/routes', async (req, res) => {
  try {
    const result = await query('SELECT * FROM routes ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get routes error:', error);
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
});

// Dashboard stats
app.get('/api/dashboard/stats', authenticate, async (req, res) => {
  try {
    const stats = {};
    
    if (req.userRole === 'FARMER') {
      const listings = await query(
        'SELECT COUNT(*) as count FROM produce_listings WHERE farmer_id = $1',
        [req.userId]
      );
      const activeListings = await query(
        "SELECT COUNT(*) as count FROM produce_listings WHERE farmer_id = $1 AND listing_status = 'ACTIVE'",
        [req.userId]
      );
      const totalSales = await query(
        'SELECT COALESCE(SUM(final_price * quantity), 0) as total FROM orders o JOIN produce_listings l ON o.listing_id = l.id WHERE l.farmer_id = $1 AND o.order_status = $2',
        [req.userId, 'COMPLETED']
      );
      
      stats.totalListings = parseInt(listings.rows[0].count);
      stats.activeListings = parseInt(activeListings.rows[0].count);
      stats.totalSales = parseFloat(totalSales.rows[0].total);
    } else if (req.userRole === 'BUYER') {
      const orders = await query(
        'SELECT COUNT(*) as count FROM orders WHERE buyer_id = $1',
        [req.userId]
      );
      const pendingOrders = await query(
        "SELECT COUNT(*) as count FROM orders WHERE buyer_id = $1 AND order_status = 'PENDING'",
        [req.userId]
      );
      const totalSpent = await query(
        'SELECT COALESCE(SUM(final_price * quantity), 0) as total FROM orders WHERE buyer_id = $1 AND order_status = $2',
        [req.userId, 'COMPLETED']
      );
      
      stats.totalOrders = parseInt(orders.rows[0].count);
      stats.pendingOrders = parseInt(pendingOrders.rows[0].count);
      stats.totalSpent = parseFloat(totalSpent.rows[0].total);
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Catch-all 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`SIH26033 Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API base: http://localhost:${PORT}/api`);
});

module.exports = app;
