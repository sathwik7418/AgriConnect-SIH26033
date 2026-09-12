import tomatoImage from '../assets/crops/tomato.jpg';
import onionImage from '../assets/crops/onion.jpg';
import potatoImage from '../assets/crops/potato.jpg';
import cornImage from '../assets/crops/corn.jpg';
import brinjalImage from '../assets/crops/brinjal.jpg';
import appleImage from '../assets/crops/apple.jpg';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listingAPI,
  demandAPI,
  orderAPI,
  routeAPI,
  vehicleAPI,
  marketAPI,
} from '../services/api';

import {
  Search,
  ShoppingCart,
  X,
  Loader2,
  CheckCircle,
  TrendingUp,
  Store,
  MapPin,
  UserRound,
  CalendarDays,
  Package,
  BadgeCheck,
} from 'lucide-react';

// =====================================================
// CROP IMAGES
// =====================================================

// Only import images that actually exist.
// Other images are referenced as paths so missing files
// do NOT break the Vite build.


const cropImages = {
  TOMATO: tomatoImage,
  ONION: onionImage,
  POTATO: potatoImage,
  CORN: cornImage,
  BRINJAL: brinjalImage,
  APPLE: appleImage,
  WHEAT: tomatoImage,
  RICE: tomatoImage,
  LETTUCE: tomatoImage,
  MANGO: tomatoImage,
  BANANA: tomatoImage,

  OTHER: tomatoImage,
};

// =====================================================
// COMMODITIES
// =====================================================

const commodities = [
  'ALL',
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
  'BANANA',
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
  BANANA: 'Banana',
  PIGEON_PEA: 'Pigeon Pea',
  CHICKPEA: 'Chickpea',
  LENTIL: 'Lentil',
};

const marketCategories = {
  VEGETABLES: [
    'TOMATO',
    'ONION',
    'POTATO',
    'BRINJAL',
    'LETTUCE',
  ],
  FRUITS: ['MANGO', 'APPLE', 'BANANA'],
  GRAINS: ['WHEAT', 'RICE', 'CORN'],
  PULSES: [
    'PIGEON_PEA',
    'CHICKPEA',
    'LENTIL',
  ],
};

const gradeLabels = {
  GRADE_A: 'Grade A',
  GRADE_B: 'Grade B',
  GRADE_C: 'Grade C',
  PREMIUM: 'Premium',
};

const categoryInfo = [
  {
    key: 'ALL',
    label: 'All Produce',
    icon: '🛒',
    description: 'Browse everything',
  },
  {
    key: 'VEGETABLES',
    label: 'Vegetables',
    icon: '🥬',
    description: 'Fresh vegetables',
  },
  {
    key: 'FRUITS',
    label: 'Fruits',
    icon: '🍎',
    description: 'Fresh fruits',
  },
  {
    key: 'GRAINS',
    label: 'Grains',
    icon: '🌾',
    description: 'Cereals and grains',
  },
  {
    key: 'PULSES',
    label: 'Pulses',
    icon: '🫘',
    description: 'Pulses and legumes',
  },
];

