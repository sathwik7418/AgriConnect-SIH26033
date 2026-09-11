import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  demandAPI,
  listingAPI,
  orderAPI,
  dashboardAPI,
  supplyDemandAPI,
  routeAPI
} from '../services/api';

import {
  Plus,
  ShoppingCart,
  TrendingDown,
  Clock,
  CheckCircle,
  Search,
  MapPin,
  X,
  Loader2,
  ArrowRight,
  Package,
  RefreshCw,
  SlidersHorizontal,
  Users,
  Truck,
  IndianRupee,
  BarChart3,
  ChevronRight
} from 'lucide-react';

const cropOptions = [
  'TOMATO',
  'ONION',
  'POTATO',
  'WHEAT',
  'RICE',
  'CORN',
  'BRINJAL',
  'LETTUCE',
  'MANGO',
  'APPLE',
  'BANANA'
];

const cropLabels = {
  TOMATO: 'Tomato',
  ONION: 'Onion',
  POTATO: 'Potato',
  WHEAT: 'Wheat',
  RICE: 'Rice',
  CORN: 'Corn',
  BRINJAL: 'Brinjal',
  LETTUCE: 'Lettuce',
  MANGO: 'Mango',
  APPLE: 'Apple',
  BANANA: 'Banana'
};

const gradeLabels = {
  GRADE_A: 'Grade A',
  GRADE_B: 'Grade B',
  GRADE_C: 'Grade C',
  PREMIUM: 'Premium'
};

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';

  return 'Good evening';
}

