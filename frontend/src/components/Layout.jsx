import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sprout, ShoppingCart, BarChart3, Truck, Activity, LogOut, Menu, X, Home, ShoppingBag, Bell, ChevronRight, Shield, Trash2, Inbox } from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { notificationsAPI } from '../services/api';
import AIBot from './AIBot/AIBot';

const MemoizedOutlet = React.memo(Outlet);

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const notifRef = useRef(null);
  const profileRef = useRef(null);
  const mountedRef = useRef(true);
  const hamburgerRef = useRef(null);
  const closeBtnRef = useRef(null);

  const loadNotifications = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const res = await notificationsAPI.getAll();
      if (mountedRef.current) setNotifications(res.data);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (user) {
      loadNotifications();
      const interval = setInterval(loadNotifications, 15000);
      return () => clearInterval(interval);
    }
  }, [user, loadNotifications]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) setShowNotifications(false);
      if (profileRef.current && !profileRef.current.contains(event.target)) setShowProfile(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (mobileOpen) {
          setMobileOpen(false);
          hamburgerRef.current?.focus();
        } else {
          setShowNotifications(false);
          setShowProfile(false);
        }
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileOpen]);

  useEffect(() => {
    if (mobileOpen) {
      closeBtnRef.current?.focus();
    }
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
    setShowNotifications(false);
    setShowProfile(false);
  }, [location.pathname]);

  const handleMarkRead = async (id) => {
    try {
      await notificationsAPI.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleDeleteNotification = async (e, id) => {
    e.stopPropagation();
    try {
      await notificationsAPI.delete(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const getNavItems = () => {
    if (!user) return [];
    const role = user.role;
    if (role === 'FARMER' || role === 'FPO') {
      return [
        { path: '/', label: 'Dashboard', icon: Home },
        { path: '/marketplace', label: 'Marketplace', icon: ShoppingCart },
        { path: '/orders', label: 'Orders', icon: ShoppingBag },
        { path: '/prices', label: 'Market Prices', icon: BarChart3 },
        { path: '/logistics', label: 'Logistics', icon: Truck },
        { path: '/impact', label: 'Impact', icon: Activity },
      ];
    } else if (role === 'BUYER' || role === 'CONSUMER') {
      return [
        { path: '/', label: 'Dashboard', icon: Home },
        { path: '/marketplace', label: 'Marketplace', icon: ShoppingCart },
        { path: '/orders', label: 'Orders', icon: ShoppingBag },
        { path: '/prices', label: 'Market Prices', icon: BarChart3 },
        { path: '/logistics', label: 'Logistics', icon: Truck },
        { path: '/impact', label: 'Impact', icon: Activity },
      ];
    } else if (role === 'ADMIN') {
      return [
        { path: '/', label: 'Dashboard', icon: Shield },
        { path: '/prices', label: 'Market Prices', icon: BarChart3 },
        { path: '/logistics', label: 'Logistics', icon: Truck },
        { path: '/impact', label: 'Impact', icon: Activity },
      ];
    }
    return [
      { path: '/', label: 'Dashboard', icon: Home },
      { path: '/marketplace', label: 'Marketplace', icon: ShoppingCart },
      { path: '/orders', label: 'Orders', icon: ShoppingBag },
      { path: '/prices', label: 'Market Prices', icon: BarChart3 },
      { path: '/logistics', label: 'Logistics', icon: Truck },
      { path: '/impact', label: 'Impact', icon: Activity },
    ];
  };

  const navs = getNavItems();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleColors = {
            FARMER: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    FPO: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    BUYER: 'bg-blue-50 text-blue-700 border border-blue-200',
    CONSUMER: 'bg-purple-50 text-purple-700 border border-purple-200',
    ADMIN: 'bg-amber-50 text-amber-700 border border-amber-200',
  };

  const roleLabels = { FARMER: 'Farmer', FPO: 'FPO', BUYER: 'Buyer', CONSUMER: 'Consumer', ADMIN: 'Admin' };

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-base)' }}>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-[240px] border-r shrink-0 sticky top-0 h-screen transition-colors duration-300"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        aria-label="Main navigation">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-shadow duration-300 hover:shadow-glow"
            style={{ background: 'var(--accent-dim)' }}>
            <Sprout className="h-5 w-5" style={{ color: 'var(--accent)' }} />
          </div>
          <span className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Agri<span style={{ color: 'var(--accent)' }}>Connect</span>
          </span>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" role="navigation" aria-label="Main navigation">
          {navs.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                  isActive ? '' : ''
                }`}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  background: isActive ? 'var(--accent-glow)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                    style={{ background: 'var(--accent)', boxShadow: '0 0 10px var(--accent-glow-strong)' }} />
                )}
                <Icon className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-105" />
                <span>{label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ background: 'var(--accent)' }} />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer - User Card */}
        <div className="border-t px-4 py-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 glow-ring"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
              {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {user?.name || user?.email?.split('@')[0]}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${roleColors[user?.role] || 'bg-gray-50 text-gray-700 border border-gray-200'}`}>
                  {roleLabels[user?.role] || user?.role}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg transition-all duration-200"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-md transition-opacity" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[280px] flex flex-col animate-slide-in-right"
            style={{ background: 'var(--bg-surface)', boxShadow: 'var(--shadow-xl)' }}>
            <div className="flex items-center justify-between px-5 h-16 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
                  <Sprout className="h-5 w-5" style={{ color: 'var(--accent)' }} />
                </div>
                <span className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  Agri<span style={{ color: 'var(--accent)' }}>Connect</span>
                </span>
              </div>
              <button ref={closeBtnRef} onClick={() => setMobileOpen(false)} className="p-2 rounded-lg transition-colors duration-200"
                aria-label="Close navigation"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" role="navigation" aria-label="Main navigation">
              {navs.map(({ path, label, icon: Icon }) => {
                const isActive = location.pathname === path;
                return (
                  <Link
                    key={path}
                    to={path}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200"
                    aria-current={isActive ? 'page' : undefined}
                    style={{
                      background: isActive ? 'var(--accent-glow)' : 'transparent',
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{label}</span>
                    {isActive && (
                      <ChevronRight className="h-4 w-4 ml-auto" style={{ color: 'var(--accent)' }} />
                    )}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t px-4 py-4" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 glow-ring"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                  {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {user?.name || user?.email?.split('@')[0]}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{user?.email}</div>
                </div>
                <button onClick={handleLogout} className="p-2 rounded-lg transition-all duration-200" style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}>
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 h-16 flex items-center justify-between px-4 sm:px-6 border-b transition-colors duration-300"
          style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px) saturate(1.4)', WebkitBackdropFilter: 'blur(16px) saturate(1.4)', borderColor: 'var(--border)' }}>
          {/* Left: Mobile menu + breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              ref={hamburgerRef}
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden btn-icon min-h-[44px] min-w-[44px]"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden sm:flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
              <span>{navs.find(n => n.path === location.pathname)?.label || 'Dashboard'}</span>
            </div>
          </div>

          {/* Right: Notifications + Profile */}
          <div className="flex items-center gap-2">
            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => { setShowNotifications(!showNotifications); setShowProfile(false); }}
                className="relative btn-icon"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-[18px] min-w-[18px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center animate-pulse-glow"
                    style={{ background: 'var(--danger)', color: 'white', boxShadow: '0 0 8px rgba(239,68,68,0.3)' }}>
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl overflow-hidden dropdown-enter"
                  style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px) saturate(1.2)', WebkitBackdropFilter: 'blur(20px) saturate(1.2)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg)' }}>
                  <div className="px-4 py-3 flex justify-between items-center border-b" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Notifications</span>
                    {unreadCount > 0 && (
                      <span className="badge text-[10px] py-0.5 px-2" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                      <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-sm)' }}>
                        <Inbox className="h-7 w-7" style={{ color: 'var(--text-muted)' }} />
                      </div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>You're all caught up</p>
                      <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>No new activity right now.</p>
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.map(n => (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (!n.is_read) handleMarkRead(n.id);
                            setShowNotifications(false);
                            navigate('/orders');
                          }}
                          className="px-4 py-3 cursor-pointer transition-all duration-200 group border-b"
                          style={{
                            background: !n.is_read ? 'var(--accent-glow)' : 'transparent',
                            borderColor: 'var(--border)',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = !n.is_read ? 'var(--accent-glow-strong)' : 'var(--bg-hover)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = !n.is_read ? 'var(--accent-glow)' : 'transparent'}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex items-start gap-2.5 flex-1 min-w-0">
                              {!n.is_read && <div className="h-2 w-2 rounded-full shrink-0 mt-1.5 animate-pulse-glow" style={{ background: 'var(--accent)' }} />}
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-semibold block" style={{ color: !n.is_read ? 'var(--accent)' : 'var(--text-primary)' }}>
                                  {n.title}
                                </span>
                                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{n.message}</p>
                                <span className="text-[9px] mt-1.5 block" style={{ color: 'var(--text-muted)' }}>
                                  {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => handleDeleteNotification(e, n.id)}
                              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 shrink-0"
                              style={{ color: 'var(--text-muted)' }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Profile Button */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => { setShowProfile(!showProfile); setShowNotifications(false); }}
                className="flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-lg transition-all duration-200"
                aria-label="User menu"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div className="hidden md:block text-right">
                  <div className="text-sm font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>
                    {user?.name || user?.email?.split('@')[0]}
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 glow-ring"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                  {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase()}
                </div>
              </button>

              {showProfile && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl overflow-hidden dropdown-enter"
                  style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.95) 0%, rgba(250,250,249,0.92) 100%)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                  <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 glow-ring"
                        style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                        {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{user?.name || 'User'}</div>
                        <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user?.email}</div>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1.5 inline-block ${roleColors[user?.role] || ''}`}>
                          {roleLabels[user?.role] || user?.role}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="py-1.5">
                    <button
                      onClick={() => { setShowProfile(false); handleLogout(); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all duration-200 rounded-none"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; e.currentTarget.style.color = 'var(--danger)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] w-full mx-auto">
          <MemoizedOutlet />
        </main>
        <AIBot />
      </div>
    </div>
  );
}
