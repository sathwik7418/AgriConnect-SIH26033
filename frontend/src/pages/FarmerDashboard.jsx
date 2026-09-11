import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { listingAPI, dashboardAPI, marketAPI } from '../services/api';
import {
  Plus,
  Package,
  TrendingUp,
  Eye,
  Info,
  CheckCircle,
  AlertTriangle,
  Loader2,
  X,
  ArrowUpRight,
  Sprout,
  IndianRupee,
  BarChart3,
  ShoppingBasket,
  MapPin,
  Clock,
  ChevronRight,
  Activity,
  BadgeIndianRupee
} from 'lucide-react';

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

  return `₹${number.toLocaleString('en-IN')}`;
}

function getListingStatusClass(status) {
  if (status === 'ACTIVE') return 'badge-success';
  if (status === 'SOLD') return 'badge-neutral';
  return 'badge-danger';
}

function getRelativeDate(dateValue) {
  if (!dateValue) return 'Recently';

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return 'Recently';

  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short'
  });
}

export default function FarmerDashboard() {
  const { profile } = useAuth();

  const [stats, setStats] = useState({});
  const [listings, setListings] = useState([]);

  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  const [marketSnapshot, setMarketSnapshot] = useState([]);
  const [marketLoading, setMarketLoading] = useState(false);

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

  const [guidancePrice, setGuidancePrice] = useState(null);
  const [guidanceLoading, setGuidanceLoading] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (profile) {
      setForm(prev => ({
        ...prev,
        location: profile.location || '',
        state: profile.state || '',
        district: profile.district || ''
      }));
    }
  }, [profile?.location, profile?.state, profile?.district]);

  const load = useCallback(async () => {
    if (!profile?.id || !mountedRef.current) return;

    try {
      const [s, l] = await Promise.all([
        dashboardAPI.getStats(),
        listingAPI.getByFarmer(profile.id)
      ]);

      if (mountedRef.current) {
        setStats(s?.data || {});
        setListings(l?.data || []);
      }
    } catch (err) {
      console.error('Failed to load farmer dashboard stats:', err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * Load a small market snapshot for the dashboard.
   * This uses the existing market API and does not require a new endpoint.
   */
  const loadMarketSnapshot = useCallback(async () => {
    setMarketLoading(true);

    try {
      const crops = ['TOMATO', 'ONION', 'POTATO', 'RICE'];

      const responses = await Promise.all(
        crops.map(async crop => {
          try {
            const res = await marketAPI.getPrices({
              commodity: crop
            });

            const records = res?.data || [];

            if (!records.length) {
              return null;
            }

            let match = records.find(
              p =>
                p.state?.toLowerCase() ===
                profile?.state?.toLowerCase()
            );

            if (!match) {
              match = records[0];
            }

            const isQuintal =
              match.source === 'mandi_api' ||
              match.source === 'historical_dataset' ||
              match.source === 'agmarknet_historical';

            const rawPrice = parseFloat(match.modal_price);

            if (Number.isNaN(rawPrice)) {
              return null;
            }

            const pricePerKg = isQuintal
              ? rawPrice / 100
              : rawPrice;

            return {
              commodity: crop,
              label: cropLabels[crop] || crop,
              price: pricePerKg,
              originalPrice: rawPrice,
              unit: isQuintal ? 'quintal' : 'kg',
              market: match.market,
              state: match.state,
              source: match.source,
              freshness: match.data_freshness || 'fresh'
            };
          } catch (err) {
            console.error(
              `Failed to load market price for ${crop}:`,
              err
            );

            return null;
          }
        })
      );

      if (mountedRef.current) {
        setMarketSnapshot(responses.filter(Boolean));
      }
    } catch (err) {
      console.error('Failed to load market snapshot:', err);
    } finally {
      if (mountedRef.current) {
        setMarketLoading(false);
      }
    }
  }, [profile?.state]);

  useEffect(() => {
    if (profile?.state) {
      loadMarketSnapshot();
    }
  }, [profile?.state, loadMarketSnapshot]);

  useEffect(() => {
    if (showAdd && form.commodity) {
      fetchPriceGuidance(form.commodity);
    }
  }, [form.commodity, showAdd]);

  const fetchPriceGuidance = async crop => {
    setGuidanceLoading(true);
    setGuidancePrice(null);

    try {
      const res = await marketAPI.getPrices({
        commodity: crop
      });

      if (res.data && res.data.length > 0) {
        let match = res.data.find(
          p =>
            p.state?.toLowerCase() ===
            profile?.state?.toLowerCase()
        );

        if (!match) {
          match = res.data[0];
        }

        const isQuintal =
          match.source === 'mandi_api' ||
          match.source === 'historical_dataset' ||
          match.source === 'agmarknet_historical';

        const typicalKg = isQuintal
          ? parseFloat(match.modal_price) / 100
          : parseFloat(match.modal_price);

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
      console.error(
        'Failed to load market guidance price:',
        err
      );
    } finally {
      setGuidanceLoading(false);
    }
  };

  const handleCreate = async e => {
    e.preventDefault();

    if (
      !profile?.location ||
      !profile?.state ||
      !profile?.district
    ) {
      alert(
        'Your profile location details are incomplete. Please complete your profile onboarding first.'
      );

      return;
    }

    try {
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

      setGuidancePrice(null);

      await load();
      await loadMarketSnapshot();
    } catch (err) {
      console.error('Failed to create listing:', err);

      alert(
        err?.response?.data?.message ||
          'Failed to create listing. Please try again.'
      );
    }
  };

  const activeListings = listings.filter(
    l => l.listing_status === 'ACTIVE'
  );

  const soldListings = listings.filter(
    l => l.listing_status === 'SOLD'
  );

  const totalQuantity = listings.reduce(
    (total, listing) =>
      total + (Number(listing.quantity) || 0),
    0
  );

  const activeQuantity = activeListings.reduce(
    (total, listing) =>
      total + (Number(listing.quantity) || 0),
    0
  );

  const averageAskingPrice =
    activeListings.length > 0
      ? activeListings.reduce(
          (total, listing) =>
            total + (Number(listing.asking_price) || 0),
          0
        ) / activeListings.length
      : 0;

  const profileLocationComplete =
    profile?.location &&
    profile?.state &&
    profile?.district;

  const recentListings = [...listings]
    .sort((a, b) => {
      const dateA = new Date(
        a.created_at || a.createdAt || 0
      ).getTime();

      const dateB = new Date(
        b.created_at || b.createdAt || 0
      ).getTime();

      return dateB - dateA;
    })
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{
            borderColor: 'var(--bg-overlay)',
            borderTopColor: 'var(--accent)'
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* =========================================================
          HEADER
      ========================================================= */}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sprout
              className="h-5 w-5"
              style={{ color: 'var(--accent)' }}
            />

            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--accent)' }}
            >
              Farmer Dashboard
            </span>
          </div>

          <h1
            className="text-2xl font-bold gradient-text"
          >
            {getGreeting()}, {profile?.name || 'Farmer'}
          </h1>

          <p
            className="text-sm mt-1"
            style={{ color: 'var(--text-muted)' }}
          >
            Manage your produce, monitor your market position,
            and connect with buyers.
          </p>
        </div>

        <button
          onClick={() => setShowAdd(!showAdd)}
          className="btn-primary flex items-center justify-center gap-2"
        >
          {showAdd ? (
            <X className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}

          {showAdd ? 'Cancel' : 'List Produce'}
        </button>
      </div>

      {/* =========================================================
          QUICK ACTIONS
      ========================================================= */}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        <button
          onClick={() => setShowAdd(true)}
          className="card-surface p-4 text-left hover-premium transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">

              <div
                className="p-2.5 rounded-xl"
                style={{
                  background: 'rgba(34,197,94,0.10)'
                }}
              >
                <Plus
                  className="h-5 w-5"
                  style={{ color: 'var(--accent)' }}
                />
              </div>

              <div>
                <p
                  className="text-sm font-bold"
                  style={{
                    color: 'var(--text-primary)'
                  }}
                >
                  List Produce
                </p>

                <p
                  className="text-xs mt-0.5"
                  style={{
                    color: 'var(--text-muted)'
                  }}
                >
                  Add new crop
                </p>
              </div>
            </div>

            <ArrowUpRight
              className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--accent)' }}
            />
          </div>
        </button>

        <button
          onClick={() =>
            document
              .getElementById('active-produce')
              ?.scrollIntoView({
                behavior: 'smooth'
              })
          }
          className="card-surface p-4 text-left hover-premium transition-all group"
        >
          <div className="flex items-center justify-between">

            <div className="flex items-center gap-3">

              <div
                className="p-2.5 rounded-xl"
                style={{
                  background: 'rgba(59,130,246,0.10)'
                }}
              >
                <Package
                  className="h-5 w-5"
                  style={{ color: 'var(--info)' }}
                />
              </div>

              <div>
                <p
                  className="text-sm font-bold"
                  style={{
                    color: 'var(--text-primary)'
                  }}
                >
                  Active Produce
                </p>

                <p
                  className="text-xs mt-0.5"
                  style={{
                    color: 'var(--text-muted)'
                  }}
                >
                  {activeListings.length} active listings
                </p>
              </div>
            </div>

            <ChevronRight
              className="h-4 w-4 opacity-50 group-hover:opacity-100"
              style={{ color: 'var(--info)' }}
            />
          </div>
        </button>

        <button
          onClick={() =>
            document
              .getElementById('market-snapshot')
              ?.scrollIntoView({
                behavior: 'smooth'
              })
          }
          className="card-surface p-4 text-left hover-premium transition-all group"
        >
          <div className="flex items-center justify-between">

            <div className="flex items-center gap-3">

              <div
                className="p-2.5 rounded-xl"
                style={{
                  background: 'rgba(245,158,11,0.10)'
                }}
              >
                <BarChart3
                  className="h-5 w-5"
                  style={{ color: 'var(--warning)' }}
                />
              </div>

              <div>
                <p
                  className="text-sm font-bold"
                  style={{
                    color: 'var(--text-primary)'
                  }}
                >
                  Market Prices
                </p>

                <p
                  className="text-xs mt-0.5"
                  style={{
                    color: 'var(--text-muted)'
                  }}
                >
                  Check crop prices
                </p>
              </div>
            </div>

            <ChevronRight
              className="h-4 w-4 opacity-50 group-hover:opacity-100"
              style={{ color: 'var(--warning)' }}
            />
          </div>
        </button>
      </div>

      {/* =========================================================
          WELCOME EMPTY STATE
      ========================================================= */}

      {listings.length === 0 && (
        <div
          className="card-atmospheric p-8 text-center space-y-3 animate-fade-in-up"
        >
          <div
            className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
            style={{
              background: 'rgba(34,197,94,0.12)'
            }}
          >
            <Package
              className="h-8 w-8"
              style={{ color: 'var(--accent)' }}
            />
          </div>

          <h2
            className="text-lg font-bold"
            style={{ color: 'var(--accent)' }}
          >
            Welcome to AgriConnect!
          </h2>

          <p
            className="text-sm max-w-md mx-auto"
            style={{ color: 'var(--text-muted)' }}
          >
            You haven't listed any produce yet. List your
            crops today to connect directly with bulk buyers
            and increase your earnings.
          </p>

          <button
            onClick={() => setShowAdd(true)}
            className="btn-primary text-sm"
          >
            Create Your First Listing
          </button>
        </div>
      )}

      {/* =========================================================
          FARM OVERVIEW
      ========================================================= */}

      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2
              className="font-bold text-base"
              style={{ color: 'var(--text-primary)' }}
            >
              Farm Overview
            </h2>

            <p
              className="text-xs mt-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              Your current activity on AgriConnect
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Total Listings */}
          <div className="card-surface p-5 hover-premium">
            <div className="flex items-center justify-between mb-4">

              <div
                className="p-3 rounded-xl"
                style={{
                  background: 'rgba(34,197,94,0.10)'
                }}
              >
                <Package
                  className="h-5 w-5"
                  style={{ color: 'var(--accent)' }}
                />
              </div>

              <span
                className="text-[10px] font-semibold"
                style={{
                  color: 'var(--text-muted)'
                }}
              >
                ALL TIME
              </span>
            </div>

            <p
              className="text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              Total Listings
            </p>

            <p
              className="text-2xl font-bold font-numeric mt-1"
              style={{
                color: 'var(--text-primary)'
              }}
            >
              {stats.totalListings || listings.length || 0}
            </p>
          </div>

          {/* Active Listings */}
          <div className="card-surface p-5 hover-premium">
            <div className="flex items-center justify-between mb-4">

              <div
                className="p-3 rounded-xl"
                style={{
                  background: 'rgba(59,130,246,0.10)'
                }}
              >
                <Activity
                  className="h-5 w-5"
                  style={{ color: 'var(--info)' }}
                />
              </div>

              <span
                className="text-[10px] font-semibold"
                style={{
                  color: 'var(--info)'
                }}
              >
                LIVE
              </span>
            </div>

            <p
              className="text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              Active Produce
            </p>

            <p
              className="text-2xl font-bold font-numeric mt-1"
              style={{
                color: 'var(--text-primary)'
              }}
            >
              {stats.activeListings ||
                activeListings.length ||
                0}
            </p>
          </div>

          {/* Total Sales */}
          <div className="card-surface p-5 hover-premium">
            <div className="flex items-center justify-between mb-4">

              <div
                className="p-3 rounded-xl"
                style={{
                  background: 'rgba(245,158,11,0.10)'
                }}
              >
                <IndianRupee
                  className="h-5 w-5"
                  style={{ color: 'var(--warning)' }}
                />
              </div>

              <span
                className="text-[10px] font-semibold"
                style={{
                  color: 'var(--text-muted)'
                }}
              >
                SALES
              </span>
            </div>

            <p
              className="text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              Total Sales
            </p>

            <p
              className="text-2xl font-bold font-numeric mt-1"
              style={{
                color: 'var(--text-primary)'
              }}
            >
              {formatCurrency(stats.totalSales)}
            </p>
          </div>

          {/* Total Quantity */}
          <div className="card-surface p-5 hover-premium">
            <div className="flex items-center justify-between mb-4">

              <div
                className="p-3 rounded-xl"
                style={{
                  background: 'rgba(168,85,247,0.10)'
                }}
              >
                <ShoppingBasket
                  className="h-5 w-5"
                  style={{
                    color: 'var(--accent-secondary, #a855f7)'
                  }}
                />
              </div>

              <span
                className="text-[10px] font-semibold"
                style={{
                  color: 'var(--text-muted)'
                }}
              >
                INVENTORY
              </span>
            </div>

            <p
              className="text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              Listed Quantity
            </p>

            <p
              className="text-2xl font-bold font-numeric mt-1"
              style={{
                color: 'var(--text-primary)'
              }}
            >
              {totalQuantity.toLocaleString('en-IN')} kg
            </p>
          </div>
        </div>
      </div>

      {/* =========================================================
          ADD LISTING FORM
      ========================================================= */}

      {showAdd && (
        <div
          className="card-atmospheric p-6 space-y-4 animate-slide-down"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3
                className="font-bold text-base"
                style={{
                  color: 'var(--text-primary)'
                }}
              >
                Create New Listing
              </h3>

              <p
                className="text-xs mt-1"
                style={{
                  color: 'var(--text-muted)'
                }}
              >
                Tell buyers what produce you currently have
                available.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setGuidancePrice(null);
              }}
              className="p-2 rounded-lg hover:bg-black/5"
            >
              <X
                className="h-4 w-4"
                style={{
                  color: 'var(--text-muted)'
                }}
              />
            </button>
          </div>

          <form
            onSubmit={handleCreate}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {!profileLocationComplete ? (
              <div
                className="col-span-full rounded-lg p-3 text-xs font-medium flex items-center justify-between"
                style={{
                  background:
                    'rgba(245,158,11,0.10)',
                  color: 'var(--warning)',
                  border:
                    '1px solid rgba(245,158,11,0.15)'
                }}
              >
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" />

                  Your profile location details are incomplete.
                  You must fill them out to list crops.
                </span>

                <a
                  href="/onboard"
                  className="font-bold underline"
                  style={{
                    color: 'var(--warning)'
                  }}
                >
                  Complete Profile
                </a>
              </div>
            ) : (
              <div
                className="col-span-full rounded-lg p-3 text-xs flex items-center gap-1.5"
                style={{
                  background:
                    'rgba(34,197,94,0.10)',
                  color: 'var(--accent)',
                  border:
                    '1px solid rgba(34,197,94,0.15)'
                }}
              >
                <CheckCircle className="h-4 w-4 shrink-0" />

                Listing Location:

                <strong>
                  {profile.location}, {profile.district},{' '}
                  {profile.state}
                </strong>

                (from your profile)
              </div>
            )}

            {/* Crop */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{
                  color: 'var(--text-secondary)'
                }}
              >
                Crop
              </label>

              <select
                value={form.commodity}
                onChange={e =>
                  setForm({
                    ...form,
                    commodity: e.target.value
                  })
                }
                className="input-field"
              >
                {Object.entries(cropLabels).map(
                  ([key, value]) => (
                    <option key={key} value={key}>
                      {value}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* Variety */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{
                  color: 'var(--text-secondary)'
                }}
              >
                Variety
              </label>

              <input
                value={form.variety}
                onChange={e =>
                  setForm({
                    ...form,
                    variety: e.target.value
                  })
                }
                className="input-field"
                placeholder="e.g. Roma / Hybrid"
              />
            </div>

            {/* Grade */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{
                  color: 'var(--text-secondary)'
                }}
              >
                Grade
              </label>

              <select
                value={form.grade}
                onChange={e =>
                  setForm({
                    ...form,
                    grade: e.target.value
                  })
                }
                className="input-field"
              >
                {Object.entries(gradeLabels).map(
                  ([key, value]) => (
                    <option key={key} value={key}>
                      {value}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{
                  color: 'var(--text-secondary)'
                }}
              >
                Quantity (kg)
              </label>

              <input
                type="number"
                min="1"
                value={form.quantity}
                onChange={e =>
                  setForm({
                    ...form,
                    quantity: e.target.value
                  })
                }
                className="input-field font-numeric"
                placeholder="e.g. 500"
                required
              />
            </div>

            {/* Market Guidance */}
            <div className="col-span-full">
              {guidanceLoading ? (
                <div
                  className="rounded-lg p-3 text-xs flex items-center gap-2"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-muted)'
                  }}
                >
                  <div
                    className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
                    style={{
                      borderColor: 'var(--bg-overlay)',
                      borderTopColor: 'var(--accent)'
                    }}
                  />

                  Loading mandi price guidance...
                </div>
              ) : guidancePrice ? (
                <div
                  className="rounded-lg p-3.5 text-xs space-y-1.5"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)'
                  }}
                >
                  <div className="flex justify-between items-center gap-3">
                    <span
                      className="font-semibold"
                      style={{
                        color: 'var(--text-secondary)'
                      }}
                    >
                      Typical Market Price:{' '}
                      <strong
                        style={{
                          color: 'var(--accent)'
                        }}
                      >
                        ₹
                        {guidancePrice.typical.toFixed(
                          1
                        )}
                        /kg
                      </strong>
                    </span>

                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background:
                          'var(--bg-surface)',
                        color:
                          'var(--text-muted)',
                        border:
                          '1px solid var(--border)'
                      }}
                    >
                      Source:{' '}
                      {guidancePrice.source ===
                      'government_api'
                        ? 'Gov Portal'
                        : guidancePrice.source ===
                          'mandi_api'
                        ? 'APMC Mandi'
                        : guidancePrice.source ||
                          'Market'}{' '}
                      ({guidancePrice.freshness})
                    </span>
                  </div>

                  <p
                    className="text-[10px]"
                    style={{
                      color: 'var(--text-muted)'
                    }}
                  >
                    Raw rate: ₹
                    {guidancePrice.originalTypical.toLocaleString(
                      'en-IN'
                    )}{' '}
                    per{' '}
                    {guidancePrice.unit ===
                    '₹/quintal'
                      ? 'quintal (100kg)'
                      : 'kg'}{' '}
                    at {guidancePrice.market},{' '}
                    {guidancePrice.state}
                  </p>

                  {form.askingPrice &&
                    !isNaN(
                      parseFloat(
                        form.askingPrice
                      )
                    ) &&
                    (() => {
                      const asking =
                        parseFloat(
                          form.askingPrice
                        );

                      const diff =
                        asking -
                        guidancePrice.typical;

                      const pct =
                        guidancePrice.typical > 0
                          ? (diff /
                              guidancePrice.typical) *
                            100
                          : 0;

                      if (diff < 0) {
                        return (
                          <p
                            className="font-bold pt-1 text-[11px]"
                            style={{
                              color:
                                'var(--accent)'
                            }}
                          >
                            ✔ ₹
                            {Math.abs(
                              diff
                            ).toFixed(1)}
                            /kg below market (
                            {pct.toFixed(1)}%) —
                            Good value!
                          </p>
                        );
                      }

                      if (diff > 0) {
                        return (
                          <p
                            className="font-bold pt-1 text-[11px]"
                            style={{
                              color:
                                'var(--warning)'
                            }}
                          >
                            ℹ ₹
                            {diff.toFixed(1)}
                            /kg above market (+
                            {pct.toFixed(1)}%)
                          </p>
                        );
                      }

                      return (
                        <p
                          className="font-bold pt-1 text-[11px]"
                          style={{
                            color:
                              'var(--text-muted)'
                          }}
                        >
                          Matches typical market
                          price.
                        </p>
                      );
                    })()}
                </div>
              ) : (
                <div
                  className="rounded-lg p-3 text-xs flex items-center gap-1"
                  style={{
                    background:
                      'var(--bg-elevated)',
                    color:
                      'var(--text-muted)'
                  }}
                >
                  <Info className="h-4 w-4 shrink-0" />

                  No matching market price records
                  found for{' '}
                  {cropLabels[form.commodity] ||
                    form.commodity}
                  . Enter your asking price.
                </div>
              )}
            </div>

            {/* Asking Price */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{
                  color: 'var(--text-secondary)'
                }}
              >
                Asking Price (₹/kg)
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={form.askingPrice}
                onChange={e =>
                  setForm({
                    ...form,
                    askingPrice: e.target.value
                  })
                }
                className="input-field font-numeric"
                placeholder="e.g. 35"
                required
              />
            </div>

            {/* Buttons */}
            <div
              className="col-span-full flex gap-2 pt-2 border-t"
              style={{
                borderColor: 'var(--border)'
              }}
            >
              <button
                type="submit"
                disabled={!profileLocationComplete}
                className="btn-primary disabled:opacity-50"
              >
                Create Listing
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setGuidancePrice(null);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================
          MARKET SNAPSHOT
      ========================================================= */}

      <div id="market-snapshot">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2
              className="font-bold text-base"
              style={{
                color: 'var(--text-primary)'
              }}
            >
              Market Snapshot
            </h2>

            <p
              className="text-xs mt-0.5"
              style={{
                color: 'var(--text-muted)'
              }}
            >
              Current indicative prices for selected crops
            </p>
          </div>

          <div
            className="flex items-center gap-1.5 text-[10px]"
            style={{
              color: 'var(--text-muted)'
            }}
          >
            <Clock className="h-3.5 w-3.5" />

            Live market data
          </div>
        </div>

        {marketLoading ? (
          <div className="card-surface p-6 flex justify-center">
            <Loader2
              className="h-5 w-5 animate-spin"
              style={{
                color: 'var(--accent)'
              }}
            />
          </div>
        ) : marketSnapshot.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {marketSnapshot.map(item => (
              <div
                key={item.commodity}
                className="card-surface p-4 hover-premium"
              >
                <div className="flex items-center justify-between">

                  <div
                    className="p-2.5 rounded-lg"
                    style={{
                      background:
                        'rgba(34,197,94,0.10)'
                    }}
                  >
                    <TrendingUp
                      className="h-4 w-4"
                      style={{
                        color:
                          'var(--accent)'
                      }}
                    />
                  </div>

                  <span
                    className="text-[10px] font-semibold"
                    style={{
                      color:
                        'var(--text-muted)'
                    }}
                  >
                    {item.freshness}
                  </span>
                </div>

                <p
                  className="text-sm font-bold mt-4"
                  style={{
                    color:
                      'var(--text-primary)'
                  }}
                >
                  {item.label}
                </p>

                <p
                  className="text-xl font-bold font-numeric mt-1"
                  style={{
                    color:
                      'var(--accent)'
                  }}
                >
                  ₹{item.price.toFixed(1)}
                  <span
                    className="text-xs font-normal ml-1"
                    style={{
                      color:
                        'var(--text-muted)'
                    }}
                  >
                    /kg
                  </span>
                </p>

                <div
                  className="flex items-center gap-1 mt-2 text-[10px]"
                  style={{
                    color:
                      'var(--text-muted)'
                  }}
                >
                  <MapPin className="h-3 w-3" />

                  {item.market ||
                    item.state ||
                    'Market data'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="card-surface p-6 text-center"
          >
            <BarChart3
              className="h-7 w-7 mx-auto mb-2"
              style={{
                color: 'var(--text-muted)'
              }}
            />

            <p
              className="text-sm font-semibold"
              style={{
                color:
                  'var(--text-primary)'
              }}
            >
              Market data unavailable
            </p>

            <p
              className="text-xs mt-1"
              style={{
                color:
                  'var(--text-muted)'
              }}
            >
              Market prices will appear here when
              available.
            </p>
          </div>
        )}
      </div>

      {/* =========================================================
          MARKET OPPORTUNITY
      ========================================================= */}

      {activeListings.length > 0 && (
        <div className="card-atmospheric p-5">
          <div className="flex items-center gap-3 mb-4">

            <div
              className="p-2.5 rounded-xl"
              style={{
                background:
                  'rgba(34,197,94,0.10)'
              }}
            >
              <BadgeIndianRupee
                className="h-5 w-5"
                style={{
                  color:
                    'var(--accent)'
                }}
              />
            </div>

            <div>
              <h3
                className="font-bold"
                style={{
                  color:
                    'var(--text-primary)'
                }}
              >
                Your Market Position
              </h3>

              <p
                className="text-xs mt-0.5"
                style={{
                  color:
                    'var(--text-muted)'
                }}
              >
                A quick look at your current active produce
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            <div
              className="rounded-xl p-4"
              style={{
                background:
                  'var(--bg-elevated)'
              }}
            >
              <p
                className="text-xs"
                style={{
                  color:
                    'var(--text-muted)'
                }}
              >
                Active Quantity
              </p>

              <p
                className="text-lg font-bold font-numeric mt-1"
                style={{
                  color:
                    'var(--text-primary)'
                }}
              >
                {activeQuantity.toLocaleString(
                  'en-IN'
                )}{' '}
                kg
              </p>
            </div>

            <div
              className="rounded-xl p-4"
              style={{
                background:
                  'var(--bg-elevated)'
              }}
            >
              <p
                className="text-xs"
                style={{
                  color:
                    'var(--text-muted)'
                }}
              >
                Average Asking Price
              </p>

              <p
                className="text-lg font-bold font-numeric mt-1"
                style={{
                  color:
                    'var(--accent)'
                }}
              >
                ₹{averageAskingPrice.toFixed(1)}
                <span
                  className="text-xs font-normal ml-1"
                  style={{
                    color:
                      'var(--text-muted)'
                  }}
                >
                  /kg
                </span>
              </p>
            </div>

            <div
              className="rounded-xl p-4"
              style={{
                background:
                  'var(--bg-elevated)'
              }}
            >
              <p
                className="text-xs"
                style={{
                  color:
                    'var(--text-muted)'
                }}
              >
                Sold Listings
              </p>

              <p
                className="text-lg font-bold font-numeric mt-1"
                style={{
                  color:
                    'var(--text-primary)'
                }}
              >
                {stats.soldListings ||
                  soldListings.length ||
                  0}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          ACTIVE PRODUCE
      ========================================================= */}

      <div
        id="active-produce"
        className="card-surface overflow-hidden"
      >
        <div
          className="px-5 py-4 flex justify-between items-center border-b"
          style={{
            borderColor:
              'var(--border)'
          }}
        >
          <div>
            <h3
              className="font-bold text-base"
              style={{
                color:
                  'var(--text-primary)'
              }}
            >
              Your Active Produce
            </h3>

            <p
              className="text-xs mt-0.5"
              style={{
                color:
                  'var(--text-muted)'
              }}
            >
              Produce currently visible to buyers
            </p>
          </div>

          <span
            className="text-xs font-semibold"
            style={{
              color:
                'var(--text-muted)'
            }}
          >
            {activeListings.length} items
          </span>
        </div>

        {activeListings.length > 0 ? (
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
                    'Crop',
                    'Variety',
                    'Grade',
                    'Quantity',
                    'Rate',
                    'Status',
                    'Location'
                  ].map(header => (
                    <th
                      key={header}
                      className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        color:
                          'var(--text-muted)'
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="text-sm">
                {activeListings.map(listing => (
                  <tr
                    key={listing.id}
                    className="transition-colors"
                    style={{
                      borderBottom:
                        '1px solid var(--border)'
                    }}
                    onMouseEnter={e =>
                      (e.currentTarget.style.background =
                        'var(--bg-hover)')
                    }
                    onMouseLeave={e =>
                      (e.currentTarget.style.background =
                        'transparent')
                    }
                  >
                    <td
                      className="px-5 py-3 font-semibold"
                      style={{
                        color:
                          'var(--text-primary)'
                      }}
                    >
                      {cropLabels[
                        listing.commodity
                      ] ||
                        listing.commodity}
                    </td>

                    <td
                      className="px-5 py-3"
                      style={{
                        color:
                          'var(--text-secondary)'
                      }}
                    >
                      {listing.variety || '-'}
                    </td>

                    <td
                      className="px-5 py-3"
                      style={{
                        color:
                          'var(--text-secondary)'
                      }}
                    >
                      {gradeLabels[
                        listing.grade
                      ] ||
                        listing.grade}
                    </td>

                    <td
                      className="px-5 py-3 font-numeric"
                      style={{
                        color:
                          'var(--text-primary)'
                      }}
                    >
                      {Number(
                        listing.quantity || 0
                      ).toLocaleString(
                        'en-IN'
                      )}{' '}
                      kg
                    </td>

                    <td
                      className="px-5 py-3 font-bold font-numeric"
                      style={{
                        color:
                          'var(--accent)'
                      }}
                    >
                      ₹
                      {Number(
                        listing.asking_price ||
                          0
                      ).toLocaleString(
                        'en-IN'
                      )}
                      /kg
                    </td>

                    <td className="px-5 py-3">
                      <span
                        className={`badge ${getListingStatusClass(
                          listing.listing_status
                        )}`}
                      >
                        {listing.listing_status}
                      </span>
                    </td>

                    <td
                      className="px-5 py-3 text-xs"
                      style={{
                        color:
                          'var(--text-muted)'
                      }}
                    >
                      {listing.location},{' '}
                      {listing.state}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10">
            <Package
              className="h-8 w-8 mx-auto mb-3"
              style={{
                color:
                  'var(--text-muted)'
              }}
            />

            <p
              className="font-semibold"
              style={{
                color:
                  'var(--text-primary)'
              }}
            >
              No active produce
            </p>

            <p
              className="text-sm mt-1 mb-3"
              style={{
                color:
                  'var(--text-muted)'
              }}
            >
              List produce to make it visible to buyers.
            </p>

            <button
              onClick={() =>
                setShowAdd(true)
              }
              className="btn-primary text-sm"
            >
              + List Produce
            </button>
          </div>
        )}
      </div>

      {/* =========================================================
          RECENT PRODUCE
      ========================================================= */}

      {recentListings.length > 0 && (
        <div className="card-surface overflow-hidden">

          <div
            className="px-5 py-4 flex items-center justify-between border-b"
            style={{
              borderColor:
                'var(--border)'
            }}
          >
            <div>
              <h3
                className="font-bold text-base"
                style={{
                  color:
                    'var(--text-primary)'
                }}
              >
                Recent Produce Activity
              </h3>

              <p
                className="text-xs mt-0.5"
                style={{
                  color:
                    'var(--text-muted)'
                }}
              >
                Your latest listings and activity
              </p>
            </div>

            <Eye
              className="h-4 w-4"
              style={{
                color:
                  'var(--text-muted)'
              }}
            />
          </div>

          <div className="divide-y">
            {recentListings.map(listing => (
              <div
                key={listing.id}
                className="px-5 py-4 flex items-center justify-between gap-4 transition-colors"
                onMouseEnter={e =>
                  (e.currentTarget.style.background =
                    'var(--bg-hover)')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background =
                    'transparent')
                }
              >
                <div className="flex items-center gap-3 min-w-0">

                  <div
                    className="p-2.5 rounded-xl shrink-0"
                    style={{
                      background:
                        'rgba(34,197,94,0.10)'
                    }}
                  >
                    <Sprout
                      className="h-4 w-4"
                      style={{
                        color:
                          'var(--accent)'
                      }}
                    />
                  </div>

                  <div className="min-w-0">

                    <div className="flex items-center gap-2">

                      <p
                        className="font-semibold text-sm truncate"
                        style={{
                          color:
                            'var(--text-primary)'
                        }}
                      >
                        {cropLabels[
                          listing.commodity
                        ] ||
                          listing.commodity}
                      </p>

                      <span
                        className={`badge ${getListingStatusClass(
                          listing.listing_status
                        )}`}
                      >
                        {listing.listing_status}
                      </span>
                    </div>

                    <p
                      className="text-xs mt-1"
                      style={{
                        color:
                          'var(--text-muted)'
                      }}
                    >
                      {listing.quantity} kg ·{' '}
                      ₹
                      {Number(
                        listing.asking_price ||
                          0
                      ).toLocaleString(
                        'en-IN'
                      )}
                      /kg
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p
                    className="text-[10px]"
                    style={{
                      color:
                        'var(--text-muted)'
                    }}
                  >
                    {getRelativeDate(
                      listing.created_at ||
                        listing.createdAt
                    )}
                  </p>

                  <p
                    className="text-[10px] mt-1"
                    style={{
                      color:
                        'var(--text-muted)'
                    }}
                  >
                    {listing.location ||
                      profile?.location ||
                      '-'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================
          FARMER LOCATION / PROFILE STATUS
      ========================================================= */}

      <div
        className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        style={{
          background: profileLocationComplete
            ? 'rgba(34,197,94,0.06)'
            : 'rgba(245,158,11,0.08)',
          border: profileLocationComplete
            ? '1px solid rgba(34,197,94,0.12)'
            : '1px solid rgba(245,158,11,0.15)'
        }}
      >
        <div className="flex items-center gap-3">

          <div
            className="p-2 rounded-lg"
            style={{
              background:
                profileLocationComplete
                  ? 'rgba(34,197,94,0.10)'
                  : 'rgba(245,158,11,0.10)'
            }}
          >
            {profileLocationComplete ? (
              <CheckCircle
                className="h-4 w-4"
                style={{
                  color:
                    'var(--accent)'
                }}
              />
            ) : (
              <AlertTriangle
                className="h-4 w-4"
                style={{
                  color:
                    'var(--warning)'
                }}
              />
            )}
          </div>

          <div>
            <p
              className="text-xs font-bold"
              style={{
                color:
                  'var(--text-primary)'
              }}
            >
              {profileLocationComplete
                ? 'Farm location is complete'
                : 'Complete your farm location'}
            </p>

            <p
              className="text-[11px] mt-0.5"
              style={{
                color:
                  'var(--text-muted)'
              }}
            >
              {profileLocationComplete
                ? `${profile.location}, ${profile.district}, ${profile.state}`
                : 'Your location is required before you can list produce.'}
            </p>
          </div>
        </div>

        {!profileLocationComplete && (
          <a
            href="/onboard"
            className="text-xs font-bold underline"
            style={{
              color:
                'var(--warning)'
            }}
          >
            Complete Profile
          </a>
        )}
      </div>

    </div>
  );
}