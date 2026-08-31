import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Marketplace from './pages/Marketplace';
import MarketPrices from './pages/MarketPrices';
import Logistics from './pages/Logistics';
import Impact from './pages/Impact';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import FarmerDashboard from './pages/FarmerDashboard';
import BuyerDashboard from './pages/BuyerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Onboarding from './pages/Onboarding';
import Orders from './pages/Orders';
import Landing from './pages/Landing';

function AppRoutes() {
  const { user, loading, hasProfile, profileError, clearProfileError, logout, checkingProfile } = useAuth();
  const navigate = useNavigate();
  
  if (profileError) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-base)' }}>
        <div className="text-center space-y-4 max-w-sm mx-auto px-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Unable to verify your session. Please try again.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { clearProfileError(); window.location.reload(); }} className="btn-primary text-sm">
              Retry
            </button>
            <button onClick={() => { logout(); navigate('/'); }} className="btn-secondary text-sm">
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  if (loading || checkingProfile) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-base)' }}>
        <div className="w-10 h-10 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--bg-overlay)', borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
      <Route path="/verify-email" element={user && user.is_verified ? <Navigate to="/" /> : <VerifyEmail />} />
      <Route path="/onboard" element={user && !hasProfile ? <Onboarding /> : <Navigate to="/" />} />
      
      {/* Landing / Dashboard Parent Router */}
      <Route path="/" element={
        !user ? (
          <Landing />
        ) : !hasProfile ? (
          <Navigate to="/onboard" />
        ) : (
          <Layout />
        )
      }>
        <Route index element={
          user?.role === 'FARMER' ? <FarmerDashboard /> :
          user?.role === 'BUYER' ? <BuyerDashboard /> :
          user?.role === 'ADMIN' ? <AdminDashboard /> :
          <Dashboard />
        } />
        <Route path="marketplace" element={user ? <Marketplace /> : <Navigate to="/" />} />
        <Route path="prices" element={user ? <MarketPrices /> : <Navigate to="/" />} />
        <Route path="logistics" element={user ? <Logistics /> : <Navigate to="/" />} />
        <Route path="impact" element={user ? <Impact /> : <Navigate to="/" />} />
        <Route path="orders" element={user ? <Orders /> : <Navigate to="/" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
