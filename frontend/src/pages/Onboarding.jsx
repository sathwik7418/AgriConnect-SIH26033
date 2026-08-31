import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { profilesAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { Sprout, User, Phone, MapPin, Landmark, Trash2, Plus, Loader2, ArrowRight } from 'lucide-react';

const cropOptions = ['TOMATO', 'ONION', 'POTATO', 'WHEAT', 'RICE', 'CORN', 'BRINJAL', 'LETTUCE', 'MANGO', 'APPLE', 'BANANA'];

const cropLabels = {
  TOMATO: 'Tomato', ONION: 'Onion', POTATO: 'Potato', WHEAT: 'Wheat',
  RICE: 'Rice', CORN: 'Corn', BRINJAL: 'Brinjal', LETTUCE: 'Lettuce',
  MANGO: 'Mango', APPLE: 'Apple', BANANA: 'Banana'
};

const states = ['Andhra Pradesh', 'Bihar', 'Delhi', 'Gujarat', 'Haryana', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Punjab', 'Rajasthan', 'Telangana', 'Uttar Pradesh', 'West Bengal'];

const roleConfig = {
  FARMER: { label: 'Farmer', color: '#22c55e', icon: '🌾' },
  FPO: { label: 'FPO', color: '#22c55e', icon: '🌾' },
  BUYER: { label: 'Buyer', color: '#3b82f6', icon: '🛒' },
  CONSUMER: { label: 'Consumer', color: '#8b5cf6', icon: '🛒' },
};

export default function Onboarding() {
  const { user, fetchProfile } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState(user?.name || '');
  const [contactNumber, setContactNumber] = useState('');
  const [state, setState] = useState('Maharashtra');
  const [district, setDistrict] = useState('');
  const [location, setLocation] = useState('');

  const [fpoName, setFpoName] = useState('');
  const [totalLandArea, setTotalLandArea] = useState('');
  const [selectedCrops, setSelectedCrops] = useState([]);

  const [companyName, setCompanyName] = useState('');
  const [organizationType, setOrganizationType] = useState('bulk_buyer');
  const [annualCapacity, setAnnualCapacity] = useState('');

  useEffect(() => {
    if (user?.name && !name) setName(user.name);
  }, [user]);

  const toggleCrop = (crop) => {
    setSelectedCrops(prev => prev.includes(crop) ? prev.filter(c => c !== crop) : [...prev, crop]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    let payload = {};
    if (user.role === 'FARMER' || user.role === 'FPO') {
      payload = { name, state, district, location, fpoName, totalLandArea, crops: selectedCrops, contactNumber };
    } else if (user.role === 'BUYER') {
      payload = {
        name,
        companyName: organizationType === 'INDIVIDUAL' ? 'Individual' : companyName,
        organizationType, state, district, location,
        annualCapacity: organizationType === 'INDIVIDUAL' ? 0 : annualCapacity,
        contactNumber
      };
    } else if (user.role === 'CONSUMER') {
      payload = { name, state, district, location, contactNumber };
    }

    try {
      await profilesAPI.onboard(payload);
      await fetchProfile();
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const rc = roleConfig[user?.role] || roleConfig.FARMER;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-atmospheric relative overflow-hidden">
      <div className="w-full max-w-2xl animate-fade-in-up my-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-ring animate-pulse-glow"
            style={{ background: 'var(--accent-dim)' }}>
            <Sprout className="h-7 w-7" style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="text-2xl font-bold gradient-text">
            Complete your profile
          </h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>
            Tell us about yourself to start using AgriConnect
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: `${rc.color}15`, color: rc.color }}>
            <span>{rc.icon}</span> {rc.label}
          </div>
        </div>

        {/* Card */}
        <div className="card-atmospheric hover-glow p-8">
          {error && (
            <div className="badge badge-danger rounded-lg px-4 py-3 text-sm font-medium mb-6 w-full justify-start">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6 stagger-children">
            {/* Consumer */}
            {user?.role === 'CONSUMER' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Consumer Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Full Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                      className="input-field" placeholder="Enter your name" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Contact Phone</label>
                    <input type="tel" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)}
                      className="input-field" placeholder="10-digit mobile number" required />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>State</label>
                    <select value={state} onChange={(e) => setState(e.target.value)} className="input-field">
                      {states.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>District</label>
                    <input type="text" value={district} onChange={(e) => setDistrict(e.target.value)}
                      className="input-field" placeholder="e.g. Pune" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Locality</label>
                    <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                      className="input-field" placeholder="e.g. Ibrahimpatnam" required />
                  </div>
                </div>
              </div>
            )}

            {/* Farmer / FPO */}
            {(user?.role === 'FARMER' || user?.role === 'FPO') && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Farmer Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Full Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                      className="input-field" placeholder="e.g. Ramesh Kumar" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Contact Phone</label>
                    <input type="tel" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)}
                      className="input-field" placeholder="10-digit mobile number" required />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>State</label>
                    <select value={state} onChange={(e) => setState(e.target.value)} className="input-field">
                      {states.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>District</label>
                    <input type="text" value={district} onChange={(e) => setDistrict(e.target.value)}
                      className="input-field" placeholder="e.g. Pune" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Village / Locality</label>
                    <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                      className="input-field" placeholder="e.g. Ibrahimpatnam" required />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>FPO Name (Optional)</label>
                    <input type="text" value={fpoName} onChange={(e) => setFpoName(e.target.value)}
                      className="input-field" placeholder="Farmers Producer Org." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Land Area (Acres)</label>
                    <input type="number" step="0.1" value={totalLandArea} onChange={(e) => setTotalLandArea(e.target.value)}
                      className="input-field" placeholder="e.g. 5.5" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>Select crops you grow</label>
                  <div className="flex flex-wrap gap-2">
                    {cropOptions.map(crop => (
                      <button type="button" key={crop} onClick={() => toggleCrop(crop)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150"
                        style={{
                          background: selectedCrops.includes(crop) ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                          color: selectedCrops.includes(crop) ? 'var(--accent)' : 'var(--text-secondary)',
                          border: `1px solid ${selectedCrops.includes(crop) ? 'var(--border-accent)' : 'var(--border)'}`,
                        }}>
                        {cropLabels[crop] || crop}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Buyer */}
            {user?.role === 'BUYER' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Buyer Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Full Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                      className="input-field" placeholder="e.g. Rahul Sharma" required />
                  </div>
                  {organizationType !== 'INDIVIDUAL' && (
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Company / Organization</label>
                      <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                        className="input-field" placeholder="e.g. BigBasket Inc." required />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Buyer Type</label>
                    <select value={organizationType} onChange={(e) => setOrganizationType(e.target.value)} className="input-field">
                      <option value="bulk_buyer">Bulk Buyer (Wholesaler)</option>
                      <option value="retail_chain">Retail Chain / Supermarket</option>
                      <option value="fpo">FPO Procurement</option>
                      <option value="INDIVIDUAL">Individual Consumer</option>
                      <option value="other">Other Business Entity</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Contact Phone</label>
                    <input type="tel" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)}
                      className="input-field" placeholder="10-digit mobile number" required />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>State</label>
                    <select value={state} onChange={(e) => setState(e.target.value)} className="input-field">
                      {states.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>District</label>
                    <input type="text" value={district} onChange={(e) => setDistrict(e.target.value)}
                      className="input-field" placeholder="e.g. Mumbai" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Delivery Destination</label>
                    <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                      className="input-field" placeholder="e.g. Mumbai Central" required />
                  </div>
                </div>
                {organizationType !== 'INDIVIDUAL' && (
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Annual Capacity (kg)</label>
                    <input type="number" value={annualCapacity} onChange={(e) => setAnnualCapacity(e.target.value)}
                      className="input-field" placeholder="e.g. 50000" required />
                  </div>
                )}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-[15px]">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>Complete Profile <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
