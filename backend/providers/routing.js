const https = require('https');
const http = require('http');

class RoutingProvider {
  constructor() {
    this.name = 'routing';
    this.provider = process.env.ROUTING_PROVIDER || '';
    this.apiKey = process.env.ROUTING_API_KEY;
    this.apiUrl = process.env.ROUTING_API_URL;
  }

  isConfigured() {
    return !!(this.provider && this.apiKey);
  }

  async getRoute(origin, destination) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Routing provider not configured',
        route: null,
        source: 'unavailable',
      };
    }

    switch (this.provider.toLowerCase()) {
      case 'osrm':
        return this._osrmRoute(origin, destination);
      case 'google':
        return this._googleRoute(origin, destination);
      case 'mapbox':
        return this._mapboxRoute(origin, destination);
      default:
        return { success: false, error: `Unknown routing provider: ${this.provider}`, route: null };
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

  _httpGet(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, { timeout: 10000 }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Invalid JSON from routing API')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Routing API timeout')); });
    });
  }
}

module.exports = new RoutingProvider();
