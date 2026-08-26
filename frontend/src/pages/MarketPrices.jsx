import { useState, useEffect } from 'react';
import { marketAPI } from '../services/api';
import { RefreshCw, TrendingUp, TrendingDown, Minus, Info, LayoutGrid, Table } from 'lucide-react';
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
  const [viewMode, setViewMode] = useState('cards'); // 'cards' (Farmer visual view) or 'table' (Tabular view)

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

  // Helper to format prices correctly with both original and converted units
  const getPriceDetails = (minPrice, maxPrice, modalPrice, source) => {
    const isQuintal = source === 'mandi_api' || source === 'historical_dataset' || source === 'agmarknet_historical';
    const minVal = parseFloat(minPrice);
    const maxVal = parseFloat(maxPrice);
    const modalVal = parseFloat(modalPrice);
    
    if (isQuintal) {
      return {
        unit: '₹/quintal',
        minText: `₹${minVal.toLocaleString()}/quintal (₹${(minVal/100).toFixed(1)}/kg)`,
        maxText: `₹${maxVal.toLocaleString()}/quintal (₹${(maxVal/100).toFixed(1)}/kg)`,
        modalText: `₹${modalVal.toLocaleString()}/quintal (₹${(modalVal/100).toFixed(1)}/kg)`,
        convertedModal: `₹${(modalVal/100).toFixed(1)}/kg`
      };
    } else {
      return {
        unit: '₹/kg',
        minText: `₹${minVal.toFixed(1)}/kg`,
        maxText: `₹${maxVal.toFixed(1)}/kg`,
        modalText: `₹${modalVal.toFixed(1)}/kg`,
        convertedModal: `₹${modalVal.toFixed(1)}/kg`
      };
    }
  };

  // Prepare chart data - normalized to ₹/kg
  const chartData = {};
  latest.forEach(p => {
    if (!chartData[p.commodity]) chartData[p.commodity] = { commodity: p.commodity, prices: [] };
    const isQuintal = p.source === 'mandi_api' || p.source === 'historical_dataset' || p.source === 'agmarknet_historical';
    const pricePerKg = isQuintal ? parseFloat(p.modal_price) / 100 : parseFloat(p.modal_price);
    chartData[p.commodity].prices.push(pricePerKg);
  });
  
  const barData = Object.values(chartData).map(d => ({
    commodity: d.commodity,
    avgPrice: parseFloat((d.prices.reduce((a, b) => a + b, 0) / d.prices.length).toFixed(2)),
    count: d.prices.length,
  }));

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Market Prices (Mandi Price Intelligence)</h1>
          <p className="text-gray-500 text-sm">Official daily mandi rates across government-regulated APMC markets</p>
        </div>
        <button onClick={handleSync} disabled={syncing} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium shadow-sm">
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          Sync Data
        </button>
      </div>

      {/* Guide Panel */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-sm text-blue-900 space-y-2">
        <h4 className="font-bold flex items-center gap-1.5 text-blue-950">
          <Info className="h-4 w-4 text-blue-700" /> Mandi Price Guide & Explanations
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <p>📍 <span className="font-semibold">Market (Mandi):</span> The specific government agricultural market yard where trade happened.</p>
          <p>💰 <span className="font-semibold">Typical Price (Modal):</span> The price at which most transactions took place. Best price reference.</p>
          <p>⬇️ <span className="font-semibold">Lowest (Min) / Highest (Max):</span> The minimum and maximum prices recorded on the day.</p>
          <p>🔗 <span className="font-semibold">Source:</span> Origin of data: Government APIs (official portal), APMC Mandi inputs, or historical datasets.</p>
          <p>🕐 <span className="font-semibold">Freshness:</span> Indicates if the rates are from today's arrivals (fresh) or historical reference.</p>
        </div>
      </div>

      {/* Filters & View Toggles */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-4 rounded-xl border">
        <div className="flex gap-3 flex-wrap">
          <select value={commodity} onChange={e => setCommodity(e.target.value)} className="px-3 py-2 border rounded-lg text-sm bg-gray-50">
            {commodities.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All Crops' : c}</option>)}
          </select>
          <select value={state} onChange={e => setState(e.target.value)} className="px-3 py-2 border rounded-lg text-sm bg-gray-50">
            {states.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All States' : s}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-semibold">{prices.length} records found</span>
          <div className="bg-gray-100 p-0.5 rounded-lg flex border">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-md flex items-center gap-1 text-xs font-semibold transition-all ${viewMode === 'cards' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Farmer Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md flex items-center gap-1 text-xs font-semibold transition-all ${viewMode === 'table' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <Table className="h-3.5 w-3.5" /> Table View
            </button>
          </div>
        </div>
      </div>

      {/* Average Modal Price Chart */}
      {barData.length > 0 && (
        <div className="bg-white rounded-xl p-5 card-shadow border">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            Average Modal Price by Crop (Normalized to ₹/kg)
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="commodity" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit=" ₹" />
              <Tooltip formatter={(v) => `₹${v}/kg`} />
              <Bar dataKey="avgPrice" name="Avg Price (₹/kg)" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Farmer Cards View */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {prices.slice(0, 99).map(p => {
            const pricing = getPriceDetails(p.min_price, p.max_price, p.modal_price, p.source);
            
            return (
              <div key={p.id} className="bg-white rounded-xl p-5 border card-shadow space-y-3 hover:border-green-300 hover:shadow-md transition-all">
                <div className="flex justify-between items-start border-b pb-2">
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg flex items-center gap-1.5">
                      🌾 Crop: {p.commodity}
                    </h3>
                    <p className="text-xs text-gray-400 font-semibold">{p.variety || 'Standard Variety'}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
                    p.data_freshness === 'fresh' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    🕐 {p.data_freshness?.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-1.5 text-sm">
                  <p className="text-gray-600 flex items-start gap-1">
                    <span className="text-gray-400">📍</span>
                    <span>
                      <strong className="text-gray-800">Market:</strong> {p.market}, {p.state}
                    </span>
                  </p>
                  <p className="text-gray-600 flex items-center gap-1">
                    <span className="text-gray-400">💰</span>
                    <span>
                      <strong className="text-gray-800">Typical Price:</strong> <span className="text-green-700 font-bold font-numeric">{pricing.convertedModal}</span>
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 pl-5">
                    Original Price: {pricing.modalText}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs">
                  <div className="bg-gray-50 p-2 rounded-lg space-y-0.5">
                    <span className="text-gray-400 font-semibold">⬇️ Lowest</span>
                    <p className="font-bold text-gray-800 font-numeric">{pricing.convertedModal === pricing.minText ? pricing.convertedModal : pricing.minText.split(' ')[0]}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded-lg space-y-0.5">
                    <span className="text-gray-400 font-semibold">⬆️ Highest</span>
                    <p className="font-bold text-gray-800 font-numeric">{pricing.maxText.split(' ')[0]}</p>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[10px] pt-1 text-gray-400">
                  <span>🔗 Source: {
                    p.source === 'government_api' ? 'Official Gov Portal' :
                    p.source === 'mandi_api' ? 'APMC Mandi Yard' :
                    p.source === 'agmarknet_historical' ? 'Historical AGMARKNET' :
                    p.source
                  }</span>
                  <span>Rec: {new Date(p.arrival_date).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabular View */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-xl card-shadow border overflow-hidden">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">State</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Market</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Crop</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Min Price</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Typical (Modal)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Max Price</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Original Unit</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Freshness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {prices.slice(0, 150).map(p => {
                  const pricing = getPriceDetails(p.min_price, p.max_price, p.modal_price, p.source);

                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">{p.state}</td>
                      <td className="px-4 py-2.5 font-medium">{p.market}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-medium">{p.commodity}</span>
                      </td>
                      <td className="px-4 py-2.5 text-green-600 font-medium font-numeric">{pricing.minText}</td>
                      <td className="px-4 py-2.5 font-bold font-numeric">{pricing.modalText}</td>
                      <td className="px-4 py-2.5 text-red-600 font-numeric">{pricing.maxText}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{pricing.unit}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                          p.source === 'mandi_api' ? 'bg-blue-100 text-blue-700' :
                          p.source === 'government_api' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {p.source}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${p.data_freshness === 'fresh' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {p.data_freshness}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
