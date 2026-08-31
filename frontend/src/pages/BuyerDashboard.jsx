import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { demandAPI, listingAPI, orderAPI, dashboardAPI, supplyDemandAPI, routeAPI } from '../services/api';
import { Plus, ShoppingCart, TrendingDown, Clock, CheckCircle, Search, MapPin, X, Info, Loader2 } from 'lucide-react';

const cropOptions = ['TOMATO', 'ONION', 'POTATO', 'WHEAT', 'RICE', 'CORN', 'BRINJAL', 'LETTUCE', 'MANGO', 'APPLE', 'BANANA'];
const cropLabels = { TOMATO: 'Tomato', ONION: 'Onion', POTATO: 'Potato', WHEAT: 'Wheat', RICE: 'Rice', CORN: 'Corn', BRINJAL: 'Brinjal', LETTUCE: 'Lettuce', MANGO: 'Mango', APPLE: 'Apple', BANANA: 'Banana' };

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function BuyerDashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({});
  const [demands, setDemands] = useState([]);
  const [listings, setListings] = useState([]);
  const [showDemand, setShowDemand] = useState(false);
  const [form, setForm] = useState({ commodity: 'TOMATO', requiredQuantity: '', targetPrice: '', deliveryLocation: '', requiredGrade: 'GRADE_A' });
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const [selectedMatchDemand, setSelectedMatchDemand] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchError, setMatchError] = useState('');

  const [orderingListing, setOrderingListing] = useState(null);
  const [orderQuantity, setOrderQuantity] = useState('');
  const [orderLocation, setOrderLocation] = useState('');
  const [orderError, setOrderError] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [routeEstimate, setRouteEstimate] = useState(null);
  const [estimatingRoute, setEstimatingRoute] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState('TRANSPORT_PARTNER');

  const [orderSuccess, setOrderSuccess] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!profile?.id || !mountedRef.current) return;
    try {
      const [s, d, l] = await Promise.all([dashboardAPI.getStats(), demandAPI.getByBuyer(profile.id), listingAPI.getAll()]);
      if (mountedRef.current) {
        setStats(s?.data || {});
        setDemands(d?.data || []);
        setListings(l?.data || []);
      }
    } catch (err) { console.error('Failed to load buyer dashboard data:', err); }
    finally { if (mountedRef.current) setLoading(false); }
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const handleCreateDemand = async (e) => {
    e.preventDefault();
    await demandAPI.create(form);
    setShowDemand(false);
    setForm({ commodity: 'TOMATO', requiredQuantity: '', targetPrice: '', deliveryLocation: '', requiredGrade: 'GRADE_A' });
    load();
  };

  const handleFindFarmers = async (demand) => {
    setSelectedMatchDemand(demand); setMatches([]); setMatchError(''); setLoadingMatches(true);
    try {
      const res = await supplyDemandAPI.getMatches(demand.commodity, { maxPrice: demand.target_price, minQuantity: 1 });
      setMatches(res.data || []);
      if (res.data?.length === 0) setMatchError('No farmers found matching this commodity currently.');
    } catch (err) { setMatchError('Failed to fetch matches.'); }
    finally { setLoadingMatches(false); }
  };

  const handleOpenOrder = (listing) => {
    setOrderingListing(listing); setOrderQuantity(''); setOrderLocation(profile?.location || '');
    setOrderError(''); setRouteEstimate(null); setDeliveryMode('TRANSPORT_PARTNER');
  };

  const handleCalculateEstimate = async () => {
    if (!orderLocation) { setOrderError('Enter a delivery destination first.'); return; }
    if (!orderQuantity || isNaN(parseFloat(orderQuantity)) || parseFloat(orderQuantity) <= 0) { setOrderError('Enter a valid quantity.'); return; }
    setEstimatingRoute(true); setOrderError('');
    try {
      const res = await routeAPI.estimate(orderingListing.location, orderLocation);
      setRouteEstimate({
        distanceKm: res.data.distanceKm, estimatedTime: res.data.estimatedTime,
        estimatedCost: deliveryMode === 'BUYER_PICKUP' ? 0 : res.data.estimatedCost
      });
    } catch (err) { setOrderError(err.response?.data?.error || 'Failed to estimate route.'); }
    finally { setEstimatingRoute(false); }
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setOrderError('');
    if (!routeEstimate && deliveryMode !== 'BUYER_PICKUP') { setOrderError('Calculate delivery estimate first.'); return; }
    setOrdering(true);
    try {
      const qty = parseFloat(orderQuantity);
      if (isNaN(qty) || qty <= 0) { setOrderError('Enter a valid quantity.'); setOrdering(false); return; }
      if (qty > parseFloat(orderingListing.quantity)) { setOrderError(`Only ${orderingListing.quantity} kg available`); setOrdering(false); return; }
      await orderAPI.create({ listingId: orderingListing.id, quantity: qty, deliveryLocation: orderLocation || orderingListing.location, deliveryMode });
      setOrderSuccess(true);
      setTimeout(() => { setOrderSuccess(false); setOrderingListing(null); setRouteEstimate(null); setSelectedMatchDemand(null); load(); }, 1500);
    } catch (err) { setOrderError(err.response?.data?.error || 'Failed to place order.'); }
    finally { setOrdering(false); }
  };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--bg-overlay)', borderTopColor: 'var(--info)' }} />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">{getGreeting()}, {profile?.name || 'Buyer'}</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Here's your buying activity</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/marketplace" className="btn-primary flex items-center gap-2 text-sm">
            <Search className="h-4 w-4" /> Find Produce
          </a>
          <button onClick={() => setShowDemand(!showDemand)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover-lift"
            style={{ background: 'var(--info)', color: 'white' }}>
            {showDemand ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showDemand ? 'Cancel' : 'Create Demand'}
          </button>
        </div>
      </div>

      {demands.length === 0 && (
        <div className="card-atmospheric p-8 text-center space-y-3 animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.12)' }}>
            <ShoppingCart className="h-8 w-8" style={{ color: 'var(--info)' }} />
          </div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--info)' }}>Welcome to AgriConnect!</h2>
          <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
            Create a demand to request matches, or check the marketplace to buy crops directly.
          </p>
          <div className="flex justify-center gap-2">
            <button onClick={() => setShowDemand(true)} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--info)', color: 'white' }}>Create Demand</button>
            <a href="/marketplace" className="btn-secondary text-sm">Explore Marketplace</a>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
        {[
          { icon: ShoppingCart, label: 'Total Orders', value: stats.totalOrders || 0, color: 'var(--info)', bg: 'rgba(59,130,246,0.12)' },
          { icon: Clock, label: 'Pending Orders', value: stats.pendingOrders || 0, color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)' },
          { icon: TrendingDown, label: 'Total Spent', value: `₹${(stats.totalSpent || 0).toLocaleString()}`, color: 'var(--accent)', bg: 'rgba(34,197,94,0.1)' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="card-surface p-5 hover-premium">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg" style={{ background: bg }}><Icon className="h-5 w-5" style={{ color }} /></div>
              <div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>
                <p className="text-xl font-bold font-numeric" style={{ color: 'var(--text-primary)' }}>{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Demand */}
      {showDemand && (
        <div className="card-atmospheric p-6 animate-slide-down">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Create Purchase Demand</h3>
          <form onSubmit={handleCreateDemand} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Commodity</label>
              <select value={form.commodity} onChange={e => setForm({ ...form, commodity: e.target.value })} className="input-field">
                {cropOptions.map(c => <option key={c} value={c}>{cropLabels[c] || c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Qty (kg)</label>
              <input type="number" value={form.requiredQuantity} onChange={e => setForm({ ...form, requiredQuantity: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Target ₹/kg</label>
              <input type="number" value={form.targetPrice} onChange={e => setForm({ ...form, targetPrice: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Delivery Location</label>
              <input value={form.deliveryLocation} onChange={e => setForm({ ...form, deliveryLocation: e.target.value })} className="input-field" required />
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--info)', color: 'white' }}>Create</button>
              <button type="button" onClick={() => setShowDemand(false)} className="btn-secondary text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* My Demands */}
      <div className="card-surface overflow-hidden">
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Your Demands</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Commodity', 'Qty (kg)', 'Target Price', 'Delivery', 'Status', 'Matching'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-sm">
              {demands.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{cropLabels[d.commodity] || d.commodity}</td>
                  <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{d.required_quantity}</td>
                  <td className="px-5 py-3 font-medium" style={{ color: 'var(--info)' }}>₹{d.target_price}/kg</td>
                  <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{d.delivery_location}</td>
                  <td className="px-5 py-3"><span className="badge badge-success">{d.demand_status}</span></td>
                  <td className="px-5 py-3">
                    <button onClick={() => handleFindFarmers(d)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--info)' }}>
                      <Search className="h-3 w-3" /> Find Farmers
                    </button>
                  </td>
                </tr>
              ))}
              {demands.length === 0 && (
                <tr><td colSpan="6" className="text-center py-12">
                  <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.10)' }}>
                    <ShoppingCart className="h-7 w-7" style={{ color: 'var(--info)', opacity: 0.6 }} />
                  </div>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>No demands created</p>
                  <p className="text-sm mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>Tell farmers what produce you need.</p>
                  <button onClick={() => setShowDemand(true)} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--info)', color: 'white' }}>+ Create Demand</button>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Available Listings */}
      <div className="card-surface overflow-hidden">
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Available Produce</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
          {listings.slice(0, 9).map(l => (
            <div key={l.id} className="card-surface p-4 hover-lift transition-all">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{cropLabels[l.commodity] || l.commodity}</h4>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{l.variety} · {l.grade?.replace('_', ' ')}</p>
                </div>
                <span className="badge badge-success text-[10px]">{l.listing_status}</span>
              </div>
              <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Farmer: {l.farmer_name}</p>
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>{l.quantity} kg at {l.location}</p>
              <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-lg font-bold font-numeric" style={{ color: 'var(--accent)' }}>₹{l.asking_price}<span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>/kg</span></span>
                {l.farmer_id !== profile?.id && (
                  <button onClick={() => handleOpenOrder(l)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}>
                    <ShoppingCart className="h-3 w-3" /> Buy
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Matching Modal */}
      {selectedMatchDemand && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-40 modal-backdrop">
          <div className="card-glass rounded-2xl max-w-2xl w-full p-6 relative modal-content max-h-[85vh] flex flex-col"
            style={{ boxShadow: 'var(--shadow-xl)' }}>
            <button onClick={() => setSelectedMatchDemand(null)} className="absolute right-4 top-4 p-1 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Farmers matching: {cropLabels[selectedMatchDemand.commodity] || selectedMatchDemand.commodity}
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Budget: <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>₹{selectedMatchDemand.target_price}/kg</span> | {selectedMatchDemand.required_quantity} kg
            </p>
            {loadingMatches ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--bg-overlay)', borderTopColor: 'var(--info)' }} />
              </div>
            ) : matchError ? (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>{matchError}</div>
            ) : (
              <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                {matches.map((m, i) => (
                  <div key={i} className="rounded-xl p-4 transition-colors relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{m.listing.farmer_name}</span>
                        <span className="badge badge-info text-[10px]">Score: {Math.round(m.score)}</span>
                      </div>
                      <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        <MapPin className="h-3.5 w-3.5" /> {m.listing.listing_location}, {m.listing.listing_state}
                      </p>
                      <div className="flex gap-4 text-xs">
                        <span style={{ color: 'var(--text-muted)' }}>Price: <span className="font-semibold font-numeric" style={{ color: 'var(--accent)' }}>₹{m.listing.asking_price}/kg</span></span>
                        <span style={{ color: 'var(--text-muted)' }}>Available: <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{m.listing.available_quantity} kg</span></span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1.5">
                        {m.matchReasons.map((reason, ri) => (
                          <span key={ri} className="badge badge-success text-[10px]">{reason}</span>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => handleOpenOrder(m.listing)}
                      className="flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-semibold self-stretch sm:self-center justify-center transition-colors"
                      style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}>
                      <ShoppingCart className="h-3.5 w-3.5" /> Buy
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Order Modal */}
      {orderingListing && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50 modal-backdrop">
          <div className="card-glass rounded-2xl max-w-md w-full p-6 relative modal-content"
            style={{ boxShadow: 'var(--shadow-xl)' }}>
            <button onClick={() => { setOrderingListing(null); setOrderSuccess(false); }} className="absolute right-4 top-4 p-1 rounded-lg"
              style={{ color: 'var(--text-muted)' }}>
              <X className="h-5 w-5" />
            </button>

            {orderSuccess ? (
              <div className="text-center py-8 space-y-3 animate-scale">
                <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.15)' }}>
                  <CheckCircle className="h-8 w-8" style={{ color: 'var(--accent)' }} />
                </div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--accent)' }}>Order Placed!</h3>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Your order has been confirmed.</p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                  <ShoppingCart className="h-5 w-5" style={{ color: 'var(--accent)' }} />
                  Place Direct Order
                </h3>
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                  Ordering <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{cropLabels[orderingListing.commodity] || orderingListing.commodity}</span> from <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{orderingListing.farmer_name}</span>
                </p>

                {orderError && (
                  <div className="rounded-lg text-xs p-3 mb-4" style={{ background: 'rgba(239,68,68,0.10)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.15)' }}>
                    {orderError}
                  </div>
                )}

                <form onSubmit={handlePlaceOrder} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Quantity (kg)</label>
                    <input type="number" step="any" value={orderQuantity}
                      onChange={(e) => { setOrderQuantity(e.target.value); setRouteEstimate(null); }}
                      className="input-field font-numeric" placeholder={`Max ${orderingListing.quantity} kg`} required />
                    <span className="text-xs mt-1 block" style={{ color: 'var(--text-muted)' }}>
                      Available: {orderingListing.quantity} kg | Price: ₹{orderingListing.asking_price}/kg
                    </span>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Delivery Destination</label>
                    <div className="flex gap-2">
                      <input type="text" value={orderLocation}
                        onChange={(e) => { setOrderLocation(e.target.value); setRouteEstimate(null); }}
                        className="input-field flex-1" placeholder="e.g. Warehouse Location" required />
                      <button type="button" onClick={handleCalculateEstimate}
                        disabled={estimatingRoute || !orderLocation || !orderQuantity}
                        className="px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                        style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--info)', border: '1px solid rgba(59,130,246,0.2)' }}>
                        {estimatingRoute ? 'Calculating...' : 'Estimate Route'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Delivery Mode</label>
                    <select value={deliveryMode} onChange={(e) => { setDeliveryMode(e.target.value); setRouteEstimate(null); }} className="input-field">
                      <option value="TRANSPORT_PARTNER">External Transport Partner</option>
                      <option value="FARMER_DELIVERY">Farmer Arranged Delivery</option>
                      <option value="BUYER_PICKUP">Self Pickup (Free)</option>
                    </select>
                  </div>

                  {routeEstimate ? (
                    <div className="rounded-lg p-3 text-sm space-y-2 animate-slide-down"
                      style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.15)' }}>
                      <h4 className="font-bold text-xs" style={{ color: 'var(--info)' }}>Route Estimate</h4>
                      {routeEstimate.isFallback && (
                        <div className="text-[10px] font-semibold px-2 py-1 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)' }}>
                          Estimated using location fallback
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2 text-xs border-b pb-2 mb-2" style={{ borderColor: 'rgba(59,130,246,0.1)' }}>
                        <div>Distance: <span className="font-bold">{routeEstimate.distanceKm} km</span></div>
                        <div>Time: <span className="font-bold">{routeEstimate.estimatedTime}</span></div>
                        <div>Cost: <span className="font-bold font-numeric" style={{ color: 'var(--accent)' }}>₹{routeEstimate.estimatedCost}</span></div>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span>Produce Value:</span>
                          <span className="font-bold font-numeric">₹{(parseFloat(orderQuantity) * parseFloat(orderingListing.asking_price)).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Transport:</span>
                          <span className="font-bold font-numeric">₹{routeEstimate.estimatedCost.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1 font-bold text-sm" style={{ borderColor: 'rgba(59,130,246,0.1)', color: 'var(--text-primary)' }}>
                          <span>Total:</span>
                          <span className="font-numeric">₹{(parseFloat(orderQuantity) * parseFloat(orderingListing.asking_price) + routeEstimate.estimatedCost).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ) : deliveryMode === 'BUYER_PICKUP' && orderQuantity && !isNaN(parseFloat(orderQuantity)) ? (
                    <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.15)' }}>
                      <div className="flex justify-between">
                        <span>Produce Cost:</span>
                        <span className="font-bold font-numeric">₹{(parseFloat(orderQuantity) * parseFloat(orderingListing.asking_price)).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Transport (Self):</span>
                        <span className="font-bold font-numeric">₹0</span>
                      </div>
                      <div className="flex justify-between border-t pt-1 font-bold text-sm" style={{ borderColor: 'rgba(34,197,94,0.15)' }}>
                        <span>Total:</span>
                        <span className="font-numeric">₹{(parseFloat(orderQuantity) * parseFloat(orderingListing.asking_price)).toLocaleString()}</span>
                      </div>
                    </div>
                  ) : orderQuantity && !isNaN(parseFloat(orderQuantity)) && (
                    <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--bg-elevated)' }}>
                      <div className="flex justify-between">
                        <span>Produce Cost:</span>
                        <span className="font-bold font-numeric">₹{(parseFloat(orderQuantity) * parseFloat(orderingListing.asking_price)).toLocaleString()}</span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Click "Estimate Route" for transport costs.</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button type="submit" disabled={ordering || (!routeEstimate && deliveryMode !== 'BUYER_PICKUP')}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}>
                      {ordering ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {ordering ? 'Placing Order...' : 'Confirm Order'}
                    </button>
                    <button type="button" onClick={() => { setOrderingListing(null); setOrderSuccess(false); }} className="btn-secondary px-4 py-2.5">
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
