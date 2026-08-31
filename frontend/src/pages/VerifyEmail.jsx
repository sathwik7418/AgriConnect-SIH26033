import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { Sprout, Mail, RefreshCw, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyEmail } = useAuth();

  const [email, setEmail] = useState(location.state?.email || '');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Please provide an email address');
      return;
    }
    if (otp.length !== 6 || isNaN(parseInt(otp))) {
      setError('Please enter a valid 6-digit verification code');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await verifyEmail(email, otp);
      setSuccess('Account verified successfully! Redirecting you to your workspace...');
      setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed. Please check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError('Please provide an email address to resend the code');
      return;
    }
    setError('');
    setSuccess('');
    setResending(true);
    try {
      const res = await authAPI.resendVerification({ email });
      setSuccess(res.data?.message || 'Verification code resent. Check your inbox.');
      setCooldown(60);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend verification code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-atmospheric relative overflow-hidden">
      <div className="w-full max-w-md animate-fade-in-up relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-ring animate-pulse-glow"
            style={{ background: 'var(--accent-dim)' }}>
            <Mail className="h-7 w-7" style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="text-2xl font-bold gradient-text">
            Verify your email
          </h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>
            Enter the 6-digit code sent to your inbox
          </p>
        </div>

        {/* Card */}
        <div className="card-atmospheric hover-glow p-8">
          <form onSubmit={handleVerify} className="space-y-5 stagger-children">
            {error && (
              <div className="badge badge-danger rounded-lg px-4 py-3 text-sm font-medium w-full justify-start">
                {error}
              </div>
            )}

            {success && (
              <div className="badge badge-success rounded-lg px-4 py-3 text-sm font-medium flex items-center gap-2 w-full justify-start">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!location.state?.email}
                className="input-field disabled:opacity-50"
                required
                placeholder="name@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Verification Code</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="input-field text-center tracking-[0.5em] text-2xl font-bold font-numeric"
                required
                maxLength={6}
                pattern="\d{6}"
                inputMode="numeric"
              />
            </div>

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-[15px]"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>Verify Email <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t flex flex-col items-center gap-3" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={handleResend}
              disabled={resending || cooldown > 0}
              className="flex items-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-40"
              style={{ color: cooldown > 0 ? 'var(--text-muted)' : 'var(--accent)' }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${resending ? 'animate-spin' : ''}`} />
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>

            <Link to="/login" className="text-sm font-medium transition-colors hover:underline" style={{ color: 'var(--text-muted)' }}>
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
