import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { orderAPI } from '../services/api';
import { ShoppingBag, CheckCircle, Clock, Truck, Check, X, Phone, User, Package, ArrowRight, Loader2, ShoppingCart } from 'lucide-react';

const statusSteps = ['PENDING', 'CONFIRMED', 'PICKUP_READY', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];
const statusStyles = {
  PENDING: { color: 'var(--warning)', bg: 'rgba(245,158,11,0.12)', label: 'Order Placed' },
  CONFIRMED: { color: 'var(--info)', bg: 'rgba(59,130,246,0.12)', label: 'Accepted' },
  PICKUP_READY: { color: '#a855f7', bg: 'rgba(168,85,247,0.12)', label: 'Ready for Pickup' },
  IN_TRANSIT: { color: '#6366f1', bg: 'rgba(99,102,241,0.12)', label: 'In Transit' },
  DELIVERED: { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)', label: 'Delivered' },
  COMPLETED: { color: 'var(--accent)', bg: 'rgba(34,197,94,0.12)', label: 'Completed' },
  CANCELLED: { color: 'var(--danger)', bg: 'rgba(239,68,68,0.12)', label: 'Cancelled' },
};

const stepLabels = { PENDING: 'Placed', CONFIRMED: 'Accepted', PICKUP_READY: 'Ready', IN_TRANSIT: 'Shipped', DELIVERED: 'Delivered', COMPLETED: 'Completed' };

const deliveryModeConfig = {
  BUYER_PICKUP: { label: 'Self Pickup', className: 'badge-neutral' },
  FARMER_DELIVERY: { label: 'Farmer Delivery', className: 'badge-info' },
  TRANSPORT_PARTNER: { label: 'Transport Partner', className: 'badge-neutral' },
};

