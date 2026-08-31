import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { impactAPI, listingAPI, marketAPI, forecastAPI, dashboardAPI } from '../services/api';
import { Users, ShoppingCart, TrendingUp, Wheat, ArrowUpRight, Clock, CheckCircle, Truck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const cropLabels = { TOMATO: 'Tomato', ONION: 'Onion', POTATO: 'Potato', WHEAT: 'Wheat', RICE: 'Rice', CORN: 'Corn', BRINJAL: 'Brinjal', LETTUCE: 'Lettuce', MANGO: 'Mango', APPLE: 'Apple', BANANA: 'Banana' };

const chartTooltipStyle = {
  contentStyle: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', fontSize: '12px', color: '#18181b', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
  cursor: { fill: 'rgba(0,0,0,0.03)' }
};

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [summary, setSummary] = useState(null);
  const [listings, setListings] = useState([]);
  const [prices, setPrices] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const promises = [impactAPI.getSummary(), listingAPI.getAll(), marketAPI.getLatest(), forecastAPI.getAll()];
    if (user) promises.push(dashboardAPI.getStats());
    Promise.all(promises).then(([s, l, p, f, st]) => {
      if (!mountedRef.current) return;
      setSummary(s?.data || null); setListings(l?.data || []); setPrices(p?.data || []); setForecasts(f?.data || []);
      if (st) setStats(st?.data || {});
    }).catch(err => console.error('Failed to load dashboard:', err))
    .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [user]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--bg-overlay)', borderTopColor: 'var(--accent)' }} />
    </div>
  );

  const commodityData = {};
  listings.forEach(l => { commodityData[l.commodity] = (commodityData[l.commodity] || 0) + parseFloat(l.quantity); });
  const commodityChart = Object.entries(commodityData).map(([name, value]) => ({ name: cropLabels[name] || name, value })).sort((a, b) => b.value - a.value);

  const statePriceData = {};
  prices.forEach(p => {
    if (!statePriceData[p.state]) statePriceData[p.state] = { state: p.state, prices: [] };
    const isQuintal = p.source === 'mandi_api' || p.source === 'historical_dataset' || p.source === 'agmarknet_historical';
    statePriceData[p.state].prices.push(isQuintal ? parseFloat(p.modal_price) / 100 : parseFloat(p.modal_price));
  });
  const avgPricesByState = Object.values(statePriceData).map(d => ({
    state: d.state.split(' ').slice(0, 2).join(' '),
    avgPrice: Math.round(d.prices.reduce((a, b) => a + b, 0) / d.prices.length),
  }));

  // Consumer Dashboard
  if (user?.role === 'CONSUMER') {
    const localListings = listings.filter(l => l.farmer_state?.toLowerCase() === profile?.state?.toLowerCase());
    const pendingOrdersCount = stats.pendingOrders || 0;
    const completedOrdersCount = (stats.totalOrders - stats.pendingOrders) || 0;
    const totalSpent = stats.totalSpent || 0;

    return (
      <div className="space-y-6 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Consumer Dashboard</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Welcome back, {profile?.name || user?.email}! Track your fresh produce orders.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 stagger-children">
          {[
            { icon: Clock, label: 'Active Orders', value: pendingOrdersCount, color: 'var(--info)', bg: 'rgba(59,130,246,0.1)' },
            { icon: CheckCircle, label: 'Completed', value: completedOrdersCount, color: 'var(--accent)', bg: 'rgba(34,197,94,0.1)' },
            { icon: TrendingUp, label: 'Total Spent', value: `₹${totalSpent.toLocaleString()}`, color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)' },
            { icon: Wheat, label: `Produce in ${profile?.state || 'State'}`, value: localListings.length, color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className="card-surface p-5 hover-premium">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</p>
                  <p className="text-2xl font-bold mt-1 font-numeric" style={{ color: 'var(--text-primary)' }}>{value}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: bg }}><Icon className="h-6 w-6" style={{ color }} /></div>
              </div>
            </div>
          ))}
        </div>

        {pendingOrdersCount > 0 && (
          <div className="rounded-xl p-4 flex items-center justify-between"
            style={{ background: 'var(--accent-glow)', border: '1px solid var(--border-accent)' }}>
            <span className="text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Truck className="h-5 w-5 animate-pulse" style={{ color: 'var(--accent)' }} />
              You have <strong>{pendingOrdersCount} active delivery</strong> in progress.
            </span>
            <a href="/orders" className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}>Track Order</a>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-surface p-5 hover-lift">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                Fresh Produce in <strong style={{ color: 'var(--accent)' }}>{profile?.state}</strong>
              </h3>
              <a href="/marketplace" className="text-xs font-bold flex items-center gap-0.5 transition-colors hover-glow"
                style={{ color: 'var(--accent)' }}>
                Browse <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {localListings.slice(0, 5).map(l => (
                <div key={l.id} className="flex items-center justify-between p-3 rounded-lg transition-all hover-glow"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{cropLabels[l.commodity] || l.commodity} ({l.variety})</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Farmer: {l.farmer_name} | {l.location}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold font-numeric" style={{ color: 'var(--accent)' }}>₹{l.asking_price}/kg</p>
                    <p className="text-[11px] mt-0.5 font-numeric" style={{ color: 'var(--text-muted)' }}>{l.quantity} kg</p>
                  </div>
                </div>
              ))}
              {localListings.length === 0 && (
                <div className="text-center py-8">
                  <Package className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--accent)', opacity: 0.5 }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>No local produce found</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Check back soon for fresh listings in your state.</p>
                </div>
              )}
            </div>
          </div>

          <div className="card-surface p-5 hover-lift">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Avg Mandi Price by State (₹/kg)</h3>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={avgPricesByState}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="state" tick={{ fontSize: 11, fill: '#71717a' }} />
                <YAxis tick={{ fontSize: 12, fill: '#71717a' }} />
                <Tooltip {...chartTooltipStyle} formatter={(v) => `₹${v}/kg`} />
                <Bar dataKey="avgPrice" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // Generic Dashboard
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold gradient-text">Dashboard</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Overview of marketplace activity</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {[
          { icon: Users, label: 'Farmers Connected', value: summary?.farmersConnected || 0, color: 'var(--accent)', bg: 'rgba(34,197,94,0.1)' },
          { icon: ShoppingCart, label: 'Orders Completed', value: summary?.ordersCompleted || 0, color: 'var(--info)', bg: 'rgba(59,130,246,0.1)' },
          { icon: TrendingUp, label: 'Trade Value', value: `₹${((summary?.totalTradeValue || 0) / 100000).toFixed(1)}L`, color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)' },
          { icon: Wheat, label: 'Active Listings', value: listings.length, color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="card-surface p-5 hover-premium">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>
                <p className="text-2xl font-bold font-numeric" style={{ color: 'var(--text-primary)' }}>{value}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: bg }}><Icon className="h-6 w-6" style={{ color }} /></div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-surface p-5 hover-lift">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Supply by Commodity (kg)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={commodityChart.slice(0, 6)}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#71717a' }} />
              <YAxis tick={{ fontSize: 12, fill: '#71717a' }} />
              <Tooltip {...chartTooltipStyle} />
              <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card-surface p-5 hover-lift">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Avg Market Price by State (₹/kg)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={avgPricesByState}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="state" tick={{ fontSize: 11, fill: '#71717a' }} />
              <YAxis tick={{ fontSize: 12, fill: '#71717a' }} />
              <Tooltip {...chartTooltipStyle} formatter={(v) => `₹${v}/kg`} />
              <Bar dataKey="avgPrice" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-surface p-5 hover-lift">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Latest Produce Listings</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {listings.slice(0, 8).map(l => (
              <div key={l.id} className="flex items-center justify-between p-3 rounded-lg transition-all hover-glow"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <div>
                  <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{cropLabels[l.commodity] || l.commodity} - {l.variety}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{l.farmer_name} | {l.location}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold font-numeric" style={{ color: 'var(--accent)' }}>₹{l.asking_price}/kg</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{l.quantity} kg</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card-surface p-5 hover-lift">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Demand Forecasts (Next 7 Days)</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {forecasts.length === 0 ? (
              <div className="text-center py-8">
                <TrendingUp className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--accent)', opacity: 0.5 }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>No forecast data available</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Load historical data to enable forecasting</p>
              </div>
            ) : forecasts.map(f => {
              const isHistorical = f.model_version === 'HISTORICAL' || f.data_source === 'historical_dataset';
              return (
                <div key={f.id || f.commodity} className="flex items-center justify-between p-3 rounded-lg transition-all hover-glow"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{cropLabels[f.commodity] || f.commodity} in {f.location}</p>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                      {isHistorical ? 'Historical Trend Projection' : 'Simulated Forecast'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold font-numeric" style={{ color: 'var(--info)' }}>{parseInt(f.predicted_demand).toLocaleString()} kg</p>
                    <span className={`badge text-[9px] ${isHistorical ? 'badge-info' : 'badge-warning'}`}>
                      {isHistorical ? 'Historical' : 'Demo'}
                    </span>
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
