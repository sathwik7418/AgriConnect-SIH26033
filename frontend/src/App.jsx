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

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div></div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={
          user?.role === 'FARMER' ? <FarmerDashboard /> :
          user?.role === 'BUYER' ? <BuyerDashboard /> :
          <Dashboard />
        } />
        <Route path="marketplace" element={<Marketplace />} />
        <Route path="prices" element={<MarketPrices />} />
        <Route path="logistics" element={<Logistics />} />
        <Route path="impact" element={<Impact />} />
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
