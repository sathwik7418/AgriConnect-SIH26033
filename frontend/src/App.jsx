import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Marketplace from './pages/Marketplace';
import MarketPrices from './pages/MarketPrices';
import Logistics from './pages/Logistics';
import Impact from './pages/Impact';
import Login from './pages/Login';
import Register from './pages/Register';
import FarmerDashboard from './pages/FarmerDashboard';
import BuyerDashboard from './pages/BuyerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Onboarding from './pages/Onboarding';
import Orders from './pages/Orders';

function ProtectedRoute({ children }) {
  const { user, loading, hasProfile, checkingProfile } = useAuth();
  if (loading || checkingProfile) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  if (!hasProfile) return <Navigate to="/onboard" />;
  return children;
}

function AppRoutes() {
  const { user, hasProfile } = useAuth();
  
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
      <Route path="/onboard" element={user && !hasProfile ? <Onboarding /> : <Navigate to="/" />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={
          user?.role === 'FARMER' ? <FarmerDashboard /> :
          user?.role === 'BUYER' ? <BuyerDashboard /> :
          user?.role === 'ADMIN' ? <AdminDashboard /> :
          <Dashboard />
        } />
        <Route path="marketplace" element={<Marketplace />} />
        <Route path="prices" element={<MarketPrices />} />
        <Route path="logistics" element={<Logistics />} />
        <Route path="impact" element={<Impact />} />
        <Route path="orders" element={<Orders />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
