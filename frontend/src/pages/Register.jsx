import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sprout, Eye, EyeOff, ArrowRight, Loader2, Tractor, ShoppingBag } from 'lucide-react';

const roles = [
  { value: 'FARMER', label: 'Farmer', desc: 'Sell your produce directly', icon: Tractor, color: '#22c55e' },
  { value: 'BUYER', label: 'Buyer', desc: 'Source fresh produce', icon: ShoppingBag, color: '#3b82f6' },
];

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'FARMER' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Full name is required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(form.password)) {
      setError('Password must be at least 8 characters with uppercase, lowercase, number, and special character.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role
      });
      if (res && res.requiresVerification) {
        navigate('/verify-email', { state: { email: form.email } });
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-atmospheric relative overflow-hidden">
      <div className="w-full max-w-md animate-fade-in-up relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-ring animate-pulse-glow"
            style={{ background: 'var(--accent-dim)' }}>
            <Sprout className="h-7 w-7" style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="text-2xl font-bold gradient-text">
            Create account
          </h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>
            Join AgriConnect marketplace
          </p>
        </div>

        {/* Card */}
        <div className="card-atmospheric hover-glow p-8">
          <form onSubmit={handleSubmit} className="space-y-5 stagger-children">
            {error && (
              <div className="badge badge-danger rounded-lg px-4 py-3 text-sm font-medium w-full justify-start">
                {error}
              </div>
            )}

            {/* Role selector */}
            <div>
              <label className="block text-sm font-medium mb-2.5" style={{ color: 'var(--text-secondary)' }}>I am a</label>
              <div className="grid grid-cols-2 gap-3">
                {roles.map(({ value, label, desc, icon: Icon, color }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm({ ...form, role: value })}
                    className="p-4 rounded-xl text-center transition-all duration-200"
                    style={{
                      background: form.role === value ? `${color}12` : 'var(--bg-elevated)',
                      border: `1.5px solid ${form.role === value ? `${color}40` : 'var(--border)'}`,
                    }}
                  >
                    <Icon className="h-6 w-6 mx-auto mb-2" style={{ color: form.role === value ? color : 'var(--text-muted)' }} />
                    <div className="text-sm font-semibold" style={{ color: form.role === value ? color : 'var(--text-primary)' }}>
                      {label}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
                placeholder="Enter your full name"
                required
                autoComplete="name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input-field"
                placeholder="name@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input-field pr-11"
                  placeholder="Min 8 characters"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                className="input-field"
                placeholder="Re-enter your password"
                required
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-[15px]"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>Create Account <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold transition-colors hover:underline" style={{ color: 'var(--accent)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
