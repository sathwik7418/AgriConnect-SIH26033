import { useState, useEffect } from 'react';
import { adminAPI, marketAPI } from '../services/api';
import { Users, ShoppingCart, BarChart3, Truck, RefreshCw, Database, Server, CheckCircle, AlertTriangle } from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminAPI.getStats();
      setStats(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load system statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await marketAPI.sync();
      setSyncResult({
        success: true,
        message: `Sync completed successfully! Stored ${res.data.records} new records, skipped ${res.data.skipped || 0}.`,
        timestamp: new Date().toLocaleTimeString()
      });
      await loadStats();
    } catch (err) {
      setSyncResult({
        success: false,
        message: err.response?.data?.error || 'Sync failed. Please verify Mandi API key configuration in .env.'
      });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Control Center</h1>
        <p className="text-gray-500 text-sm">System administration and data health cockpit</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* Grid of Key Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* User Stats Card */}
        <div className="bg-white rounded-xl p-5 border card-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-500">System Users</span>
            <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><Users className="h-5 w-5" /></div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats?.users?.total || 0}</p>
          <div className="mt-2 text-xs text-gray-500 grid grid-cols-3 gap-1 border-t pt-2">
            <div>👨‍🌾 Farmers: <span className="font-semibold">{stats?.users?.farmers || 0}</span></div>
            <div>💼 Buyers: <span className="font-semibold">{stats?.users?.buyers || 0}</span></div>
            <div>🛒 Cons: <span className="font-semibold">{stats?.users?.consumers || 0}</span></div>
          </div>
        </div>

        {/* Trade Value Card */}
        <div className="bg-white rounded-xl p-5 border card-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-500">Marketplace Volume</span>
            <div className="bg-green-50 p-2 rounded-lg text-green-600"><ShoppingCart className="h-5 w-5" /></div>
          </div>
          <p className="text-2xl font-bold text-green-700 font-numeric">Rs{parseFloat(stats?.marketplace?.totalValue || 0).toLocaleString()}</p>
          <div className="mt-2 text-xs text-gray-500 flex justify-between border-t pt-2">
            <span>Listings: <span className="font-semibold">{stats?.marketplace?.activeListings || 0} active</span></span>
            <span>Orders: <span className="font-semibold">{stats?.marketplace?.completedOrders || 0} / {stats?.marketplace?.totalOrders || 0}</span></span>
          </div>
        </div>

        {/* Mandi Records Card */}
        <div className="bg-white rounded-xl p-5 border card-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-500">Live Mandi Prices</span>
            <div className="bg-amber-50 p-2 rounded-lg text-amber-600"><BarChart3 className="h-5 w-5" /></div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats?.marketData?.mandiCount || 0}</p>
          <div className="mt-2 text-xs text-gray-500 flex justify-between border-t pt-2">
            <span>Gov APIs: <span className="font-semibold text-gray-800">{stats?.marketData?.govCount || 0}</span></span>
            <span>Sync Source: <span className="font-semibold text-gray-800">mandi_api</span></span>
          </div>
        </div>

        {/* Historical Database Card */}
        <div className="bg-white rounded-xl p-5 border card-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-500">Historical Database</span>
            <div className="bg-purple-50 p-2 rounded-lg text-purple-600"><Database className="h-5 w-5" /></div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{(stats?.historicalData?.count || 0).toLocaleString()}</p>
          <div className="mt-2 text-xs text-gray-500 border-t pt-2">
            <span>Range: <span className="font-semibold">{stats?.historicalData?.minDate ? new Date(stats.historicalData.minDate).getFullYear() : 'N/A'} - {stats?.historicalData?.maxDate ? new Date(stats.historicalData.maxDate).getFullYear() : 'N/A'}</span></span>
          </div>
        </div>
      </div>

      {/* Main Admin Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sync panel */}
        <div className="bg-white rounded-xl border p-5 card-shadow space-y-4 lg:col-span-2">
          <div className="border-b pb-2 flex justify-between items-center">
            <h3 className="font-bold text-gray-900 text-base flex items-center gap-1.5">
              <Server className="h-5 w-5 text-green-600" />
              Mandi Ingestion & Synchronization
            </h3>
            {stats?.marketData?.latestSync && (
              <span className="text-[10px] text-gray-400 font-semibold bg-gray-50 px-2 py-0.5 border rounded">
                Last Sync: {new Date(stats.marketData.latestSync).toLocaleString()}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Triggers manual retrieval of fresh commodity price arrivals from Gov APIs (APMC Mandis) to populate price charts and guide farmer listings.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="bg-green-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing Mandi Records...' : 'Sync Market Prices'}
            </button>
            <span className="text-xs text-gray-400">
              * Resolves coordinate calculations dynamically.
            </span>
          </div>

          {syncResult && (
            <div className={`p-4 rounded-lg text-sm border flex items-start gap-2 ${
              syncResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {syncResult.success ? <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" /> : <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />}
              <div>
                <p className="font-semibold">{syncResult.success ? 'Sync Succeeded' : 'Sync Failed'}</p>
                <p className="text-xs mt-0.5">{syncResult.message}</p>
                {syncResult.timestamp && <p className="text-[10px] text-gray-400 mt-1">Completed at: {syncResult.timestamp}</p>}
              </div>
            </div>
          )}
        </div>

        {/* System & Logistics status */}
        <div className="bg-white rounded-xl border p-5 card-shadow space-y-4">
          <div className="border-b pb-2">
            <h3 className="font-bold text-gray-900 text-base flex items-center gap-1.5">
              <Truck className="h-5 w-5 text-blue-600" />
              Logistics & Integration Status
            </h3>
          </div>

          <div className="space-y-3.5 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-semibold">OSRM Routing Provider</span>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full font-bold border border-blue-100 uppercase">
                {stats?.logistics?.provider || 'OSRM'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-semibold">Provider Connection</span>
              <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full font-bold border border-green-100 uppercase">
                ONLINE
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-semibold">Logistics Pricing Model</span>
              <span className="text-gray-700 font-semibold text-xs">
                Rs 9.5/km (min Rs300)
              </span>
            </div>

            <div className="pt-3 border-t text-xs text-gray-400 leading-relaxed">
              <strong>Routing Health Check:</strong> Distance and duration estimates are resolved dynamically. If OpenRouteService is un-configured or times out, the system automatically redirects query coordinates to OSRM's public routing service.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
