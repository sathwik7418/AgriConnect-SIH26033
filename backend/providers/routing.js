const https = require('https');
const http = require('http');

// ── Vehicle Catalogue (AgriConnect Estimation Parameters) ──
const VEHICLE_CATALOGUE = {
  MINI_TRUCK: {
    id: 'MINI_TRUCK',
    label: 'Mini Truck',
    description: 'Tata Ace / similar',
    capacityKg: 2000,
    ratePerKm: 12,
    loadingHandling: 80,
  },
  PICKUP_LCV: {
    id: 'PICKUP_LCV',
    label: 'Pickup / LCV',
    description: 'Pickup truck / Light Commercial Vehicle',
    capacityKg: 3000,
    ratePerKm: 18,
    loadingHandling: 120,
  },
  MEDIUM_TRUCK: {
    id: 'MEDIUM_TRUCK',
    label: 'Medium Truck',
    description: 'Eicher / Tata 407 / similar',
    capacityKg: 7000,
    ratePerKm: 25,
    loadingHandling: 200,
  },
  HEAVY_TRUCK: {
    id: 'HEAVY_TRUCK',
    label: 'Heavy Truck',
    description: 'Multi-axle truck / 10+ tonnes',
    capacityKg: 15000,
    ratePerKm: 38,
    loadingHandling: 350,
  },
};

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

  _haversineRoute(origin, destination) {
    const R = 6371; // Earth's radius in km
    const dLat = (destination.lat - origin.lat) * (Math.PI / 180);
    const dLng = (destination.lng - origin.lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(origin.lat * (Math.PI / 180)) *
        Math.cos(destination.lat * (Math.PI / 180)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const directKm = R * c;
    // Highway winding factor for Indian road corridors (approx 1.25x - 1.3x great-circle distance)
    const roadKm = Math.max(1, Math.round(directKm * 1.28));
    const estimatedMinutes = Math.round((roadKm / 45) * 60);

    return {
      success: true,
      route: {
        distanceKm: roadKm,
        estimatedTime: `${estimatedMinutes} min`,
        estimatedCost: 0,
        source: 'haversine_fallback',
      }
    };
  }

  async _osrmRoute(origin, destination) {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`;
    try {
      const data = await this._httpGet(url);
      if (data.code !== 'Ok' || !data.routes?.length) {
        console.warn('OSRM returned non-OK status, applying Haversine fallback.');
        return this._haversineRoute(origin, destination);
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
      console.warn('OSRM request failed, applying Haversine fallback:', error.message);
      return this._haversineRoute(origin, destination);
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

  async calculateRouteDetails(originName, destinationName, vehicleType = 'PICKUP_LCV', payloadKg = 0) {
    const origin = await this.geocode(originName);
    const destination = await this.geocode(destinationName);
    
    if (!origin || !destination) {
      return {
        success: false,
        error: "We couldn't verify this location. Please check the address."
      };
    }
    
    const isFallback = origin.isFallback || destination.isFallback;
    const result = await this.getRoute(origin, destination);
    if (result.success && result.route) {
      const distance = result.route.distanceKm;
      const payload = parseFloat(payloadKg) || 0;
      const vehicle = VEHICLE_CATALOGUE[vehicleType] || VEHICLE_CATALOGUE.PICKUP_LCV;
      
      const transportCost = Math.max(300, Math.round(distance * vehicle.ratePerKm + vehicle.loadingHandling));
      
      result.route.estimatedCost = transportCost;
      result.route.isFallback = isFallback;
      result.route.vehicle = {
        id: vehicle.id,
        label: vehicle.label,
        description: vehicle.description,
        capacityKg: vehicle.capacityKg,
        ratePerKm: vehicle.ratePerKm,
        loadingHandling: vehicle.loadingHandling,
      };
      result.route.breakdown = {
        distanceKm: distance,
        ratePerKm: vehicle.ratePerKm,
        distanceCost: Math.round(distance * vehicle.ratePerKm),
        loadingHandling: vehicle.loadingHandling,
        totalEstimate: transportCost,
      };

      // Milestone 4: Add recommendation & fleet comparison
      if (payload > 0) {
        result.route.fleetComparison = this.compareVehicles(distance, payload, vehicle.id);
        result.route.capacityUtilizationPct = Math.min(100, Math.round((payload / vehicle.capacityKg) * 1000) / 10);
        result.route.remainingCapacityKg = Math.max(0, vehicle.capacityKg - payload);
        result.route.isOversized = result.route.fleetComparison.isOversized;
        result.route.oversizedWarning = result.route.fleetComparison.oversizedWarning;
      }
    }
    return result;
  }

  recommendVehicle(payloadKg) {
    const payload = parseFloat(payloadKg) || 0;
    if (payload <= 2000) {
      return {
        vehicle: VEHICLE_CATALOGUE.MINI_TRUCK,
        reason: 'Fits within 2,000 kg capacity and has the lowest transport rate (₹12/km).'
      };
    }
    if (payload <= 3000) {
      return {
        vehicle: VEHICLE_CATALOGUE.PICKUP_LCV,
        reason: 'Mini Truck capacity exceeded. Pickup / LCV provides 3,000 kg capacity at ₹18/km.'
      };
    }
    if (payload <= 7000) {
      return {
        vehicle: VEHICLE_CATALOGUE.MEDIUM_TRUCK,
        reason: 'Payload requires Medium Truck (7,000 kg capacity) for single-trip commercial logistics.'
      };
    }
    return {
      vehicle: VEHICLE_CATALOGUE.HEAVY_TRUCK,
      reason: payload > 15000 
        ? 'Heavy Truck (15,000 kg capacity) provides maximum payload capacity for bulk agricultural transport.'
        : 'Payload requires Heavy Truck (15,000 kg capacity) for high-tonnage bulk freight.'
    };
  }

  compareVehicles(distanceKm, payloadKg, selectedVehicleType = 'PICKUP_LCV') {
    const dist = parseFloat(distanceKm) || 0;
    const payload = parseFloat(payloadKg) || 0;
    const recommended = this.recommendVehicle(payload);
    const selected = VEHICLE_CATALOGUE[selectedVehicleType] || VEHICLE_CATALOGUE.PICKUP_LCV;
    const recCost = Math.max(300, Math.round(dist * recommended.vehicle.ratePerKm + recommended.vehicle.loadingHandling));

    const comparison = Object.values(VEHICLE_CATALOGUE).map(v => {
      const isCapable = payload <= 0 || v.capacityKg >= payload;
      const isRecommended = v.id === recommended.vehicle.id;
      const isSelected = v.id === selected.id;
      const cost = Math.max(300, Math.round(dist * v.ratePerKm + v.loadingHandling));
      const costDiff = cost - recCost;
      const utilization = payload > 0 ? Math.min(100, Math.round((payload / v.capacityKg) * 1000) / 10) : 0;
      const remainingKg = Math.max(0, v.capacityKg - payload);

      let disqualificationReason = null;
      if (!isCapable) {
        disqualificationReason = `Payload (${payload.toLocaleString()} kg) exceeds vehicle capacity (${v.capacityKg.toLocaleString()} kg)`;
      }

      return {
        id: v.id,
        label: v.label,
        description: v.description,
        capacityKg: v.capacityKg,
        ratePerKm: v.ratePerKm,
        loadingHandling: v.loadingHandling,
        estimatedCost: cost,
        costDifference: costDiff,
        isCapable,
        isRecommended,
        isSelected,
        capacityUtilizationPct: utilization,
        remainingCapacityKg: remainingKg,
        disqualificationReason
      };
    });

    const isOversized = payload > 0 && selected.capacityKg > recommended.vehicle.capacityKg && selected.id !== recommended.vehicle.id;
    const selectedCost = Math.max(300, Math.round(dist * selected.ratePerKm + selected.loadingHandling));
    const potentialSavings = isOversized ? Math.max(0, selectedCost - recCost) : 0;

    return {
      distanceKm: dist,
      payloadKg: payload,
      recommendedVehicle: recommended.vehicle,
      recommendationReason: recommended.reason,
      selectedVehicle: selected,
      isOversized,
      potentialSavings,
      oversizedWarning: isOversized ? `You're using a larger vehicle (${selected.label}) than necessary. Switching to ${recommended.vehicle.label} could save ₹${potentialSavings.toLocaleString()}.` : null,
      vehicles: comparison
    };
  }

  calculateTransportCost(distanceKm, vehicleType = 'PICKUP_LCV') {
    const vehicle = VEHICLE_CATALOGUE[vehicleType] || VEHICLE_CATALOGUE.PICKUP_LCV;
    const transportCost = Math.max(300, Math.round(distanceKm * vehicle.ratePerKm + vehicle.loadingHandling));
    return {
      transportCost,
      vehicle: {
        id: vehicle.id,
        label: vehicle.label,
        description: vehicle.description,
        capacityKg: vehicle.capacityKg,
        ratePerKm: vehicle.ratePerKm,
        loadingHandling: vehicle.loadingHandling,
      },
      breakdown: {
        distanceKm,
        ratePerKm: vehicle.ratePerKm,
        distanceCost: Math.round(distanceKm * vehicle.ratePerKm),
        loadingHandling: vehicle.loadingHandling,
        totalEstimate: transportCost,
      },
    };
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
        timeout: 3500
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
module.exports.VEHICLE_CATALOGUE = VEHICLE_CATALOGUE;
