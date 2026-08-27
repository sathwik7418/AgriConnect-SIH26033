import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { Sprout, Mail, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

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
      setTimeout(() => {
        navigate('/');
      }, 1500);
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
      setSuccess(res.data?.message || 'Verification code resent successfully. Please check your inbox.');
      setCooldown(60);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend verification code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <Sprout className="h-12 w-12 text-green-600 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">Verify Your Email</h1>
          <p className="text-gray-500 text-sm mt-1">Please enter the 6-digit code sent to your inbox</p>
        </div>

        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4.5 w-4.5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!location.state?.email}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500"
                required
                placeholder="name@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.slice(0, 6))}
              placeholder="123456"
              className="w-full text-center tracking-widest text-2xl font-bold px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-numeric"
              required
              maxLength={6}
              pattern="\d{6}"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex items-start gap-2">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Verifying...' : 'Verify Email'}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center justify-center gap-3">
          <button
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="flex items-center gap-1.5 text-sm font-semibold text-green-700 hover:text-green-800 disabled:text-gray-400 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${resending ? 'animate-spin' : ''}`} />
            {cooldown > 0 ? `Resend Code in ${cooldown}s` : 'Resend Code'}
          </button>

          <Link to="/login" className="text-sm font-medium text-gray-500 hover:text-gray-800 hover:underline">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
