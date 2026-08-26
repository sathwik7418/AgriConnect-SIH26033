import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { demandAPI, listingAPI, orderAPI, dashboardAPI } from '../services/api';
import { Plus, ShoppingCart, TrendingDown, Clock, CheckCircle } from 'lucide-react';

export default function BuyerDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({});
  const [demands, setDemands] = useState([]);
  const [listings, setListings] = useState([]);
  const [showDemand, setShowDemand] = useState(false);
  const [form, setForm] = useState({ commodity: 'TOMATO', requiredQuantity: '', targetPrice: '', deliveryLocation: '', requiredGrade: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [s, d, l] = await Promise.all([dashboardAPI.getStats(), demandAPI.getAll(), listingAPI.getAll()]);
      setStats(s.data);
      setDemands(d.data);
      setListings(l.data);
    } finally { setLoading(false); }
  };

  const handleCreateDemand = async (e) => {
    e.preventDefault();
    await demandAPI.create(form);
    setShowDemand(false);
    setForm({ commodity: 'TOMATO', requiredQuantity: '', targetPrice: '', deliveryLocation: '', requiredGrade: '' });
    load();
  };

  const handleOrder = async (listingId) => {
    const qty = prompt('Enter quantity (kg):');
    if (!qty) return;
    await orderAPI.create({ listingId, quantity: parseFloat(qty), deliveryLocation: 'Mumbai' });
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Buyer Dashboard</h1>
          <p className="text-gray-500 text-sm">Browse listings and manage your orders</p>
        </div>
        <button onClick={() => setShowDemand(!showDemand)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Create Demand
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-3 rounded-lg"><ShoppingCart className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Total Orders</p>
              <p className="text-xl font-bold">{stats.totalOrders || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-3 rounded-lg"><Clock className="h-5 w-5 text-amber-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Pending Orders</p>
              <p className="text-xl font-bold">{stats.pendingOrders || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-3 rounded-lg"><TrendingDown className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Total Spent</p>
              <p className="text-xl font-bold">Rs{(stats.totalSpent || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create Demand Form */}
      {showDemand && (
        <div className="bg-white rounded-xl p-6 card-shadow">
          <h3 className="font-semibold text-gray-900 mb-4">Create Purchase Demand</h3>
          <form onSubmit={handleCreateDemand} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Commodity</label>
              <select value={form.commodity} onChange={e => setForm({ ...form, commodity: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                {['TOMATO','ONION','POTATO','WHEAT','RICE','CORN','BRINJAL','LETTUCE','MANGO','APPLE','BANANA'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Required Qty (kg)</label>
              <input type="number" value={form.requiredQuantity} onChange={e => setForm({ ...form, requiredQuantity: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Price (Rs/kg)</label>
              <input type="number" value={form.targetPrice} onChange={e => setForm({ ...form, targetPrice: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Location</label>
              <input value={form.deliveryLocation} onChange={e => setForm({ ...form, deliveryLocation: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" required />
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Create</button>
              <button type="button" onClick={() => setShowDemand(false)} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* My Demands */}
      <div className="bg-white rounded-xl card-shadow overflow-hidden">
        <div className="px-5 py-4 border-b"><h3 className="font-semibold text-gray-900">Your Demands</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Commodity</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty (kg)</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target Price</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Delivery</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {demands.slice(0, 10).map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-sm font-medium">{d.commodity}</td>
                  <td className="px-5 py-3 text-sm">{d.required_quantity}</td>
                  <td className="px-5 py-3 text-sm font-medium text-blue-700">Rs{d.target_price}/kg</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{d.delivery_location}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">{d.demand_status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Available Listings */}
      <div className="bg-white rounded-xl card-shadow overflow-hidden">
        <div className="px-5 py-4 border-b"><h3 className="font-semibold text-gray-900">Available Produce</h3></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
          {listings.slice(0, 9).map(l => (
            <div key={l.id} className="border rounded-lg p-4 hover-lift bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-semibold text-gray-900">{l.commodity}</h4>
                  <p className="text-xs text-gray-500">{l.variety} | {(l.grade || '').replace('_', ' ')}</p>
                </div>
                <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">{l.listing_status}</span>
              </div>
              <p className="text-sm text-gray-600 mb-1">Farmer: {l.farmer_name}</p>
              <p className="text-sm text-gray-600 mb-3">{l.quantity} kg available at {l.location}</p>
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-green-700">Rs{l.asking_price}/kg</span>
                <button onClick={() => handleOrder(l.id)} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700">Order</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
