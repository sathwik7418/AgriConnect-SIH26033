import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { listingAPI, demandAPI, orderAPI, routeAPI, vehicleAPI, marketAPI } from '../services/api';
import { Search, ShoppingCart, X, Loader2, CheckCircle } from 'lucide-react';

const commodities = ['ALL', 'TOMATO', 'ONION', 'POTATO', 'WHEAT', 'RICE', 'CORN', 'BRINJAL', 'LETTUCE', 'MANGO', 'APPLE', 'BANANA'];
const cropLabels = { TOMATO: 'Tomato', ONION: 'Onion', POTATO: 'Potato', WHEAT: 'Wheat', RICE: 'Rice', CORN: 'Corn', BRINJAL: 'Brinjal', LETTUCE: 'Lettuce', MANGO: 'Mango', APPLE: 'Apple', BANANA: 'Banana' };
const gradeLabels = { GRADE_A: 'Grade A', GRADE_B: 'Grade B', GRADE_C: 'Grade C', PREMIUM: 'Premium' };

export default function Marketplace() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState('listings');
  const [listings, setListings] = useState([]);
  const [demands, setDemands] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [latestPrices, setLatestPrices] = useState([]);
  const [orderingListing, setOrderingListing] = useState(null);
  const [orderQuantity, setOrderQuantity] = useState('');
  const [orderLocation, setOrderLocation] = useState('');
  const [orderError, setOrderError] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [routeEstimate, setRouteEstimate] = useState(null);
  const [estimatingRoute, setEstimatingRoute] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState('TRANSPORT_PARTNER');
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState('PICKUP_LCV');

  useEffect(() => { loadData(); vehicleAPI.getAll().then(r => setVehicles(r?.data || [])).catch(() => {}); }, []);

  useEffect(() => {
    if (routeEstimate && deliveryMode !== 'BUYER_PICKUP' && orderLocation && orderingListing) {
      handleCalculateEstimate();
    }
  }, [selectedVehicle]);

  const loadData = () => {
    setLoading(true);
    Promise.all([listingAPI.getAll(), demandAPI.getAll(), marketAPI.getLatest()])
      .then(([l, d, m]) => { setListings(l?.data || []); setDemands(d?.data || []); setLatestPrices(m?.data || []); })
      .catch(err => console.error('Failed to load marketplace:', err))
      .finally(() => setLoading(false));
  };

  const handleOpenOrder = (listing) => {
    setOrderingListing(listing); setOrderQuantity(''); setOrderLocation(profile?.location || '');
    setOrderError(''); setRouteEstimate(null); setDeliveryMode('TRANSPORT_PARTNER'); setOrderSuccess(false); setSelectedVehicle('PICKUP_LCV');
  };

  const handleCalculateEstimate = async () => {
    if (!orderLocation) { setOrderError('Enter a delivery destination.'); return; }
    if (!orderQuantity || isNaN(parseFloat(orderQuantity)) || parseFloat(orderQuantity) <= 0) { setOrderError('Enter a valid quantity.'); return; }
    setEstimatingRoute(true); setOrderError('');
    try {
      const res = await routeAPI.estimate(orderingListing.location, orderLocation, selectedVehicle);
      setRouteEstimate(res.data);
    } catch (err) { setOrderError(err.response?.data?.error || 'Failed to estimate route.'); }
    finally { setEstimatingRoute(false); }
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault(); setOrderError('');
    if (!routeEstimate && deliveryMode !== 'BUYER_PICKUP') { setOrderError('Calculate delivery estimate first.'); return; }
    setOrdering(true);
    try {
      const qty = parseFloat(orderQuantity);
      if (isNaN(qty) || qty <= 0) { setOrderError('Enter a valid quantity.'); setOrdering(false); return; }
      if (qty > parseFloat(orderingListing.quantity)) { setOrderError(`Only ${orderingListing.quantity} kg available`); setOrdering(false); return; }
      await orderAPI.create({ listingId: orderingListing.id, quantity: qty, deliveryLocation: orderLocation || orderingListing.location, deliveryMode, vehicleType: selectedVehicle });
      setOrderSuccess(true);
      setTimeout(() => { setOrderSuccess(false); setOrderingListing(null); setRouteEstimate(null); loadData(); }, 1500);
    } catch (err) { setOrderError(err.response?.data?.error || 'Failed to place order.'); }
    finally { setOrdering(false); }
  };

  const getMandiReference = (listing) => {
    if (!latestPrices || latestPrices.length === 0) return null;
    let match = latestPrices.find(p => p.commodity.toUpperCase() === listing.commodity.toUpperCase() && p.state?.toUpperCase() === listing.state?.toUpperCase() && p.district?.toUpperCase() === listing.district?.toUpperCase());
    let isDistrictMatch = true;
    if (!match) { isDistrictMatch = false; match = latestPrices.find(p => p.commodity.toUpperCase() === listing.commodity.toUpperCase() && p.state?.toUpperCase() === listing.state?.toUpperCase()); }
    if (match) {
      const isQuintal = match.source === 'mandi_api' || match.source === 'historical_dataset' || match.source === 'agmarknet_historical';
      return { price: isQuintal ? (parseFloat(match.modal_price) / 100).toFixed(1) : parseFloat(match.modal_price).toFixed(1), scope: isDistrictMatch ? 'district' : 'state' };
    }
    return null;
  };

  const filteredListings = listings.filter(l => (filter === 'ALL' || l.commodity === filter) && (search === '' || l.commodity.toLowerCase().includes(search.toLowerCase()) || l.farmer_name?.toLowerCase().includes(search.toLowerCase())));
  const filteredDemands = demands.filter(d => filter === 'ALL' || d.commodity === filter);

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--bg-overlay)', borderTopColor: 'var(--accent)' }} />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold gradient-text">Marketplace</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Browse available produce and buyer demands</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b" style={{ borderColor: 'var(--border)' }}>
        {[
          { key: 'listings', label: `Produce Listings (${filteredListings.length})` },
          { key: 'demands', label: `Buyer Demands (${filteredDemands.length})` },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)} className="pb-3 px-1 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor: tab === key ? 'var(--accent)' : 'transparent',
              color: tab === key ? 'var(--accent)' : 'var(--text-muted)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4" style={{ color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" placeholder="Search commodities, farmers..." />
        </div>
        <div className="flex gap-1 flex-wrap">
          {commodities.map(c => (
            <button key={c} onClick={() => setFilter(c)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: filter === c ? 'var(--accent)' : 'var(--bg-elevated)',
                color: filter === c ? 'var(--text-inverse)' : 'var(--text-secondary)',
                border: `1px solid ${filter === c ? 'var(--accent)' : 'var(--border)'}`,
              }}>
              {c === 'ALL' ? 'All' : cropLabels[c] || c}
            </button>
          ))}
        </div>
      </div>

      {/* Listings */}
      {tab === 'listings' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredListings.map(l => {
            const isOwnListing = l.farmer_id === profile?.id;
            const ref = getMandiReference(l);
            return (
              <div key={l.id} className="card-surface hover-premium p-5 flex flex-col">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>{cropLabels[l.commodity] || l.commodity}</h3>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{l.variety} · {gradeLabels[l.grade] || l.grade}</p>
                  </div>
                  <span className={`badge ${isOwnListing ? 'badge-info' : 'badge-success'} text-[10px]`}>
                    {isOwnListing ? 'YOUR LISTING' : l.listing_status}
                  </span>
                </div>

                {/* Farmer & Location */}
                <div className="space-y-1 mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <p>Farmer: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{l.farmer_name}</span></p>
                  <p>{l.location}, {l.farmer_state}</p>
                  <p>Qty: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{l.quantity} kg</span></p>
                </div>

                {/* Price — Farmer asking vs Mandi reference */}
                <div className="mt-auto pt-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Farmer Price</span>
                      <div className="flex items-baseline">
                        <span className="text-2xl font-bold font-numeric" style={{ color: 'var(--accent)' }}>₹{l.asking_price}</span>
                        <span className="text-sm ml-0.5" style={{ color: 'var(--text-muted)' }}>/kg</span>
                      </div>
                    </div>
                    {ref ? (
                      <div className="text-right">
                        <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Mandi ref ({ref.scope})</span>
                        <p className="text-sm font-semibold font-numeric" style={{ color: 'var(--text-secondary)' }}>₹{ref.price}/kg</p>
                      </div>
                    ) : (
                      <div className="text-right">
                        <span className="text-[10px] italic" style={{ color: 'var(--text-muted)' }}>Mandi ref unavailable</span>
                      </div>
                    )}
                  </div>
                  {(user?.role === 'BUYER' || user?.role === 'CONSUMER') && !isOwnListing && (
                    <button onClick={() => handleOpenOrder(l)} className="w-full flex items-center justify-center gap-1.5 btn-primary text-sm py-2.5">
                      <ShoppingCart className="h-4 w-4" /> Buy Now
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Demands */}
      {tab === 'demands' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDemands.map(d => (
            <div key={d.id} className="card-surface hover-premium p-5 flex flex-col">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>{cropLabels[d.commodity] || d.commodity}</h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{d.variety || 'Any variety'}</p>
                </div>
                <span className="badge badge-info">{d.demand_status}</span>
              </div>
              <div className="space-y-1 mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <p>Buyer: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{d.buyer_name}</span></p>
                <p>Delivery to: {d.delivery_location}</p>
                <p>Required: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{d.required_quantity} kg</span></p>
              </div>
              <div className="mt-auto pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-baseline">
                  <span className="text-2xl font-bold font-numeric" style={{ color: 'var(--info)' }}>₹{d.target_price}</span>
                  <span className="text-sm ml-0.5" style={{ color: 'var(--text-muted)' }}>/kg target</span>
                </div>
              </div>
            </div>
          ))}
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

                  {deliveryMode !== 'BUYER_PICKUP' && vehicles.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>How will this order be transported?</label>
                      <div className="grid grid-cols-2 gap-2">
                        {vehicles.map(v => {
                          const isSelected = selectedVehicle === v.id;
                          const exceedsCapacity = orderQuantity && !isNaN(parseFloat(orderQuantity)) && parseFloat(orderQuantity) > v.capacityKg;
                          return (
                            <button key={v.id} type="button" onClick={() => { setSelectedVehicle(v.id); setRouteEstimate(null); }}
                              className="rounded-lg p-3 text-left text-xs transition-all"
                              style={{
                                background: isSelected ? 'rgba(34,197,94,0.10)' : 'var(--bg-elevated)',
                                border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                                boxShadow: isSelected ? '0 0 12px rgba(34,197,94,0.15)' : 'none',
                                opacity: exceedsCapacity && !isSelected ? 0.5 : 1,
                              }}>
                              <div className="font-semibold text-sm" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>{v.label}</div>
                              <div style={{ color: 'var(--text-muted)' }}>{v.description}</div>
                              <div className="mt-1 font-medium" style={{ color: 'var(--text-secondary)' }}>Up to {v.capacityKg.toLocaleString()} kg</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {deliveryMode !== 'BUYER_PICKUP' && orderQuantity && !isNaN(parseFloat(orderQuantity)) && (() => {
                    const selected = vehicles.find(v => v.id === selectedVehicle);
                    const qty = parseFloat(orderQuantity);
                    if (selected && qty > selected.capacityKg) {
                      const smallestFit = vehicles.find(v => v.capacityKg >= qty);
                      return (
                        <div className="rounded-lg text-xs p-3" style={{ background: 'rgba(245,158,11,0.10)', color: '#b45309', border: '1px solid rgba(245,158,11,0.2)' }}>
                          Vehicle capacity is insufficient for {qty.toLocaleString()} kg. {smallestFit ? `Please select "${smallestFit.label}".` : 'Please select a larger vehicle.'}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {routeEstimate ? (
                    (() => {
                      const breakdown = routeEstimate.breakdown || {};
                      const vehicle = routeEstimate.vehicle || {};
                      const distanceKm = routeEstimate.distanceKm ?? breakdown.distanceKm ?? 0;
                      const ratePerKm = breakdown.ratePerKm ?? vehicle.ratePerKm ?? 0;
                      const distanceCost = breakdown.distanceCost ?? Math.round(distanceKm * ratePerKm);
                      const loadingHandling = breakdown.loadingHandling ?? vehicle.loadingHandling ?? 0;
                      const totalEstimate = breakdown.total ?? routeEstimate.estimatedCost ?? (distanceCost + loadingHandling);
                      const vehicleLabel = vehicle.label || selectedVehicle;
                      const capacityKg = vehicle.capacityKg || 0;
                      return (
                        <div className="rounded-lg p-4 text-sm space-y-2 animate-slide-down"
                          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                          <h4 className="font-bold text-xs" style={{ color: 'var(--text-muted)' }}>Estimated Transport Cost</h4>
                          {routeEstimate.isFallback && (
                            <div className="text-[10px] font-semibold px-2 py-1 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)' }}>
                              Estimated using location fallback
                            </div>
                          )}
                          <div className="space-y-1.5 text-xs font-numeric" style={{ color: 'var(--text-secondary)' }}>
                            <div className="flex justify-between">
                              <span>{distanceKm} km × ₹{ratePerKm}/km</span>
                              <span className="font-medium">₹{distanceCost.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Loading / handling estimate</span>
                              <span className="font-medium">₹{loadingHandling.toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="border-t pt-2 mt-2 space-y-1.5 text-xs" style={{ borderColor: 'var(--border)' }}>
                            <div className="flex justify-between font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                              <span>Estimated total</span>
                              <span className="font-numeric">₹{totalEstimate.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span style={{ color: 'var(--text-muted)' }}>Estimated travel time</span>
                              <span className="font-medium font-numeric">~{routeEstimate.estimatedTime}</span>
                            </div>
                            <div className="flex justify-between">
                              <span style={{ color: 'var(--text-muted)' }}>Vehicle</span>
                              <span className="font-medium">{vehicleLabel}</span>
                            </div>
                            <div className="flex justify-between">
                              <span style={{ color: 'var(--text-muted)' }}>Capacity</span>
                              <span className="font-medium">Up to {capacityKg.toLocaleString()} kg</span>
                            </div>
                          </div>
                          <p className="text-[10px] pt-1" style={{ color: 'var(--text-muted)' }}>Estimated cost — final transporter charges may vary.</p>
                        </div>
                      );
                    })()
                  ) : deliveryMode === 'BUYER_PICKUP' && orderQuantity && !isNaN(parseFloat(orderQuantity)) ? (
                    <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.15)' }}>
                      <div className="flex justify-between"><span>Produce Cost:</span><span className="font-bold font-numeric">₹{(parseFloat(orderQuantity) * parseFloat(orderingListing.asking_price)).toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>Transport (Self):</span><span className="font-bold font-numeric">₹0</span></div>
                      <div className="flex justify-between border-t pt-1 font-bold text-sm" style={{ borderColor: 'rgba(34,197,94,0.15)' }}>
                        <span>Total:</span><span className="font-numeric">₹{(parseFloat(orderQuantity) * parseFloat(orderingListing.asking_price)).toLocaleString()}</span>
                      </div>
                      <p className="text-[10px] pt-1" style={{ color: 'var(--text-muted)' }}>Self Pickup — No transport cost</p>
                    </div>
                  ) : orderQuantity && !isNaN(parseFloat(orderQuantity)) && (
                    <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--bg-elevated)' }}>
                      <div className="flex justify-between"><span>Produce Cost:</span><span className="font-bold font-numeric">₹{(parseFloat(orderQuantity) * parseFloat(orderingListing.asking_price)).toLocaleString()}</span></div>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Click "Estimate Route" for transport costs.</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button type="submit" disabled={ordering || (!routeEstimate && deliveryMode !== 'BUYER_PICKUP') || (deliveryMode !== 'BUYER_PICKUP' && orderQuantity && !isNaN(parseFloat(orderQuantity)) && vehicles.find(v => v.id === selectedVehicle) && parseFloat(orderQuantity) > vehicles.find(v => v.id === selectedVehicle).capacityKg)}
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
