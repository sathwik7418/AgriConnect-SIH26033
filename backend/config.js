const fs = require('fs');
const path = require('path');

const PLACEHOLDER_VALUES = [
  'YOUR_GOVERNMENT_API_KEY_HERE',
  'your_jwt_secret_key_change_this_in_production',
  'YOUR_API_KEY',
  'YOUR_SECRET',
  'changeme',
  'placeholder',
  'YOUR_API_KEY_HERE',
  'YOUR_SECRET_KEY_HERE',
];

function isPlaceholder(value) {
  if (!value) return false;
  return PLACEHOLDER_VALUES.some(p => value.toLowerCase().includes(p.toLowerCase()));
}

function validateConfig() {
  const results = {
    database: { status: 'UNKNOWN', message: '' },
    jwt: { status: 'UNKNOWN', message: '' },
    mandiApi: { status: 'UNKNOWN', message: '' },
    varietyApi: { status: 'UNKNOWN', message: '' },
    historicalData: { status: 'UNKNOWN', message: '' },
    routing: { status: 'UNKNOWN', message: '' },
    satellite: { status: 'UNKNOWN', message: '' },
    ceda: { status: 'UNKNOWN', message: '' },
  };

  // Database
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && !isPlaceholder(dbUrl)) {
    results.database = { status: 'CONFIGURED', message: 'Database URL is set' };
  } else {
    results.database = { status: 'MISSING', message: 'DATABASE_URL not set or is placeholder' };
  }

  // JWT
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret && !isPlaceholder(jwtSecret) && jwtSecret.length >= 16) {
    results.jwt = { status: 'CONFIGURED', message: 'JWT secret is configured' };
  } else if (jwtSecret && isPlaceholder(jwtSecret)) {
    results.jwt = { status: 'INVALID', message: 'JWT_SECRET is still a placeholder — change it for production' };
  } else {
    results.jwt = { status: 'MISSING', message: 'JWT_SECRET not set' };
  }

  // Mandi API
  const mandiKey = process.env.MANDI_API_KEY;
  const mandiUrl = process.env.MANDI_API_URL;
  const mandiResource = process.env.MANDI_RESOURCE_ID;
  if (mandiKey && mandiUrl && mandiResource && !isPlaceholder(mandiKey) && !isPlaceholder(mandiResource)) {
    results.mandiApi = { status: 'CONFIGURED', message: 'Mandi API fully configured' };
  } else if (mandiKey && !isPlaceholder(mandiKey)) {
    results.mandiApi = { status: 'PARTIAL', message: 'Mandi API key set but missing RESOURCE_ID' };
  } else {
    results.mandiApi = { status: 'MISSING', message: 'Mandi API not configured — market prices will use cached data only' };
  }

  // Variety API
  const varietyKey = process.env.VARIETY_API_KEY;
  const varietyResource = process.env.VARIETY_RESOURCE_ID;
  if (varietyKey && varietyResource && !isPlaceholder(varietyKey) && !isPlaceholder(varietyResource)) {
    results.varietyApi = { status: 'CONFIGURED', message: 'Variety API fully configured' };
  } else if (varietyKey && !isPlaceholder(varietyKey)) {
    results.varietyApi = { status: 'PARTIAL', message: 'Variety API key set but missing RESOURCE_ID' };
  } else {
    results.varietyApi = { status: 'MISSING', message: 'Variety API not configured — variety-level prices unavailable' };
  }

  // Historical Data
  const histPath = process.env.HISTORICAL_DATA_PATH;
  if (histPath && !isPlaceholder(histPath)) {
    if (fs.existsSync(path.resolve(histPath))) {
      results.historicalData = { status: 'CONFIGURED', message: `Historical dataset found at ${histPath}` };
    } else {
      results.historicalData = { status: 'INVALID', message: `File not found: ${histPath}` };
    }
  } else {
    results.historicalData = { status: 'CHECK_DB', message: 'No historical dataset file configured — check database for historical records' };
  }

  // Routing
  const routingProvider = process.env.ROUTING_PROVIDER;
  const routingKey = process.env.ROUTING_API_KEY;
  if (routingProvider && routingKey && !isPlaceholder(routingKey)) {
    results.routing = { status: 'CONFIGURED', message: `Routing via ${routingProvider} configured` };
  } else if (routingProvider) {
    results.routing = { status: 'PARTIAL', message: `Routing provider set (${routingProvider}) but missing API key` };
  } else {
    results.routing = { status: 'MISSING', message: 'No routing provider — route suggestions disabled' };
  }

  // Satellite Crop Health (Copernicus Data Space Ecosystem - Sentinel-2 NDVI)
  const cdseClientId = process.env.CDSE_CLIENT_ID;
  const cdseClientSecret = process.env.CDSE_CLIENT_SECRET;
  const cdseTokenUrl = process.env.CDSE_TOKEN_URL;
  if (cdseClientId && cdseClientSecret && cdseTokenUrl && !isPlaceholder(cdseClientId) && !isPlaceholder(cdseClientSecret)) {
    results.satellite = { status: 'CONFIGURED', message: 'CDSE Sentinel-2 NDVI configured' };
  } else if (cdseClientId && !isPlaceholder(cdseClientId)) {
    results.satellite = { status: 'PARTIAL', message: 'CDSE client configured but missing secret or token URL' };
  } else {
    results.satellite = { status: 'MISSING', message: 'CDSE not configured — Satellite Crop Health disabled' };
  }

  // CEDA Agmarknet - historical market price / quantity data
  const cedaKey = process.env.CEDA_API_KEY;
  if (cedaKey && !isPlaceholder(cedaKey)) {
    results.ceda = { status: 'CONFIGURED', message: 'CEDA Agmarknet API configured' };
  } else if (cedaKey && isPlaceholder(cedaKey)) {
    results.ceda = { status: 'INVALID', message: 'CEDA_API_KEY is still a placeholder — replace it with a real key' };
  } else {
    results.ceda = { status: 'MISSING', message: 'CEDA Agmarknet not configured — historical market data unavailable' };
  }

  return results;
}

function printConfigReport(results) {
  const STATUS_ICONS = {
    CONFIGURED: '[OK]',
    PARTIAL:   '[!!]',
    MISSING:   '[--]',
    INVALID:   '[XX]',
    UNKNOWN:   '[??]',
  };

  console.log('\n=== AgriConnect Configuration Report ===\n');

  for (const [key, result] of Object.entries(results)) {
    const icon = STATUS_ICONS[result.status] || STATUS_ICONS.UNKNOWN;
    const label = key.padEnd(18);
    console.log(`  ${icon} ${label} ${result.message}`);
  }

  const configured = Object.values(results).filter(r => r.status === 'CONFIGURED').length;
  const total = Object.keys(results).length;
  console.log(`\n  ${configured}/${total} integrations configured`);

  const missing = Object.entries(results).filter(([, r]) => r.status === 'MISSING');
  if (missing.length > 0) {
    console.log('\n  Missing integrations will gracefully degrade.');
    console.log('  See .env.example for setup instructions.\n');
  } else {
    console.log('\n  All integrations configured.\n');
  }
}

module.exports = { validateConfig, printConfigReport };
