import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { listingAPI, dashboardAPI, orderAPI } from '../services/api';
import { Plus, Package, TrendingUp, ShoppingCart, Eye } from 'lucide-react';

export default function FarmerDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({});
  const [listings, setListings] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ commodity: 'TOMATO', variety: '', grade: 'GRADE_A', quantity: '', askingPrice: '', location: '', state: 'Maharashtra', district: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const [s, l] = await Promise.all([dashboardAPI.getStats(), listingAPI.getAll()]);
      setStats(s.data);
      setListings(l.data);
    } finally { setLoading(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    await listingAPI.create(form);
    setShowAdd(false);
    setForm({ commodity: 'TOMATO', variety: '', grade: 'GRADE_A', quantity: '', askingPrice: '', location: '', state: 'Maharashtra', district: '' });
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Farmer Dashboard</h1>
          <p className="text-gray-500 text-sm">Manage your produce listings and track sales</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
          <Plus className="h-4 w-4" /> Add Listing
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-3 rounded-lg"><Package className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Total Listings</p>
              <p className="text-xl font-bold">{stats.totalListings || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-3 rounded-lg"><Eye className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Active Listings</p>
              <p className="text-xl font-bold">{stats.activeListings || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-3 rounded-lg"><TrendingUp className="h-5 w-5 text-amber-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Total Sales</p>
              <p className="text-xl font-bold">Rs{(stats.totalSales || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Listing Form */}
      {showAdd && (
        <div className="bg-white rounded-xl p-6 card-shadow">
          <h3 className="font-semibold text-gray-900 mb-4">Create New Listing</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Commodity</label>
              <select value={form.commodity} onChange={e => setForm({ ...form, commodity: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                {['TOMATO','ONION','POTATO','WHEAT','RICE','CORN','BRINJAL','LETTUCE','MANGO','APPLE','BANANA'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Variety</label>
              <input value={form.variety} onChange={e => setForm({ ...form, variety: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Roma" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
              <select value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                {['GRADE_A','GRADE_B','GRADE_C','PREMIUM'].map(g => <option key={g} value={g}>{g.replace('_',' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (kg)</label>
              <input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Asking Price (Rs/kg)</label>
              <input type="number" value={form.askingPrice} onChange={e => setForm({ ...form, askingPrice: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
              <input value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
              <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Create Listing</button>
              <button type="button" onClick={() => setShowAdd(false)} className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Listings Table */}
      <div className="bg-white rounded-xl card-shadow overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">Your Listings</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Commodity</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Variety</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty (kg)</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price (Rs/kg)</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {listings.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-sm font-medium">{l.commodity}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{l.variety || '-'}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{(l.grade || '').replace('_', ' ')}</td>
                  <td className="px-5 py-3 text-sm">{l.quantity}</td>
                  <td className="px-5 py-3 text-sm font-medium text-green-700">Rs{l.asking_price}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${l.listing_status === 'ACTIVE' ? 'bg-green-100 text-green-700' : l.listing_status === 'SOLD' ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-700'}`}>
                      {l.listing_status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{l.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
