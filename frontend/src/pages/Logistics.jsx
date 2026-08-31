import { useState, useEffect } from 'react';
import { routeAPI, vehicleAPI } from '../services/api';
import { MapPin, Clock, Truck, DollarSign, Calculator, Info } from 'lucide-react';

export default function Logistics() {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ origin: '', destination: '', distanceKm: '', estimatedTime: '', estimatedCost: '', vehicleType: 'truck_1ton' });
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState('');
  const [activeDeliveries, setActiveDeliveries] = useState(0);
  const [upcomingPickups, setUpcomingPickups] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [estimatedTransportCost, setEstimatedTransportCost] = useState(0);
  const [vehicleCatalogue, setVehicleCatalogue] = useState([]);

  useEffect(() => {
    vehicleAPI.getAll().then(r => setVehicleCatalogue(r?.data || [])).catch(() => setVehicleCatalogue([]));
    loadRoutes();
  }, []);

  const loadRoutes = () => {
    routeAPI.getAll().then(r => {
      const data = r.data;
      setRoutes(data);
      setLoading(false);
      setActiveDeliveries(data.length);
      setUpcomingPickups(0);
      setTotalDistance(data.reduce((sum, r) => sum + parseFloat(r.distance_km), 0));
      setEstimatedTransportCost(data.reduce((sum, r) => sum + parseFloat(r.estimated_cost), 0));
    });
  };

  const handleEstimate = async () => {
    if (!form.origin || !form.destination) {
      setEstimateError('Please fill in both Origin and Destination first');
      return;
    }
    setEstimating(true);
    setEstimateError('');
    try {
      const res = await routeAPI.estimate(form.origin, form.destination);
      setForm(prev => ({
        ...prev,
        distanceKm: res.data.distanceKm,
        estimatedTime: res.data.estimatedTime,
        estimatedCost: res.data.estimatedCost
      }));
    } catch (err) {
      setEstimateError(err.response?.data?.error || 'Failed to automatically resolve road distance. Try entering major Indian cities like Pune, Mumbai, Nagpur.');
    } finally {
      setEstimating(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    await routeAPI.create(form);
    setShowAdd(false);
    setForm({ origin: '', destination: '', distanceKm: '', estimatedTime: '', estimatedCost: '', vehicleType: 'truck_1ton' });
    setEstimateError('');
    loadRoutes();
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Logistics & Routes</h1>
          <p className="text-gray-500 text-sm">Optimized transport routes and cost estimates</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium">
          {showAdd ? 'Close Panel' : '+ Add Route'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[var(--accent)] rounded-xl p-4 card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-[var(--info)] p-2 rounded-lg"><MapPin className="h-5 w-5 text-[var(--text-primary)]" /></div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Active Deliveries</p>
              <p className="text-lg font-bold text-[var(--text-primary)]">{activeDeliveries}</p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--info)] rounded-xl p-4 card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-[var(--warning)] p-2 rounded-lg"><Truck className="h-5 w-5 text-[var(--text-primary)]" /></div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Upcoming Pickups</p>
              <p className="text-lg font-bold text-[var(--text-primary)]">{upcomingPickups}</p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--info)] rounded-xl p-4 card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-[var(--accent)] p-2 rounded-lg"><Calculator className="h-5 w-5 text-[var(--text-primary)]" /></div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Total Distance</p>
              <p className="text-lg font-bold text-[var(--text-primary)]">{totalDistance} km</p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--info)] rounded-xl p-4 card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-[var(--warning)] p-2 rounded-lg"><DollarSign className="h-5 w-5 text-[var(--text-primary)]" /></div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Est. Transport Cost</p>
              <p className="text-lg font-bold text-[var(--text-primary)]">Rs{estimatedTransportCost}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Route Form */}
      {showAdd && (
        <div className="bg-white rounded-xl p-6 card-shadow space-y-4">
          <div className="flex justify-between items-center border-b pb-2">
            <h3 className="font-semibold text-gray-900">Add New Route</h3>
            <span className="text-xs text-gray-400 bg-gray-50 border px-2 py-0.5 rounded flex items-center gap-1">
              <Info className="h-3.5 w-3.5 text-blue-500" /> Supports OSRM road routing
            </span>
          </div>

          {estimateError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-lg">
              {estimateError}
            </div>
          )}

          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-gray-500 mb-1">Origin City</label>
              <input value={form.origin} onChange={e => setForm({ ...form, origin: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Pune" required />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-gray-500 mb-1">Destination City</label>
              <input value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Mumbai" required />
            </div>
            
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleEstimate}
                disabled={estimating}
                className="w-full bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-100 disabled:opacity-50 flex items-center justify-center gap-1 h-[38px]"
              >
                <Calculator className="h-4 w-4" /> {estimating ? 'Estimating...' : 'Auto-Estimate'}
              </button>
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-semibold text-gray-500 mb-1">Distance (km)</label>
              <input type="number" value={form.distanceKm} onChange={e => setForm({ ...form, distanceKm: e.target.value })} className="px-3 py-2 border rounded-lg text-sm font-numeric" placeholder="Auto-calculated" required />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-gray-500 mb-1">Est. Time</label>
              <input value={form.estimatedTime} onChange={e => setForm({ ...form, estimatedTime: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" placeholder="Auto-calculated" required />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-gray-500 mb-1">Est. Cost (Rs)</label>
              <input type="number" value={form.estimatedCost} onChange={e => setForm({ ...form, estimatedCost: e.target.value })} className="px-3 py-2 border rounded-lg text-sm font-numeric" placeholder="Auto-calculated" required />
            </div>
            
            <div className="flex flex-col sm:col-span-2">
              <label className="text-xs font-semibold text-gray-500 mb-1">Vehicle Type</label>
              <select value={form.vehicleType} onChange={e => setForm({ ...form, vehicleType: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm">
                <option value="truck_1ton">Truck 1 Ton (Tata Ace)</option>
                <option value="truck_5ton">Truck 5 Ton (Eicher)</option>
                <option value="tempo">Tempo</option>
                <option value="mini_truck">Mini Truck</option>
              </select>
            </div>

            <div className="sm:col-span-3 lg:col-span-6 flex gap-2 pt-2">
              <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 shadow-sm">
                Create Route Record
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setEstimateError(''); }} className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Routes Directory */}
      <div className="bg-white rounded-xl card-shadow overflow-hidden">
        <div className="px-5 py-4 border-b flex justify-between items-center">
          <h3 className="font-semibold text-gray-900">Route Directory</h3>
          <span className="text-xs text-gray-400 font-medium">Shows verified logistics paths</span>
        </div>
        
        {routes.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Truck className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold">No routes registered yet</p>
            <p className="text-xs mt-1">Use the panel above to estimate and save routes dynamically.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Origin</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Destination</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Distance</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Est. Time</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trucking Cost</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {routes.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm font-semibold text-gray-700">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-green-600" />
                        {r.origin}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm font-semibold text-gray-700">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-red-600" />
                        {r.destination}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm font-numeric">{r.distance_km} km</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{r.estimated_time}</td>
                    <td className="px-5 py-3 text-sm font-bold text-green-700 font-numeric">Rs{parseFloat(r.estimated_cost).toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-gray-600 capitalize">{r.vehicle_type?.replace('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
