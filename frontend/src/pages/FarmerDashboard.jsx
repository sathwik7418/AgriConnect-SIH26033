import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { listingAPI, dashboardAPI, marketAPI } from '../services/api';
import { Plus, Package, TrendingUp, Eye, Info, CheckCircle, AlertTriangle } from 'lucide-react';

export default function FarmerDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({});
  const [listings, setListings] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [form, setForm] = useState({
    commodity: 'TOMATO',
    variety: '',
    grade: 'GRADE_A',
    quantity: '',
    askingPrice: '',
    location: '',
    state: '',
    district: ''
  });

  // Price Guidance states
  const [guidancePrice, setGuidancePrice] = useState(null);
  const [guidanceLoading, setGuidanceLoading] = useState(false);

  // Sync form inputs when profile loads
  useEffect(() => {
    if (profile) {
      setForm(prev => ({
        ...prev,
        location: profile.location || '',
        state: profile.state || '',
        district: profile.district || ''
      }));
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.id) {
      load();
    }
  }, [profile]);

  // Fetch price guidance when crop changes or form opens
  useEffect(() => {
    if (showAdd && form.commodity) {
      fetchPriceGuidance(form.commodity);
    }
  }, [form.commodity, showAdd]);

  const load = async () => {
    try {
      const [s, l] = await Promise.all([dashboardAPI.getStats(), listingAPI.getByFarmer(profile.id)]);
      setStats(s.data);
      setListings(l.data);
    } finally { setLoading(false); }
  };

  const fetchPriceGuidance = async (crop) => {
    setGuidanceLoading(true);
    setGuidancePrice(null);
    try {
      const res = await marketAPI.getPrices({ commodity: crop });
      if (res.data && res.data.length > 0) {
        // Find a price in the same state if possible, fallback to the first available record
        let match = res.data.find(p => p.state?.toLowerCase() === profile?.state?.toLowerCase());
        if (!match) match = res.data[0];

        const isQuintal = match.source === 'mandi_api' || match.source === 'historical_dataset' || match.source === 'agmarknet_historical';
        const typicalKg = isQuintal ? parseFloat(match.modal_price) / 100 : parseFloat(match.modal_price);

        setGuidancePrice({
          typical: typicalKg,
          originalTypical: parseFloat(match.modal_price),
          unit: isQuintal ? '₹/quintal' : '₹/kg',
          source: match.source,
          freshness: match.data_freshness || 'fresh',
          market: match.market,
          state: match.state
        });
      }
    } catch (err) {
      console.error('Failed to load market guidance price:', err);
    } finally {
      setGuidanceLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!profile?.location || !profile?.state || !profile?.district) {
      alert('Your profile location details are incomplete. Please complete your profile onboarding first.');
      return;
    }

    await listingAPI.create({
      ...form,
      location: profile.location,
      state: profile.state,
      district: profile.district
    });
    
    setShowAdd(false);
    setForm({
      commodity: 'TOMATO',
      variety: '',
      grade: 'GRADE_A',
      quantity: '',
      askingPrice: '',
      location: profile.location || '',
      state: profile.state || '',
      district: profile.district || ''
    });
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>;

  const profileLocationComplete = profile?.location && profile?.state && profile?.district;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Farmer Dashboard</h1>
          <p className="text-gray-500 text-sm">Manage your produce listings and track sales</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-semibold shadow-sm">
          <Plus className="h-4.5 w-4.5" /> Add Listing
        </button>
      </div>

      {listings.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center space-y-3">
          <h2 className="text-lg font-bold text-green-950">🌾 Welcome to AgriConnect!</h2>
          <p className="text-sm text-green-800 max-w-md mx-auto">
            You haven't listed any produce yet. List your crops today to connect directly with bulk buyers, calculate transport fees, and increase your earnings.
          </p>
          <button onClick={() => setShowAdd(true)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700">
            Create Your First Listing
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-3 rounded-lg"><Package className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Total Listings</p>
              <p className="text-xl font-bold">{stats.totalListings || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-3 rounded-lg"><Eye className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Active Listings</p>
              <p className="text-xl font-bold">{stats.activeListings || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border card-shadow">
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
        <div className="bg-white rounded-xl p-6 border card-shadow space-y-4">
          <h3 className="font-bold text-gray-900 text-lg border-b pb-2">Create New Listing</h3>
          
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Profile derived location info banner */}
            {!profileLocationComplete ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-lg flex items-center justify-between col-span-1 sm:col-span-2 lg:col-span-4">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Your profile location details are incomplete. You must fill them out to list crops.
                </span>
                <a href="/onboard" className="text-amber-900 font-bold underline whitespace-nowrap pl-2">Complete Profile</a>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 text-green-800 text-xs p-3 rounded-lg col-span-1 sm:col-span-2 lg:col-span-4 flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                <span>
                  📍 Listing Location: <strong>{profile.location}, {profile.district}, {profile.state}</strong> (automatically linked from your profile)
                </span>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">🌾 Crop (Commodity)</label>
              <select value={form.commodity} onChange={e => setForm({ ...form, commodity: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50">
                {['TOMATO','ONION','POTATO','WHEAT','RICE','CORN','BRINJAL','LETTUCE','MANGO','APPLE','BANANA'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">📦 Crop Variety</label>
              <input value={form.variety} onChange={e => setForm({ ...form, variety: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Roma / Hybrid" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Grade</label>
              <select value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50">
                {['GRADE_A','GRADE_B','GRADE_C','PREMIUM'].map(g => <option key={g} value={g}>{g.replace('_',' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">⚖️ Quantity (kg)</label>
              <input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-numeric" placeholder="e.g. 500" required />
            </div>

            {/* Real-time price guidance */}
            <div className="col-span-1 sm:col-span-2 lg:col-span-4">
              {guidanceLoading ? (
                <div className="bg-gray-50 border p-3 rounded-lg text-xs text-gray-400 flex items-center gap-2">
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-gray-400"></div>
                  Loading mandi price guidance...
                </div>
              ) : guidancePrice ? (
                <div className="bg-gray-50 border p-3.5 rounded-lg text-xs space-y-1.5 leading-normal">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-700 flex items-center gap-1">
                      💰 Typical Market Price: <strong className="text-green-700 text-sm">₹{guidancePrice.typical.toFixed(1)}/kg</strong>
                    </span>
                    <span className="text-[10px] text-gray-400 font-bold bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                      Source: {
                        guidancePrice.source === 'government_api' ? 'Official Gov Portal' :
                        guidancePrice.source === 'mandi_api' ? 'APMC Mandi Yard' :
                        guidancePrice.source || 'Live Market'
                      } ({guidancePrice.freshness})
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    * Raw rate: ₹{guidancePrice.originalTypical.toLocaleString()} per {guidancePrice.unit === '₹/quintal' ? 'quintal (100kg)' : 'kg'} at {guidancePrice.market}, {guidancePrice.state}
                  </p>
                  
                  {form.askingPrice && !isNaN(parseFloat(form.askingPrice)) && (() => {
                    const asking = parseFloat(form.askingPrice);
                    const diff = asking - guidancePrice.typical;
                    const pct = (diff / guidancePrice.typical) * 100;
                    
                    if (diff < 0) {
                      return (
                        <p className="text-green-700 font-bold pt-1 flex items-center gap-1 text-[11px]">
                          <span>✔</span> ₹{Math.abs(diff).toFixed(1)}/kg below market typical rate ({pct.toFixed(1)}%) — Good value for buyers!
                        </p>
                      );
                    } else if (diff > 0) {
                      return (
                        <p className="text-amber-600 font-bold pt-1 flex items-center gap-1 text-[11px]">
                          <span>ℹ</span> ₹{diff.toFixed(1)}/kg above market typical rate (+{pct.toFixed(1)}%) — Pricing is higher than recent APMC averages.
                        </p>
                      );
                    } else {
                      return (
                        <p className="text-gray-600 font-bold pt-1 flex items-center gap-1 text-[11px]">
                          Matches typical market price exactly.
                        </p>
                      );
                    }
                  })()}
                </div>
              ) : (
                <div className="bg-gray-50 border p-3 rounded-lg text-xs text-gray-500 flex items-center gap-1">
                  <Info className="h-4 w-4 text-gray-400" />
                  No matching market price records found for {form.commodity} in your state. Enter your desired asking price.
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">💰 Asking Price (₹/kg)</label>
              <input type="number" value={form.askingPrice} onChange={e => setForm({ ...form, askingPrice: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-numeric" placeholder="e.g. 35" required />
            </div>

            <div className="col-span-1 sm:col-span-2 lg:col-span-4 flex gap-2 pt-2 border-t">
              <button
                type="submit"
                disabled={!profileLocationComplete}
                className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Create Listing
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setGuidancePrice(null); }}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Listings Table */}
      <div className="bg-white rounded-xl card-shadow border overflow-hidden">
        <div className="px-5 py-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-gray-900 text-base">Your Active Produce</h3>
          <span className="text-xs text-gray-400 font-semibold">{listings.length} items listed</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Crop</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Variety</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Grade</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Quantity</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Asking Rate</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mandi Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {listings.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-semibold text-gray-950">🌾 {l.commodity}</td>
                  <td className="px-5 py-3 text-gray-600">{l.variety || '-'}</td>
                  <td className="px-5 py-3 text-gray-600">{(l.grade || '').replace('_', ' ')}</td>
                  <td className="px-5 py-3 font-numeric">{l.quantity} kg</td>
                  <td className="px-5 py-3 font-bold text-green-700 font-numeric">₹{l.asking_price}/kg</td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                      l.listing_status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                      l.listing_status === 'SOLD' ? 'bg-gray-100 text-gray-600' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {l.listing_status === 'ACTIVE' ? '🟢 ACTIVE' : l.listing_status === 'SOLD' ? '⚫ SOLD' : l.listing_status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">📍 {l.location}, {l.state}</td>
                </tr>
              ))}
              {listings.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-gray-500">
                    No crop listings created yet. Click "Add Listing" to offer your harvest.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
