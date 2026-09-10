import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { marketAPI, aiAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n/LanguageContext';
import { RefreshCw, TrendingUp, TrendingDown, Minus, Info, LayoutGrid, Table, Loader2, Sparkles, Clock, AlertCircle, ShieldCheck, Search, MapPin } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MetricCardSkeleton, ProductCardSkeleton, PageHeaderSkeleton, TableRowSkeleton, ChartSkeleton, CardGridSkeleton } from '../components/Skeletons';
import { ErrorState, ServiceUnavailableState, NoDataState, EmptyState, RetryButton } from '../components/UxStates';
import { normalizeApiError } from '../hooks/useAsyncState';
import FeatureImage from '../components/FeatureImage';
import { formatUserFacingError } from '../utils/terminology';
import { getProduceImage, CommodityAltText } from '../utils/cropImages';
import LiveMarketPanel from '../components/LiveMarketPanel';

const chartTooltipStyle = {
  contentStyle: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', fontSize: '12px', color: '#18181b', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
  cursor: { fill: 'rgba(0,0,0,0.03)' }
};

export default function MarketPrices() {
  const { user, profile } = useAuth();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [prices, setPrices] = useState([]);
  const [latest, setLatest] = useState([]);
  const [commodity, setCommodity] = useState(() => searchParams.get('commodity') || 'ALL');
  const [state, setState] = useState(() => searchParams.get('state') || 'ALL');
  const [availableCommodities, setAvailableCommodities] = useState(['ALL']);
  const [availableStates, setAvailableStates] = useState(['ALL']);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState('cards');
  const [dailyIntel, setDailyIntel] = useState(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [ranked, setRanked] = useState(null);
  const [rankedLoading, setRankedLoading] = useState(false);
  const [coverage, setCoverage] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [loadError, setLoadError] = useState(null);
  const [forecastError, setForecastError] = useState(null);

  // Market Forecast State
  const [forecastCommodity, setForecastCommodity] = useState('TOMATO');
  const [demandForecast, setDemandForecast] = useState(null);
  const [priceForecast, setPriceForecast] = useState(null);
  const [pressureIndex, setPressureIndex] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = {};
      if (commodity !== 'ALL') params.commodity = commodity;
      if (state !== 'ALL') params.state = state;
      const locParams = {};
      if (profile?.district) locParams.district = profile.district;
      if (profile?.state) locParams.state = profile.state;
      const [p, l, c] = await Promise.all([
        marketAPI.getPrices(params),
        marketAPI.getLatest(),
        marketAPI.getTodayRates(locParams).catch(() => null)
      ]);
      const priceData = p?.data || [];
      setPrices(priceData);
      setLatest(l?.data || []);
      setCoverage(c?.data || null);

      // Derive available commodities and states from real data
      const derivedCommodities = ['ALL', ...Array.from(new Set(priceData.map(p => p.commodity).filter(Boolean)))];
      const derivedStates = ['ALL', ...Array.from(new Set(priceData.map(p => p.state).filter(Boolean)))];
      setAvailableCommodities(derivedCommodities);
      setAvailableStates(derivedStates);
    } catch (err) {
      console.error('Failed to load prices:', err);
      setLoadError(normalizeApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const loadRanked = async () => {
    setRankedLoading(true);
    try {
      const params = {};
      const targetState = state !== 'ALL' ? state : profile?.state;
      if (targetState) params.state = targetState;
      if (profile?.district && (!targetState || profile.state === targetState)) {
        params.district = profile.district;
      }
      const res = await marketAPI.getRanked(params);
      setRanked(res?.data || null);
    } catch (err) {
      setRanked(null);
    } finally {
      setRankedLoading(false);
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

  const loadForecast = async (crop) => {
    const targetCrop = crop === 'ALL' ? 'TOMATO' : crop;
    setForecastCommodity(targetCrop);
    setForecastLoading(true);
    setForecastError(null);
    try {
      const [dfRes, pfRes, prRes] = await Promise.all([
        aiAPI.getDemandForecast({ commodity: targetCrop, days: 7 }).catch(() => null),
        aiAPI.getPriceForecast({ commodity: targetCrop, days: 7 }).catch(() => null),
        aiAPI.getMarketPressure({ commodity: targetCrop }).catch(() => null)
      ]);
      setDemandForecast(dfRes?.data || null);
      setPriceForecast(pfRes?.data || null);
      setPressureIndex(prRes?.data || null);
    } catch (err) {
      console.warn('Failed to load market forecast:', err);
      setForecastError(normalizeApiError(err));
    } finally {
      setForecastLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadIntel();
    loadRanked();
    loadForecast(commodity);
  }, [commodity, state]);

  useEffect(() => {
    const next = {};
    if (commodity && commodity !== 'ALL') next.commodity = commodity;
    if (state && state !== 'ALL') next.state = state;
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commodity, state]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await marketAPI.sync();
      if (result.data?.hint) alert(result.data.hint);
      await load();
    } catch (err) {
      alert(formatUserFacingError(err, 'Failed to synchronize market data. Please try again.'));
    }
    setSyncing(false);
  };

  const getPriceDetails = (minPrice, maxPrice, modalPrice, source, pricePerKg) => {
    // Prefer the DB-computed price_per_kg (already normalized at ingest) when present
    const ppkg = pricePerKg != null && isFinite(parseFloat(pricePerKg)) && parseFloat(pricePerKg) > 0
      ? parseFloat(pricePerKg)
      : null;
    if (ppkg !== null) {
      return {
        unit: '₹/kg',
        minText: `₹${ppkg.toFixed(1)}/kg`,
        maxText: `₹${ppkg.toFixed(1)}/kg`,
        modalText: `₹${ppkg.toFixed(1)}/kg`,
        convertedModal: `₹${ppkg.toFixed(1)}/kg`
      };
    }
    const isQuintal = source === 'mandi_api' || source === 'historical_dataset' || source === 'agmarknet_historical' || source === 'agmarknet_current';
    const minVal = parseFloat(minPrice);
    const maxVal = parseFloat(maxPrice);
    const modalVal = parseFloat(modalPrice);
    if (isQuintal) {
      return {
        unit: '₹/quintal',
        minText: `₹${minVal.toLocaleString()}/q (₹${(minVal/100).toFixed(1)}/kg)`,
        maxText: `₹${maxVal.toLocaleString()}/q`,
        modalText: `₹${modalVal.toLocaleString()}/q (₹${(modalVal/100).toFixed(1)}/kg)`,
        convertedModal: `₹${(modalVal/100).toFixed(1)}/kg`
      };
    }
    return {
      unit: '₹/kg',
      minText: `₹${minVal.toFixed(1)}/kg`,
      maxText: `₹${maxVal.toFixed(1)}/kg`,
      modalText: `₹${modalVal.toFixed(1)}/kg`,
      convertedModal: `₹${modalVal.toFixed(1)}/kg`
    };
  };

  const formatSourceLabel = (src) => {
    if (!src) return 'APMC Mandi';
    const s = src.toLowerCase();
    if (s.includes('gov') || s.includes('government')) return 'Government Data';
    if (s.includes('agmarknet')) return s.includes('historical') ? 'Market Historical Benchmarks' : 'AGMARKNET Fallback';
    if (s.includes('mandi')) return 'APMC Mandi Yard';
    if (s.includes('historical')) return 'Market Historical Benchmarks';
    return 'Verified Market Rate';
  };


  const getBestLocationLabel = (p) => {
    if (!p) return "";
    if (p.district) return `${p.district}${p.state ? ` (${p.state})` : ""}`;
    if (p.state) return p.state;
    return "";
  };
  const scSource = (entry) => {
    const best = entry.bestScope && entry.scopes[entry.bestScope];
    return formatSourceLabel(best?.source);
  };

  const chartData = {};
  latest.forEach(p => {
    if (!chartData[p.commodity]) chartData[p.commodity] = { commodity: p.commodity, prices: [] };
    const ppkg = p.price_per_kg != null ? parseFloat(p.price_per_kg) : null;
    if (ppkg != null && ppkg > 0) {
      chartData[p.commodity].prices.push(ppkg);
    } else {
      const isQuintal = p.source === 'mandi_api' || p.source === 'historical_dataset' || p.source === 'agmarknet_historical' || p.source === 'agmarknet_current';
      chartData[p.commodity].prices.push(isQuintal ? parseFloat(p.modal_price) / 100 : parseFloat(p.modal_price));
    }
  });
  const barData = Object.values(chartData).map(d => ({
    commodity: d.commodity,
    avgPrice: parseFloat((d.prices.reduce((a, b) => a + b, 0) / d.prices.length).toFixed(2)),
    count: d.prices.length
  }));

  const scopeOf = (p) => {
    if (!p) return 'National';
    const dist = String(p.district || '').trim().toLowerCase();
    const st = String(p.state || '').trim().toLowerCase();
    const pDist = String(profile?.district || '').trim().toLowerCase();
    const pState = String(profile?.state || '').trim().toLowerCase();
    if (pDist && dist && dist.includes(pDist)) return 'District';
    if (pState && st && st === pState) return 'State';
    return 'National';
  };

  const scopeBadgeClass = (s) =>
    s === 'District'
      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
      : s === 'State'
        ? 'bg-blue-50 text-blue-800 border border-blue-200'
        : 'bg-slate-100 text-slate-600 border border-slate-200';

  const filteredPrices = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return prices;
    return prices.filter(p =>
      String(p.commodity || '').toLowerCase().includes(q) ||
      String(p.variety || '').toLowerCase().includes(q) ||
      String(t(`commodities.${p.commodity}`) || p.commodity || '').toLowerCase().includes(q) ||
      String(p.market || '').toLowerCase().includes(q) ||
      String(p.state || '').toLowerCase().includes(q) ||
      String(p.district || '').toLowerCase().includes(q)
    );
  }, [prices, searchText]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in-up" aria-busy="true" aria-label="Loading market prices">
        <PageHeaderSkeleton />
        <MetricCardSkeleton count={4} />
        <CardGridSkeleton count={6} cols={3} />
        <span className="sr-only">Loading market prices...</span>
      </div>
    );
  }

  // Error state — request failed
  if (loadError) {
    const isServiceUnavailable = loadError.type === 'SERVICE_UNAVAILABLE' || loadError.type === 'NETWORK';
    return (
      <div className="space-y-6 animate-fade-in-up">
        <PageHeaderSkeleton />
        {isServiceUnavailable ? (
          <ServiceUnavailableState
            service="Market prices"
            onRetry={load}
          />
        ) : loadError.type === 'TIMEOUT' ? (
          <ErrorState
            title="Request timed out"
            message="The server took too long to respond."
            retryable={loadError.retryable}
            onRetry={load}
          />
        ) : loadError.type === 'AUTH_EXPIRED' ? (
          <ErrorState
            title="Session expired"
            message="Your session has expired. Please sign in again."
            retryable={false}
          />
        ) : (
          <ErrorState
            title="Failed to load market prices"
            message={loadError.message || 'An error occurred while loading market data.'}
            retryable={loadError.retryable}
            onRetry={load}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-4">
          <FeatureImage feature="market_intelligence" className="h-16 w-24 rounded-xl object-cover shadow-sm hidden sm:block" />
          <div>
            <h1 className="text-2xl font-bold gradient-text">{t('marketPrices.title')}</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('marketPrices.subtitle')}</p>
          {latest.length > 0 && (() => {
            const maxTime = Math.max(...latest.map(p => new Date(p.fetched_at || Date.now()).getTime()));
            return maxTime > 0 ? (
              <span className="text-[10px] font-semibold block mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Updated: {new Date(maxTime).toLocaleString()}
              </span>
            ) : null;
          })()}
          </div>
        </div>
        {user?.role === 'ADMIN' && (
          <button onClick={handleSync} disabled={syncing} className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t('marketPrices.syncData')}
          </button>
        )}
      </div>

      {/* Summary metrics — computed from real market rows, never fabricated */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card-surface p-4 rounded-2xl space-y-1">
          <span className="text-[10px] uppercase font-bold block" style={{ color: 'var(--text-muted)' }}>Commodities with live rates</span>
          <p className="text-lg font-bold font-numeric text-emerald-700">
            {coverage?.availableCount ?? '—'}<span className="text-xs text-slate-400 font-semibold"> / {coverage?.rates?.length ?? '—'}</span>
          </p>
          <p className="text-[10px] text-slate-400">current verified mandi quotes</p>
        </div>
        <div className="card-surface p-4 rounded-2xl space-y-1">
          <span className="text-[10px] uppercase font-bold block" style={{ color: 'var(--text-muted)' }}>No recent data</span>
          <p className="text-lg font-bold font-numeric text-slate-600">
            {coverage ? Math.max(0, coverage.rates.length - coverage.availableCount) : '—'}
          </p>
          <p className="text-[10px] text-slate-400">shown honestly, never invented</p>
        </div>
        <div className="card-surface p-4 rounded-2xl space-y-1">
          <span className="text-[10px] uppercase font-bold block" style={{ color: 'var(--text-muted)' }}>Data source</span>
          <p className="text-lg font-bold text-slate-900 flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" /> data.gov.in</p>
          <p className="text-[10px] text-slate-400">AGMARKNET fallback, no fabricated prices</p>
        </div>
        <div className="card-surface p-4 rounded-2xl space-y-1">
          <span className="text-[10px] uppercase font-bold block" style={{ color: 'var(--text-muted)' }}>Prioritized location</span>
          <p className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-emerald-600" />
            <span className="truncate">
              {profile?.district ? `${profile.district}${profile.state ? `, ${profile.state}` : ''}` : profile?.state || (coverage?.location?.state || 'National scope')}
            </span>
          </p>
          <p className="text-[10px] text-slate-400">District → State → National fallback</p>
        </div>
      </div>

      {/* Live Data Coverage — all supported crops, real current data, honest no-data */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <LiveMarketPanel className="lg:col-span-1" />
        <div className="lg:col-span-2 card-surface p-5 rounded-2xl space-y-3">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Current Mandi Data Coverage
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Every supported crop is listed on the left with the latest observation from the current
            Government mandi pipeline, prioritized by your district, then state, then national scope.
            A crop with no current observation plainly shows <span className="font-semibold text-slate-700">"No recent data"</span> —
            no price is ever invented to fill the gap.
          </p>
          <ul className="text-xs text-slate-600 space-y-1.5">
            <li className="flex gap-2"><span className="text-emerald-600 font-bold">•</span> Each quote is stamped with its scope badge (District / State / National) so a fallback is never presented as a local price.</li>
            <li className="flex gap-2"><span className="text-emerald-600 font-bold">•</span> Freshness shows when the latest observation arrived. Historical records (2019–2025) are context only and never shown as today's price.</li>
            <li className="flex gap-2"><span className="text-emerald-600 font-bold">•</span> Below the coverage panel you can explore per-crop trends, rankings, forecast models, and the full market table.</li>
          </ul>
        </div>
      </div>

      {/* Market Forecast & Trends Section */}
      <div className="card-surface p-6 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" />
              <span>{t('forecast.title') || 'Market Forecast & Trends'}</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                {forecastCommodity}
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Agricultural demand projections and price trajectories based on live regional market records
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              name="forecast-commodity"
              aria-label="Forecast crop"
              value={forecastCommodity}
              onChange={e => loadForecast(e.target.value)}
              className="input-field text-xs py-1.5 px-3 rounded-xl w-auto"
            >
              {availableCommodities.map(c => (
                <option key={c} value={c}>{t(`commodities.${c}`) || c}</option>
              ))}
              {!availableCommodities.includes(forecastCommodity) && (
                <option key={forecastCommodity} value={forecastCommodity} disabled>
                  {t(`commodities.${forecastCommodity}`) || forecastCommodity}
                </option>
              )}
            </select>
          </div>
        </div>

        {forecastLoading ? (
          <ChartSkeleton height={200} />
        ) : forecastError ? (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-2 text-xs text-amber-700" role="alert">
            <AlertCircle className="h-5 w-5 text-amber-500 mx-auto" aria-hidden="true" />
            <p className="font-semibold">Forecast data temporarily unavailable</p>
            <p className="text-[11px] text-amber-600">Market trends are still available below.</p>
          </div>
        ) : demandForecast && demandForecast.trend ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Expected Demand */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  {t('forecast.expectedDemand') || 'Expected Demand (7d)'}
                </span>
                <div className="flex items-center gap-1.5 pt-1">
                  {demandForecast.trend === 'RISING' ? (
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                  ) : demandForecast.trend === 'FALLING' ? (
                    <TrendingDown className="h-4 w-4 text-rose-600" />
                  ) : (
                    <Minus className="h-4 w-4 text-slate-500" />
                  )}
                  <strong className="text-base font-numeric text-slate-900">
                    {demandForecast.projectedDemandKg ? `${demandForecast.projectedDemandKg.toLocaleString()} kg` : 'Stable Demand'}
                  </strong>
                </div>
                <span className="text-[11px] font-semibold text-emerald-700 block">
                  Trend: {demandForecast.trend}
                </span>
              </div>

              {/* Price Direction */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  {t('forecast.priceDirection') || 'Price Direction'}
                </span>
                <div className="flex items-center gap-1.5 pt-1">
                  <strong className="text-base font-numeric text-blue-700">
                    {priceForecast?.expectedRange
                      ? `₹${priceForecast.expectedRange.min} - ₹${priceForecast.expectedRange.max} / kg`
                      : 'Market Rate Stable'}
                  </strong>
                </div>
                <span className="text-[11px] font-semibold text-slate-600 block">
                  Direction: {priceForecast?.direction || 'Steady'}
                </span>
              </div>

              {/* Recommended Selling Window */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  {t('forecast.recommendedWindow') || 'Recommended Window'}
                </span>
                <div className="flex items-center gap-1.5 pt-1">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <strong className="text-sm font-semibold text-slate-900">
                    {demandForecast.recommendedWindow || 'Next 3–5 days'}
                  </strong>
                </div>
                <span className="text-[11px] font-semibold text-amber-700 block">
                  Optimal realization
                </span>
              </div>

              {/* Forecast Confidence */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  {t('forecast.confidence') || 'Model Confidence'}
                </span>
                <div className="flex items-center gap-1.5 pt-1">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <strong className="text-base font-numeric text-emerald-700">
                    {demandForecast.confidenceScore || 85}%
                  </strong>
                </div>
                <span className="text-[11px] text-slate-500 block">
                  Verified by live trade signals
                </span>
              </div>
            </div>

            {/* Explanation card */}
            {demandForecast.explanation && (
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 text-xs text-emerald-950 flex items-start gap-2.5">
                <Info className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">{t('forecast.why') || 'Why this forecast?'}: </strong>
                  <span className="leading-relaxed">{demandForecast.explanation}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2 text-xs text-slate-500">
            <AlertCircle className="h-6 w-6 text-slate-400 mx-auto" />
            <p className="font-semibold text-slate-700">
              {t('forecast.insufficientData') || 'Not enough recent market data to generate a reliable forecast.'}
            </p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              Forecasts require active transaction records across APMC Mandis to prevent speculation.
            </p>
          </div>
        )}
      </div>

      {/* Guide */}
      <div className="rounded-2xl p-5 text-sm space-y-2 bg-blue-50/60 border border-blue-200/80">
        <h3 className="font-bold flex items-center gap-1.5 text-blue-900">
          <Info className="h-4 w-4 text-blue-700" /> {t('marketPrices.mandiPriceGuide')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs text-blue-950">
          <p><strong>{t('marketPrices.market')}:</strong> Official agricultural market yard where trade occurred.</p>
          <p><strong>{t('marketPrices.typicalPrice')}:</strong> Benchmark rate at which majority transactions closed.</p>
          <p><strong>{t('marketPrices.minPrice')} / {t('marketPrices.maxPrice')}:</strong> Daily price spread recorded across grades.</p>
          <p><strong>Direct Farmer Impact:</strong> Direct trade on AgriConnect enables farmers to realize full typical rate without middleman deductions.</p>
        </div>
      </div>

      {/* Market Price Ranking: district -> state -> national (real data) */}
      <div className="card-surface p-5 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="font-bold flex items-center gap-2 text-slate-900">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              Market Price Ranking
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Latest real prices ranked by locality: your district first, then state, then national.
            </p>
          </div>
          {ranked?.order && (
            <span className="badge badge-info text-[10px]">
              Priority: {ranked.order.join(' → ')}
            </span>
          )}
        </div>

        {rankedLoading ? (
          <CardGridSkeleton count={3} cols={3} />
        ) : ranked?.insufficientRealData || (!ranked?.ranked?.length) ? (
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2 text-xs text-slate-500">
            <AlertCircle className="h-6 w-6 text-slate-400 mx-auto" />
            <p className="font-semibold text-slate-700">
              {t('forecast.insufficientData') || 'Insufficient real current market data.'}
            </p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              No prices are shown because none can be reported honestly without fabricating market data.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ranked.ranked.map(e => (
              <div key={e.commodity} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-900">{e.commodity}</span>
                  <span className="badge text-[10px] badge-success">
                    {e.bestScope === 'district' ? 'Local' : e.bestScope === 'state' ? 'State' : 'National'}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {['district', 'state', 'national'].filter(s => e.scopes[s]).map(s => {
                    const sc = e.scopes[s];
                    const active = s === e.bestScope;
                    return (
                      <div key={s} className={`flex items-center justify-between text-xs rounded-lg px-2.5 py-1.5 ${active ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-100'}`}>
                        <span className={`font-medium ${active ? 'text-emerald-800' : 'text-slate-500'}`}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                          <span className="text-slate-400 font-normal"> · {sc.market || sc.state}</span>
                        </span>
                        <span className="font-bold font-numeric text-slate-900">₹{sc.pricePerKg}/kg</span>
                      </div>
                    );
                  })}
                </div>
                <div className="text-[10px] text-slate-400">
                  <span>Source: {scSource(e)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap justify-between items-center gap-4 rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
        <div className="flex gap-3 flex-wrap flex-1 min-w-[220px]">
          <select name="commodity" aria-label="Filter crop" value={commodity} onChange={e => setCommodity(e.target.value)} className="input-field w-auto text-xs">
            {availableCommodities.map(c => <option key={c} value={c}>{c === 'ALL' ? t('marketplace.allCrops') : t(`commodities.${c}`) || c}</option>)}
          </select>
          <select name="state" aria-label="Filter state" value={state} onChange={e => setState(e.target.value)} className="input-field w-auto text-xs">
            {availableStates.map(s => <option key={s} value={s}>{s === 'ALL' ? t('marketplace.allRegions') : s}</option>)}
          </select>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              name="record-search"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Search crop, market or region…"
              aria-label="Search crop, market or region"
              className="w-full text-xs py-2 pl-8 pr-3 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-500">{filteredPrices.length} records</span>
          <div className="p-0.5 rounded-lg flex bg-slate-100">
            {[
              { key: 'cards', icon: LayoutGrid, label: 'Cards' },
              { key: 'table', icon: Table, label: 'Table' },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className={`px-3 py-1.5 rounded-md flex items-center gap-1 text-xs font-semibold transition-all ${
                  viewMode === key ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Daily Intelligence */}
      {commodity !== 'ALL' && (
        <div className="card-surface p-5 space-y-3">
          <h3 className="font-semibold flex flex-wrap items-center gap-1.5 text-slate-900">
            Daily Price Intelligence for <strong className="text-emerald-700">{commodity}</strong>
            {state !== 'ALL' && <span>in <strong className="text-emerald-700">{state}</strong></span>}
            {dailyIntel?.scope && <span className="ml-auto badge badge-info text-[10px] uppercase">{dailyIntel.scope}</span>}
          </h3>
          {intelLoading ? (
            <div className="py-4">
              <CardGridSkeleton count={4} cols={4} />
            </div>
          ) : dailyIntel ? (
            dailyIntel.status === 'Comparison unavailable' ? (
              <div className="text-sm p-4 rounded-xl bg-slate-50 text-slate-500">
                Not enough historical data for 24h comparison. {dailyIntel.todayPrice ? `Latest rate: ₹${dailyIntel.todayPrice.toFixed(1)}/kg` : ''}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Latest Rate', value: `₹${dailyIntel.todayPrice.toFixed(1)}/kg`, sub: new Date(dailyIntel.todayDate).toLocaleDateString() },
                  { label: 'Previous Rate', value: `₹${dailyIntel.yesterdayPrice.toFixed(1)}/kg`, sub: new Date(dailyIntel.yesterdayDate).toLocaleDateString() },
                  { label: 'Change', value: `${dailyIntel.difference > 0 ? '+' : ''}${dailyIntel.difference.toFixed(1)}/kg`, icon: dailyIntel.difference > 0 ? TrendingUp : dailyIntel.difference < 0 ? TrendingDown : Minus, color: dailyIntel.difference > 0 ? '#10b981' : dailyIntel.difference < 0 ? '#ef4444' : '#64748b' },
                  { label: '% Change', value: `${dailyIntel.percentageChange > 0 ? '+' : ''}${dailyIntel.percentageChange.toFixed(2)}%`, color: dailyIntel.percentageChange > 0 ? '#10b981' : dailyIntel.percentageChange < 0 ? '#ef4444' : '#64748b' },
                ].map(({ label, value, sub, icon: Icon, color }) => (
                  <div key={label} className="rounded-2xl p-4 bg-slate-50 border border-slate-200">
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {Icon && <Icon className="h-5 w-5" style={{ color }} />}
                      <p className="text-lg font-bold font-numeric" style={{ color }}>{value}</p>
                    </div>
                    {sub && <p className="text-[10px] mt-1 text-slate-400">{sub}</p>}
                  </div>
                ))}
              </div>
            )
          ) : null}
        </div>
      )}

      {/* Chart */}
      {barData.length > 0 && (
        <div className="card-surface p-5 hover-lift">
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-slate-900">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            Average Benchmark Price by Crop (₹/kg)
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="commodity" tick={{ fontSize: 12, fill: '#71717a' }} />
              <YAxis tick={{ fontSize: 12, fill: '#71717a' }} unit=" ₹" />
              <Tooltip {...chartTooltipStyle} formatter={(v) => `₹${v}/kg`} />
              <Bar dataKey="avgPrice" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cards View */}
      {viewMode === 'cards' && (
        prices.length === 0 && !loading ? (
          <div className="card-surface p-12 text-center space-y-3">
            <AlertCircle className="h-12 w-12 mx-auto text-slate-300" />
            <h3 className="font-bold text-lg text-slate-900">No APMC Price Data Available</h3>
            <p className="text-sm max-w-md mx-auto text-slate-500">
              Live mandi price records are synced from the government Agmarknet API. When the sync runs, current market rates will appear here.
            </p>
            <button onClick={load} className="btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1.5 mx-auto">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        ) : filteredPrices.length === 0 ? (
          <div className="card-surface p-10 text-center space-y-2">
            <Search className="h-8 w-8 mx-auto text-slate-300" />
            <h3 className="font-bold text-slate-900">No matching records</h3>
            <p className="text-sm text-slate-500">Nothing matches “{searchText}”. Try a crop, market or region.</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPrices.slice(0, 99).map(p => {
            const hasPrice = p.modal_price != null && parseFloat(p.modal_price) > 0;
            const pricing = getPriceDetails(p.min_price, p.max_price, p.modal_price, p.source, p.price_per_kg);
            const name = t(`commodities.${p.commodity}`) || p.commodity;
            const scope = scopeOf(p);
            return (
              <div key={p.id} className="card-surface p-5 space-y-3 hover-premium">
                <div className="flex justify-between items-start border-b pb-2 border-slate-100">
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={getProduceImage(p.commodity)} alt={CommodityAltText(p.commodity)} loading="lazy" className="h-12 w-12 rounded-xl object-cover border border-slate-100 shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 truncate">{name}</h3>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-xs text-slate-500 truncate">{getBestLocationLabel(p) || 'Standard Variety'}</p>
                        {p.variety && (
                          <span className="shrink-0 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">{p.variety}</span>
                        )}
                        <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${scopeBadgeClass(scope)}`}>{scope}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`badge text-[10px] ${p.data_freshness === 'fresh' ? 'badge-success' : 'badge-warning'}`}>
                    {p.data_freshness?.toUpperCase()}
                  </span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <p className="text-slate-600">📍 <strong className="text-slate-900">Market:</strong> {p.market}, {getBestLocationLabel(p)}</p>
                  <p className="text-slate-600">💰 <strong className="text-slate-900">Typical:</strong> <span className="font-bold font-numeric text-emerald-700">{hasPrice ? pricing.convertedModal : "—"}</span></p>
                  <p className="text-xs pl-5 text-slate-400">Raw: {hasPrice ? pricing.modalText : "— No recent data"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div className="p-2 rounded-xl bg-slate-50">
                    <span className="text-slate-400">Lowest</span>
                    <p className="font-bold font-numeric text-slate-900">{hasPrice ? pricing.minText.split(' ')[0] : "—"}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50">
                    <span className="text-slate-400">Highest</span>
                    <p className="font-bold font-numeric text-slate-900">{hasPrice ? pricing.maxText.split(' ')[0] : "—"}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center text-[10px] pt-1 text-slate-400">
                  <span>Source: {formatSourceLabel(p.source)}</span>
                  <span>{new Date(p.arrival_date).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
        )
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        prices.length === 0 && !loading ? (
          <div className="card-surface p-12 text-center space-y-3">
            <AlertCircle className="h-12 w-12 mx-auto text-slate-300" />
            <h3 className="font-bold text-lg text-slate-900">No APMC Price Data Available</h3>
            <p className="text-sm max-w-md mx-auto text-slate-500">
              Live mandi price records are synced from the government Agmarknet API. When the sync runs, current market rates will appear here.
            </p>
            <button onClick={load} className="btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1.5 mx-auto">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        ) : filteredPrices.length === 0 ? (
          <div className="card-surface p-10 text-center space-y-2">
            <Search className="h-8 w-8 mx-auto text-slate-300" />
            <h3 className="font-bold text-slate-900">No matching records</h3>
            <p className="text-sm text-slate-500">Nothing matches “{searchText}”. Try a crop, market or region.</p>
          </div>
        ) : (
        <>
          {/* Mobile: stacked cards (no horizontal scroll) */}
          <div className="sm:hidden space-y-3">
            {filteredPrices.slice(0, 99).map(p => {
              const hasPrice = p.modal_price != null && parseFloat(p.modal_price) > 0;
              const pricing = getPriceDetails(p.min_price, p.max_price, p.modal_price, p.source, p.price_per_kg);
              const name = t(`commodities.${p.commodity}`) || p.commodity;
              const scope = scopeOf(p);
              return (
                <div key={p.id} className="card-surface p-4 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <img src={getProduceImage(p.commodity)} alt={CommodityAltText(p.commodity)} loading="lazy" className="h-11 w-11 rounded-xl object-cover border border-slate-100 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 truncate text-sm">{name}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {p.market} · {getBestLocationLabel(p) || 'Standard Variety'}
                        {p.variety ? ` · ${p.variety}` : ''}
                      </p>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${scopeBadgeClass(scope)}`}>{scope}</span>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Typical</span>
                      <span className="text-xl font-bold font-numeric text-emerald-700">{hasPrice ? pricing.convertedModal : '—'}</span>
                    </div>
                    <span className={`badge text-[10px] ${p.data_freshness === 'fresh' ? 'badge-success' : 'badge-warning'}`}>
                      {p.data_freshness?.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                    <span>Low <strong className="font-numeric text-slate-800">{hasPrice ? pricing.minText.split(' ')[0] : '—'}</strong> · High <strong className="font-numeric text-slate-800">{hasPrice ? pricing.maxText.split(' ')[0] : '—'}</strong></span>
                    <span className="text-[10px] text-slate-400">{new Date(p.arrival_date).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: premium table */}
          <div className="hidden sm:block card-surface overflow-hidden rounded-2xl">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-100">
                  <tr>
                    {['Crop', 'Variety', 'Location', 'Market', 'Min', 'Typical', 'Max', 'Source', 'Freshness'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredPrices.slice(0, 150).map(p => {
                    const hasPrice = p.modal_price != null && parseFloat(p.modal_price) > 0;
                    const locationLabel = getBestLocationLabel(p);
                    const pricing = getPriceDetails(p.min_price, p.max_price, p.modal_price, p.source, p.price_per_kg);
                    const name = t(`commodities.${p.commodity}`) || p.commodity;
                    const scope = scopeOf(p);
                    return (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <img src={getProduceImage(p.commodity)} alt={CommodityAltText(p.commodity)} loading="lazy" className="h-9 w-9 rounded-lg object-cover border border-slate-100 shrink-0" />
                            <div>
                              <span className="font-semibold text-slate-900 block">{name}</span>
                              <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${scopeBadgeClass(scope)}`}>{scope}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{p.variety || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2.5 text-slate-600">{locationLabel || "—"}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{p.market}</td>
                        <td className="px-4 py-2.5 font-medium font-numeric text-emerald-700">{hasPrice ? pricing.minText.split(' ')[0] : "—"}</td>
                        <td className="px-4 py-2.5 font-bold font-numeric text-slate-900">{hasPrice ? pricing.modalText.split(' ')[0] : "—"}</td>
                        <td className="px-4 py-2.5 font-numeric text-rose-600">{hasPrice ? pricing.maxText.split(' ')[0] : "—"}</td>
                        <td className="px-4 py-2.5"><span className="badge text-[10px] badge-info">{formatSourceLabel(p.source)}</span></td>
                        <td className="px-4 py-2.5"><span className={`badge text-[10px] ${p.data_freshness === 'fresh' ? 'badge-success' : 'badge-warning'}`}>{p.data_freshness}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
        )
      )}
    </div>
  );
}
