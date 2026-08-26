import { useState, useEffect } from 'react';
import { routeAPI } from '../services/api';
import { MapPin, Clock, Truck, DollarSign } from 'lucide-react';

export default function Logistics() {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ origin: '', destination: '', distanceKm: '', estimatedTime: '', estimatedCost: '', vehicleType: 'truck_1ton' });

  useEffect(() => {
    routeAPI.getAll().then(r => { setRoutes(r.data); setLoading(false); });
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    await routeAPI.create(form);
    setShowAdd(false);
    setForm({ origin: '', destination: '', distanceKm: '', estimatedTime: '', estimatedCost: '', vehicleType: 'truck_1ton' });
    const r = await routeAPI.getAll();
    setRoutes(r.data);
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
          + Add Route
        </button>
      </div>

      {/* Route Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-lg"><MapPin className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Total Routes</p>
              <p className="text-lg font-bold">{routes.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg"><Truck className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Vehicle Types</p>
              <p className="text-lg font-bold">{new Set(routes.map(r => r.vehicle_type)).size}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-2 rounded-lg"><DollarSign className="h-5 w-5 text-amber-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Avg Cost</p>
              <p className="text-lg font-bold">Rs{Math.round(routes.reduce((a, r) => a + parseFloat(r.estimated_cost), 0) / routes.length)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 card-shadow">
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 p-2 rounded-lg"><Clock className="h-5 w-5 text-purple-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Avg Distance</p>
              <p className="text-lg font-bold">{Math.round(routes.reduce((a, r) => a + parseFloat(r.distance_km), 0) / routes.length)} km</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Route Form */}
      {showAdd && (
        <div className="bg-white rounded-xl p-6 card-shadow">
          <h3 className="font-semibold text-gray-900 mb-4">Add New Route</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <input value={form.origin} onChange={e => setForm({ ...form, origin: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" placeholder="Origin" required />
            <input value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" placeholder="Destination" required />
            <input type="number" value={form.distanceKm} onChange={e => setForm({ ...form, distanceKm: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" placeholder="Distance (km)" required />
            <input value={form.estimatedTime} onChange={e => setForm({ ...form, estimatedTime: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" placeholder="Est. Time" required />
            <input type="number" value={form.estimatedCost} onChange={e => setForm({ ...form, estimatedCost: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" placeholder="Cost (Rs)" />
            <select value={form.vehicleType} onChange={e => setForm({ ...form, vehicleType: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
              <option value="truck_1ton">Truck 1 Ton</option>
              <option value="truck_5ton">Truck 5 Ton</option>
              <option value="tempo">Tempo</option>
              <option value="mini_truck">Mini Truck</option>
            </select>
            <div className="sm:col-span-3 lg:col-span-6 flex gap-2">
              <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Create Route</button>
              <button type="button" onClick={() => setShowAdd(false)} className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg text-sm font-medium">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Routes Table */}
      <div className="bg-white rounded-xl card-shadow overflow-hidden">
        <div className="px-5 py-4 border-b"><h3 className="font-semibold text-gray-900">Route Directory</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Origin</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Destination</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Distance</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Est. Time</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost (Rs)</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {routes.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-sm font-medium flex items-center gap-1"><MapPin className="h-3 w-3 text-green-500" />{r.origin}</td>
                  <td className="px-5 py-3 text-sm font-medium flex items-center gap-1"><MapPin className="h-3 w-3 text-red-500" />{r.destination}</td>
                  <td className="px-5 py-3 text-sm">{r.distance_km} km</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{r.estimated_time}</td>
                  <td className="px-5 py-3 text-sm font-medium text-green-700">Rs{parseFloat(r.estimated_cost).toLocaleString()}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{r.vehicle_type?.replace('_', ' ')}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
