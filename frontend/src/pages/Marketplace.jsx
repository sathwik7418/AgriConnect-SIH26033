import { useState, useEffect } from 'react';
import { listingAPI, demandAPI } from '../services/api';
import { Search, Filter, ShoppingCart } from 'lucide-react';

const commodities = ['ALL', 'TOMATO', 'ONION', 'POTATO', 'WHEAT', 'RICE', 'CORN', 'BRINJAL', 'LETTUCE', 'MANGO', 'APPLE', 'BANANA'];

export default function Marketplace() {
  const [tab, setTab] = useState('listings');
  const [listings, setListings] = useState([]);
  const [demands, setDemands] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listingAPI.getAll(), demandAPI.getAll()]).then(([l, d]) => {
      setListings(l.data);
      setDemands(d.data);
    }).finally(() => setLoading(false));
  }, []);

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
          {filteredListings.map(l => (
            <div key={l.id} className="bg-white rounded-xl card-shadow p-5 hover-lift">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">{l.commodity}</h3>
                  <p className="text-sm text-gray-500">{l.variety} | {(l.grade || '').replace('_', ' ')}</p>
                </div>
                <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">{l.listing_status}</span>
              </div>
              <div className="space-y-1.5 mb-4">
                <p className="text-sm text-gray-600">Farmer: <span className="font-medium">{l.farmer_name}</span></p>
                <p className="text-sm text-gray-600">Location: {l.location}, {l.farmer_state}</p>
                <p className="text-sm text-gray-600">Quantity: <span className="font-medium">{l.quantity} {l.unit}</span></p>
              </div>
              <div className="flex justify-between items-center pt-3 border-t">
                <div>
                  <span className="text-2xl font-bold text-green-700">Rs{l.asking_price}</span>
                  <span className="text-sm text-gray-500">/kg</span>
                </div>
                <button className="flex items-center gap-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">
                  <ShoppingCart className="h-4 w-4" /> Order
                </button>
              </div>
            </div>
          ))}
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
                  <span className="text-2xl font-bold text-blue-700">Rs{d.target_price}</span>
                  <span className="text-sm text-gray-500">/kg target</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
