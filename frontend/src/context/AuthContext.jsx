import { createContext, useContext, useState, useEffect } from 'react';
import api, { authAPI, profilesAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [profile, setProfile] = useState(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (currentToken) => {
    const activeToken = currentToken || token || localStorage.getItem('token');
    if (!activeToken) {
      setProfile(null);
      setHasProfile(false);
      setCheckingProfile(false);
      return;
    }
    try {
      setCheckingProfile(true);
      const res = await profilesAPI.me();
      if (res.data && res.data.profileExists) {
        setProfile(res.data.profile);
        setHasProfile(true);
      } else {
        setProfile(null);
        setHasProfile(false);
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setProfile(null);
      setHasProfile(false);
    } finally {
      setCheckingProfile(false);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        const stored = localStorage.getItem('user');
        if (stored) {
          setUser(JSON.parse(stored));
        }
        await fetchProfile(token);
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { user: userData, token: newToken } = res.data;
    setUser(userData);
    setToken(newToken);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData));
    await fetchProfile(newToken);
    return userData;
  };

  const register = async (data) => {
    const res = await authAPI.register(data);
    if (res.data && res.data.requiresVerification) {
      return res.data;
    }
    const { user: userData, token: newToken } = res.data;
    setUser(userData);
    setToken(newToken);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData));
    await fetchProfile(newToken);
    return userData;
  };

  const verifyEmail = async (email, otp) => {
    const res = await authAPI.verifyEmail({ email, otp });
    const { user: userData, token: newToken } = res.data;
    setUser(userData);
    setToken(newToken);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData));
    await fetchProfile(newToken);
    return userData;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setProfile(null);
    setHasProfile(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, profile, hasProfile, checkingProfile, fetchProfile, verifyEmail }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
