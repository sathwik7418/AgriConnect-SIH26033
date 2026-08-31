import { useState, useEffect } from 'react';
import { impactAPI } from '../services/api';
import { Users, TrendingUp, DollarSign, Truck, Leaf, ShoppingCart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];
const chartTooltipStyle = {
  contentStyle: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', fontSize: '12px', color: '#18181b', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
  cursor: { fill: 'rgba(0,0,0,0.03)' }
};

export default function Impact() {
  const [metrics, setMetrics] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([impactAPI.getMetrics(), impactAPI.getSummary()])
      .then(([m, s]) => { setMetrics(m?.data || []); setSummary(s?.data || null); })
      .catch(err => console.error('Failed to load impact:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--bg-overlay)', borderTopColor: 'var(--accent)' }} />
    </div>
  );

  const metricCards = [
    { icon: Users, label: 'Farmers Connected', value: summary?.farmersConnected || 0, color: 'var(--accent)', bg: 'rgba(34,197,94,0.1)' },
    { icon: ShoppingCart, label: 'Orders Completed', value: summary?.ordersCompleted || 0, color: 'var(--info)', bg: 'rgba(59,130,246,0.1)' },
    { icon: DollarSign, label: 'Trade Value', value: `₹${((summary?.totalTradeValue || 0) / 100000).toFixed(1)}L`, color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)' },
  ];

  const pieData = metrics.filter(m => ['farmers_connected', 'buyers_connected', 'orders_completed'].includes(m.metric_type))
    .map(m => ({ name: m.metric_type.replace('_', ' '), value: parseFloat(m.metric_value) }));

  const barData = metrics.filter(m => ['total_trade_value', 'transport_cost_saved'].includes(m.metric_type))
    .map(m => ({ name: m.metric_type.replace('_', ' '), value: parseFloat(m.metric_value) }));

  const gaugeData = metrics.filter(m => ['avg_farmer_income_increase', 'waste_reduction'].includes(m.metric_type))
    .map(m => ({ name: m.metric_type.replace('_', ' '), value: parseFloat(m.metric_value) }));

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold gradient-text">Impact Dashboard</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Measuring social and economic impact of AgriConnect</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
        {metricCards.map(({ icon: Icon, label, value, color, bg }, i) => (
          <div key={i} className="card-surface p-5 hover-lift">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl" style={{ background: bg }}><Icon className="h-6 w-6" style={{ color }} /></div>
              <div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-surface p-5 hover-lift">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Stakeholder Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} dataKey="value">
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip {...chartTooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card-surface p-5 hover-lift">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Financial Impact (₹)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#71717a' }} />
              <YAxis tick={{ fontSize: 11, fill: '#71717a' }} />
              <Tooltip {...chartTooltipStyle} formatter={(v) => `₹${(v/100000).toFixed(1)}L`} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {barData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Improvements + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-surface p-5 hover-lift">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Key Improvements</h3>
          <div className="space-y-4">
            {gaugeData.map((g, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{g.name.replace(/_/g, ' ')}</span>
                  <span className="font-bold" style={{ color: 'var(--accent)' }}>{g.value}%</span>
                </div>
                <div className="w-full rounded-full h-2.5" style={{ background: 'var(--bg-overlay)' }}>
                  <div className="h-2.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(g.value, 100)}%`, background: 'var(--accent)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card-surface p-5 hover-lift">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>All Metrics</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {metrics.map(m => (
              <div key={m.id} className="flex justify-between items-center p-3 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{m.metric_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Unit: {m.unit}</p>
                </div>
                <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{parseFloat(m.metric_value).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="card-atmospheric p-6">
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>How AgriConnect Creates Impact</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: TrendingUp, title: '22% Income Increase', desc: 'Farmers earn more by selling directly to buyers, eliminating middlemen', color: 'var(--accent)', bg: 'rgba(34,197,94,0.1)' },
            { icon: Truck, title: 'Optimized Logistics', desc: 'Direct farm-to-buyer routes reduce transport costs by 15%', color: 'var(--info)', bg: 'rgba(59,130,246,0.1)' },
            { icon: Leaf, title: '15% Waste Reduction', desc: 'Better demand forecasting and faster delivery reduce food waste', color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)' },
          ].map(({ icon: Icon, title, desc, color, bg }) => (
            <div key={title} className="text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: bg }}>
                <Icon className="h-6 w-6" style={{ color }} />
              </div>
              <h4 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h4>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