export default function Orders() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => { if (profile?.id) loadOrders(); }, [profile]);

  const loadOrders = async () => {
    setLoading(true); setError('');
    try {
      let res;
      if (user.role === 'FARMER' || user.role === 'FPO') res = await orderAPI.getByFarmer(profile.id);
      else res = await orderAPI.getByBuyer(profile.id);
      setOrders(res.data || []);
    } catch (err) { setError('Failed to load orders.'); }
    finally { setLoading(false); }
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    try { await orderAPI.updateStatus(orderId, newStatus); loadOrders(); }
    catch (err) { alert(err.response?.data?.error || 'Failed to update status'); }
    finally { setUpdatingId(null); }
  };

  const getStepIndex = (status) => statusSteps.indexOf(status);

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--bg-overlay)', borderTopColor: 'var(--accent)' }} />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold gradient-text">Your Orders</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {user.role === 'FARMER' || user.role === 'FPO' ? 'Manage received crop orders and update dispatch' : 'Track your placed orders and confirm deliveries'}
        </p>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.10)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.15)' }}>
          {error}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="card-atmospheric p-10 text-center animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.1)' }}>
            <ShoppingBag className="h-8 w-8" style={{ color: 'var(--accent)' }} />
          </div>
          <p className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>No orders yet</p>
          <p className="text-sm mt-1 max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
            {user.role === 'FARMER' || user.role === 'FPO'
              ? 'Orders will appear here when buyers purchase your produce.'
              : 'Orders will appear here once you place a purchase from the marketplace.'}
          </p>
          <a href="/marketplace" className="inline-flex items-center gap-1.5 mt-4 btn-primary text-sm">
            <ShoppingCart className="h-3.5 w-3.5" /> Browse Marketplace
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const currentStep = getStepIndex(o.order_status);
            const isCancelled = o.order_status === 'CANCELLED';
            const isFarmer = user.role === 'FARMER' || user.role === 'FPO';
            const ss = statusStyles[o.order_status] || statusStyles.PENDING;

            return (
              <div key={o.id} className="card-surface p-6 space-y-4 transition-all hover-lift">
                {/* Header */}
                <div className="flex flex-wrap justify-between items-start gap-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>ORDER {o.id.substring(0, 8).toUpperCase()}</span>
                      {o.delivery_mode && deliveryModeConfig[o.delivery_mode] && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${deliveryModeConfig[o.delivery_mode].className}`}>
                          {deliveryModeConfig[o.delivery_mode].label}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                      {o.commodity} <span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>({o.variety} | {o.grade})</span>
                    </h3>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Placed {new Date(o.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="badge" style={{ background: ss.bg, color: ss.color }}>{ss.label}</span>
                    <span className="text-sm font-semibold font-numeric" style={{ color: 'var(--text-primary)' }}>
                      Total: ₹{(parseFloat(o.final_price) * parseFloat(o.quantity)).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-xs uppercase block" style={{ color: 'var(--text-muted)' }}>Quantity</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{o.quantity} kg</span>
                  </div>
                  <div>
                    <span className="text-xs uppercase block" style={{ color: 'var(--text-muted)' }}>
                      {isFarmer ? 'Buyer Details' : 'Farmer Details'}
                    </span>
                    <div className="flex items-center gap-1 font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                      <User className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                      <span>{isFarmer ? o.buyer_name : o.farmer_name}</span>
                    </div>
                    {isFarmer && o.buyer_company && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{o.buyer_company}</span>}
                    {((isFarmer && o.buyer_phone) || (!isFarmer && o.farmer_phone)) && (
                      <div className="flex items-center gap-1 text-xs mt-1 font-semibold" style={{ color: 'var(--accent)' }}>
                        <Phone className="h-3 w-3" />
                        <span>{isFarmer ? o.buyer_phone : o.farmer_phone}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-xs uppercase block" style={{ color: 'var(--text-muted)' }}>Delivery</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{o.delivery_location}</span>
                  </div>
                  <div>
                    <span className="text-xs uppercase block" style={{ color: 'var(--text-muted)' }}>Mode</span>
                    <span className="font-semibold block mt-0.5" style={{ color: 'var(--text-primary)' }}>
                      {o.delivery_mode === 'TRANSPORT_PARTNER' ? 'Transport Partner' : o.delivery_mode === 'FARMER_DELIVERY' ? 'Farmer Delivery' : o.delivery_mode === 'BUYER_PICKUP' ? 'Self Pickup' : o.delivery_mode}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                {!isCancelled && (
                  <div className="pt-4 pb-2">
                    <div className="relative flex items-center justify-between w-full">
                      {/* Background track */}
                      <div className="absolute left-[14px] right-[14px] h-[2px] top-1/2 transform -translate-y-1/2 -z-10 rounded-full" style={{ background: 'var(--bg-overlay)' }} />
                      {/* Progress fill */}
                      <div className="absolute left-[14px] h-[2px] top-1/2 transform -translate-y-1/2 -z-10 rounded-full transition-all duration-500"
                        style={{
                          background: 'linear-gradient(90deg, var(--accent) 0%, #22c55e 100%)',
                          width: `calc(${currentStep >= 0 ? (currentStep / (statusSteps.length - 1)) * 100 : 0}% - 28px)`,
                          boxShadow: '0 0 8px var(--accent-glow)',
                        }} />
                      {statusSteps.map((step, idx) => {
                        const isDone = idx < currentStep;
                        const isCurrent = idx === currentStep;
                        const isFuture = idx > currentStep;
                        return (
                          <div key={step} className="flex flex-col items-center relative z-10">
                            <div className="relative">
                              {/* Glow ring for current step */}
                              {isCurrent && (
                                <div className="absolute inset-[-6px] rounded-full animate-pulse-glow"
                                  style={{ background: 'var(--accent-glow)' }} />
                              )}
                              <div className="w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all duration-300 relative"
                                style={{
                                  background: isDone ? 'linear-gradient(135deg, #22c55e 0%, var(--accent) 100%)' : isCurrent ? 'var(--accent)' : 'var(--bg-surface)',
                                  borderColor: isDone ? '#22c55e' : isCurrent ? 'var(--accent)' : 'var(--border-strong)',
                                  color: isDone || isCurrent ? 'var(--text-inverse)' : 'var(--text-muted)',
                                  boxShadow: isCurrent
                                    ? '0 0 0 4px var(--accent-glow), 0 2px 8px rgba(34,197,94,0.3)'
                                    : isDone
                                      ? '0 2px 6px rgba(34,197,94,0.2)'
                                      : 'none',
                                  transform: isCurrent ? 'scale(1.1)' : 'scale(1)',
                                }}>
                                {isDone ? (
                                  <Check className="h-3.5 w-3.5 font-bold" />
                                ) : isCurrent ? (
                                  <div className="w-2 h-2 rounded-full bg-white" />
                                ) : (
                                  <span className="text-xs">{idx + 1}</span>
                                )}
                              </div>
                            </div>
                            <span className={`text-[10px] font-semibold mt-2 hidden md:block`}
                              style={{ color: isCurrent ? 'var(--accent)' : isDone ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                              {stepLabels[step] || step}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap justify-between items-center gap-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {o.transport_cost && parseFloat(o.transport_cost) > 0 ? (
                      <span>Transport: <span className="font-bold" style={{ color: 'var(--text-primary)' }}>₹{o.transport_cost}</span>{o.route_distance_km ? ` (${o.route_distance_km} km)` : ''}</span>
                    ) : o.delivery_mode === 'BUYER_PICKUP' ? (
                      <span>Self Pickup — No transport cost</span>
                    ) : (
                      <span>Transport estimate pending confirmation</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isFarmer && o.order_status === 'PENDING' && (
                      <>
                        <button onClick={() => handleUpdateStatus(o.id, 'CONFIRMED')} disabled={updatingId === o.id}
                          className="btn-primary text-xs flex items-center gap-1 disabled:opacity-50">
                          {updatingId === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Confirm
                        </button>
                        <button onClick={() => handleUpdateStatus(o.id, 'CANCELLED')} disabled={updatingId === o.id}
                          className="text-xs flex items-center gap-1 px-4 py-2 rounded-lg font-semibold transition-colors"
                          style={{ background: 'rgba(239,68,68,0.10)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.15)' }}>
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                      </>
                    )}
                    {isFarmer && o.order_status === 'CONFIRMED' && (
                      <button onClick={() => handleUpdateStatus(o.id, 'PICKUP_READY')} disabled={updatingId === o.id}
                        className="text-xs flex items-center gap-1 px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
                        style={{ background: '#a855f7', color: 'white' }}>
                        <Package className="h-3.5 w-3.5" /> Mark Ready <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isFarmer && o.order_status === 'PICKUP_READY' && (
                      <button onClick={() => handleUpdateStatus(o.id, 'IN_TRANSIT')} disabled={updatingId === o.id}
                        className="text-xs flex items-center gap-1 px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
                        style={{ background: '#6366f1', color: 'white' }}>
                        <Truck className="h-3.5 w-3.5" /> Dispatch <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isFarmer && o.order_status === 'IN_TRANSIT' && (
                      <button onClick={() => handleUpdateStatus(o.id, 'DELIVERED')} disabled={updatingId === o.id}
                        className="text-xs flex items-center gap-1 px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
                        style={{ background: '#06b6d4', color: 'white' }}>
                        <CheckCircle className="h-3.5 w-3.5" /> Mark Delivered
                      </button>
                    )}
                    {!isFarmer && o.order_status === 'PENDING' && (
                      <button onClick={() => handleUpdateStatus(o.id, 'CANCELLED')} disabled={updatingId === o.id}
                        className="btn-secondary text-xs flex items-center gap-1 disabled:opacity-50">
                        <X className="h-3.5 w-3.5" /> Cancel
                      </button>
                    )}
                    {!isFarmer && o.order_status === 'DELIVERED' && (
                      <button onClick={() => handleUpdateStatus(o.id, 'COMPLETED')} disabled={updatingId === o.id}
                        className="btn-primary text-xs flex items-center gap-1 disabled:opacity-50">
                        <CheckCircle className="h-3.5 w-3.5" /> Confirm Receipt
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
