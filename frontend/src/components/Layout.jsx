import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sprout, ShoppingCart, BarChart3, Truck, Activity, LogOut, Menu, X, Home } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/marketplace', label: 'Marketplace', icon: ShoppingCart },
  { path: '/prices', label: 'Market Prices', icon: BarChart3 },
  { path: '/logistics', label: 'Logistics', icon: Truck },
  { path: '/impact', label: 'Impact', icon: Activity },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-2">
                <Sprout className="h-8 w-8 text-green-600" />
                <span className="text-xl font-bold text-gray-900">Agri<span className="text-green-600">Connect</span></span>
              </Link>
              <div className="hidden md:flex items-center gap-1">
                {navItems.map(({ path, label, icon: Icon }) => (
                  <Link
                    key={path}
                    to={path}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      location.pathname === path
                        ? 'bg-green-50 text-green-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="hidden md:flex items-center gap-4">
              <span className="text-sm text-gray-500">{user?.role}</span>
              <span className="text-sm font-medium text-gray-900">{user?.email}</span>
              <button onClick={handleLogout} className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600">
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
            <button className="md:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-b shadow-lg">
          <div className="px-4 py-2 space-y-1">
            {navItems.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  location.pathname === path ? 'bg-green-50 text-green-700' : 'text-gray-600'
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
            <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 text-sm text-red-600">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
