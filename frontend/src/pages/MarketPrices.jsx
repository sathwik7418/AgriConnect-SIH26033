import { useState, useEffect } from 'react';
import { marketAPI } from '../services/api';
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const commodities = ['ALL', 'TOMATO', 'ONION', 'POTATO', 'WHEAT', 'RICE'];
const states = ['ALL', 'Maharashtra', 'Karnataka', 'Madhya Pradesh', 'Rajasthan', 'Delhi'];

export default function MarketPrices() {
  const [prices, setPrices] = useState([]);
  const [latest, setLatest] = useState([]);
  const [commodity, setCommodity] = useState('ALL');
  const [state, setState] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (commodity !== 'ALL') params.commodity = commodity;
      if (state !== 'ALL') params.state = state;
      const [p, l] = await Promise.all([marketAPI.getPrices(params), marketAPI.getLatest()]);
      setPrices(p.data);
      setLatest(l.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [commodity, state]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await marketAPI.sync();
      if (result.data?.hint) {
        alert(result.data.hint);
      }
      await load();
    } catch (err) {
      if (err.response?.data?.hint) {
        alert(err.response.data.hint);
      } else if (err.response?.data?.error) {
        alert(`Sync failed: ${err.response.data.error}`);
      }
    }
    setSyncing(false);
  };

  // Prepare chart data - group by commodity, avg modal price
  const chartData = {};
  latest.forEach(p => {
    if (!chartData[p.commodity]) chartData[p.commodity] = { commodity: p.commodity, prices: [] };
    chartData[p.commodity].prices.push(parseFloat(p.modal_price));
  });
  const barData = Object.values(chartData).map(d => ({
    commodity: d.commodity,
    avgPrice: Math.round(d.prices.reduce((a, b) => a + b, 0) / d.prices.length),
    count: d.prices.length,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Market Prices</h1>
          <p className="text-gray-500 text-sm">Government mandi prices across India</p>
        </div>
        <button onClick={handleSync} disabled={syncing} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          Sync Data
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={commodity} onChange={e => setCommodity(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
          {commodities.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All Commodities' : c}</option>)}
        </select>
        <select value={state} onChange={e => setState(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
          {states.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All States' : s}</option>)}
        </select>
        <span className="self-center text-sm text-gray-500">{prices.length} records found</span>
        {prices.length > 0 && prices[0].source === 'seed_demo' && (
          <span className="self-center px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-700 font-medium">DEMO DATA</span>
        )}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl p-5 card-shadow">
        <h3 className="font-semibold text-gray-900 mb-4">Average Modal Price by Commodity (Rs/kg)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="commodity" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="avgPrice" name="Avg Modal Price" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Prices Table */}
      <div className="bg-white rounded-xl card-shadow overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">Mandi Price Records</h3>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Market</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Commodity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Min (Rs)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Modal (Rs)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Max (Rs)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Freshness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prices.slice(0, 100).map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-sm">{p.state}</td>
                  <td className="px-4 py-2.5 text-sm font-medium">{p.market}</td>
                  <td className="px-4 py-2.5 text-sm">
                    <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-medium">{p.commodity}</span>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-green-600 font-medium">Rs{p.min_price}</td>
                  <td className="px-4 py-2.5 text-sm font-bold">Rs{p.modal_price}</td>
                  <td className="px-4 py-2.5 text-sm text-red-600">Rs{p.max_price}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                      p.source === 'mandi_api' ? 'bg-green-100 text-green-700' :
                      p.source === 'historical_dataset' ? 'bg-blue-100 text-blue-700' :
                      p.source === 'seed_demo' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {p.source === 'seed_demo' ? 'DEMO' :
                       p.source === 'mandi_api' ? 'LIVE' :
                       p.source === 'historical_dataset' ? 'HISTORICAL' :
                       p.source || 'unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${p.data_freshness === 'fresh' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {p.data_freshness}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