export default function Marketplace() {
  const { profile, user } = useAuth();
  console.log('MARKETPLACE PROFILE:', profile);
console.log('MARKETPLACE ROLE:', profile?.role);

  const [tab, setTab] = useState('listings');
  const [listings, setListings] = useState([]);
  const [demands, setDemands] = useState([]);

  const [filter, setFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] =
    useState('ALL');

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [latestPrices, setLatestPrices] = useState([]);
  const [marketPrices, setMarketPrices] = useState([]);
  const [visibleMarketPrices, setVisibleMarketPrices] =
    useState(8);

  const [orderingListing, setOrderingListing] =
    useState(null);

  const [orderQuantity, setOrderQuantity] =
    useState('');

  const [orderLocation, setOrderLocation] =
    useState('');

  const [orderError, setOrderError] = useState('');
  const [ordering, setOrdering] = useState(false);

  const [routeEstimate, setRouteEstimate] =
    useState(null);

  const [estimatingRoute, setEstimatingRoute] =
    useState(false);

  const [deliveryMode, setDeliveryMode] = useState(
    'TRANSPORT_PARTNER'
  );

  const [orderSuccess, setOrderSuccess] =
    useState(false);

  const [vehicles, setVehicles] = useState([]);

  const [selectedVehicle, setSelectedVehicle] =
    useState('PICKUP_LCV');

  // =====================================================
  // INITIAL LOAD
  // =====================================================

  useEffect(() => {
    loadData();

    vehicleAPI
      .getAll()
      .then((r) => setVehicles(r?.data || []))
      .catch(() => {});
  }, []);

  // =====================================================
  // ROUTE RECALCULATION
  // =====================================================

  useEffect(() => {
    if (
      routeEstimate &&
      deliveryMode !== 'BUYER_PICKUP' &&
      orderLocation &&
      orderingListing
    ) {
      handleCalculateEstimate();
    }
  }, [selectedVehicle]);

  // =====================================================
  // RESET MARKET PRICE PAGINATION
  // =====================================================

  useEffect(() => {
    setVisibleMarketPrices(8);
  }, [marketPrices]);

  // =====================================================
  // LOAD MARKETPLACE DATA
  // =====================================================

  const loadData = () => {
    setLoading(true);

    Promise.all([
      listingAPI.getAll(),
      demandAPI.getAll(),
      marketAPI.getLatest(),
      marketAPI.getPrices(),
    ])
      .then(([l, d, latest, prices]) => {
        setListings(l?.data || []);
        setDemands(d?.data || []);
        setLatestPrices(latest?.data || []);
        setMarketPrices(prices?.data || []);
      })
      .catch((err) =>
        console.error(
          'Failed to load marketplace:',
          err
        )
      )
      .finally(() => setLoading(false));
  };

  // =====================================================
  // OPEN ORDER
  // =====================================================

  const handleOpenOrder = (listing) => {
    setOrderingListing(listing);
    setOrderQuantity('');
    setOrderLocation(profile?.location || '');
    setOrderError('');
    setRouteEstimate(null);
    setDeliveryMode('TRANSPORT_PARTNER');
    setOrderSuccess(false);
    setSelectedVehicle('PICKUP_LCV');
  };

  // =====================================================
  // CATEGORY
  // =====================================================

  const getCategoryForCommodity = (commodity) => {
    const value = commodity?.toUpperCase();

    for (const [
      category,
      categoryCommodities,
    ] of Object.entries(marketCategories)) {
      if (categoryCommodities.includes(value)) {
        return category;
      }
    }

    return 'OTHER';
  };

  const handleCategoryClick = (category) => {
    setCategoryFilter(category);
    setFilter('ALL');

    const section = document.getElementById(
      'farmer-produce-section'
    );

    if (section) {
      section.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  };

  // =====================================================
  // ROUTE ESTIMATE
  // =====================================================

  const handleCalculateEstimate = async () => {
    if (!orderLocation) {
      setOrderError(
        'Enter a delivery destination.'
      );
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
        orderLocation,
        selectedVehicle
      );

      setRouteEstimate(res.data);
    } catch (err) {
      setOrderError(
        err.response?.data?.error ||
          'Failed to estimate route.'
      );
    } finally {
      setEstimatingRoute(false);
    }
  };

  // =====================================================
  // PLACE ORDER
  // =====================================================

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setOrderError('');

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
      const qty = parseFloat(orderQuantity);

      if (isNaN(qty) || qty <= 0) {
        setOrderError('Enter a valid quantity.');
        setOrdering(false);
        return;
      }

      if (
        qty >
        parseFloat(orderingListing.quantity)
      ) {
        setOrderError(
          `Only ${orderingListing.quantity} kg available`
        );
        setOrdering(false);
        return;
      }

      await orderAPI.create({
        listingId: orderingListing.id,
        quantity: qty,
        deliveryLocation:
          orderLocation ||
          orderingListing.location,
        deliveryMode,
        vehicleType: selectedVehicle,
      });

      setOrderSuccess(true);

      setTimeout(() => {
        setOrderSuccess(false);
        setOrderingListing(null);
        setRouteEstimate(null);
        loadData();
      }, 1500);
    } catch (err) {
      setOrderError(
        err.response?.data?.error ||
          'Failed to place order.'
      );
    } finally {
      setOrdering(false);
    }
  };

  // =====================================================
  // MANDI REFERENCE
  // =====================================================

  const getMandiReference = (listing) => {
    if (
      !latestPrices ||
      latestPrices.length === 0
    ) {
      return null;
    }

    let match = latestPrices.find(
      (p) =>
        p.commodity?.toUpperCase() ===
          listing.commodity?.toUpperCase() &&
        p.state?.toUpperCase() ===
          listing.state?.toUpperCase() &&
        p.district?.toUpperCase() ===
          listing.district?.toUpperCase()
    );

    let isDistrictMatch = true;

    if (!match) {
      isDistrictMatch = false;

      match = latestPrices.find(
        (p) =>
          p.commodity?.toUpperCase() ===
            listing.commodity?.toUpperCase() &&
          p.state?.toUpperCase() ===
            listing.state?.toUpperCase()
      );
    }

    if (match) {
      const isQuintal =
        match.source === 'mandi_api' ||
        match.source ===
          'historical_dataset' ||
        match.source ===
          'agmarknet_historical';

      const modalPrice = parseFloat(
        match.modal_price || 0
      );

      return {
        price: isQuintal
          ? (modalPrice / 100).toFixed(1)
          : modalPrice.toFixed(1),
        scope: isDistrictMatch
          ? 'district'
          : 'state',
      };
    }

    return null;
  };

  // =====================================================
  // FILTERED LISTINGS
  // =====================================================

  const filteredListings = listings.filter(
    (l) => {
      const matchesCategory =
        categoryFilter === 'ALL' ||
        marketCategories[
          categoryFilter
        ]?.includes(l.commodity);

      const matchesCommodity =
        filter === 'ALL' ||
        l.commodity === filter;

      const matchesSearch =
        search === '' ||
        l.commodity
          ?.toLowerCase()
          .includes(search.toLowerCase()) ||
        l.farmer_name
          ?.toLowerCase()
          .includes(search.toLowerCase());

      return (
        matchesCategory &&
        matchesCommodity &&
        matchesSearch
      );
    }
  );

  // =====================================================
  // FILTERED DEMANDS
  // =====================================================

  const filteredDemands = demands.filter(
    (d) => {
      const matchesCategory =
        categoryFilter === 'ALL' ||
        marketCategories[
          categoryFilter
        ]?.includes(d.commodity);

      const matchesCommodity =
        filter === 'ALL' ||
        d.commodity === filter;

      return (
        matchesCategory &&
        matchesCommodity
      );
    }
  );

  // =====================================================
  // UNIQUE MARKET PRICES
  // =====================================================

  const uniqueMarketPrices =
    marketPrices.filter(
      (price, index, arr) =>
        arr.findIndex(
          (p) =>
            p.commodity ===
              price.commodity &&
            p.state === price.state &&
            p.district ===
              price.district
        ) === index
    );

  const displayedMarketPrices =
    uniqueMarketPrices.slice(
      0,
      visibleMarketPrices
    );

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{
            borderColor:
              'var(--bg-overlay)',
            borderTopColor:
              'var(--accent)',
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* =====================================================
          MARKETPLACE HEADER
      ====================================================== */}

      <div>
        <h1 className="text-2xl font-bold gradient-text">
          Marketplace
        </h1>

        <p
          className="text-sm mt-1"
          style={{
            color:
              'var(--text-muted)',
          }}
        >
          Discover market prices, fresh farmer
          produce, and buyer opportunities
        </p>
      </div>

      {/* =====================================================
          CATEGORY CARDS
      ====================================================== */}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {categoryInfo.map((category) => (
          <button
            key={category.key}
            onClick={() =>
              handleCategoryClick(
                category.key
              )
            }
            className="p-4 rounded-xl text-left transition-all hover:-translate-y-0.5"
            style={{
              background:
                'var(--bg-elevated)',
              border:
                '1px solid var(--border)',
            }}
          >
            <div className="text-2xl mb-2">
              {category.icon}
            </div>

            <div
              className="font-semibold text-sm"
              style={{
                color:
                  'var(--text-primary)',
              }}
            >
              {category.label}
            </div>

            <div
              className="text-xs mt-1"
              style={{
                color:
                  'var(--text-muted)',
              }}
            >
              {category.description}
            </div>
          </button>
        ))}
      </div>

      {/* =====================================================
          MARKET PRICE OVERVIEW
      ====================================================== */}

      <div
        className="rounded-2xl p-5"
        style={{
          background:
            'var(--bg-elevated)',
          border:
            '1px solid var(--border)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background:
                  'rgba(34,197,94,0.10)',
              }}
            >
              <TrendingUp
                className="h-5 w-5"
                style={{
                  color:
                    'var(--accent)',
                }}
              />
            </div>

            <div>
              <h2
                className="text-lg font-semibold"
                style={{
                  color:
                    'var(--text-primary)',
                }}
              >
                Today's Market Prices
              </h2>

              <p
                className="text-xs mt-1"
                style={{
                  color:
                    'var(--text-muted)',
                }}
              >
                Latest available mandi market
                data
              </p>
            </div>
          </div>

          <span
            className="text-xs px-3 py-1 rounded-full"
            style={{
              background:
                'var(--bg-overlay)',
              color:
                'var(--text-muted)',
            }}
          >
            {marketPrices.length} records
          </span>
        </div>

        {displayedMarketPrices.length ===
        0 ? (
          <div
            className="py-8 text-center"
            style={{
              color:
                'var(--text-muted)',
            }}
          >
            <Store className="h-8 w-8 mx-auto mb-2 opacity-50" />

            <p className="text-sm">
              Market price data is currently
              unavailable.
            </p>

            <p className="text-xs mt-1">
              Market data will appear here when
              the mandi data source is available.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {displayedMarketPrices.map(
                (price, index) => {
                  const isQuintal =
                    price.source ===
                      'mandi_api' ||
                    price.source ===
                      'historical_dataset' ||
                    price.source ===
                      'agmarknet_historical';

                  const modalPrice =
                    parseFloat(
                      price.modal_price || 0
                    );

                  const minPrice =
                    parseFloat(
                      price.min_price || 0
                    );

                  const maxPrice =
                    parseFloat(
                      price.max_price || 0
                    );

                  const divisor =
                    isQuintal ? 100 : 1;

                  const category =
                    getCategoryForCommodity(
                      price.commodity
                    );

                  return (
                    <div
                      key={`${price.commodity}-${price.state}-${price.district}-${index}`}
                      className="rounded-xl p-4 transition-all hover:-translate-y-0.5"
                      style={{
                        background:
                          'var(--bg-base)',
                        border:
                          '1px solid var(--border)',
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div
                            className="font-semibold text-sm"
                            style={{
                              color:
                                'var(--text-primary)',
                            }}
                          >
                            {cropLabels[
                              price.commodity
                            ] ||
                              price.commodity}
                          </div>

                          <div
                            className="text-[10px] mt-1 uppercase"
                            style={{
                              color:
                                'var(--text-muted)',
                            }}
                          >
                            {category}
                          </div>
                        </div>

                        <span
                          className="text-xs text-right"
                          style={{
                            color:
                              'var(--text-muted)',
                          }}
                        >
                          {price.district ||
                            price.state ||
                            'Market'}
                        </span>
                      </div>

                      <div className="mt-3">
                        <div
                          className="text-xl font-bold"
                          style={{
                            color:
                              'var(--accent)',
                          }}
                        >
                          ₹
                          {(
                            modalPrice /
                            divisor
                          ).toFixed(1)}

                          <span
                            className="text-xs font-normal ml-1"
                            style={{
                              color:
                                'var(--text-muted)',
                            }}
                          >
                            /kg
                          </span>
                        </div>

                        <div
                          className="text-xs mt-1"
                          style={{
                            color:
                              'var(--text-muted)',
                          }}
                        >
                          Range ₹
                          {(
                            minPrice /
                            divisor
                          ).toFixed(1)}
                          {' – '}
                          ₹
                          {(
                            maxPrice /
                            divisor
                          ).toFixed(1)}
                        </div>
                      </div>

                      {price.market && (
                        <div
                          className="text-[10px] mt-3 pt-2 border-t"
                          style={{
                            color:
                              'var(--text-muted)',
                            borderColor:
                              'var(--border)',
                          }}
                        >
                          Market:{' '}
                          {price.market}
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>

            {visibleMarketPrices <
              uniqueMarketPrices.length && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={() =>
                    setVisibleMarketPrices(
                      (prev) => prev + 8
                    )
                  }
                  className="px-6 py-3 rounded-xl font-medium transition-all hover:-translate-y-0.5"
                  style={{
                    background:
                      'var(--bg-secondary)',
                    color:
                      'var(--text-primary)',
                    border:
                      '1px solid var(--border)',
                  }}
                >
                  Load More

                  <span
                    className="ml-2 text-xs"
                    style={{
                      color:
                        'var(--text-muted)',
                    }}
                  >
                    (
                    {uniqueMarketPrices.length -
                      visibleMarketPrices}{' '}
                    more)
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* =====================================================
          FARMER MARKETPLACE
      ====================================================== */}

      <div
        id="farmer-produce-section"
        className="scroll-mt-4"
      >
        <div>
          <h2
            className="text-lg font-semibold"
            style={{
              color:
                'var(--text-primary)',
            }}
          >
            Farmer Marketplace
          </h2>

          <p
            className="text-xs mt-1"
            style={{
              color:
                'var(--text-muted)',
            }}
          >
            Buy directly from farmers or
            explore buyer demands.
          </p>
        </div>
      </div>

      {/* =====================================================
          TABS
      ====================================================== */}

      <div
        className="flex gap-4 border-b"
        style={{
          borderColor:
            'var(--border)',
        }}
      >
        {[
          {
            key: 'listings',
            label: `Produce Listings (${filteredListings.length})`,
          },
          {
            key: 'demands',
            label: `Buyer Demands (${filteredDemands.length})`,
          },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="pb-3 px-1 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor:
                tab === key
                  ? 'var(--accent)'
                  : 'transparent',
              color:
                tab === key
                  ? 'var(--accent)'
                  : 'var(--text-muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* =====================================================
          FILTERS
      ====================================================== */}

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search
            className="absolute left-3 top-2.5 h-4 w-4"
            style={{
              color:
                'var(--text-muted)',
            }}
          />

          <input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="input-field pl-9"
            placeholder="Search commodities, farmers..."
          />
        </div>

        <div className="flex gap-1 flex-wrap">
          {commodities.map((c) => (
            <button
              key={c}
              onClick={() => {
                setFilter(c);
                setCategoryFilter('ALL');
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background:
                  filter === c
                    ? 'var(--accent)'
                    : 'var(--bg-elevated)',
                color:
                  filter === c
                    ? 'var(--text-inverse)'
                    : 'var(--text-secondary)',
                border: `1px solid ${
                  filter === c
                    ? 'var(--accent)'
                    : 'var(--border)'
                }`,
              }}
            >
              {c === 'ALL'
                ? 'All'
                : cropLabels[c] || c}
            </button>
          ))}
        </div>
      </div>

      {/* =====================================================
          FARMER LISTINGS
      ====================================================== */}

      {tab === 'listings' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredListings.map(
            (listing) => {
              const image =
                cropImages[
                  listing.commodity
                ] || cropImages.OTHER;

              const mandiReference =
                getMandiReference(listing);

              return (
                <div
                  key={listing.id}
                  className="group overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1"
                  style={{
                    background:
                      'var(--bg-elevated)',
                    border:
                      '1px solid var(--border)',
                    boxShadow:
                      '0 4px 18px rgba(0,0,0,0.04)',
                  }}
                >
                  {/* =================================================
                      CROP IMAGE
                  ================================================== */}

                  <div className="relative h-52 overflow-hidden">
                    <img
                      src={image}
                      alt={
                        cropLabels[listing.commodity] ||
                        listing.commodity
                      }
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src =
                          tomatoImage;
                      }}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />

                    {/* Image overlay */}

                    <div
                      className="absolute inset-x-0 bottom-0 h-24"
                      style={{
                        background:
                          'linear-gradient(to top, rgba(0,0,0,0.55), transparent)',
                      }}
                    />

                    {/* Farmer Produce badge */}

                    <div className="absolute top-3 left-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                        style={{
                          background:
                            'rgba(255,255,255,0.92)',
                          color:
                            'var(--text-primary)',
                          backdropFilter:
                            'blur(8px)',
                        }}
                      >
                        <UserRound className="h-3 w-3" />
                        Farmer Produce
                      </span>
                    </div>

                    {/* Grade */}

                    {listing.grade && (
                      <div className="absolute top-3 right-3">
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                          style={{
                            background:
                              'rgba(255,255,255,0.92)',
                            color:
                              'var(--text-primary)',
                            backdropFilter:
                              'blur(8px)',
                          }}
                        >
                          <BadgeCheck className="h-3 w-3" />

                          {gradeLabels[
                            listing.grade
                          ] ||
                            listing.grade}
                        </span>
                      </div>
                    )}

                    {/* Crop name over image */}

                    <div className="absolute bottom-4 left-4 right-4">
                      <h3
                        className="text-xl font-bold"
                        style={{
                          color: '#ffffff',
                          textShadow:
                            '0 1px 4px rgba(0,0,0,0.35)',
                        }}
                      >
                        {cropLabels[
                          listing.commodity
                        ] ||
                          listing.commodity}
                      </h3>

                      {listing.variety && (
                        <p
                          className="text-xs mt-0.5"
                          style={{
                            color:
                              'rgba(255,255,255,0.88)',
                          }}
                        >
                          {listing.variety}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* =================================================
                      CARD CONTENT
                  ================================================== */}

                  <div className="p-5">

                    {/* Price + quantity */}

                    <div
                      className="grid grid-cols-2 gap-3"
                    >
                      <div
                        className="rounded-xl p-3"
                        style={{
                          background:
                            'var(--bg-secondary)',
                        }}
                      >
                        <div
                          className="flex items-center gap-1.5 text-xs"
                          style={{
                            color:
                              'var(--text-muted)',
                          }}
                        >
                          <Package className="h-3.5 w-3.5" />

                          Available
                        </div>

                        <div
                          className="text-lg font-bold mt-1"
                          style={{
                            color:
                              'var(--text-primary)',
                          }}
                        >
                          {Number(
                            listing.quantity || 0
                          ).toLocaleString()}
                          <span className="text-xs font-medium ml-1">
                            {listing.unit ||
                              'kg'}
                          </span>
                        </div>
                      </div>

                      <div
                        className="rounded-xl p-3"
                        style={{
                          background:
                            'rgba(34,197,94,0.08)',
                          border:
                            '1px solid rgba(34,197,94,0.12)',
                        }}
                      >
                        <div
                          className="text-xs"
                          style={{
                            color:
                              'var(--text-muted)',
                          }}
                        >
                          Asking price
                        </div>

                        <div
                          className="text-lg font-bold mt-1"
                          style={{
                            color:
                              'var(--accent)',
                          }}
                        >
                          ₹
                          {Number(
                            listing.asking_price ||
                              0
                          ).toLocaleString()}

                          <span
                            className="text-xs font-normal ml-1"
                            style={{
                              color:
                                'var(--text-muted)',
                            }}
                          >
                            /{' '}
                            {listing.unit ||
                              'kg'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Mandi comparison */}

                    {mandiReference && (
                      <div
                        className="mt-4 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3"
                        style={{
                          background:
                            'rgba(59,130,246,0.07)',
                          border:
                            '1px solid rgba(59,130,246,0.12)',
                        }}
                      >
                        <div>
                          <p
                            className="text-[10px] uppercase tracking-wide font-semibold"
                            style={{
                              color:
                                'var(--text-muted)',
                            }}
                          >
                            Mandi reference
                          </p>

                          <p
                            className="text-xs mt-0.5"
                            style={{
                              color:
                                'var(--text-secondary)',
                            }}
                          >
                            Nearby{' '}
                            {
                              mandiReference.scope
                            } market
                          </p>
                        </div>

                        <div
                          className="font-bold text-sm"
                          style={{
                            color:
                              'var(--info)',
                          }}
                        >
                          ₹
                          {
                            mandiReference.price
                          }
                          <span className="text-[10px] font-normal ml-1">
                            /kg
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Location */}

                    <div className="mt-4 space-y-2.5">

                      <div className="flex items-start gap-2.5">
                        <MapPin
                          className="h-4 w-4 mt-0.5 shrink-0"
                          style={{
                            color:
                              'var(--accent)',
                          }}
                        />

                        <div className="min-w-0">
                          <p
                            className="text-[10px] uppercase tracking-wide font-medium"
                            style={{
                              color:
                                'var(--text-muted)',
                            }}
                          >
                            Location
                          </p>

                          <p
                            className="text-sm mt-0.5 truncate"
                            style={{
                              color:
                                'var(--text-secondary)',
                            }}
                          >
                            {listing.location ||
                              'Location unavailable'}

                            {listing.state
                              ? `, ${listing.state}`
                              : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <UserRound
                          className="h-4 w-4 mt-0.5 shrink-0"
                          style={{
                            color:
                              'var(--info)',
                          }}
                        />

                        <div className="min-w-0">
                          <p
                            className="text-[10px] uppercase tracking-wide font-medium"
                            style={{
                              color:
                                'var(--text-muted)',
                            }}
                          >
                            Farmer
                          </p>

                          <p
                            className="text-sm mt-0.5 truncate"
                            style={{
                              color:
                                'var(--text-secondary)',
                            }}
                          >
                            {listing.farmer_name ||
                              'Farmer'}
                          </p>
                        </div>
                      </div>

                      {listing.availability_date && (
                        <div className="flex items-start gap-2.5">
                          <CalendarDays
                            className="h-4 w-4 mt-0.5 shrink-0"
                            style={{
                              color:
                                'var(--warning)',
                            }}
                          />

                          <div>
                            <p
                              className="text-[10px] uppercase tracking-wide font-medium"
                              style={{
                                color:
                                  'var(--text-muted)',
                              }}
                            >
                              Available from
                            </p>

                            <p
                              className="text-sm mt-0.5"
                              style={{
                                color:
                                  'var(--text-secondary)',
                              }}
                            >
                              {new Date(
                                listing.availability_date
                              ).toLocaleDateString(
                                undefined,
                                {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                }
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Description */}

                    {listing.description && (
                      <div
                        className="mt-4 pt-4 border-t"
                        style={{
                          borderColor:
                            'var(--border)',
                        }}
                      >
                        <p
                          className="text-sm line-clamp-2 leading-relaxed"
                          style={{
                            color:
                              'var(--text-secondary)',
                          }}
                        >
                          {
                            listing.description
                          }
                        </p>
                      </div>
                    )}

                    {/* =================================================
                        BUY BUTTON
                        Visible to buyers, hidden from farmers
                    ================================================== */}

                    {user?.role?.trim().toUpperCase() === 'BUYER' && (
                      <button
                        onClick={() =>
                          handleOpenOrder(listing)
                        }
                        className="w-full mt-5 py-3 rounded-xl font-semibold text-sm transition-all hover:-translate-y-0.5 hover:shadow-md flex items-center justify-center gap-2"
                        style={{
                          background:
                            'var(--accent)',
                          color:
                            'var(--text-inverse)',
                        }}
                      >
                        <ShoppingCart className="h-4 w-4" />
                        Buy Now
                      </button>
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}

      {/* =====================================================
          EMPTY LISTINGS
      ====================================================== */}

      {tab === 'listings' &&
        filteredListings.length === 0 && (
          <div
            className="card-surface p-10 text-center"
            style={{
              color:
                'var(--text-muted)',
            }}
          >
            <Store className="h-10 w-10 mx-auto mb-3 opacity-40" />

            <p className="font-medium">
              No farmer listings found
            </p>

            <p className="text-xs mt-1">
              Try another commodity or search
              term.
            </p>
          </div>
        )}

      {/* =====================================================
          BUYER DEMANDS
      ====================================================== */}

      {tab === 'demands' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDemands.map((d) => (
            <div
              key={d.id}
              className="card-surface hover-premium p-5 flex flex-col"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3
                    className="font-semibold text-lg"
                    style={{
                      color:
                        'var(--text-primary)',
                    }}
                  >
                    {cropLabels[
                      d.commodity
                    ] || d.commodity}
                  </h3>

                  <p
                    className="text-sm"
                    style={{
                      color:
                        'var(--text-muted)',
                    }}
                  >
                    {d.variety ||
                      'Any variety'}
                  </p>
                </div>

                <span className="badge badge-info">
                  {d.demand_status}
                </span>
              </div>

              <div
                className="space-y-1 mb-4 text-sm"
                style={{
                  color:
                    'var(--text-secondary)',
                }}
              >
                <p>
                  Buyer:{' '}
                  <span
                    className="font-medium"
                    style={{
                      color:
                        'var(--text-primary)',
                    }}
                  >
                    {d.buyer_name}
                  </span>
                </p>

                <p>
                  Delivery to:{' '}
                  {d.delivery_location}
                </p>

                <p>
                  Required:{' '}
                  <span
                    className="font-medium"
                    style={{
                      color:
                        'var(--text-primary)',
                    }}
                  >
                    {d.required_quantity} kg
                  </span>
                </p>
              </div>

              <div
                className="mt-auto pt-3 border-t"
                style={{
                  borderColor:
                    'var(--border)',
                }}
              >
                <div className="flex items-baseline">
                  <span
                    className="text-2xl font-bold font-numeric"
                    style={{
                      color:
                        'var(--info)',
                    }}
                  >
                    ₹{d.target_price}
                  </span>

                  <span
                    className="text-sm ml-0.5"
                    style={{
                      color:
                        'var(--text-muted)',
                    }}
                  >
                    /kg target
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* =====================================================
          EMPTY DEMANDS
      ====================================================== */}

      {tab === 'demands' &&
        filteredDemands.length === 0 && (
          <div
            className="card-surface p-10 text-center"
            style={{
              color:
                'var(--text-muted)',
            }}
          >
            <p className="font-medium">
              No buyer demands found
            </p>

            <p className="text-xs mt-1">
              Try another commodity.
            </p>
          </div>
        )}

      {/* =====================================================
          ORDER MODAL
      ====================================================== */}

      {orderingListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 modal-backdrop">
          <div
            className="relative w-full max-w-4xl rounded-3xl overflow-hidden"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
            }}
          >
            {/* =================================================
                HEADER
            ================================================== */}

            <div
              className="px-5 sm:px-7 py-4 flex items-center justify-between"
              style={{
                background: 'var(--bg-elevated)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'rgba(34,197,94,0.10)',
                  }}
                >
                  <ShoppingCart
                    className="h-5 w-5"
                    style={{
                      color: 'var(--accent)',
                    }}
                  />
                </div>

                <div>
                  <h3
                    className="text-lg font-bold"
                    style={{
                      color: 'var(--text-primary)',
                    }}
                  >
                    Confirm Order
                  </h3>

                  <p
                    className="text-xs mt-0.5"
                    style={{
                      color: 'var(--text-muted)',
                    }}
                  >
                    Review your order before confirming
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setOrderingListing(null);
                  setOrderSuccess(false);
                  setOrderError('');
                  setRouteEstimate(null);
                }}
                className="p-2 rounded-xl transition-colors hover:bg-black/5"
                style={{
                  color: 'var(--text-muted)',
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* =================================================
                SUCCESS
            ================================================== */}

            {orderSuccess ? (
              <div className="px-6 py-16 text-center">
                <div
                  className="w-20 h-20 rounded-full mx-auto flex items-center justify-center"
                  style={{
                    background: 'rgba(34,197,94,0.10)',
                  }}
                >
                  <CheckCircle
                    className="h-10 w-10"
                    style={{
                      color: 'var(--accent)',
                    }}
                  />
                </div>

                <h3
                  className="text-xl font-bold mt-5"
                  style={{
                    color: 'var(--text-primary)',
                  }}
                >
                  Order Confirmed
                </h3>

                <p
                  className="text-sm mt-2"
                  style={{
                    color: 'var(--text-muted)',
                  }}
                >
                  Your order has been successfully placed.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handlePlaceOrder}
                className="p-4 sm:p-6"
              >
                {/* =================================================
                    MAIN GRID
                ================================================== */}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                  {/* =================================================
                      LEFT COLUMN
                  ================================================== */}

                  <div className="space-y-4">

                    {/* PRODUCT SUMMARY */}

                    <div
                      className="rounded-2xl p-4"
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p
                            className="text-[10px] uppercase tracking-wider font-semibold"
                            style={{
                              color: 'var(--text-muted)',
                            }}
                          >
                            Farmer Produce
                          </p>

                          <h4
                            className="text-xl font-bold mt-1"
                            style={{
                              color: 'var(--text-primary)',
                            }}
                          >
                            {cropLabels[
                              orderingListing.commodity
                            ] ||
                              orderingListing.commodity}
                          </h4>

                          {orderingListing.variety && (
                            <p
                              className="text-xs mt-0.5"
                              style={{
                                color: 'var(--text-muted)',
                              }}
                            >
                              {orderingListing.variety}
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <p
                            className="text-xl font-bold"
                            style={{
                              color: 'var(--accent)',
                            }}
                          >
                            ₹
                            {Number(
                              orderingListing.asking_price || 0
                            ).toLocaleString()}
                          </p>

                          <p
                            className="text-[11px]"
                            style={{
                              color: 'var(--text-muted)',
                            }}
                          >
                            / kg
                          </p>
                        </div>
                      </div>

                      <div
                        className="mt-3 pt-3 border-t flex flex-wrap gap-x-4 gap-y-1.5 text-xs"
                        style={{
                          borderColor: 'var(--border)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <span className="flex items-center gap-1.5">
                          <UserRound className="h-3.5 w-3.5" />
                          {orderingListing.farmer_name ||
                            'Farmer'}
                        </span>

                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {orderingListing.location ||
                            'Location unavailable'}
                        </span>

                        <span className="flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5" />
                          {Number(
                            orderingListing.quantity || 0
                          ).toLocaleString()}{' '}
                          kg available
                        </span>
                      </div>
                    </div>

                    {/* ERROR */}

                    {orderError && (
                      <div
                        className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
                        style={{
                          background:
                            'rgba(239,68,68,0.08)',
                          border:
                            '1px solid rgba(239,68,68,0.15)',
                          color: '#dc2626',
                        }}
                      >
                        <X className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{orderError}</span>
                      </div>
                    )}

                    {/* QUANTITY */}

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label
                          className="text-sm font-semibold"
                          style={{
                            color: 'var(--text-primary)',
                          }}
                        >
                          Quantity
                        </label>

                        <span
                          className="text-xs"
                          style={{
                            color: 'var(--text-muted)',
                          }}
                        >
                          Max {orderingListing.quantity} kg
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={orderQuantity}
                          onChange={(e) => {
                            setOrderQuantity(e.target.value);
                            setRouteEstimate(null);
                          }}
                          className="input-field pr-14 font-numeric"
                          placeholder="Enter quantity"
                          required
                        />

                        <span
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold"
                          style={{
                            color: 'var(--text-muted)',
                          }}
                        >
                          kg
                        </span>
                      </div>
                    </div>

                    {/* DELIVERY DESTINATION */}

                    <div>
                      <label
                        className="block text-sm font-semibold mb-2"
                        style={{
                          color: 'var(--text-primary)',
                        }}
                      >
                        Delivery destination
                      </label>

                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <MapPin
                            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                            style={{
                              color: 'var(--text-muted)',
                            }}
                          />

                          <input
                            type="text"
                            value={orderLocation}
                            onChange={(e) => {
                              setOrderLocation(e.target.value);
                              setRouteEstimate(null);
                            }}
                            className="input-field pl-10"
                            placeholder="Enter delivery location"
                            required
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleCalculateEstimate}
                          disabled={
                            estimatingRoute ||
                            !orderLocation ||
                            !orderQuantity
                          }
                          className="px-4 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
                          style={{
                            background:
                              'rgba(59,130,246,0.08)',
                            color: 'var(--info)',
                            border:
                              '1px solid rgba(59,130,246,0.15)',
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
                        className="block text-sm font-semibold mb-2"
                        style={{
                          color: 'var(--text-primary)',
                        }}
                      >
                        Delivery method
                      </label>

                      <select
                        value={deliveryMode}
                        onChange={(e) => {
                          setDeliveryMode(e.target.value);
                          setRouteEstimate(null);
                        }}
                        className="input-field"
                      >
                        <option value="TRANSPORT_PARTNER">
                          Transport Partner
                        </option>

                        <option value="FARMER_DELIVERY">
                          Farmer Arranged Delivery
                        </option>

                        <option value="BUYER_PICKUP">
                          Self Pickup — Free
                        </option>
                      </select>
                    </div>
                  </div>

                  {/* =================================================
                      RIGHT COLUMN
                  ================================================== */}

                  <div className="space-y-4">

                    {/* VEHICLES */}

                    {deliveryMode !== 'BUYER_PICKUP' &&
                      vehicles.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label
                              className="text-sm font-semibold"
                              style={{
                                color:
                                  'var(--text-primary)',
                              }}
                            >
                              Transport vehicle
                            </label>

                            <span
                              className="text-[10px]"
                              style={{
                                color:
                                  'var(--text-muted)',
                              }}
                            >
                              Select one
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {vehicles.map((v) => {
                              const isSelected =
                                selectedVehicle === v.id;

                              const exceedsCapacity =
                                orderQuantity &&
                                !isNaN(
                                  parseFloat(orderQuantity)
                                ) &&
                                parseFloat(orderQuantity) >
                                  v.capacityKg;

                              return (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedVehicle(v.id);
                                    setRouteEstimate(null);
                                  }}
                                  className="rounded-xl p-3 text-left transition-all"
                                  style={{
                                    background:
                                      isSelected
                                        ? 'rgba(34,197,94,0.07)'
                                        : 'var(--bg-secondary)',
                                    border: `1px solid ${
                                      isSelected
                                        ? 'var(--accent)'
                                        : 'var(--border)'
                                    }`,
                                    opacity:
                                      exceedsCapacity &&
                                      !isSelected
                                        ? 0.45
                                        : 1,
                                  }}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span
                                      className="font-semibold text-sm"
                                      style={{
                                        color:
                                          isSelected
                                            ? 'var(--accent)'
                                            : 'var(--text-primary)',
                                      }}
                                    >
                                      {v.label}
                                    </span>

                                    {isSelected && (
                                      <CheckCircle
                                        className="h-4 w-4"
                                        style={{
                                          color:
                                            'var(--accent)',
                                        }}
                                      />
                                    )}
                                  </div>

                                  <p
                                    className="text-[11px] mt-1 line-clamp-1"
                                    style={{
                                      color:
                                        'var(--text-muted)',
                                    }}
                                  >
                                    {v.description}
                                  </p>

                                  <p
                                    className="text-[10px] mt-1.5 font-medium"
                                    style={{
                                      color:
                                        'var(--text-secondary)',
                                    }}
                                  >
                                    Capacity ·{' '}
                                    {v.capacityKg.toLocaleString()}{' '}
                                    kg
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    {/* CAPACITY WARNING */}

                    {deliveryMode !== 'BUYER_PICKUP' &&
                      orderQuantity &&
                      !isNaN(
                        parseFloat(orderQuantity)
                      ) &&
                      (() => {
                        const selected =
                          vehicles.find(
                            (v) =>
                              v.id === selectedVehicle
                          );

                        const qty = parseFloat(
                          orderQuantity
                        );

                        if (
                          selected &&
                          qty > selected.capacityKg
                        ) {
                          const smallestFit =
                            vehicles.find(
                              (v) =>
                                v.capacityKg >= qty
                            );

                          return (
                            <div
                              className="rounded-xl px-4 py-3 text-xs"
                              style={{
                                background:
                                  'rgba(245,158,11,0.08)',
                                border:
                                  '1px solid rgba(245,158,11,0.15)',
                                color: '#b45309',
                              }}
                            >
                              Vehicle capacity is insufficient
                              for {qty.toLocaleString()} kg.
                              {smallestFit
                                ? ` Select ${smallestFit.label}.`
                                : ' Select a larger vehicle.'}
                            </div>
                          );
                        }

                        return null;
                      })()}

                    {/* ROUTE ESTIMATE */}

                    {routeEstimate &&
                      (() => {
                        const breakdown =
                          routeEstimate.breakdown || {};

                        const vehicle =
                          routeEstimate.vehicle || {};

                        const distanceKm =
                          routeEstimate.distanceKm ??
                          breakdown.distanceKm ??
                          0;

                        const ratePerKm =
                          breakdown.ratePerKm ??
                          vehicle.ratePerKm ??
                          0;

                        const distanceCost =
                          breakdown.distanceCost ??
                          Math.round(
                            distanceKm * ratePerKm
                          );

                        const loadingHandling =
                          breakdown.loadingHandling ??
                          vehicle.loadingHandling ??
                          0;

                        const totalEstimate =
                          breakdown.total ??
                          routeEstimate.estimatedCost ??
                          distanceCost +
                            loadingHandling;

                        return (
                          <div
                            className="rounded-2xl p-4"
                            style={{
                              background:
                                'var(--bg-secondary)',
                              border:
                                '1px solid var(--border)',
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p
                                  className="text-xs font-semibold"
                                  style={{
                                    color:
                                      'var(--text-primary)',
                                  }}
                                >
                                  Delivery estimate
                                </p>

                                <p
                                  className="text-[10px] mt-0.5"
                                  style={{
                                    color:
                                      'var(--text-muted)',
                                  }}
                                >
                                  {distanceKm} km ·{' '}
                                  {
                                    routeEstimate.estimatedTime
                                  }
                                </p>
                              </div>

                              <div className="text-right">
                                <p
                                  className="text-lg font-bold font-numeric"
                                  style={{
                                    color:
                                      'var(--text-primary)',
                                  }}
                                >
                                  ₹
                                  {totalEstimate.toLocaleString()}
                                </p>

                                <p
                                  className="text-[10px]"
                                  style={{
                                    color:
                                      'var(--text-muted)',
                                  }}
                                >
                                  estimated delivery
                                </p>
                              </div>
                            </div>

                            <div
                              className="mt-3 pt-3 border-t space-y-1.5 text-xs"
                              style={{
                                borderColor:
                                  'var(--border)',
                                color:
                                  'var(--text-secondary)',
                              }}
                            >
                              <div className="flex justify-between">
                                <span>
                                  Distance · ₹{ratePerKm}/km
                                </span>

                                <span className="font-medium">
                                  ₹
                                  {distanceCost.toLocaleString()}
                                </span>
                              </div>

                              <div className="flex justify-between">
                                <span>
                                  Loading & handling
                                </span>

                                <span className="font-medium">
                                  ₹
                                  {loadingHandling.toLocaleString()}
                                </span>
                              </div>
                            </div>

                            {routeEstimate.isFallback && (
                              <p
                                className="text-[10px] mt-2"
                                style={{
                                  color:
                                    'var(--warning)',
                                }}
                              >
                                Estimate based on location
                                fallback.
                              </p>
                            )}
                          </div>
                        );
                      })()}

                    {/* PRICE SUMMARY */}

                    {orderQuantity &&
                      !isNaN(
                        parseFloat(orderQuantity)
                      ) &&
                      (() => {
                        const qty = parseFloat(
                          orderQuantity
                        );

                        const produceCost =
                          qty *
                          parseFloat(
                            orderingListing.asking_price ||
                              0
                          );

                        let deliveryCost = 0;

                        if (
                          deliveryMode !==
                            'BUYER_PICKUP' &&
                          routeEstimate
                        ) {
                          deliveryCost =
                            routeEstimate.breakdown
                              ?.total ??
                            routeEstimate.estimatedCost ??
                            0;
                        }

                        const total =
                          produceCost + deliveryCost;

                        return (
                          <div
                            className="rounded-2xl p-4"
                            style={{
                              background:
                                'var(--bg-elevated)',
                              border:
                                '1px solid var(--border)',
                            }}
                          >
                            <p
                              className="text-xs font-semibold mb-2"
                              style={{
                                color:
                                  'var(--text-primary)',
                              }}
                            >
                              Order summary
                            </p>

                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between">
                                <span
                                  style={{
                                    color:
                                      'var(--text-muted)',
                                  }}
                                >
                                  Produce
                                </span>

                                <span className="font-medium font-numeric">
                                  ₹
                                  {produceCost.toLocaleString()}
                                </span>
                              </div>

                              <div className="flex justify-between">
                                <span
                                  style={{
                                    color:
                                      'var(--text-muted)',
                                  }}
                                >
                                  Delivery
                                </span>

                                <span className="font-medium font-numeric">
                                  {deliveryMode ===
                                  'BUYER_PICKUP'
                                    ? 'Free'
                                    : routeEstimate
                                    ? `₹${deliveryCost.toLocaleString()}`
                                    : 'Estimate required'}
                                </span>
                              </div>

                              <div
                                className="border-t pt-2 mt-2 flex items-center justify-between"
                                style={{
                                  borderColor:
                                    'var(--border)',
                                }}
                              >
                                <span
                                  className="font-semibold"
                                  style={{
                                    color:
                                      'var(--text-primary)',
                                  }}
                                >
                                  Total
                                </span>

                                <span
                                  className="text-xl font-bold font-numeric"
                                  style={{
                                    color:
                                      'var(--accent)',
                                  }}
                                >
                                  ₹
                                  {total.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                  </div>
                </div>

                {/* =================================================
                    ACTIONS
                ================================================== */}

                <div
                  className="flex gap-3 mt-5 pt-4 border-t"
                  style={{
                    borderColor: 'var(--border)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOrderingListing(null);
                      setOrderSuccess(false);
                      setOrderError('');
                      setRouteEstimate(null);
                    }}
                    className="px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
                    style={{
                      background:
                        'var(--bg-secondary)',
                      color:
                        'var(--text-secondary)',
                      border:
                        '1px solid var(--border)',
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={
                      ordering ||
                      (!routeEstimate &&
                        deliveryMode !==
                          'BUYER_PICKUP') ||
                      (deliveryMode !==
                        'BUYER_PICKUP' &&
                        orderQuantity &&
                        !isNaN(
                          parseFloat(orderQuantity)
                        ) &&
                        vehicles.find(
                          (v) =>
                            v.id ===
                            selectedVehicle
                        ) &&
                        parseFloat(
                          orderQuantity
                        ) >
                          vehicles.find(
                            (v) =>
                              v.id ===
                              selectedVehicle
                          ).capacityKg)
                    }
                    className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2 hover:-translate-y-0.5"
                    style={{
                      background:
                        'var(--accent)',
                      color:
                        'var(--text-inverse)',
                    }}
                  >
                    {ordering ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Placing Order...
                      </>
                    ) : (
                      <>
                        Confirm Order
                        <CheckCircle className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}