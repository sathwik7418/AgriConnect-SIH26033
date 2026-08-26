import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { profilesAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { Sprout, User, Phone, MapPin, Landmark, Trash2, Plus } from 'lucide-react';

const cropOptions = ['TOMATO', 'ONION', 'POTATO', 'WHEAT', 'RICE', 'CORN', 'BRINJAL', 'LETTUCE', 'MANGO', 'APPLE', 'BANANA'];

export default function Onboarding() {
  const { user, fetchProfile } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Common Fields
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [state, setState] = useState('Maharashtra');
  const [district, setDistrict] = useState('');
  const [location, setLocation] = useState('');

  // Farmer Specific Fields
  const [fpoName, setFpoName] = useState('');
  const [totalLandArea, setTotalLandArea] = useState('');
  const [selectedCrops, setSelectedCrops] = useState([]);

  // Buyer Specific Fields
  const [companyName, setCompanyName] = useState('');
  const [organizationType, setOrganizationType] = useState('bulk_buyer');
  const [annualCapacity, setAnnualCapacity] = useState('');

  // Consumer Specific Fields
  const [address, setAddress] = useState('');

  const toggleCrop = (crop) => {
    if (selectedCrops.includes(crop)) {
      setSelectedCrops(selectedCrops.filter(c => c !== crop));
    } else {
      setSelectedCrops([...selectedCrops, crop]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    let payload = {};
    if (user.role === 'FARMER' || user.role === 'FPO') {
      payload = {
        name,
        state,
        district,
        location, // village/locality
        fpoName,
        totalLandArea,
        crops: selectedCrops,
        contactNumber
      };
    } else if (user.role === 'BUYER') {
      payload = {
        name,
        companyName,
        organizationType,
        state,
        district,
        location, // delivery location
        annualCapacity,
        contactNumber
      };
    } else if (user.role === 'CONSUMER') {
      payload = {
        name,
        address
      };
    }

    try {
      await profilesAPI.onboard(payload);
      await fetchProfile(); // Update Auth Context state
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-8 my-8">
        <div className="text-center mb-8">
          <Sprout className="h-12 w-12 text-green-600 mx-auto mb-3 animate-bounce" />
          <h1 className="text-2xl font-bold text-gray-900">Complete Your Profile</h1>
          <p className="text-gray-500 text-sm mt-1">Tell us a bit about yourself to start using AgriConnect</p>
          <div className="mt-3 inline-block bg-green-50 border border-green-200 text-green-800 text-xs px-3 py-1 rounded-full font-semibold">
            Role: {user?.role}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-6">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Consumer Onboarding Form */}
          {user?.role === 'CONSUMER' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Your Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                    placeholder="Enter your name"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Delivery Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                    rows="3"
                    placeholder="Enter your complete delivery address"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* Farmer & FPO Onboarding Form */}
          {(user?.role === 'FARMER' || user?.role === 'FPO') && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800 border-b pb-2">🌾 Farmer Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                      placeholder="e.g. Ramesh Kumar"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Contact Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="tel"
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                      placeholder="10-digit mobile number"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">State</label>
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                  >
                    {['Andhra Pradesh', 'Bihar', 'Delhi', 'Gujarat', 'Haryana', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Punjab', 'Rajasthan', 'Telangana', 'Uttar Pradesh', 'West Bengal'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">District</label>
                  <input
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                    placeholder="e.g. Pune"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Village / Locality</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                    placeholder="e.g. Ibrahimpatnam"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">FPO Name (Optional)</label>
                  <div className="relative">
                    <Landmark className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={fpoName}
                      onChange={(e) => setFpoName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                      placeholder="Farmers Producer Org."
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Total Land Area (Acres)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={totalLandArea}
                    onChange={(e) => setTotalLandArea(e.target.value)}
                    className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                    placeholder="e.g. 5.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">🌾 Select Crops You Grow</label>
                <div className="flex flex-wrap gap-2">
                  {cropOptions.map(crop => (
                    <button
                      type="button"
                      key={crop}
                      onClick={() => toggleCrop(crop)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                        selectedCrops.includes(crop)
                          ? 'bg-green-600 border-green-600 text-white shadow-sm'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {crop}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Buyer Onboarding Form */}
          {user?.role === 'BUYER' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800 border-b pb-2">🛒 Buyer Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                      placeholder="e.g. Rahul Sharma"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Company / Organization</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                    placeholder="e.g. BigBasket Inc."
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Buyer Type</label>
                  <select
                    value={organizationType}
                    onChange={(e) => setOrganizationType(e.target.value)}
                    className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                  >
                    <option value="bulk_buyer">Bulk Buyer (Wholesaler)</option>
                    <option value="retail_chain">Retail Chain / Supermarket</option>
                    <option value="fpo">FPO Procurement</option>
                    <option value="other">Other Business Entity</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Contact Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="tel"
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                      placeholder="10-digit mobile number"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">State</label>
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                  >
                    {['Andhra Pradesh', 'Bihar', 'Delhi', 'Gujarat', 'Haryana', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Punjab', 'Rajasthan', 'Telangana', 'Uttar Pradesh', 'West Bengal'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">District</label>
                  <input
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                    placeholder="e.g. Mumbai"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Delivery Destination / City</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                    placeholder="e.g. Mumbai Central Warehouse"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Annual Purchasing Capacity (kg)</label>
                <input
                  type="number"
                  value={annualCapacity}
                  onChange={(e) => setAnnualCapacity(e.target.value)}
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                  placeholder="e.g. 50000"
                  required
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 text-sm shadow-md"
          >
            {loading ? 'Submitting Details...' : 'Complete Profile & Get Started'}
          </button>
        </form>
      </div>
    </div>
  );
}