function formatCurrency(value) {
  const number = Number(value || 0);

  return `₹${number.toLocaleString('en-IN', {
    maximumFractionDigits: 0
  })}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

export default function BuyerDashboard() {
  const { profile } = useAuth();

  const [stats, setStats] = useState({});
  const [demands, setDemands] = useState([]);
  const [listings, setListings] = useState([]);

  const [showDemand, setShowDemand] = useState(false);

  const [form, setForm] = useState({
    commodity: 'TOMATO',
    requiredQuantity: '',
    targetPrice: '',
    deliveryLocation: '',
    requiredGrade: 'GRADE_A'
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const mountedRef = useRef(true);

  // ---------------------------------------------------------
  // MARKETPLACE FILTERS
  // ---------------------------------------------------------

  const [searchTerm, setSearchTerm] = useState('');
  const [cropFilter, setCropFilter] = useState('ALL');
  const [sortOption, setSortOption] = useState('newest');

  // ---------------------------------------------------------
  // MATCHING
  // ---------------------------------------------------------

  const [selectedMatchDemand, setSelectedMatchDemand] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchError, setMatchError] = useState('');

  // ---------------------------------------------------------
  // ORDER
  // ---------------------------------------------------------

  const [orderingListing, setOrderingListing] = useState(null);
  const [orderQuantity, setOrderQuantity] = useState('');
  const [orderLocation, setOrderLocation] = useState('');
  const [orderError, setOrderError] = useState('');
  const [ordering, setOrdering] = useState(false);

  // ---------------------------------------------------------
  // ROUTE
  // ---------------------------------------------------------

  const [routeEstimate, setRouteEstimate] = useState(null);
  const [estimatingRoute, setEstimatingRoute] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState('TRANSPORT_PARTNER');

  const [orderSuccess, setOrderSuccess] = useState(false);

  // ---------------------------------------------------------
  // MOUNT
  // ---------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ---------------------------------------------------------
  // LOAD DASHBOARD
  // ---------------------------------------------------------

  const load = useCallback(async (isRefresh = false) => {
    if (!profile?.id || !mountedRef.current) return;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [statsResponse, demandsResponse, listingsResponse] =
        await Promise.all([
          dashboardAPI.getStats(),
          demandAPI.getByBuyer(profile.id),
          listingAPI.getAll()
        ]);

      if (!mountedRef.current) return;

      setStats(statsResponse?.data || {});
      setDemands(demandsResponse?.data || []);
      setListings(listingsResponse?.data || []);
    } catch (err) {
      console.error('Failed to load buyer dashboard data:', err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------------------------------------------------------
  // CREATE DEMAND
  // ---------------------------------------------------------

  const handleCreateDemand = async (e) => {
    e.preventDefault();

    try {
      await demandAPI.create({
        ...form,
        requiredQuantity: parseFloat(form.requiredQuantity),
        targetPrice: parseFloat(form.targetPrice)
      });

      setShowDemand(false);

      setForm({
        commodity: 'TOMATO',
        requiredQuantity: '',
        targetPrice: '',
        deliveryLocation: '',
        requiredGrade: 'GRADE_A'
      });

      await load(true);
    } catch (err) {
      console.error('Failed to create demand:', err);

      alert(
        err.response?.data?.error ||
        'Failed to create demand. Please try again.'
      );
    }
  };

  // ---------------------------------------------------------
  // FIND FARMERS
  // ---------------------------------------------------------

  const handleFindFarmers = async (demand) => {
    setSelectedMatchDemand(demand);
    setMatches([]);
    setMatchError('');
    setLoadingMatches(true);

    try {
      const res = await supplyDemandAPI.getMatches(
        demand.commodity,
        {
          maxPrice: demand.target_price,
          minQuantity: 1
        }
      );

      const result = res?.data || [];

      setMatches(result);

      if (result.length === 0) {
        setMatchError(
          'No farmers found matching this commodity currently.'
        );
      }
    } catch (err) {
      console.error('Failed to fetch matches:', err);

      setMatchError(
        err.response?.data?.error ||
        'Failed to fetch matching farmers.'
      );
    } finally {
      setLoadingMatches(false);
    }
  };

  // ---------------------------------------------------------
  // OPEN ORDER
  // ---------------------------------------------------------

  const handleOpenOrder = (listing) => {
    setOrderingListing(listing);
    setOrderQuantity('');
    setOrderLocation(profile?.location || '');
    setOrderError('');
    setRouteEstimate(null);
    setDeliveryMode('TRANSPORT_PARTNER');
    setOrderSuccess(false);
  };

  // ---------------------------------------------------------
  // CALCULATE ROUTE
  // ---------------------------------------------------------

  const handleCalculateEstimate = async () => {
    if (!orderLocation.trim()) {
      setOrderError('Enter a delivery destination first.');
      return;
    }

    if (
      !orderQuantity ||
      isNaN(parseFloat(orderQuantity)) ||
      parseFloat(orderQuantity) <= 0
    ) {
      setOrderError('Enter a valid quantity.');
      return;
    }

    setEstimatingRoute(true);
    setOrderError('');

    try {
      const res = await routeAPI.estimate(
        orderingListing.location,
        orderLocation
      );

      setRouteEstimate({
        distanceKm: res.data.distanceKm,
        estimatedTime: res.data.estimatedTime,
        estimatedCost:
          deliveryMode === 'BUYER_PICKUP'
            ? 0
            : res.data.estimatedCost,
        isFallback: res.data.isFallback
      });
    } catch (err) {
      console.error('Route estimation failed:', err);

      setOrderError(
        err.response?.data?.error ||
        'Failed to estimate route.'
      );
    } finally {
      setEstimatingRoute(false);
    }
  };

  // ---------------------------------------------------------
  // PLACE ORDER
  // ---------------------------------------------------------

  const handlePlaceOrder = async (e) => {
    e.preventDefault();

    setOrderError('');

    const qty = parseFloat(orderQuantity);

    if (isNaN(qty) || qty <= 0) {
      setOrderError('Enter a valid quantity.');
      return;
    }

    if (qty > parseFloat(orderingListing.quantity)) {
      setOrderError(
        `Only ${orderingListing.quantity} kg available`
      );
      return;
    }

    if (
      !routeEstimate &&
      deliveryMode !== 'BUYER_PICKUP'
    ) {
      setOrderError(
        'Calculate delivery estimate first.'
      );
      return;
    }

    setOrdering(true);

    try {
      await orderAPI.create({
        listingId: orderingListing.id,
        quantity: qty,
        deliveryLocation:
          orderLocation || orderingListing.location,
        deliveryMode
      });

      setOrderSuccess(true);

      setTimeout(async () => {
        if (!mountedRef.current) return;

        setOrderSuccess(false);
        setOrderingListing(null);
        setRouteEstimate(null);
        setSelectedMatchDemand(null);

        await load(true);
      }, 1500);
    } catch (err) {
      console.error('Failed to place order:', err);

      setOrderError(
        err.response?.data?.error ||
        'Failed to place order.'
      );
    } finally {
      setOrdering(false);
    }
  };

  // ---------------------------------------------------------
  // MARKETPLACE FILTER
  // ---------------------------------------------------------

  const filteredListings = listings
    .filter((listing) => {
      const matchesSearch =
        !searchTerm ||
        cropLabels[listing.commodity]
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        listing.variety
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        listing.location
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        listing.farmer_name
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase());

      const matchesCrop =
        cropFilter === 'ALL' ||
        listing.commodity === cropFilter;

      return matchesSearch && matchesCrop;
    })
    .sort((a, b) => {
      if (sortOption === 'price-low') {
        return (
          parseFloat(a.asking_price || 0) -
          parseFloat(b.asking_price || 0)
        );
      }

      if (sortOption === 'price-high') {
        return (
          parseFloat(b.asking_price || 0) -
          parseFloat(a.asking_price || 0)
        );
      }

      if (sortOption === 'quantity') {
        return (
          parseFloat(b.quantity || 0) -
          parseFloat(a.quantity || 0)
        );
      }

      return 0;
    });

  // ---------------------------------------------------------
  // LOADING
  // ---------------------------------------------------------

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{
            borderColor: 'var(--bg-overlay)',
            borderTopColor: 'var(--info)'
          }}
        />
      </div>
    );
  }

  const activeDemands = demands.filter(
    (d) =>
      d.demand_status !== 'FULFILLED' &&
      d.demand_status !== 'CANCELLED'
  );

  const activeListings = listings.filter(
    (l) => l.listing_status === 'ACTIVE'
  );

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

        <div>
          <h1
            className="text-2xl font-bold gradient-text"
          >
            {getGreeting()}, {profile?.name || 'Buyer'}
          </h1>

          <p
            className="text-sm mt-1"
            style={{ color: 'var(--text-muted)' }}
          >
            Manage your procurement, find farmers and buy
            fresh produce directly.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">

          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                refreshing ? 'animate-spin' : ''
              }`}
            />
            Refresh
          </button>

          <a
            href="/marketplace"
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Search className="h-4 w-4" />
            Marketplace
          </a>

          <button
            onClick={() => setShowDemand(!showDemand)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover-lift"
            style={{
              background: 'var(--info)',
              color: 'white'
            }}
          >
            {showDemand ? (
              <X className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}

            {showDemand
              ? 'Cancel'
              : 'Create Demand'}
          </button>

        </div>
      </div>

      {/* =====================================================
          QUICK ACTIONS
      ===================================================== */}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        <button
          onClick={() => setShowDemand(true)}
          className="card-surface p-5 text-left hover-lift transition-all"
        >
          <div className="flex items-center justify-between">

            <div
              className="p-3 rounded-xl"
              style={{
                background: 'rgba(59,130,246,0.12)'
              }}
            >
              <Plus
                className="h-5 w-5"
                style={{ color: 'var(--info)' }}
              />
            </div>

            <ArrowRight
              className="h-4 w-4"
              style={{
                color: 'var(--text-muted)'
              }}
            />

          </div>

          <h3
            className="font-bold mt-4"
            style={{
              color: 'var(--text-primary)'
            }}
          >
            Create Demand
          </h3>

          <p
            className="text-xs mt-1"
            style={{
              color: 'var(--text-muted)'
            }}
          >
            Tell farmers what produce you need.
          </p>
        </button>

        <a
          href="/marketplace"
          className="card-surface p-5 text-left hover-lift transition-all"
        >
          <div className="flex items-center justify-between">

            <div
              className="p-3 rounded-xl"
              style={{
                background: 'rgba(34,197,94,0.10)'
              }}
            >
              <Search
                className="h-5 w-5"
                style={{ color: 'var(--accent)' }}
              />
            </div>

            <ArrowRight
              className="h-4 w-4"
              style={{
                color: 'var(--text-muted)'
              }}
            />

          </div>

          <h3
            className="font-bold mt-4"
            style={{
              color: 'var(--text-primary)'
            }}
          >
            Find Produce
          </h3>

          <p
            className="text-xs mt-1"
            style={{
              color: 'var(--text-muted)'
            }}
          >
            Browse produce directly from farmers.
          </p>
        </a>

        <button
          onClick={() => {
            if (activeDemands.length > 0) {
              handleFindFarmers(activeDemands[0]);
            } else {
              setShowDemand(true);
            }
          }}
          className="card-surface p-5 text-left hover-lift transition-all"
        >
          <div className="flex items-center justify-between">

            <div
              className="p-3 rounded-xl"
              style={{
                background: 'rgba(168,85,247,0.10)'
              }}
            >
              <Users
                className="h-5 w-5"
                style={{
                  color: '#a855f7'
                }}
              />
            </div>

            <ArrowRight
              className="h-4 w-4"
              style={{
                color: 'var(--text-muted)'
              }}
            />

          </div>

          <h3
            className="font-bold mt-4"
            style={{
              color: 'var(--text-primary)'
            }}
          >
            Find Farmers
          </h3>

          <p
            className="text-xs mt-1"
            style={{
              color: 'var(--text-muted)'
            }}
          >
            Match your requirements with farmers.
          </p>
        </button>

        <div
          className="card-surface p-5 hover-lift transition-all"
        >
          <div className="flex items-center justify-between">

            <div
              className="p-3 rounded-xl"
              style={{
                background: 'rgba(245,158,11,0.10)'
              }}
            >
              <Truck
                className="h-5 w-5"
                style={{
                  color: 'var(--warning)'
                }}
              />
            </div>

            <span
              className="text-xs font-bold"
              style={{
                color: 'var(--warning)'
              }}
            >
              PROCUREMENT
            </span>

          </div>

          <h3
            className="font-bold mt-4"
            style={{
              color: 'var(--text-primary)'
            }}
          >
            Direct Buying
          </h3>

          <p
            className="text-xs mt-1"
            style={{
              color: 'var(--text-muted)'
            }}
          >
            Buy from farmers with delivery estimates.
          </p>
        </div>

      </div>

      {/* =====================================================
          WELCOME / EMPTY STATE
      ===================================================== */}

      {demands.length === 0 && listings.length === 0 && (
        <div
          className="card-atmospheric p-8 text-center space-y-3"
        >

          <div
            className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
            style={{
              background: 'rgba(59,130,246,0.12)'
            }}
          >
            <ShoppingCart
              className="h-8 w-8"
              style={{
                color: 'var(--info)'
              }}
            />
          </div>

          <h2
            className="text-lg font-bold"
            style={{
              color: 'var(--info)'
            }}
          >
            Welcome to AgriConnect!
          </h2>

          <p
            className="text-sm max-w-md mx-auto"
            style={{
              color: 'var(--text-muted)'
            }}
          >
            Start by creating a purchase demand or
            exploring produce available directly from
            farmers.
          </p>

          <div className="flex justify-center gap-2 flex-wrap">

            <button
              onClick={() => setShowDemand(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{
                background: 'var(--info)',
                color: 'white'
              }}
            >
              Create Demand
            </button>

            <a
              href="/marketplace"
              className="btn-secondary text-sm"
            >
              Explore Marketplace
            </a>

          </div>

        </div>
      )}

      {/* =====================================================
          PROCUREMENT STATS
      ===================================================== */}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {[
          {
            icon: ShoppingCart,
            label: 'Total Orders',
            value: stats.totalOrders || 0,
            color: 'var(--info)',
            bg: 'rgba(59,130,246,0.12)'
          },
          {
            icon: Clock,
            label: 'Pending Orders',
            value: stats.pendingOrders || 0,
            color: 'var(--warning)',
            bg: 'rgba(245,158,11,0.10)'
          },
          {
            icon: IndianRupee,
            label: 'Total Spent',
            value: formatCurrency(stats.totalSpent || 0),
            color: 'var(--accent)',
            bg: 'rgba(34,197,94,0.10)'
          },
          {
            icon: Package,
            label: 'Active Demands',
            value: activeDemands.length,
            color: '#a855f7',
            bg: 'rgba(168,85,247,0.10)'
          }
        ].map(
          ({
            icon: Icon,
            label,
            value,
            color,
            bg
          }) => (
            <div
              key={label}
              className="card-surface p-5 hover-premium"
            >

              <div className="flex items-center gap-3">

                <div
                  className="p-3 rounded-lg"
                  style={{ background: bg }}
                >
                  <Icon
                    className="h-5 w-5"
                    style={{ color }}
                  />
                </div>

                <div>
                  <p
                    className="text-sm"
                    style={{
                      color: 'var(--text-muted)'
                    }}
                  >
                    {label}
                  </p>

                  <p
                    className="text-xl font-bold font-numeric"
                    style={{
                      color: 'var(--text-primary)'
                    }}
                  >
                    {value}
                  </p>
                </div>

              </div>

            </div>
          )
        )}

      </div>

      {/* =====================================================
          CREATE DEMAND
      ===================================================== */}

      {showDemand && (
        <div
          className="card-atmospheric p-6 animate-slide-down"
        >

          <div className="flex items-center justify-between mb-5">

            <div>
              <h3
                className="font-bold text-base"
                style={{
                  color: 'var(--text-primary)'
                }}
              >
                Create Purchase Demand
              </h3>

              <p
                className="text-xs mt-1"
                style={{
                  color: 'var(--text-muted)'
                }}
              >
                Specify what you want farmers to supply.
              </p>
            </div>

            <button
              onClick={() => setShowDemand(false)}
              className="p-2 rounded-lg"
              style={{
                color: 'var(--text-muted)'
              }}
            >
              <X className="h-4 w-4" />
            </button>

          </div>

          <form
            onSubmit={handleCreateDemand}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
          >

            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{
                  color: 'var(--text-secondary)'
                }}
              >
                Commodity
              </label>

              <select
                value={form.commodity}
                onChange={(e) =>
                  setForm({
                    ...form,
                    commodity: e.target.value
                  })
                }
                className="input-field"
              >
                {cropOptions.map((crop) => (
                  <option
                    key={crop}
                    value={crop}
                  >
                    {cropLabels[crop]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{
                  color: 'var(--text-secondary)'
                }}
              >
                Required Quantity
              </label>

              <input
                type="number"
                min="1"
                value={form.requiredQuantity}
                onChange={(e) =>
                  setForm({
                    ...form,
                    requiredQuantity: e.target.value
                  })
                }
                className="input-field font-numeric"
                placeholder="e.g. 1000"
                required
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{
                  color: 'var(--text-secondary)'
                }}
              >
                Target Price ₹/kg
              </label>

              <input
                type="number"
                min="0"
                step="any"
                value={form.targetPrice}
                onChange={(e) =>
                  setForm({
                    ...form,
                    targetPrice: e.target.value
                  })
                }
                className="input-field font-numeric"
                placeholder="e.g. 30"
                required
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{
                  color: 'var(--text-secondary)'
                }}
              >
                Delivery Location
              </label>

              <input
                value={form.deliveryLocation}
                onChange={(e) =>
                  setForm({
                    ...form,
                    deliveryLocation: e.target.value
                  })
                }
                className="input-field"
                placeholder="e.g. Hyderabad Warehouse"
                required
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{
                  color: 'var(--text-secondary)'
                }}
              >
                Required Grade
              </label>

              <select
                value={form.requiredGrade}
                onChange={(e) =>
                  setForm({
                    ...form,
                    requiredGrade: e.target.value
                  })
                }
                className="input-field"
              >
                {Object.entries(gradeLabels).map(
                  ([key, value]) => (
                    <option
                      key={key}
                      value={key}
                    >
                      {value}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="col-span-full flex gap-2 pt-2">

              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2"
                style={{
                  background: 'var(--info)',
                  color: 'white'
                }}
              >
                <Plus className="h-4 w-4" />
                Create Demand
              </button>

              <button
                type="button"
                onClick={() => setShowDemand(false)}
                className="btn-secondary"
              >
                Cancel
              </button>

            </div>

          </form>

        </div>
      )}

      {/* =====================================================
          ACTIVE DEMANDS
      ===================================================== */}

      <div className="card-surface overflow-hidden">

        <div className="px-5 py-4 border-b flex items-center justify-between gap-3"
          style={{
            borderColor: 'var(--border)'
          }}
        >

          <div>
            <h3
              className="font-bold text-base"
              style={{
                color: 'var(--text-primary)'
              }}
            >
              Active Purchase Demands
            </h3>

            <p
              className="text-xs mt-1"
              style={{
                color: 'var(--text-muted)'
              }}
            >
              Your current requirements from farmers.
            </p>
          </div>

          <span
            className="text-xs font-semibold"
            style={{
              color: 'var(--text-muted)'
            }}
          >
            {activeDemands.length} active
          </span>

        </div>

        <div className="overflow-x-auto">

          <table className="w-full">

            <thead>
              <tr
                style={{
                  borderBottom:
                    '1px solid var(--border)'
                }}
              >
                {[
                  'Commodity',
                  'Quantity',
                  'Target Price',
                  'Delivery',
                  'Status',
                  'Action'
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      color: 'var(--text-muted)'
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="text-sm">

              {activeDemands.map((demand) => (
                <tr
                  key={demand.id}
                  style={{
                    borderBottom:
                      '1px solid var(--border)'
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      'var(--bg-hover)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background =
                      'transparent')
                  }
                >

                  <td
                    className="px-5 py-3 font-semibold"
                    style={{
                      color: 'var(--text-primary)'
                    }}
                  >
                    {cropLabels[demand.commodity] ||
                      demand.commodity}
                  </td>

                  <td
                    className="px-5 py-3 font-numeric"
                    style={{
                      color: 'var(--text-secondary)'
                    }}
                  >
                    {formatNumber(
                      demand.required_quantity
                    )}{' '}
                    kg
                  </td>

                  <td
                    className="px-5 py-3 font-semibold font-numeric"
                    style={{
                      color: 'var(--info)'
                    }}
                  >
                    ₹{demand.target_price}/kg
                  </td>

                  <td
                    className="px-5 py-3"
                    style={{
                      color: 'var(--text-secondary)'
                    }}
                  >
                    {demand.delivery_location}
                  </td>

                  <td className="px-5 py-3">

                    <span className="badge badge-success">
                      {demand.demand_status}
                    </span>

                  </td>

                  <td className="px-5 py-3">

                    <button
                      onClick={() =>
                        handleFindFarmers(demand)
                      }
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{
                        background:
                          'rgba(59,130,246,0.12)',
                        color: 'var(--info)'
                      }}
                    >
                      <Users className="h-3 w-3" />
                      Find Farmers
                    </button>

                  </td>

                </tr>
              ))}

              {activeDemands.length === 0 && (
                <tr>
                  <td
                    colSpan="6"
                    className="text-center py-12"
                  >

                    <Package
                      className="h-8 w-8 mx-auto mb-3"
                      style={{
                        color: 'var(--text-muted)'
                      }}
                    />

                    <p
                      className="font-semibold"
                      style={{
                        color: 'var(--text-primary)'
                      }}
                    >
                      No active demands
                    </p>

                    <p
                      className="text-sm mt-1 mb-3"
                      style={{
                        color: 'var(--text-muted)'
                      }}
                    >
                      Create a demand when you need
                      specific produce.
                    </p>

                    <button
                      onClick={() => setShowDemand(true)}
                      className="px-4 py-2 rounded-lg text-sm font-semibold"
                      style={{
                        background: 'var(--info)',
                        color: 'white'
                      }}
                    >
                      + Create Demand
                    </button>

                  </td>
                </tr>
              )}

            </tbody>

          </table>

        </div>

      </div>

      {/* =====================================================
          AVAILABLE PRODUCE
      ===================================================== */}

      <div className="card-surface overflow-hidden">

        <div className="px-5 py-4 border-b"
          style={{
            borderColor: 'var(--border)'
          }}
        >

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

            <div>
              <h3
                className="font-bold text-base"
                style={{
                  color: 'var(--text-primary)'
                }}
              >
                Available Produce
              </h3>

              <p
                className="text-xs mt-1"
                style={{
                  color: 'var(--text-muted)'
                }}
              >
                Fresh listings available directly from
                farmers.
              </p>
            </div>

            <a
              href="/marketplace"
              className="flex items-center gap-1 text-xs font-semibold"
              style={{
                color: 'var(--info)'
              }}
            >
              View Full Marketplace
              <ChevronRight className="h-3.5 w-3.5" />
            </a>

          </div>

        </div>

        {/* FILTER BAR */}

        <div
          className="p-5 border-b"
          style={{
            borderColor: 'var(--border)'
          }}
        >

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            <div className="relative">

              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                style={{
                  color: 'var(--text-muted)'
                }}
              />

              <input
                value={searchTerm}
                onChange={(e) =>
                  setSearchTerm(e.target.value)
                }
                className="input-field pl-9"
                placeholder="Search crop, farmer or location..."
              />

            </div>

            <div className="relative">

              <SlidersHorizontal
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                style={{
                  color: 'var(--text-muted)'
                }}
              />

              <select
                value={cropFilter}
                onChange={(e) =>
                  setCropFilter(e.target.value)
                }
                className="input-field pl-9"
              >

                <option value="ALL">
                  All Crops
                </option>

                {cropOptions.map((crop) => (
                  <option
                    key={crop}
                    value={crop}
                  >
                    {cropLabels[crop]}
                  </option>
                ))}

              </select>

            </div>

            <select
              value={sortOption}
              onChange={(e) =>
                setSortOption(e.target.value)
              }
              className="input-field"
            >
              <option value="newest">
                Default
              </option>

              <option value="price-low">
                Price: Low to High
              </option>

              <option value="price-high">
                Price: High to Low
              </option>

              <option value="quantity">
                Highest Quantity
              </option>
            </select>

          </div>

        </div>

        {/* LISTINGS */}

        <div className="p-5">

          <div className="flex items-center justify-between mb-4">

            <span
              className="text-xs"
              style={{
                color: 'var(--text-muted)'
              }}
            >
              Showing{' '}
              <strong>
                {Math.min(filteredListings.length, 9)}
              </strong>{' '}
              of {filteredListings.length} matching
              listings
            </span>

            <span
              className="text-xs font-semibold"
              style={{
                color: 'var(--accent)'
              }}
            >
              {activeListings.length} active listings
            </span>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {filteredListings
              .filter(
                (listing) =>
                  listing.listing_status === 'ACTIVE'
              )
              .slice(0, 9)
              .map((listing) => (

                <div
                  key={listing.id}
                  className="card-surface p-4 hover-lift transition-all"
                >

                  <div className="flex justify-between items-start mb-3">

                    <div>

                      <h4
                        className="font-bold"
                        style={{
                          color:
                            'var(--text-primary)'
                        }}
                      >
                        {cropLabels[
                          listing.commodity
                        ] ||
                          listing.commodity}
                      </h4>

                      <p
                        className="text-xs mt-1"
                        style={{
                          color:
                            'var(--text-muted)'
                        }}
                      >
                        {listing.variety ||
                          'Standard variety'}
                        {' · '}
                        {gradeLabels[
                          listing.grade
                        ] ||
                          listing.grade ||
                          'Grade not specified'}
                      </p>

                    </div>

                    <span className="badge badge-success text-[10px]">
                      ACTIVE
                    </span>

                  </div>

                  <div className="space-y-2 mb-4">

                    <div className="flex items-center gap-2 text-xs">

                      <Users
                        className="h-3.5 w-3.5"
                        style={{
                          color:
                            'var(--text-muted)'
                        }}
                      />

                      <span
                        style={{
                          color:
                            'var(--text-secondary)'
                        }}
                      >
                        {listing.farmer_name ||
                          'Farmer'}
                      </span>

                    </div>

                    <div className="flex items-center gap-2 text-xs">

                      <MapPin
                        className="h-3.5 w-3.5"
                        style={{
                          color:
                            'var(--text-muted)'
                        }}
                      />

                      <span
                        style={{
                          color:
                            'var(--text-secondary)'
                        }}
                      >
                        {listing.location}
                        {listing.state
                          ? `, ${listing.state}`
                          : ''}
                      </span>

                    </div>

                    <div className="flex items-center gap-2 text-xs">

                      <Package
                        className="h-3.5 w-3.5"
                        style={{
                          color:
                            'var(--text-muted)'
                        }}
                      />

                      <span
                        style={{
                          color:
                            'var(--text-secondary)'
                        }}
                      >
                        Available:{' '}
                        <strong>
                          {formatNumber(
                            listing.quantity
                          )}{' '}
                          kg
                        </strong>
                      </span>

                    </div>

                  </div>

                  <div
                    className="flex justify-between items-center pt-3 border-t"
                    style={{
                      borderColor:
                        'var(--border)'
                    }}
                  >

                    <div>

                      <p
                        className="text-[10px]"
                        style={{
                          color:
                            'var(--text-muted)'
                        }}
                      >
                        Asking Price
                      </p>

                      <span
                        className="text-lg font-bold font-numeric"
                        style={{
                          color:
                            'var(--accent)'
                        }}
                      >
                        ₹{listing.asking_price}
                        <span
                          className="text-xs font-normal"
                          style={{
                            color:
                              'var(--text-muted)'
                          }}
                        >
                          /kg
                        </span>
                      </span>

                    </div>

                    {listing.farmer_id !== profile?.id && (
                      <button
                        onClick={() =>
                          handleOpenOrder(listing)
                        }
                        className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background:
                            'var(--accent)',
                          color:
                            'var(--text-inverse)'
                        }}
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        Buy
                      </button>
                    )}

                  </div>

                </div>

              ))}

          </div>

          {filteredListings.filter(
            (l) => l.listing_status === 'ACTIVE'
          ).length === 0 && (

            <div className="text-center py-12">

              <Search
                className="h-8 w-8 mx-auto mb-3"
                style={{
                  color: 'var(--text-muted)'
                }}
              />

              <p
                className="font-semibold"
                style={{
                  color: 'var(--text-primary)'
                }}
              >
                No matching produce found
              </p>

              <p
                className="text-sm mt-1"
                style={{
                  color: 'var(--text-muted)'
                }}
              >
                Try another crop, location or search
                term.
              </p>

            </div>

          )}

        </div>

      </div>

      {/* =====================================================
          PROCUREMENT WORKFLOW
      ===================================================== */}

      <div className="card-atmospheric p-6">

        <div className="flex items-center gap-3 mb-6">

          <div
            className="p-3 rounded-xl"
            style={{
              background:
                'rgba(59,130,246,0.12)'
            }}
          >
            <BarChart3
              className="h-5 w-5"
              style={{
                color: 'var(--info)'
              }}
            />
          </div>

          <div>

            <h3
              className="font-bold"
              style={{
                color: 'var(--text-primary)'
              }}
            >
              Your Buying Workflow
            </h3>

            <p
              className="text-xs mt-1"
              style={{
                color: 'var(--text-muted)'
              }}
            >
              A simple way to procure produce through
              AgriConnect.
            </p>

          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

          {[
            {
              number: '01',
              title: 'Create Demand',
              text: 'Specify crop, quantity, price and delivery location.'
            },
            {
              number: '02',
              title: 'Match Farmers',
              text: 'Find farmers whose produce matches your requirements.'
            },
            {
              number: '03',
              title: 'Compare & Buy',
              text: 'Compare available quantity, price, grade and location.'
            },
            {
              number: '04',
              title: 'Arrange Delivery',
              text: 'Estimate route cost and select your delivery mode.'
            }
          ].map((step) => (

            <div
              key={step.number}
              className="rounded-xl p-4"
              style={{
                background:
                  'var(--bg-elevated)',
                border:
                  '1px solid var(--border)'
              }}
            >

              <span
                className="text-xs font-bold"
                style={{
                  color: 'var(--info)'
                }}
              >
                {step.number}
              </span>

              <h4
                className="font-semibold text-sm mt-2"
                style={{
                  color:
                    'var(--text-primary)'
                }}
              >
                {step.title}
              </h4>

              <p
                className="text-xs mt-1 leading-relaxed"
                style={{
                  color:
                    'var(--text-muted)'
                }}
              >
                {step.text}
              </p>

            </div>

          ))}

        </div>

      </div>

      {/* =====================================================
          MATCHING MODAL
      ===================================================== */}

      {selectedMatchDemand && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-40 modal-backdrop"
        >

          <div
            className="card-glass rounded-2xl max-w-2xl w-full p-6 relative modal-content max-h-[85vh] flex flex-col"
            style={{
              boxShadow: 'var(--shadow-xl)'
            }}
          >

            <button
              onClick={() =>
                setSelectedMatchDemand(null)
              }
              className="absolute right-4 top-4 p-1 rounded-lg"
              style={{
                color: 'var(--text-muted)'
              }}
            >
              <X className="h-5 w-5" />
            </button>

            <h3
              className="text-lg font-bold mb-2"
              style={{
                color: 'var(--text-primary)'
              }}
            >
              Farmers Matching Your Demand
            </h3>

            <p
              className="text-sm mb-4"
              style={{
                color: 'var(--text-muted)'
              }}
            >
              {cropLabels[
                selectedMatchDemand.commodity
              ] ||
                selectedMatchDemand.commodity}{' '}
              ·{' '}
              {formatNumber(
                selectedMatchDemand.required_quantity
              )}{' '}
              kg · Budget ₹
              {selectedMatchDemand.target_price}/kg
            </p>

            {loadingMatches ? (

              <div className="flex justify-center py-12">

                <div
                  className="w-8 h-8 border-2 rounded-full animate-spin"
                  style={{
                    borderColor:
                      'var(--bg-overlay)',
                    borderTopColor:
                      'var(--info)'
                  }}
                />

              </div>

            ) : matchError ? (

              <div className="text-center py-10">

                <Users
                  className="h-8 w-8 mx-auto mb-3"
                  style={{
                    color: 'var(--text-muted)'
                  }}
                />

                <p
                  className="text-sm"
                  style={{
                    color:
                      'var(--text-muted)'
                  }}
                >
                  {matchError}
                </p>

              </div>

            ) : (

              <div className="overflow-y-auto flex-1 space-y-3 pr-1">

                {matches.map((match, index) => (

                  <div
                    key={index}
                    className="rounded-xl p-4 flex flex-col sm:flex-row justify-between gap-4"
                    style={{
                      background:
                        'var(--bg-elevated)',
                      border:
                        '1px solid var(--border)'
                    }}
                  >

                    <div className="space-y-2 flex-1">

                      <div className="flex items-center gap-2">

                        <span
                          className="font-bold text-sm"
                          style={{
                            color:
                              'var(--text-primary)'
                          }}
                        >
                          {match.listing
                            .farmer_name ||
                            'Farmer'}
                        </span>

                        <span className="badge badge-info text-[10px]">
                          Score:{' '}
                          {Math.round(
                            match.score || 0
                          )}
                        </span>

                      </div>

                      <p
                        className="text-xs flex items-center gap-1"
                        style={{
                          color:
                            'var(--text-muted)'
                        }}
                      >
                        <MapPin className="h-3.5 w-3.5" />

                        {match.listing
                          .listing_location ||
                          match.listing.location}

                        {match.listing
                          .listing_state ||
                          match.listing.state
                          ? `, ${
                              match.listing
                                .listing_state ||
                              match.listing.state
                            }`
                          : ''}
                      </p>

                      <div className="flex flex-wrap gap-4 text-xs">

                        <span
                          style={{
                            color:
                              'var(--text-muted)'
                          }}
                        >
                          Price:{' '}
                          <strong
                            className="font-numeric"
                            style={{
                              color:
                                'var(--accent)'
                            }}
                          >
                            ₹
                            {
                              match.listing
                                .asking_price
                            }
                            /kg
                          </strong>
                        </span>

                        <span
                          style={{
                            color:
                              'var(--text-muted)'
                          }}
                        >
                          Available:{' '}
                          <strong
                            style={{
                              color:
                                'var(--text-primary)'
                            }}
                          >
                            {
                              match.listing
                                .available_quantity
                            }{' '}
                            kg
                          </strong>
                        </span>

                      </div>

                      <div className="flex flex-wrap gap-1.5">

                        {(match.matchReasons ||
                          []).map(
                          (reason, reasonIndex) => (
                            <span
                              key={reasonIndex}
                              className="badge badge-success text-[10px]"
                            >
                              {reason}
                            </span>
                          )
                        )}

                      </div>

                    </div>

                    <button
                      onClick={() =>
                        handleOpenOrder(
                          match.listing
                        )
                      }
                      className="flex items-center justify-center gap-1 px-4 py-2 rounded-lg text-xs font-semibold"
                      style={{
                        background:
                          'var(--accent)',
                        color:
                          'var(--text-inverse)'
                      }}
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      Buy
                    </button>

                  </div>

                ))}

              </div>

            )}

          </div>

        </div>
      )}

      {/* =====================================================
          ORDER MODAL
      ===================================================== */}

      {orderingListing && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50 modal-backdrop"
        >

          <div
            className="card-glass rounded-2xl max-w-md w-full p-6 relative modal-content"
            style={{
              boxShadow: 'var(--shadow-xl)'
            }}
          >

            <button
              onClick={() => {
                setOrderingListing(null);
                setOrderSuccess(false);
              }}
              className="absolute right-4 top-4 p-1 rounded-lg"
              style={{
                color: 'var(--text-muted)'
              }}
            >
              <X className="h-5 w-5" />
            </button>

            {orderSuccess ? (

              <div className="text-center py-8 space-y-3">

                <div
                  className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
                  style={{
                    background:
                      'rgba(34,197,94,0.15)'
                  }}
                >
                  <CheckCircle
                    className="h-8 w-8"
                    style={{
                      color: 'var(--accent)'
                    }}
                  />
                </div>

                <h3
                  className="text-lg font-bold"
                  style={{
                    color: 'var(--accent)'
                  }}
                >
                  Order Placed!
                </h3>

                <p
                  className="text-sm"
                  style={{
                    color: 'var(--text-muted)'
                  }}
                >
                  Your order has been confirmed.
                </p>

              </div>

            ) : (

              <>

                <h3
                  className="text-lg font-bold mb-2 flex items-center gap-1.5"
                  style={{
                    color:
                      'var(--text-primary)'
                  }}
                >
                  <ShoppingCart
                    className="h-5 w-5"
                    style={{
                      color:
                        'var(--accent)'
                    }}
                  />
                  Place Direct Order
                </h3>

                <p
                  className="text-sm mb-4"
                  style={{
                    color:
                      'var(--text-muted)'
                  }}
                >
                  Ordering{' '}
                  <strong
                    style={{
                      color:
                        'var(--text-primary)'
                    }}
                  >
                    {cropLabels[
                      orderingListing.commodity
                    ] ||
                      orderingListing.commodity}
                  </strong>{' '}
                  from{' '}
                  <strong
                    style={{
                      color:
                        'var(--text-primary)'
                    }}
                  >
                    {orderingListing.farmer_name ||
                      'Farmer'}
                  </strong>
                </p>

                {orderError && (

                  <div
                    className="rounded-lg text-xs p-3 mb-4"
                    style={{
                      background:
                        'rgba(239,68,68,0.10)',
                      color: '#dc2626',
                      border:
                        '1px solid rgba(239,68,68,0.15)'
                    }}
                  >
                    {orderError}
                  </div>

                )}

                <form
                  onSubmit={handlePlaceOrder}
                  className="space-y-4"
                >

                  {/* QUANTITY */}

                  <div>

                    <label
                      className="block text-sm font-medium mb-2"
                      style={{
                        color:
                          'var(--text-secondary)'
                      }}
                    >
                      Quantity (kg)
                    </label>

                    <input
                      type="number"
                      step="any"
                      min="0.1"
                      value={orderQuantity}
                      onChange={(e) => {
                        setOrderQuantity(
                          e.target.value
                        );
                        setRouteEstimate(null);
                      }}
                      className="input-field font-numeric"
                      placeholder={`Max ${orderingListing.quantity} kg`}
                      required
                    />

                    <span
                      className="text-xs mt-1 block"
                      style={{
                        color:
                          'var(--text-muted)'
                      }}
                    >
                      Available:{' '}
                      {orderingListing.quantity} kg
                      {' · '}
                      Price: ₹
                      {orderingListing.asking_price}
                      /kg
                    </span>

                  </div>

                  {/* DELIVERY LOCATION */}

                  <div>

                    <label
                      className="block text-sm font-medium mb-2"
                      style={{
                        color:
                          'var(--text-secondary)'
                      }}
                    >
                      Delivery Destination
                    </label>

                    <div className="flex gap-2">

                      <input
                        type="text"
                        value={orderLocation}
                        onChange={(e) => {
                          setOrderLocation(
                            e.target.value
                          );
                          setRouteEstimate(null);
                        }}
                        className="input-field flex-1"
                        placeholder="e.g. Hyderabad Warehouse"
                        required
                      />

                      <button
                        type="button"
                        onClick={
                          handleCalculateEstimate
                        }
                        disabled={
                          estimatingRoute ||
                          !orderLocation ||
                          !orderQuantity
                        }
                        className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                        style={{
                          background:
                            'rgba(59,130,246,0.12)',
                          color: 'var(--info)',
                          border:
                            '1px solid rgba(59,130,246,0.2)'
                        }}
                      >
                        {estimatingRoute
                          ? 'Calculating...'
                          : 'Estimate'}
                      </button>

                    </div>

                  </div>

                  {/* DELIVERY MODE */}

                  <div>

                    <label
                      className="block text-sm font-medium mb-2"
                      style={{
                        color:
                          'var(--text-secondary)'
                      }}
                    >
                      Delivery Mode
                    </label>

                    <select
                      value={deliveryMode}
                      onChange={(e) => {
                        setDeliveryMode(
                          e.target.value
                        );
                        setRouteEstimate(null);
                      }}
                      className="input-field"
                    >

                      <option value="TRANSPORT_PARTNER">
                        External Transport Partner
                      </option>

                      <option value="FARMER_DELIVERY">
                        Farmer Arranged Delivery
                      </option>

                      <option value="BUYER_PICKUP">
                        Self Pickup (Free)
                      </option>

                    </select>

                  </div>

                  {/* ROUTE RESULT */}

                  {routeEstimate ? (

                    <div
                      className="rounded-lg p-4 space-y-3"
                      style={{
                        background:
                          'rgba(59,130,246,0.10)',
                        border:
                          '1px solid rgba(59,130,246,0.15)'
                      }}
                    >

                      <div className="flex items-center justify-between">

                        <h4
                          className="font-bold text-xs"
                          style={{
                            color:
                              'var(--info)'
                          }}
                        >
                          Route Estimate
                        </h4>

                        {routeEstimate.isFallback && (
                          <span
                            className="text-[9px] font-semibold px-2 py-1 rounded"
                            style={{
                              background:
                                'rgba(245,158,11,0.10)',
                              color:
                                'var(--warning)'
                            }}
                          >
                            Location fallback
                          </span>
                        )}

                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs">

                        <div>
                          <p
                            style={{
                              color:
                                'var(--text-muted)'
                            }}
                          >
                            Distance
                          </p>

                          <strong>
                            {routeEstimate.distanceKm}{' '}
                            km
                          </strong>
                        </div>

                        <div>
                          <p
                            style={{
                              color:
                                'var(--text-muted)'
                            }}
                          >
                            Time
                          </p>

                          <strong>
                            {routeEstimate.estimatedTime}
                          </strong>
                        </div>

                        <div>
                          <p
                            style={{
                              color:
                                'var(--text-muted)'
                            }}
                          >
                            Transport
                          </p>

                          <strong
                            style={{
                              color:
                                'var(--accent)'
                            }}
                          >
                            ₹
                            {Number(
                              routeEstimate.estimatedCost ||
                                0
                            ).toLocaleString('en-IN')}
                          </strong>
                        </div>

                      </div>

                      <div
                        className="space-y-1.5 text-xs pt-2 border-t"
                        style={{
                          borderColor:
                            'rgba(59,130,246,0.12)'
                        }}
                      >

                        <div className="flex justify-between">

                          <span>
                            Produce Value
                          </span>

                          <strong className="font-numeric">
                            {formatCurrency(
                              parseFloat(
                                orderQuantity
                              ) *
                                parseFloat(
                                  orderingListing.asking_price
                                )
                            )}
                          </strong>

                        </div>

                        <div className="flex justify-between">

                          <span>
                            Transport
                          </span>

                          <strong className="font-numeric">
                            {formatCurrency(
                              routeEstimate.estimatedCost
                            )}
                          </strong>

                        </div>

                        <div
                          className="flex justify-between border-t pt-2 text-sm"
                          style={{
                            borderColor:
                              'rgba(59,130,246,0.12)',
                            color:
                              'var(--text-primary)'
                          }}
                        >

                          <span className="font-bold">
                            Total
                          </span>

                          <strong className="font-numeric">

                            {formatCurrency(
                              parseFloat(
                                orderQuantity
                              ) *
                                parseFloat(
                                  orderingListing.asking_price
                                ) +
                                parseFloat(
                                  routeEstimate.estimatedCost ||
                                    0
                                )
                            )}

                          </strong>

                        </div>

                      </div>

                    </div>

                  ) : deliveryMode ===
                      'BUYER_PICKUP' &&
                    orderQuantity &&
                    !isNaN(
                      parseFloat(orderQuantity)
                    ) ? (

                    <div
                      className="rounded-lg p-4 space-y-2"
                      style={{
                        background:
                          'rgba(34,197,94,0.10)',
                        border:
                          '1px solid rgba(34,197,94,0.15)'
                      }}
                    >

                      <div className="flex justify-between text-sm">

                        <span>
                          Produce Cost
                        </span>

                        <strong className="font-numeric">
                          {formatCurrency(
                            parseFloat(
                              orderQuantity
                            ) *
                              parseFloat(
                                orderingListing.asking_price
                              )
                          )}
                        </strong>

                      </div>

                      <div className="flex justify-between text-sm">

                        <span>
                          Transport
                        </span>

                        <strong>
                          ₹0
                        </strong>

                      </div>

                      <div
                        className="flex justify-between border-t pt-2 font-bold"
                        style={{
                          borderColor:
                            'rgba(34,197,94,0.15)'
                        }}
                      >

                        <span>
                          Total
                        </span>

                        <strong className="font-numeric">

                          {formatCurrency(
                            parseFloat(
                              orderQuantity
                            ) *
                              parseFloat(
                                orderingListing.asking_price
                              )
                          )}

                        </strong>

                      </div>

                    </div>

                  ) : orderQuantity &&
                    !isNaN(
                      parseFloat(orderQuantity)
                    ) ? (

                    <div
                      className="rounded-lg p-4"
                      style={{
                        background:
                          'var(--bg-elevated)'
                      }}
                    >

                      <div className="flex justify-between">

                        <span>
                          Produce Cost
                        </span>

                        <strong className="font-numeric">
                          {formatCurrency(
                            parseFloat(
                              orderQuantity
                            ) *
                              parseFloat(
                                orderingListing.asking_price
                              )
                          )}
                        </strong>

                      </div>

                      <p
                        className="text-xs mt-2"
                        style={{
                          color:
                            'var(--text-muted)'
                        }}
                      >
                        Estimate the route to
                        calculate transport cost.
                      </p>

                    </div>

                  ) : null}

                  {/* ACTIONS */}

                  <div className="flex gap-2 pt-2">

                    <button
                      type="submit"
                      disabled={
                        ordering ||
                        (
                          !routeEstimate &&
                          deliveryMode !==
                            'BUYER_PICKUP'
                        )
                      }
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{
                        background:
                          'var(--accent)',
                        color:
                          'var(--text-inverse)'
                      }}
                    >

                      {ordering && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}

                      {ordering
                        ? 'Placing Order...'
                        : 'Confirm Order'}

                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setOrderingListing(null);
                        setOrderSuccess(false);
                      }}
                      className="btn-secondary px-4"
                    >
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