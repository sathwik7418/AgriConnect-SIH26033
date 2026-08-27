const https = require('https');
const http = require('http');

const locationCoords = {
  'pune': { lat: 18.5204, lng: 73.8567 },
  'mumbai': { lat: 19.0760, lng: 72.8777 },
  'nagpur': { lat: 21.1458, lng: 79.0882 },
  'nashik': { lat: 19.9975, lng: 73.7898 },
  'aurangabad': { lat: 19.8762, lng: 75.3433 },
  'satara': { lat: 17.6805, lng: 73.9979 },
  'kolhapur': { lat: 16.7050, lng: 74.2433 },
  'solapur': { lat: 17.6599, lng: 75.9064 },
  'jalgaon': { lat: 21.0077, lng: 75.5626 },
  'ibrahimpatnam': { lat: 17.1891, lng: 78.6481 },
  'hyderabad': { lat: 17.3850, lng: 78.4867 },
  'bangalore': { lat: 12.9716, lng: 77.5946 },
  'bengaluru': { lat: 12.9716, lng: 77.5946 },
  'delhi': { lat: 28.6139, lng: 77.2090 },
  'new delhi': { lat: 28.6139, lng: 77.2090 },
  'ahmedabad': { lat: 23.0225, lng: 72.5714 },
  'surat': { lat: 21.1702, lng: 72.8311 },
  'bhopal': { lat: 23.2599, lng: 77.4126 },
  'indore': { lat: 22.7196, lng: 75.8577 },
  'jaipur': { lat: 26.9124, lng: 75.7873 },
  'lucknow': { lat: 26.8467, lng: 80.9462 },
  'patna': { lat: 25.5941, lng: 85.1376 },
  'kolkata': { lat: 22.5726, lng: 88.3639 },
  'chennai': { lat: 13.0827, lng: 80.2707 }
};

class RoutingProvider {
  constructor() {
    this.name = 'routing';
    this.provider = process.env.ROUTING_PROVIDER || 'openrouteservice';
    this.apiKey = process.env.ROUTING_API_KEY;
    this.apiUrl = process.env.ROUTING_API_URL;
  }

  isConfigured() {
    // OSRM requires no API key and is always ready as a public fallback. Others need an apiKey.
    if (this.provider === 'osrm') return true;
    return !!this.apiKey;
  }

