import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { listingAPI, dashboardAPI, marketAPI } from '../services/api';
import { Plus, Package, TrendingUp, Eye, Info, CheckCircle, AlertTriangle, Loader2, X } from 'lucide-react';

const cropLabels = {
  TOMATO: 'Tomato', ONION: 'Onion', POTATO: 'Potato', WHEAT: 'Wheat',
  RICE: 'Rice', CORN: 'Corn', BRINJAL: 'Brinjal', LETTUCE: 'Lettuce',
  MANGO: 'Mango', APPLE: 'Apple', BANANA: 'Banana'
};

const gradeLabels = { GRADE_A: 'Grade A', GRADE_B: 'Grade B', GRADE_C: 'Grade C', PREMIUM: 'Premium' };

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function FarmerDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({});
  const [listings, setListings] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ commodity: 'TOMATO', variety: '', grade: 'GRADE_A', quantity: '', askingPrice: '', location: '', state: '', district: '' });
  const [guidancePrice, setGuidancePrice] = useState(null);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (profile) {
      setForm(prev => ({ ...prev, location: profile.location || '', state: profile.state || '', district: profile.district || '' }));
    }
  }, [profile?.location, profile?.state, profile?.district]);

  const load = useCallback(async () => {
    if (!profile?.id || !mountedRef.current) return;
    try {
      const [s, l] = await Promise.all([dashboardAPI.getStats(), listingAPI.getByFarmer(profile.id)]);
      if (mountedRef.current) {
        setStats(s?.data || {});
        setListings(l?.data || []);
      }
    } catch (err) { console.error('Failed to load farmer dashboard stats:', err); }
    finally { if (mountedRef.current) setLoading(false); }
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (showAdd && form.commodity) fetchPriceGuidance(form.commodity); }, [form.commodity, showAdd]);

  const fetchPriceGuidance = async (crop) => {
    setGuidanceLoading(true); setGuidancePrice(null);
    try {
      const res = await marketAPI.getPrices({ commodity: crop });
      if (res.data && res.data.length > 0) {
        let match = res.data.find(p => p.state?.toLowerCase() === profile?.state?.toLowerCase());
        if (!match) match = res.data[0];
        const isQuintal = match.source === 'mandi_api' || match.source === 'historical_dataset' || match.source === 'agmarknet_historical';
        const typicalKg = isQuintal ? parseFloat(match.modal_price) / 100 : parseFloat(match.modal_price);
        setGuidancePrice({
          typical: typicalKg, originalTypical: parseFloat(match.modal_price),
          unit: isQuintal ? '₹/quintal' : '₹/kg', source: match.source,
          freshness: match.data_freshness || 'fresh', market: match.market, state: match.state
        });
      }
    } catch (err) { console.error('Failed to load market guidance price:', err); }
    finally { setGuidanceLoading(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!profile?.location || !profile?.state || !profile?.district) {
      alert('Your profile location details are incomplete. Please complete your profile onboarding first.');
      return;
    }
    await listingAPI.create({ ...form, location: profile.location, state: profile.state, district: profile.district });
    setShowAdd(false);
    setForm({ commodity: 'TOMATO', variety: '', grade: 'GRADE_A', quantity: '', askingPrice: '', location: profile.location || '', state: profile.state || '', district: profile.district || '' });
    load();
  };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--bg-overlay)', borderTopColor: 'var(--accent)' }} />
    </div>
  );

  const profileLocationComplete = profile?.location && profile?.state && profile?.district;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">{getGreeting()}, {profile?.name || 'Farmer'}</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Here's what's happening with your produce</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
          {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAdd ? 'Cancel' : 'List Produce'}
        </button>
      </div>

      {listings.length === 0 && (
        <div className="card-atmospheric p-8 text-center space-y-3 animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.12)' }}>
            <Package className="h-8 w-8" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--accent)' }}>Welcome to AgriConnect!</h2>
          <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
            You haven't listed any produce yet. List your crops today to connect directly with bulk buyers and increase your earnings.
          </p>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
            Create Your First Listing
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
        {[
          { icon: Package, label: 'Total Listings', value: stats.totalListings || 0, color: 'var(--accent)', bg: 'rgba(34,197,94,0.1)' },
          { icon: Eye, label: 'Active Listings', value: stats.activeListings || 0, color: 'var(--info)', bg: 'rgba(59,130,246,0.12)' },
          { icon: TrendingUp, label: 'Total Sales', value: `₹${(stats.totalSales || 0).toLocaleString()}`, color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="card-surface p-5 hover-premium">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg" style={{ background: bg }}>
                <Icon className="h-5 w-5" style={{ color }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>
                <p className="text-xl font-bold font-numeric" style={{ color: 'var(--text-primary)' }}>{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Listing Form */}
      {showAdd && (
        <div className="card-atmospheric p-6 space-y-4 animate-slide-down">
          <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>Create New Listing</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {!profileLocationComplete ? (
              <div className="col-span-full rounded-lg p-3 text-xs font-medium flex items-center justify-between"
                style={{ background: 'rgba(245,158,11,0.10)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Your profile location details are incomplete. You must fill them out to list crops.
                </span>
                <a href="/onboard" className="font-bold underline" style={{ color: 'var(--warning)' }}>Complete Profile</a>
              </div>
            ) : (
              <div className="col-span-full rounded-lg p-3 text-xs flex items-center gap-1.5"
                style={{ background: 'rgba(34,197,94,0.10)', color: 'var(--accent)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <CheckCircle className="h-4 w-4 shrink-0" />
                Listing Location: <strong>{profile.location}, {profile.district}, {profile.state}</strong> (from your profile)
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Crop</label>
              <select value={form.commodity} onChange={e => setForm({ ...form, commodity: e.target.value })} className="input-field">
                {Object.entries(cropLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Variety</label>
              <input value={form.variety} onChange={e => setForm({ ...form, variety: e.target.value })} className="input-field" placeholder="e.g. Roma / Hybrid" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Grade</label>
              <select value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} className="input-field">
                {Object.entries(gradeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Quantity (kg)</label>
              <input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="input-field font-numeric" placeholder="e.g. 500" required />
            </div>

            <div className="col-span-full">
              {guidanceLoading ? (
                <div className="rounded-lg p-3 text-xs flex items-center gap-2" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                  <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--bg-overlay)', borderTopColor: 'var(--accent)' }} />
                  Loading mandi price guidance...
                </div>
              ) : guidancePrice ? (
                <div className="rounded-lg p-3.5 text-xs space-y-1.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      Typical Market Price: <strong style={{ color: 'var(--accent)' }}>₹{guidancePrice.typical.toFixed(1)}/kg</strong>
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      Source: {guidancePrice.source === 'government_api' ? 'Gov Portal' : guidancePrice.source === 'mandi_api' ? 'APMC Mandi' : guidancePrice.source || 'Market'} ({guidancePrice.freshness})
                    </span>
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Raw rate: ₹{guidancePrice.originalTypical.toLocaleString()} per {guidancePrice.unit === '₹/quintal' ? 'quintal (100kg)' : 'kg'} at {guidancePrice.market}, {guidancePrice.state}
                  </p>
                  {form.askingPrice && !isNaN(parseFloat(form.askingPrice)) && (() => {
                    const asking = parseFloat(form.askingPrice);
                    const diff = asking - guidancePrice.typical;
                    const pct = (diff / guidancePrice.typical) * 100;
                    if (diff < 0) return <p className="font-bold pt-1 text-[11px]" style={{ color: 'var(--accent)' }}>✔ ₹{Math.abs(diff).toFixed(1)}/kg below market ({pct.toFixed(1)}%) — Good value!</p>;
                    if (diff > 0) return <p className="font-bold pt-1 text-[11px]" style={{ color: 'var(--warning)' }}>ℹ ₹{diff.toFixed(1)}/kg above market (+{pct.toFixed(1)}%)</p>;
                    return <p className="font-bold pt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>Matches typical market price.</p>;
                  })()}
                </div>
              ) : (
                <div className="rounded-lg p-3 text-xs flex items-center gap-1" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                  <Info className="h-4 w-4 shrink-0" />
                  No matching market price records found for {cropLabels[form.commodity] || form.commodity}. Enter your asking price.
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Asking Price (₹/kg)</label>
              <input type="number" value={form.askingPrice} onChange={e => setForm({ ...form, askingPrice: e.target.value })} className="input-field font-numeric" placeholder="e.g. 35" required />
            </div>

            <div className="col-span-full flex gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <button type="submit" disabled={!profileLocationComplete} className="btn-primary disabled:opacity-50">
                Create Listing
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setGuidancePrice(null); }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Listings Table */}
      <div className="card-surface overflow-hidden">
        <div className="px-5 py-4 flex justify-between items-center border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>Your Active Produce</h3>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{listings.length} items</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Crop', 'Variety', 'Grade', 'Quantity', 'Rate', 'Status', 'Location'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-sm">
              {listings.map(l => (
                <tr key={l.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <td className="px-5 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{cropLabels[l.commodity] || l.commodity}</td>
                  <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{l.variety || '-'}</td>
                  <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{gradeLabels[l.grade] || l.grade}</td>
                  <td className="px-5 py-3 font-numeric" style={{ color: 'var(--text-primary)' }}>{l.quantity} kg</td>
                  <td className="px-5 py-3 font-bold font-numeric" style={{ color: 'var(--accent)' }}>₹{l.asking_price}/kg</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${l.listing_status === 'ACTIVE' ? 'badge-success' : l.listing_status === 'SOLD' ? 'badge-neutral' : 'badge-danger'}`}>
                      {l.listing_status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{l.location}, {l.state}</td>
                </tr>
              ))}
              {listings.length === 0 && (
                <tr><td colSpan="7" className="text-center py-12">
                  <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.10)' }}>
                    <Package className="h-7 w-7" style={{ color: 'var(--accent)', opacity: 0.6 }} />
                  </div>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>No produce listed yet</p>
                  <p className="text-sm mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>Add your first crop to start connecting with buyers.</p>
                  <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">+ List Produce</button>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
