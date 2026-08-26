import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { demandAPI, listingAPI, orderAPI, dashboardAPI, supplyDemandAPI } from '../services/api';
import { Plus, ShoppingCart, TrendingDown, Clock, CheckCircle, Search, MapPin, X, Info } from 'lucide-react';

export default function BuyerDashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({});
  const [demands, setDemands] = useState([]);
  const [listings, setListings] = useState([]);
  const [showDemand, setShowDemand] = useState(false);
  const [form, setForm] = useState({ commodity: 'TOMATO', requiredQuantity: '', targetPrice: '', deliveryLocation: '', requiredGrade: 'GRADE_A' });
  const [loading, setLoading] = useState(true);

  // Matching Modal State
  const [selectedMatchDemand, setSelectedMatchDemand] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchError, setMatchError] = useState('');

  // Ordering State
  const [orderingListing, setOrderingListing] = useState(null);
  const [orderQuantity, setOrderQuantity] = useState('');
  const [orderLocation, setOrderLocation] = useState('');
  const [orderError, setOrderError] = useState('');
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      load();
    }
  }, [profile]);

  const load = async () => {
    try {
      const [s, d, l] = await Promise.all([dashboardAPI.getStats(), demandAPI.getByBuyer(profile.id), listingAPI.getAll()]);
      setStats(s.data);
      setDemands(d.data);
      setListings(l.data);
    } finally { setLoading(false); }
  };

  const handleCreateDemand = async (e) => {
    e.preventDefault();
    await demandAPI.create(form);
    setShowDemand(false);
    setForm({ commodity: 'TOMATO', requiredQuantity: '', targetPrice: '', deliveryLocation: '', requiredGrade: 'GRADE_A' });
    load();
  };

  const handleFindFarmers = async (demand) => {
    setSelectedMatchDemand(demand);
    setMatches([]);
    setMatchError('');
    setLoadingMatches(true);
    try {
      const res = await supplyDemandAPI.getMatches(demand.commodity, {
        maxPrice: demand.target_price,
        minQuantity: 1
      });
      setMatches(res.data || []);
      if (res.data?.length === 0) {
        setMatchError('No farmers found matching this commodity currently.');
      }
    } catch (err) {
      setMatchError('Failed to fetch matches. Please try again.');
    } finally {
      setLoadingMatches(false);
    }
  };

  const handleOpenOrder = (listing) => {
    setOrderingListing(listing);
    setOrderQuantity('');
    setOrderLocation(profile?.location || '');
    setOrderError('');
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setOrderError('');
    setOrdering(true);
    try {
      const qty = parseFloat(orderQuantity);
      if (isNaN(qty) || qty <= 0) {
        setOrderError('Please enter a valid quantity greater than zero');
        setOrdering(false);
        return;
      }
      if (qty > parseFloat(orderingListing.quantity)) {
        setOrderError(`Only ${orderingListing.quantity} kg available`);
        setOrdering(false);
        return;
      }
      await orderAPI.create({
        listingId: orderingListing.id,
        quantity: qty,
        deliveryLocation: orderLocation || orderingListing.location
      });
      alert('Order placed successfully!');
      setOrderingListing(null);
      setSelectedMatchDemand(null); // Close matches modal as well
      load();
    } catch (err) {
      setOrderError(err.response?.data?.error || 'Failed to place order. Please try again.');
    } finally {
      setOrdering(false);
    }
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
              <p className="text-xl font-bold font-numeric">Rs{(stats.totalSpent || 0).toLocaleString()}</p>
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
                {cropOptions.map(c => <option key={c} value={c}>{c}</option>)}
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
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matching</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {demands.map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-sm font-medium">{d.commodity}</td>
                  <td className="px-5 py-3 text-sm">{d.required_quantity}</td>
                  <td className="px-5 py-3 text-sm font-medium text-blue-700">Rs{d.target_price}/kg</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{d.delivery_location}</td>
                  <td className="px-5 py-3 text-sm">
                    <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">{d.demand_status}</span>
                  </td>
                  <td className="px-5 py-3 text-sm">
                    <button
                      onClick={() => handleFindFarmers(d)}
                      className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-semibold flex items-center gap-1"
                    >
                      <Search className="h-3 w-3" /> Find Farmers
                    </button>
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
                <span className="text-lg font-bold text-green-700 font-numeric">Rs{l.asking_price}/kg</span>
                {l.farmer_id !== profile?.id && (
                  <button onClick={() => handleOpenOrder(l)} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700 flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3" /> Order
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Matching Modal */}
      {selectedMatchDemand && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-40">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 relative card-shadow animate-scale max-h-[85vh] flex flex-col">
            <button
              onClick={() => setSelectedMatchDemand(null)}
              className="absolute right-4 top-4 p-1 rounded-lg hover:bg-gray-100"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Farmers matching: {selectedMatchDemand.commodity} ({selectedMatchDemand.required_quantity} kg wanted)
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Budget: <span className="font-semibold text-gray-800">Rs{selectedMatchDemand.target_price}/kg</span> | Location: <span className="font-semibold text-gray-800">{selectedMatchDemand.delivery_location}</span>
            </p>

            {loadingMatches ? (
              <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
            ) : matchError ? (
              <div className="text-center py-8 text-gray-500 text-sm">{matchError}</div>
            ) : (
              <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                {matches.map((m, i) => (
                  <div key={i} className="border rounded-xl p-4 bg-gray-50 hover:bg-white transition-colors relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 text-sm">{m.listing.farmer_name}</span>
                        <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-50 text-blue-700 font-semibold">
                          Match Score: {Math.round(m.score)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-gray-400" /> Location: {m.listing.listing_location}, {m.listing.listing_state}
                      </p>
                      <div className="flex gap-4 text-xs">
                        <p className="text-gray-500">Price: <span className="font-semibold text-green-700 font-numeric">Rs{m.listing.asking_price}/kg</span></p>
                        <p className="text-gray-500">Available: <span className="font-semibold text-gray-700">{m.listing.available_quantity} kg</span></p>
                      </div>
                      {/* Explanations */}
                      <div className="flex flex-wrap gap-1.5 pt-1.5">
                        {m.matchReasons.map((reason, ri) => (
                          <span key={ri} className="px-2 py-0.5 text-[10px] rounded bg-green-50 text-green-800 flex items-center gap-0.5">
                            <Info className="h-3 w-3 text-green-600" /> {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleOpenOrder(m.listing)}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-green-700 flex items-center gap-1 self-stretch sm:self-center justify-center"
                    >
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 relative card-shadow animate-scale">
            <button
              onClick={() => setOrderingListing(null)}
              className="absolute right-4 top-4 p-1 rounded-lg hover:bg-gray-100"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-1.5">
              <ShoppingCart className="h-5 w-5 text-green-600" />
              Place Direct Order
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Ordering <span className="font-semibold text-gray-800">{orderingListing.commodity}</span> from <span className="font-semibold text-gray-800">{orderingListing.farmer_name}</span>
            </p>

            {orderError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg mb-4">
                {orderError}
              </div>
            )}

            <form onSubmit={handlePlaceOrder} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Quantity to Order (kg)
                </label>
                <input
                  type="number"
                  step="any"
                  value={orderQuantity}
                  onChange={(e) => setOrderQuantity(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm font-numeric"
                  placeholder={`Max ${orderingListing.quantity} kg`}
                  required
                />
                <span className="text-xs text-gray-400 mt-1 block">
                  Available: {orderingListing.quantity} kg | Price: Rs{orderingListing.asking_price}/kg
                </span>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Delivery Destination
                </label>
                <input
                  type="text"
                  value={orderLocation}
                  onChange={(e) => setOrderLocation(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                  placeholder="e.g. Warehouse Location"
                  required
                />
              </div>

              {orderQuantity && !isNaN(parseFloat(orderQuantity)) && (
                <div className="bg-green-50 rounded-lg p-3 text-sm text-green-800 space-y-1">
                  <div className="flex justify-between">
                    <span>Produce Cost:</span>
                    <span className="font-bold font-numeric">Rs{(parseFloat(orderQuantity) * parseFloat(orderingListing.asking_price)).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs text-green-600">
                    <span>* Logistics & road routing calculated upon submission</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={ordering}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {ordering ? 'Placing Order...' : 'Confirm Order'}
                </button>
                <button
                  type="button"
                  onClick={() => setOrderingListing(null)}
                  className="px-4 py-2.5 border rounded-lg text-sm font-semibold hover:bg-gray-50 text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