  async geocode(locationStr) {
    if (!locationStr) return null;
    const clean = locationStr.toLowerCase().trim();
    
    // Validate garbage input
    if (clean.length < 3 || !/[a-z0-9]/i.test(clean)) {
      return null;
    }
    
    // 1. Try local exact match
    if (locationCoords[clean]) {
      return { ...locationCoords[clean], isFallback: false, provider: 'local' };
    }
    
    // 2. Try local contains match
    for (const [city, coords] of Object.entries(locationCoords)) {
      if (clean.includes(city) || city.includes(clean)) {
        return { ...coords, isFallback: false, provider: 'local' };
      }
    }
    
    // 3. Call OpenStreetMap Nominatim Geocoding API
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationStr)}&format=json&limit=1`;
    try {
      const data = await this._httpGet(url);
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          isFallback: false,
          provider: 'nominatim'
        };
      }
    } catch (error) {
      console.warn('OSM Nominatim Geocoding failed:', error.message);
    }
    
    // 4. Return null if geocoding fails
    return null;
  }

  async getRoute(origin, destination) {
    let activeProvider = this.provider ? this.provider.toLowerCase() : 'osrm';
    
    // Fallback to OSRM if OpenRouteService API key is missing
    if (activeProvider === 'openrouteservice' && !this.apiKey) {
      activeProvider = 'osrm';
    }

    switch (activeProvider) {
      case 'openrouteservice':
        return this._openRouteServiceRoute(origin, destination);
      case 'osrm':
        return this._osrmRoute(origin, destination);
      case 'google':
        return this._googleRoute(origin, destination);
      case 'mapbox':
        return this._mapboxRoute(origin, destination);
      default:
        return this._osrmRoute(origin, destination);
    }
  }

  async _openRouteServiceRoute(origin, destination) {
    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${this.apiKey}&start=${origin.lng},${origin.lat}&end=${destination.lng},${destination.lat}`;
    try {
      const data = await this._httpGet(url);
      if (!data.features?.length) {
        // Fallback to OSRM if OpenRouteService fails
        console.warn('OpenRouteService returned no features, falling back to OSRM.');
        return this._osrmRoute(origin, destination);
      }
      const summary = data.features[0].properties.summary;
      return {
        success: true,
        route: {
          distanceKm: Math.round(summary.distance / 1000),
          estimatedTime: `${Math.round(summary.duration / 60)} min`,
          estimatedCost: 0,
          source: 'openrouteservice',
        },
      };
    } catch (error) {
      console.warn('OpenRouteService failed, falling back to OSRM:', error.message);
      return this._osrmRoute(origin, destination);
    }
  }

  async _osrmRoute(origin, destination) {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`;
    try {
      const data = await this._httpGet(url);
      if (data.code !== 'Ok' || !data.routes?.length) {
        return { success: false, error: 'No route found', route: null };
      }
      const route = data.routes[0];
      return {
        success: true,
        route: {
          distanceKm: Math.round(route.distance / 1000),
          estimatedTime: `${Math.round(route.duration / 60)} min`,
          estimatedCost: 0,
          source: 'osrm',
        },
      };
    } catch (error) {
      return { success: false, error: error.message, route: null };
    }
  }

  async _googleRoute(origin, destination) {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&key=${this.apiKey}`;
    try {
      const data = await this._httpGet(url);
      if (data.status !== 'OK' || !data.routes?.length) {
        return { success: false, error: data.error_message || 'No route found', route: null };
      }
      const leg = data.routes[0].legs[0];
      return {
        success: true,
        route: {
          distanceKm: Math.round(leg.distance.value / 1000),
          estimatedTime: leg.duration.text,
          estimatedCost: 0,
          source: 'google',
        },
      };
    } catch (error) {
      return { success: false, error: error.message, route: null };
    }
  }

  async _mapboxRoute(origin, destination) {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?access_token=${this.apiKey}`;
    try {
      const data = await this._httpGet(url);
      if (!data.routes?.length) {
        return { success: false, error: 'No route found', route: null };
      }
      const route = data.routes[0];
      return {
        success: true,
        route: {
          distanceKm: Math.round(route.distance / 1000),
          estimatedTime: `${Math.round(route.duration / 60)} min`,
          estimatedCost: 0,
          source: 'mapbox',
        },
      };
    } catch (error) {
      return { success: false, error: error.message, route: null };
    }
  }

  async calculateRouteDetails(originName, destinationName) {
    const origin = await this.geocode(originName);
    const destination = await this.geocode(destinationName);
    
    if (!origin || !destination) {
      return {
        success: false,
        error: `Could not geocode locations. Origin: ${originName || 'missing'}, Destination: ${destinationName || 'missing'}`
      };
    }
    
    const isFallback = origin.isFallback || destination.isFallback;
    const result = await this.getRoute(origin, destination);
    if (result.success && result.route) {
      const distance = result.route.distanceKm;
      // Calculate cost: Rs 9.5 per km, minimum Rs 300
      result.route.estimatedCost = Math.max(300, Math.round(distance * 9.5));
      result.route.isFallback = isFallback;
    }
    return result;
  }

  _httpGet(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'AgriConnect-SIH26033/1.0 (Contact: vamshi@agriconnect.org)'
        },
        timeout: 10000
      };
      
      const req = client.get(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { 
            resolve(JSON.parse(body)); 
          } catch (e) { 
            reject(new Error(`Invalid JSON from routing API: status ${res.statusCode}. Body: ${body.substring(0, 200)}`)); 
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Routing API timeout')); });
    });
  }
}

module.exports = new RoutingProvider();
