import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { listingAPI, demandAPI, orderAPI } from '../services/api';
import { Search, Filter, ShoppingCart, Info, X } from 'lucide-react';

const commodities = ['ALL', 'TOMATO', 'ONION', 'POTATO', 'WHEAT', 'RICE', 'CORN', 'BRINJAL', 'LETTUCE', 'MANGO', 'APPLE', 'BANANA'];

export default function Marketplace() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState('listings');
  const [listings, setListings] = useState([]);
  const [demands, setDemands] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Ordering State
  const [orderingListing, setOrderingListing] = useState(null);
  const [orderQuantity, setOrderQuantity] = useState('');
  const [orderLocation, setOrderLocation] = useState('');
  const [orderError, setOrderError] = useState('');
  const [ordering, setOrdering] = useState(false);

  // Logistics preview states
  const [routeEstimate, setRouteEstimate] = useState(null);
  const [estimatingRoute, setEstimatingRoute] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setLoading(true);
    Promise.all([listingAPI.getAll(), demandAPI.getAll()]).then(([l, d]) => {
      setListings(l.data);
      setDemands(d.data);
    }).finally(() => setLoading(false));
  };

  const handleOpenOrder = (listing) => {
    setOrderingListing(listing);
    setOrderQuantity('');
    setOrderLocation(profile?.location || '');
    setOrderError('');
    setRouteEstimate(null);
  };

  const handleCalculateEstimate = async () => {
    if (!orderLocation) {
      setOrderError('Please enter a delivery destination city first.');
      return;
    }
    if (!orderQuantity || isNaN(parseFloat(orderQuantity)) || parseFloat(orderQuantity) <= 0) {
      setOrderError('Please enter a valid quantity first.');
      return;
    }
    setEstimatingRoute(true);
    setOrderError('');
    try {
      const res = await routeAPI.estimate(orderingListing.location, orderLocation);
      setRouteEstimate({
        distanceKm: res.data.distanceKm,
        estimatedTime: res.data.estimatedTime,
        estimatedCost: res.data.estimatedCost
      });
    } catch (err) {
      setOrderError(err.response?.data?.error || 'Failed to estimate delivery route. Please check spelling of origin/destination.');
    } finally {
      setEstimatingRoute(false);
    }
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setOrderError('');
    if (!routeEstimate) {
      setOrderError('You must calculate the delivery estimate before confirming the order.');
      return;
    }
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
      setRouteEstimate(null);
      loadData();
    } catch (err) {
      setOrderError(err.response?.data?.error || 'Failed to place order. Please try again.');
    } finally {
      setOrdering(false);
    }
  };

  const filteredListings = listings.filter(l =>
    (filter === 'ALL' || l.commodity === filter) &&
    (search === '' || l.commodity.toLowerCase().includes(search.toLowerCase()) || l.farmer_name?.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredDemands = demands.filter(d =>
    (filter === 'ALL' || d.commodity === filter)
  );

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Marketplace</h1>
        <p className="text-gray-500 text-sm">Browse available produce and buyer demands</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b">
        <button onClick={() => setTab('listings')} className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${tab === 'listings' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500'}`}>
          Produce Listings ({filteredListings.length})
        </button>
        <button onClick={() => setTab('demands')} className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${tab === 'demands' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500'}`}>
          Buyer Demands ({filteredDemands.length})
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
            placeholder="Search commodities, farmers..."
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {commodities.map(c => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === c ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Listings Grid */}
      {tab === 'listings' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredListings.map(l => {
            const isOwnListing = l.farmer_id === profile?.id;
            return (
              <div key={l.id} className="bg-white rounded-xl card-shadow p-5 hover-lift">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg">{l.commodity}</h3>
                    <p className="text-sm text-gray-500">{l.variety} | {(l.grade || '').replace('_', ' ')}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${isOwnListing ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-green-100 text-green-700'}`}>
                    {isOwnListing ? 'YOUR LISTING' : l.listing_status}
                  </span>
                </div>
                <div className="space-y-1.5 mb-4">
                  <p className="text-sm text-gray-600">Farmer: <span className="font-medium">{l.farmer_name}</span></p>
                  <p className="text-sm text-gray-600">Location: {l.location}, {l.farmer_state}</p>
                  <p className="text-sm text-gray-600">Quantity: <span className="font-medium">{l.quantity} {l.unit}</span></p>
                </div>
                <div className="flex justify-between items-center pt-3 border-t">
                  <div>
                    <span className="text-2xl font-bold text-green-700 font-numeric">Rs{l.asking_price}</span>
                    <span className="text-sm text-gray-500">/kg</span>
                  </div>
                  {(user?.role === 'BUYER' || user?.role === 'CONSUMER') && !isOwnListing && (
                    <button
                      onClick={() => handleOpenOrder(l)}
                      className="flex items-center gap-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
                    >
                      <ShoppingCart className="h-4 w-4" /> Order
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Demands Grid */}
      {tab === 'demands' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDemands.map(d => (
            <div key={d.id} className="bg-white rounded-xl card-shadow p-5 hover-lift">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">{d.commodity}</h3>
                  <p className="text-sm text-gray-500">{d.variety || 'Any variety'}</p>
                </div>
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">{d.demand_status}</span>
              </div>
              <div className="space-y-1.5 mb-4">
                <p className="text-sm text-gray-600">Buyer: <span className="font-medium">{d.buyer_name}</span></p>
                <p className="text-sm text-gray-600">Delivery to: {d.delivery_location}</p>
                <p className="text-sm text-gray-600">Required: <span className="font-medium">{d.required_quantity} kg</span></p>
              </div>
              <div className="flex justify-between items-center pt-3 border-t">
                <div>
                  <span className="text-2xl font-bold text-blue-700 font-numeric">Rs{d.target_price}</span>
                  <span className="text-sm text-gray-500">/kg target</span>
                </div>
              </div>
            </div>
          ))}
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
              Ordering <span className="font-semibold text-gray-800">{orderingListing.commodity} ({orderingListing.variety})</span> from <span className="font-semibold text-gray-800">{orderingListing.farmer_name}</span>
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
                  onChange={(e) => { setOrderQuantity(e.target.value); setRouteEstimate(null); }}
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
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={orderLocation}
                    onChange={(e) => { setOrderLocation(e.target.value); setRouteEstimate(null); }}
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                    placeholder="e.g. Pune Central Warehouse"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleCalculateEstimate}
                    disabled={estimatingRoute || !orderLocation || !orderQuantity}
                    className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-blue-100 disabled:opacity-50 transition-colors"
                  >
                    {estimatingRoute ? 'Calculating...' : 'Estimate Route'}
                  </button>
                </div>
              </div>

              {routeEstimate ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 space-y-2 leading-relaxed">
                  <h4 className="font-bold flex items-center gap-1 text-blue-950 text-xs">
                    🚚 OSRM Road Route Estimate
                  </h4>
                  {routeEstimate.isFallback && (
                    <div className="bg-amber-100 border border-amber-200 text-amber-900 px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 my-1.5">
                      ⚠️ Estimated using location fallback
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-xs border-b border-blue-100 pb-2 mb-2">
                    <div>📍 Distance: <span className="font-bold">{routeEstimate.distanceKm} km</span></div>
                    <div>⏱ Time: <span className="font-bold">{routeEstimate.estimatedTime}</span></div>
                    <div>🚚 Cost: <span className="font-bold font-numeric text-green-700">₹{routeEstimate.estimatedCost}</span></div>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>Produce Value:</span>
                      <span className="font-bold font-numeric">₹{(parseFloat(orderQuantity) * parseFloat(orderingListing.asking_price)).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Transport Cost:</span>
                      <span className="font-bold font-numeric">₹{routeEstimate.estimatedCost.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-t border-blue-100 pt-1 font-bold text-sm text-blue-950">
                      <span>Estimated Total:</span>
                      <span className="font-numeric">₹{(parseFloat(orderQuantity) * parseFloat(orderingListing.asking_price) + routeEstimate.estimatedCost).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ) : orderQuantity && !isNaN(parseFloat(orderQuantity)) && (
                <div className="bg-green-50 rounded-lg p-3 text-sm text-green-800 space-y-1">
                  <div className="flex justify-between">
                    <span>Produce Cost:</span>
                    <span className="font-bold font-numeric">Rs{(parseFloat(orderQuantity) * parseFloat(orderingListing.asking_price)).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs text-green-600 font-semibold">
                    <span>* Please click 'Estimate Route' to preview transport costs.</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={ordering || !routeEstimate}
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
