import { useState, useEffect } from 'react';
import { marketAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  LayoutGrid,
  Table,
  Loader2,
  MapPin,
  IndianRupee,
  CalendarDays,
  Database,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const commodities = ['ALL', 'TOMATO', 'ONION', 'POTATO', 'WHEAT', 'RICE'];
const states = ['ALL', 'Maharashtra', 'Karnataka', 'Madhya Pradesh', 'Rajasthan', 'Delhi'];

const chartTooltipStyle = {
  contentStyle: {
    background: '#ffffff',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#18181b',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  cursor: {
    fill: 'rgba(0,0,0,0.03)',
  },
};

export default function MarketPrices() {
  const { user } = useAuth();

  const [prices, setPrices] = useState([]);
  const [latest, setLatest] = useState([]);
  const [commodity, setCommodity] = useState('ALL');
  const [state, setState] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState('cards');
  const [dailyIntel, setDailyIntel] = useState(null);
  const [intelLoading, setIntelLoading] = useState(false);

  const load = async () => {
    setLoading(true);

    try {
      const params = {};

      if (commodity !== 'ALL') params.commodity = commodity;
      if (state !== 'ALL') params.state = state;

      const [p, l] = await Promise.all([
        marketAPI.getPrices(params),
        marketAPI.getLatest(),
      ]);

      setPrices(p?.data || []);
      setLatest(l?.data || []);
    } catch (err) {
      console.error('Failed to load prices:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadIntel = async () => {
    if (commodity === 'ALL') {
      setDailyIntel(null);
      return;
    }

    setIntelLoading(true);

    try {
      const params = { commodity };

      if (state !== 'ALL') params.state = state;

      const res = await marketAPI.getDailyIntelligence(params);
      setDailyIntel(res.data);
    } catch (err) {
      setDailyIntel(null);
    } finally {
      setIntelLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadIntel();
  }, [commodity, state]);

  const handleSync = async () => {
    setSyncing(true);

    try {
      const result = await marketAPI.sync();

      if (result.data?.hint) {
        alert(result.data.hint);
      }

      await load();
    } catch (err) {
      alert(
        err.response?.data?.error ||
        err.response?.data?.hint ||
        'Sync failed'
      );
    }

    setSyncing(false);
  };

  const getPriceDetails = (
    minPrice,
    maxPrice,
    modalPrice,
    source
  ) => {
    const isQuintal =
      source === 'mandi_api' ||
      source === 'historical_dataset' ||
      source === 'agmarknet_historical';

    const minVal = parseFloat(minPrice);
    const maxVal = parseFloat(maxPrice);
    const modalVal = parseFloat(modalPrice);

    if (isQuintal) {
      return {
        unit: '₹/quintal',
        minText: `₹${minVal.toLocaleString()}/q (₹${(minVal / 100).toFixed(1)}/kg)`,
        maxText: `₹${maxVal.toLocaleString()}/q`,
        modalText: `₹${modalVal.toLocaleString()}/q (₹${(modalVal / 100).toFixed(1)}/kg)`,
        convertedModal: `₹${(modalVal / 100).toFixed(1)}/kg`,
      };
    }

    return {
      unit: '₹/kg',
      minText: `₹${minVal.toFixed(1)}/kg`,
      maxText: `₹${maxVal.toFixed(1)}/kg`,
      modalText: `₹${modalVal.toFixed(1)}/kg`,
      convertedModal: `₹${modalVal.toFixed(1)}/kg`,
    };
  };

  const chartData = {};

  latest.forEach((p) => {
    if (!chartData[p.commodity]) {
      chartData[p.commodity] = {
        commodity: p.commodity,
        prices: [],
      };
    }

    const isQuintal =
      p.source === 'mandi_api' ||
      p.source === 'historical_dataset' ||
      p.source === 'agmarknet_historical';

    chartData[p.commodity].prices.push(
      isQuintal
        ? parseFloat(p.modal_price) / 100
        : parseFloat(p.modal_price)
    );
  });

  const barData = Object.values(chartData).map((d) => ({
    commodity: d.commodity,
    avgPrice: parseFloat(
      (
        d.prices.reduce((a, b) => a + b, 0) /
        d.prices.length
      ).toFixed(2)
    ),
    count: d.prices.length,
  }));

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{
            borderColor: 'var(--bg-overlay)',
            borderTopColor: 'var(--accent)',
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">
            Market Prices
          </h1>

          <p
            className="text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            Official daily mandi rates across APMC markets
          </p>

          {latest.length > 0 &&
            (() => {
              const maxTime = Math.max(
                ...latest.map((p) =>
                  new Date(p.fetched_at || Date.now()).getTime()
                )
              );

              return maxTime > 0 ? (
                <span
                  className="text-[10px] font-semibold block mt-0.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Updated: {new Date(maxTime).toLocaleString()}
                </span>
              ) : null;
            })()}
        </div>

        {user?.role === 'ADMIN' && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sync Data
          </button>
        )}
      </div>

      {/* Guide */}
      <div
        className="rounded-xl p-5 text-sm space-y-2"
        style={{
          background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.15)',
        }}
      >
        <h4
          className="font-bold flex items-center gap-1.5"
          style={{ color: 'var(--info)' }}
        >
          <Info className="h-4 w-4" />
          Mandi Price Guide
        </h4>

        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          <p>
            <strong>Market (Mandi):</strong> Government agricultural market
            yard where trade happened.
          </p>

          <p>
            <strong>Typical Price (Modal):</strong> Price at which most
            transactions took place.
          </p>

          <p>
            <strong>Min / Max:</strong> Minimum and maximum prices recorded
            on the day.
          </p>

          <p>
            <strong>Source:</strong> Government APIs, APMC Mandi inputs,
            or historical datasets.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap justify-between items-center gap-4 rounded-xl p-4"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="flex gap-3 flex-wrap">
          <select
            value={commodity}
            onChange={(e) => setCommodity(e.target.value)}
            className="input-field w-auto"
          >
            {commodities.map((c) => (
              <option key={c} value={c}>
                {c === 'ALL' ? 'All Crops' : c}
              </option>
            ))}
          </select>

          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="input-field w-auto"
          >
            {states.map((s) => (
              <option key={s} value={s}>
                {s === 'ALL' ? 'All States' : s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="text-xs font-semibold"
            style={{ color: 'var(--text-muted)' }}
          >
            {prices.length} records
          </span>

          <div
            className="p-0.5 rounded-lg flex"
            style={{ background: 'var(--bg-elevated)' }}
          >
            {[
              {
                key: 'cards',
                icon: LayoutGrid,
                label: 'Cards',
              },
              {
                key: 'table',
                icon: Table,
                label: 'Table',
              },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className="px-3 py-1.5 rounded-md flex items-center gap-1 text-xs font-semibold transition-all"
                style={{
                  background:
                    viewMode === key
                      ? 'var(--bg-surface)'
                      : 'transparent',
                  color:
                    viewMode === key
                      ? 'var(--accent)'
                      : 'var(--text-muted)',
                  boxShadow:
                    viewMode === key
                      ? 'var(--shadow-sm)'
                      : 'none',
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Daily Intelligence */}
      {commodity !== 'ALL' && (
        <div className="card-surface p-5 space-y-3">
          <h3
            className="font-semibold flex flex-wrap items-center gap-1.5"
            style={{ color: 'var(--text-primary)' }}
          >
            Daily Price Intelligence for{' '}
            <strong style={{ color: 'var(--accent)' }}>
              {commodity}
            </strong>

            {state !== 'ALL' && (
              <span>
                in{' '}
                <strong style={{ color: 'var(--accent)' }}>
                  {state}
                </strong>
              </span>
            )}

            {dailyIntel?.scope && (
              <span className="ml-auto badge badge-info text-[10px] uppercase">
                {dailyIntel.scope}
              </span>
            )}
          </h3>

          {intelLoading ? (
            <div
              className="text-sm flex items-center gap-2 py-4"
              style={{ color: 'var(--text-muted)' }}
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : dailyIntel ? (
            dailyIntel.status === 'Comparison unavailable' ? (
              <div
                className="text-sm p-4 rounded-lg"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                }}
              >
                Not enough data for daily price comparison.{' '}
                {dailyIntel.todayPrice
                  ? `Latest rate: ₹${dailyIntel.todayPrice.toFixed(1)}/kg`
                  : ''}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Latest Rate',
                    value: `₹${dailyIntel.todayPrice.toFixed(1)}/kg`,
                    sub: new Date(
                      dailyIntel.todayDate
                    ).toLocaleDateString(),
                  },
                  {
                    label: 'Previous Rate',
                    value: `₹${dailyIntel.yesterdayPrice.toFixed(1)}/kg`,
                    sub: new Date(
                      dailyIntel.yesterdayDate
                    ).toLocaleDateString(),
                  },
                  {
                    label: 'Change',
                    value: `${
                      dailyIntel.difference > 0 ? '+' : ''
                    }${dailyIntel.difference.toFixed(1)}/kg`,
                    icon:
                      dailyIntel.difference > 0
                        ? TrendingUp
                        : dailyIntel.difference < 0
                        ? TrendingDown
                        : Minus,
                    color:
                      dailyIntel.difference > 0
                        ? 'var(--accent)'
                        : dailyIntel.difference < 0
                        ? 'var(--danger)'
                        : 'var(--text-muted)',
                  },
                  {
                    label: '% Change',
                    value: `${
                      dailyIntel.percentageChange > 0 ? '+' : ''
                    }${dailyIntel.percentageChange.toFixed(2)}%`,
                    color:
                      dailyIntel.percentageChange > 0
                        ? 'var(--accent)'
                        : dailyIntel.percentageChange < 0
                        ? 'var(--danger)'
                        : 'var(--text-muted)',
                  },
                ].map(
                  ({
                    label,
                    value,
                    sub,
                    icon: Icon,
                    color,
                  }) => (
                    <div
                      key={label}
                      className="rounded-lg p-4"
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <p
                        className="text-xs font-medium"
                        style={{
                          color: 'var(--text-muted)',
                        }}
                      >
                        {label}
                      </p>

                      <div className="flex items-center gap-1.5 mt-1">
                        {Icon && (
                          <Icon
                            className="h-5 w-5"
                            style={{ color }}
                          />
                        )}

                        <p
                          className="text-lg font-bold font-numeric"
                          style={{
                            color:
                              color ||
                              'var(--text-primary)',
                          }}
                        >
                          {value}
                        </p>
                      </div>

                      {sub && (
                        <p
                          className="text-[10px] mt-1"
                          style={{
                            color: 'var(--text-muted)',
                          }}
                        >
                          {sub}
                        </p>
                      )}
                    </div>
                  )
                )}
              </div>
            )
          ) : null}
        </div>
      )}

      {/* Chart */}
      {barData.length > 0 && (
        <div className="card-surface p-5 hover-lift">
          <h3
            className="font-semibold mb-4 flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <TrendingUp
              className="h-5 w-5"
              style={{ color: 'var(--accent)' }}
            />
            Average Modal Price by Crop (₹/kg)
          </h3>

          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(0,0,0,0.06)"
              />

              <XAxis
                dataKey="commodity"
                tick={{
                  fontSize: 12,
                  fill: '#71717a',
                }}
              />

              <YAxis
                tick={{
                  fontSize: 12,
                  fill: '#71717a',
                }}
                unit=" ₹"
              />

              <Tooltip
                {...chartTooltipStyle}
                formatter={(v) => `₹${v}/kg`}
              />

              <Bar
                dataKey="avgPrice"
                fill="#22c55e"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

{/* Cards View */}
{viewMode === 'cards' && (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {prices.slice(0, 99).map((p) => {
      const pricing = getPriceDetails(
        p.min_price,
        p.max_price,
        p.modal_price,
        p.source
      );

      return (
        <div
          key={p.id}
          className="group rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3
                  className="text-base font-bold truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {p.commodity}
                </h3>

                {p.data_freshness === 'fresh' && (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: 'var(--accent)' }}
                    title="Fresh data"
                  />
                )}
              </div>

              <p
                className="text-[11px] mt-0.5 truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                {p.variety || 'Standard Variety'}
              </p>
            </div>

            <span
              className={`badge text-[9px] shrink-0 ${
                p.data_freshness === 'fresh'
                  ? 'badge-success'
                  : 'badge-warning'
              }`}
            >
              {p.data_freshness?.toUpperCase()}
            </span>
          </div>

          {/* Market */}
          <div
            className="flex items-center gap-1.5 mt-3 text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />

            <span className="truncate">
              {p.market || 'Unknown Market'}
            </span>

            <span>•</span>

            <span className="truncate">
              {p.state || 'Unknown State'}
            </span>
          </div>

          {/* Main Price */}
          <div className="flex items-end justify-between mt-4">
            <div>
              <p
                className="text-[10px] font-medium uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}
              >
                Typical price
              </p>

              <div className="flex items-baseline gap-1 mt-0.5">
                <span
                  className="text-2xl font-bold font-numeric tracking-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {pricing.convertedModal}
                </span>
              </div>
            </div>

            <span
              className="text-[10px] font-medium mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Modal
            </span>
          </div>

          {/* Price Range */}
          <div
            className="flex items-center justify-between mt-3 pt-3"
            style={{
              borderTop: '1px solid var(--border)',
            }}
          >
            <div>
              <p
                className="text-[10px]"
                style={{ color: 'var(--text-muted)' }}
              >
                Lowest
              </p>

              <p
                className="text-xs font-semibold font-numeric mt-0.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                {pricing.minText.split(' ')[0]}
              </p>
            </div>

            <div
              className="h-7 w-px"
              style={{ background: 'var(--border)' }}
            />

            <div className="text-right">
              <p
                className="text-[10px]"
                style={{ color: 'var(--text-muted)' }}
              >
                Highest
              </p>

              <p
                className="text-xs font-semibold font-numeric mt-0.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                {pricing.maxText.split(' ')[0]}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between mt-3 text-[10px]"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              {p.source === 'government_api'
                ? 'Gov Portal'
                : p.source === 'mandi_api'
                ? 'APMC Mandi'
                : p.source}
            </span>

            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {new Date(p.arrival_date).toLocaleDateString()}
            </span>
          </div>
        </div>
      );
    })}
  </div>
)}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="card-surface overflow-hidden">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full">
              <thead
                className="sticky top-0"
                style={{
                  background: 'var(--bg-elevated)',
                }}
              >
                <tr>
                  {[
                    'State',
                    'Market',
                    'Crop',
                    'Min',
                    'Typical',
                    'Max',
                    'Source',
                    'Fresh',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        color: 'var(--text-muted)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="text-sm">
                {prices.slice(0, 150).map((p) => {
                  const pricing = getPriceDetails(
                    p.min_price,
                    p.max_price,
                    p.modal_price,
                    p.source
                  );

                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom:
                          '1px solid var(--border)',
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
                        className="px-4 py-2.5"
                        style={{
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {p.state}
                      </td>

                      <td
                        className="px-4 py-2.5 font-medium"
                        style={{
                          color: 'var(--text-primary)',
                        }}
                      >
                        {p.market}
                      </td>

                      <td className="px-4 py-2.5">
                        <span className="badge badge-success text-[10px]">
                          {p.commodity}
                        </span>
                      </td>

                      <td
                        className="px-4 py-2.5 font-medium font-numeric"
                        style={{
                          color: 'var(--accent)',
                        }}
                      >
                        {pricing.minText.split(' ')[0]}
                      </td>

                      <td
                        className="px-4 py-2.5 font-bold font-numeric"
                        style={{
                          color: 'var(--text-primary)',
                        }}
                      >
                        {pricing.modalText.split(' ')[0]}
                      </td>

                      <td
                        className="px-4 py-2.5 font-numeric"
                        style={{
                          color: 'var(--danger)',
                        }}
                      >
                        {pricing.maxText.split(' ')[0]}
                      </td>

                      <td className="px-4 py-2.5">
                        <span
                          className={`badge text-[10px] ${
                            p.source === 'mandi_api'
                              ? 'badge-info'
                              : p.source === 'government_api'
                              ? 'badge-success'
                              : 'badge-neutral'
                          }`}
                        >
                          {p.source}
                        </span>
                      </td>

                      <td className="px-4 py-2.5">
                        <span
                          className={`badge text-[10px] ${
                            p.data_freshness === 'fresh'
                              ? 'badge-success'
                              : 'badge-warning'
                          }`}
                        >
                          {p.data_freshness}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

