import { useState, useEffect } from 'react';
import { impactAPI, listingAPI, marketAPI, forecastAPI } from '../services/api';
import { Users, ShoppingCart, TrendingUp, BarChart3, Wheat, ArrowUpRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [listings, setListings] = useState([]);
  const [prices, setPrices] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      impactAPI.getSummary(),
      listingAPI.getAll(),
      marketAPI.getLatest(),
      forecastAPI.getAll(),
    ]).then(([s, l, p, f]) => {
      setSummary(s.data);
      setListings(l.data);
      setPrices(p.data);
      setForecasts(f.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>;

  const commodityData = {};
  listings.forEach(l => {
    commodityData[l.commodity] = (commodityData[l.commodity] || 0) + parseFloat(l.quantity);
  });
  const commodityChart = Object.entries(commodityData).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const statePriceData = {};
  prices.forEach(p => {
    if (!statePriceData[p.state]) statePriceData[p.state] = { state: p.state, prices: [] };
    statePriceData[p.state].prices.push(parseFloat(p.modal_price));
  });
  const avgPricesByState = Object.values(statePriceData).map(d => ({
    state: d.state.split(' ').slice(0, 2).join(' '),
    avgPrice: Math.round(d.prices.reduce((a, b) => a + b, 0) / d.prices.length),
  }));

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
              <Tooltip />
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
            ) : forecasts.map(f => (
              <div key={f.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{f.commodity} in {f.location}</p>
                  <p className="text-xs text-gray-500">{f.notes}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-blue-700">{parseInt(f.predicted_demand).toLocaleString()} kg</p>
                  <div className="flex items-center gap-1.5 justify-end">
                    {f.model_version === 'DEMO' || f.model_version === 'SYNTHETIC' || f.data_source === 'seed_demo' ? (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-700 font-medium">DEMO</span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-100 text-green-700 font-medium">LIVE</span>
                    )}
                    <p className="text-xs text-gray-400">{f.confidence_score}% conf.</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
