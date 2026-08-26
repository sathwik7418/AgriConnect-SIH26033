import { useState, useEffect } from 'react';
import { impactAPI } from '../services/api';
import { Users, TrendingUp, DollarSign, Clock, Truck, Leaf, ShoppingCart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

export default function Impact() {
  const [metrics, setMetrics] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([impactAPI.getMetrics(), impactAPI.getSummary()]).then(([m, s]) => {
      setMetrics(m.data);
      setSummary(s.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>;

  const metricCards = [
    { icon: Users, label: 'Farmers Connected', value: summary?.farmersConnected || 0, color: 'bg-green-100 text-green-600' },
    { icon: ShoppingCart, label: 'Orders Completed', value: summary?.ordersCompleted || 0, color: 'bg-blue-100 text-blue-600' },
    { icon: DollarSign, label: 'Total Trade Value', value: `Rs${((summary?.totalTradeValue || 0) / 100000).toFixed(1)}L`, color: 'bg-amber-100 text-amber-600' },
  ];

  const pieData = metrics.filter(m => ['farmers_connected', 'buyers_connected', 'orders_completed'].includes(m.metric_type))
    .map(m => ({ name: m.metric_type.replace('_', ' '), value: parseFloat(m.metric_value) }));

  const barData = metrics.filter(m => ['total_trade_value', 'transport_cost_saved'].includes(m.metric_type))
    .map(m => ({ name: m.metric_type.replace('_', ' '), value: parseFloat(m.metric_value) }));

  const gaugeData = metrics.filter(m => ['avg_farmer_income_increase', 'waste_reduction'].includes(m.metric_type))
    .map(m => ({ name: m.metric_type.replace('_', ' '), value: parseFloat(m.metric_value) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Impact Dashboard</h1>
        <p className="text-gray-500 text-sm">Measuring social and economic impact of AgriConnect</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {metricCards.map(({ icon: Icon, label, value, color }, i) => (
          <div key={i} className="bg-white rounded-xl p-5 card-shadow hover-lift">
            <div className="flex items-center gap-4">
              <div className={`${color} p-3 rounded-xl`}><Icon className="h-6 w-6" /></div>
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 card-shadow">
          <h3 className="font-semibold text-gray-900 mb-4">Stakeholder Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} dataKey="value">
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl p-5 card-shadow">
          <h3 className="font-semibold text-gray-900 mb-4">Financial Impact (Rs)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `Rs${(v/100000).toFixed(1)}L`} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {barData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Improvement Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 card-shadow">
          <h3 className="font-semibold text-gray-900 mb-4">Key Improvements</h3>
          <div className="space-y-4">
            {gaugeData.map((g, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{g.name.replace(/_/g, ' ')}</span>
                  <span className="font-bold text-green-700">{g.value}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="bg-green-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(g.value, 100)}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 card-shadow">
          <h3 className="font-semibold text-gray-900 mb-4">All Metrics</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {metrics.map(m => (
              <div key={m.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-700">{m.metric_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-500">Unit: {m.unit}</p>
                </div>
                <p className="font-bold text-gray-900">{parseFloat(m.metric_value).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white rounded-xl p-6 card-shadow">
        <h3 className="font-semibold text-gray-900 mb-4">How AgriConnect Creates Impact</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="bg-green-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <h4 className="font-medium text-gray-900 mb-1">22% Income Increase</h4>
            <p className="text-sm text-gray-500">Farmers earn more by selling directly to buyers, eliminating middlemen</p>
          </div>
          <div className="text-center">
            <div className="bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
              <Truck className="h-6 w-6 text-blue-600" />
            </div>
            <h4 className="font-medium text-gray-900 mb-1">Optimized Logistics</h4>
            <p className="text-sm text-gray-500">Direct farm-to-buyer routes reduce transport costs by 15%</p>
          </div>
          <div className="text-center">
            <div className="bg-amber-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
              <Leaf className="h-6 w-6 text-amber-600" />
            </div>
            <h4 className="font-medium text-gray-900 mb-1">15% Waste Reduction</h4>
            <p className="text-sm text-gray-500">Better demand forecasting and faster delivery reduce food waste</p>
          </div>
        </div>
      </div>
    </div>
  );
}
