import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { impactAPI, listingAPI, marketAPI, forecastAPI, dashboardAPI } from '../services/api';
import { Users, ShoppingCart, TrendingUp, BarChart3, Wheat, ArrowUpRight, ShoppingBag, MapPin, Truck, Clock, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [summary, setSummary] = useState(null);
  const [listings, setListings] = useState([]);
  const [prices, setPrices] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const promises = [
      impactAPI.getSummary(),
      listingAPI.getAll(),
      marketAPI.getLatest(),
      forecastAPI.getAll(),
    ];
    if (user) {
      promises.push(dashboardAPI.getStats());
    }

    Promise.all(promises).then(([s, l, p, f, st]) => {
      setSummary(s.data);
      setListings(l.data);
      setPrices(p.data);
      setForecasts(f.data);
      if (st) setStats(st.data);
    }).finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>;

  // Chart and aggregates preparation
  const commodityData = {};
  listings.forEach(l => {
    commodityData[l.commodity] = (commodityData[l.commodity] || 0) + parseFloat(l.quantity);
  });
  const commodityChart = Object.entries(commodityData).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const statePriceData = {};
  prices.forEach(p => {
    if (!statePriceData[p.state]) statePriceData[p.state] = { state: p.state, prices: [] };
    const isQuintal = p.source === 'mandi_api' || p.source === 'historical_dataset' || p.source === 'agmarknet_historical';
    const pricePerKg = isQuintal ? parseFloat(p.modal_price) / 100 : parseFloat(p.modal_price);
    statePriceData[p.state].prices.push(pricePerKg);
  });
  const avgPricesByState = Object.values(statePriceData).map(d => ({
    state: d.state.split(' ').slice(0, 2).join(' '),
    avgPrice: Math.round(d.prices.reduce((a, b) => a + b, 0) / d.prices.length),
  }));

  // Render Consumer Dashboard
  if (user?.role === 'CONSUMER') {
    const localListings = listings.filter(l => l.farmer_state?.toLowerCase() === profile?.state?.toLowerCase());
    const pendingOrdersCount = stats.pendingOrders || 0;
    const completedOrdersCount = (stats.totalOrders - stats.pendingOrders) || 0;
    const totalSpent = stats.totalSpent || 0;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Consumer Dashboard</h1>
          <p className="text-gray-500 text-sm">Welcome back, {profile?.name || user?.email}! Track your fresh produce orders.</p>
        </div>

        {/* Consumer Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-5 border card-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-semibold">Active Orders</p>
                <p className="text-2xl font-bold text-gray-900 mt-1 font-numeric">{pendingOrdersCount}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg"><Clock className="h-6 w-6 text-blue-600" /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 border card-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-semibold">Completed Orders</p>
                <p className="text-2xl font-bold text-gray-900 mt-1 font-numeric">{completedOrdersCount}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg"><CheckCircle className="h-6 w-6 text-green-600" /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 border card-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-semibold">Total Spent</p>
                <p className="text-2xl font-bold text-green-700 mt-1 font-numeric">₹{totalSpent.toLocaleString()}</p>
              </div>
              <div className="bg-amber-100 p-3 rounded-lg"><TrendingUp className="h-6 w-6 text-amber-600" /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 border card-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-semibold">Produce in {profile?.state || 'My State'}</p>
                <p className="text-2xl font-bold text-purple-700 mt-1 font-numeric">{localListings.length}</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg"><Wheat className="h-6 w-6 text-purple-600" /></div>
            </div>
          </div>
        </div>

        {/* Consumer Active Order Guidance Banner */}
        {pendingOrdersCount > 0 && (
          <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-xl flex items-center justify-between">
            <span className="text-sm flex items-center gap-2">
              <Truck className="h-5 w-5 text-green-600 animate-pulse" />
              You have <strong>{pendingOrdersCount} active delivery</strong> in progress. Check the Orders page for real-time updates.
            </span>
            <a href="/orders" className="text-xs font-bold bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors">
              Track Order
            </a>
          </div>
        )}

        {/* Consumer Content Rows */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Nearby Produce listings */}
          <div className="bg-white rounded-xl p-5 border card-shadow">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
                📍 Fresh Produce in <strong className="text-green-700">{profile?.state}</strong>
              </h3>
              <a href="/marketplace" className="text-xs font-bold text-green-600 hover:underline flex items-center gap-0.5">
                Browse Marketplace <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {localListings.slice(0, 5).map(l => (
                <div key={l.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all border border-gray-100">
                  <div>
                    <p className="font-semibold text-sm text-gray-950">🌾 {l.commodity} ({l.variety})</p>
                    <p className="text-xs text-gray-500 font-medium mt-0.5">Farmer: {l.farmer_name} | 📍 {l.location}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-700 font-numeric">₹{l.asking_price}/kg</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 font-numeric">{l.quantity} kg available</p>
                  </div>
                </div>
              ))}
              {localListings.length === 0 && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No local crop listings found in {profile?.state || 'your state'} at this moment.
                </div>
              )}
            </div>
          </div>

          {/* Average prices chart */}
          <div className="bg-white rounded-xl p-5 border card-shadow">
            <h3 className="font-semibold text-gray-900 mb-4">Avg Mandi Price by State (Rs/kg)</h3>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={avgPricesByState}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="state" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => `₹${v}/kg`} />
                <Bar dataKey="avgPrice" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // Classic Platform Overview Dashboard for Buyer/Admin/Guests
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm">AgriConnect - Overview of marketplace activity</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 card-shadow hover-lift">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Farmers Connected</p>
              <p className="text-2xl font-bold text-gray-900">{summary?.farmersConnected || 0}</p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg"><Users className="h-6 w-6 text-green-600" /></div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 card-shadow hover-lift">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Orders Completed</p>
              <p className="text-2xl font-bold text-gray-900">{summary?.ordersCompleted || 0}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg"><ShoppingCart className="h-6 w-6 text-blue-600" /></div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 card-shadow hover-lift">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Trade Value</p>
              <p className="text-2xl font-bold text-gray-900">Rs{((summary?.totalTradeValue || 0) / 100000).toFixed(1)}L</p>
            </div>
            <div className="bg-amber-100 p-3 rounded-lg"><TrendingUp className="h-6 w-6 text-amber-600" /></div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 card-shadow hover-lift">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Listings</p>
              <p className="text-2xl font-bold text-gray-900">{listings.length}</p>
            </div>
            <div className="bg-purple-100 p-3 rounded-lg"><Wheat className="h-6 w-6 text-purple-600" /></div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 card-shadow">
          <h3 className="font-semibold text-gray-900 mb-4">Supply by Commodity (kg)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={commodityChart.slice(0, 6)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl p-5 card-shadow">
          <h3 className="font-semibold text-gray-900 mb-4">Avg Market Price by State (Rs/kg)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={avgPricesByState}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="state" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => `₹${v}/kg`} />
              <Bar dataKey="avgPrice" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Latest Listings and Forecasts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 card-shadow">
          <h3 className="font-semibold text-gray-900 mb-4">Latest Produce Listings</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {listings.slice(0, 8).map(l => (
              <div key={l.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{l.commodity} - {l.variety}</p>
                  <p className="text-xs text-gray-500">{l.farmer_name} | {l.location}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-green-700">Rs{l.asking_price}/kg</p>
                  <p className="text-xs text-gray-500">{l.quantity} kg</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 card-shadow">
          <h3 className="font-semibold text-gray-900 mb-4">Demand Forecasts (Next 7 Days)</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {forecasts.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">No forecast data available</p>
                <p className="text-xs mt-1">Load historical market data to enable forecasting</p>
              </div>
            ) : forecasts.map(f => {
              const isHistorical = f.model_version === 'HISTORICAL' || f.data_source === 'historical_dataset';
              return (
                <div key={f.id || f.commodity} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-semibold text-sm">{f.commodity} in {f.location}</p>
                    <p className="text-xs text-gray-500 font-medium">
                      {isHistorical ? '📊 Historical Trend Projection' : '⚠️ Demo Forecast'}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {isHistorical 
                        ? `Based on AGMARKNET historical market records. ${f.notes || ''}` 
                        : 'Not a live ML prediction (simulated)'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-700 font-numeric">{parseInt(f.predicted_demand).toLocaleString()} kg</p>
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase ${
                        isHistorical ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {isHistorical ? 'Historical Trend' : 'Simulated Demo'}
                      </span>
                      <p className="text-xs text-gray-400 font-numeric">{f.confidence_score ? `${f.confidence_score}%` : 'N/A'} conf.</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
