import { useState, useEffect } from 'react';
import { adminAPI, marketAPI } from '../services/api';
import { Users, ShoppingCart, BarChart3, Truck, RefreshCw, Database, Server, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    setLoading(true); setError('');
    try { const res = await adminAPI.getStats(); setStats(res.data); }
    catch (err) { setError(err.response?.data?.error || 'Failed to load system statistics'); }
    finally { setLoading(false); }
  };

  const handleSync = async () => {
    setSyncing(true); setSyncResult(null);
    try {
      const res = await marketAPI.sync();
      setSyncResult({ success: true, message: `Sync completed! ${res.data.records} new records, ${res.data.skipped || 0} skipped.`, timestamp: new Date().toLocaleTimeString() });
      await loadStats();
    } catch (err) { setSyncResult({ success: false, message: err.response?.data?.error || 'Sync failed.' }); }
    finally { setSyncing(false); }
  };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--bg-overlay)', borderTopColor: 'var(--accent)' }} />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold gradient-text">Admin Control Center</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>System administration and data health</p>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.10)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.15)' }}>
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {[
          { icon: Users, label: 'System Users', value: stats?.users?.total || 0, sub: `Farmers: ${stats?.users?.farmers || 0} | Buyers: ${stats?.users?.buyers || 0}`, color: 'var(--info)', bg: 'rgba(59,130,246,0.12)' },
          { icon: ShoppingCart, label: 'Marketplace Volume', value: `₹${parseFloat(stats?.marketplace?.totalValue || 0).toLocaleString()}`, sub: `${stats?.marketplace?.activeListings || 0} active listings`, color: 'var(--accent)', bg: 'rgba(34,197,94,0.1)' },
          { icon: BarChart3, label: 'Live Mandi Prices', value: stats?.marketData?.mandiCount || 0, sub: `Gov: ${stats?.marketData?.govCount || 0} records`, color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)' },
          { icon: Database, label: 'Historical Database', value: (stats?.historicalData?.count || 0).toLocaleString(), sub: `${stats?.historicalData?.minDate ? new Date(stats.historicalData.minDate).getFullYear() : 'N/A'} - ${stats?.historicalData?.maxDate ? new Date(stats.historicalData.maxDate).getFullYear() : 'N/A'}`, color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
        ].map(({ icon: Icon, label, value, sub, color, bg }) => (
          <div key={label} className="card-surface p-5 hover-lift">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</span>
              <div className="p-2 rounded-lg" style={{ background: bg }}><Icon className="h-5 w-5" style={{ color }} /></div>
            </div>
            <p className="text-2xl font-bold font-numeric" style={{ color: 'var(--text-primary)' }}>{value}</p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Main Admin Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sync Panel */}
        <div className="card-surface p-5 space-y-4 lg:col-span-2">
          <div className="border-b pb-2 flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
            <h3 className="font-bold text-base flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
              <Server className="h-5 w-5" style={{ color: 'var(--accent)' }} />
              Mandi Ingestion & Sync
            </h3>
            {stats?.marketData?.latestSync && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Last: {new Date(stats.marketData.latestSync).toLocaleString()}
              </span>
            )}
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Triggers retrieval of fresh commodity prices from Gov APIs (APMC Mandis).
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button onClick={handleSync} disabled={syncing}
              className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? 'Syncing...' : 'Sync Market Prices'}
            </button>
          </div>
          {syncResult && (
            <div className={`p-4 rounded-lg text-sm flex items-start gap-2 ${syncResult.success ? '' : ''}`}
              style={{
                background: syncResult.success ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
                color: syncResult.success ? 'var(--accent)' : '#dc2626',
                border: `1px solid ${syncResult.success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`
              }}>
              {syncResult.success ? <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />}
              <div>
                <p className="font-semibold">{syncResult.success ? 'Sync Succeeded' : 'Sync Failed'}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{syncResult.message}</p>
                {syncResult.timestamp && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>At: {syncResult.timestamp}</p>}
              </div>
            </div>
          )}
        </div>

        {/* System Status */}
        <div className="card-surface p-5 space-y-4">
          <div className="border-b pb-2" style={{ borderColor: 'var(--border)' }}>
            <h3 className="font-bold text-base flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
              <Truck className="h-5 w-5" style={{ color: 'var(--info)' }} />
              Logistics & Health
            </h3>
          </div>
          <div className="space-y-3.5 text-sm">
            {[
              ['Routing Provider', stats?.logistics?.provider || 'OSRM'],
              ['Active Routes', stats?.logistics?.activeRoutes || 0],
              ['Completed Deliveries', stats?.logistics?.completedDeliveries || 0],
              ['Total Distance', `${stats?.logistics?.totalDistanceKm || 0} km`],
              ['Transport Volume', `₹${stats?.logistics?.totalTransportCost || 0}`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center">
                <span style={{ color: 'var(--text-muted)' }} className="font-semibold">{label}</span>
                <span className="font-bold font-numeric" style={{ color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
            <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
              <div className="flex justify-between items-center text-xs">
                <span style={{ color: 'var(--text-muted)' }} className="font-semibold">Database</span>
                <span className="font-bold" style={{ color: 'var(--accent)' }}>● {stats?.health?.database || 'UP'}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span style={{ color: 'var(--text-muted)' }} className="font-semibold">Email Service</span>
                <span className="font-bold" style={{ color: stats?.health?.email === 'CONFIGURED' ? 'var(--accent)' : 'var(--warning)' }}>
                  ● {stats?.health?.email || 'UNCONFIGURED'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span style={{ color: 'var(--text-muted)' }} className="font-semibold">Mandi Sync</span>
                <span className="font-semibold uppercase" style={{ color: 'var(--text-primary)' }}>{stats?.syncJobs?.status || 'NONE'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
