import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { orderAPI } from '../services/api';
import {
  ShoppingBag,
  CheckCircle,
  Clock,
  Truck,
  Check,
  X,
  Phone,
  User,
  Package,
  ArrowRight,
  Loader2,
  ShoppingCart,
  MapPin,
  CalendarDays,
  IndianRupee,
  Building2,
} from 'lucide-react';

const statusSteps = [
  'PENDING',
  'CONFIRMED',
  'PICKUP_READY',
  'IN_TRANSIT',
  'DELIVERED',
  'COMPLETED',
];

const statusStyles = {
  PENDING: {
    color: 'var(--warning)',
    bg: 'rgba(245,158,11,0.12)',
    label: 'Order Placed',
  },
  CONFIRMED: {
    color: 'var(--info)',
    bg: 'rgba(59,130,246,0.12)',
    label: 'Accepted',
  },
  PICKUP_READY: {
    color: '#a855f7',
    bg: 'rgba(168,85,247,0.12)',
    label: 'Ready for Pickup',
  },
  IN_TRANSIT: {
    color: '#6366f1',
    bg: 'rgba(99,102,241,0.12)',
    label: 'In Transit',
  },
  DELIVERED: {
    color: '#06b6d4',
    bg: 'rgba(6,182,212,0.12)',
    label: 'Delivered',
  },
  COMPLETED: {
    color: 'var(--accent)',
    bg: 'rgba(34,197,94,0.12)',
    label: 'Completed',
  },
  CANCELLED: {
    color: 'var(--danger)',
    bg: 'rgba(239,68,68,0.12)',
    label: 'Cancelled',
  },
};

const stepLabels = {
  PENDING: 'Placed',
  CONFIRMED: 'Accepted',
  PICKUP_READY: 'Ready',
  IN_TRANSIT: 'Shipped',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
};

const deliveryModeConfig = {
  BUYER_PICKUP: {
    label: 'Self Pickup',
    className: 'badge-neutral',
  },
  FARMER_DELIVERY: {
    label: 'Farmer Delivery',
    className: 'badge-info',
  },
  TRANSPORT_PARTNER: {
    label: 'Transport Partner',
    className: 'badge-neutral',
  },
};

const getRole = (user) =>
  user?.role?.trim?.().toUpperCase?.() || '';

const isFarmerRole = (user) =>
  ['FARMER', 'FPO'].includes(getRole(user));

const formatCommodity = (commodity) => {
  if (!commodity) return 'Produce';

  return commodity
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatGrade = (grade) => {
  if (!grade) return '';

  return grade
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatDate = (date) => {
  if (!date) return '—';

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return '—';

  return parsed.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatCurrency = (value) => {
  const amount = parseFloat(value || 0);

  return `₹${amount.toLocaleString('en-IN')}`;
};

export default function Orders() {
  const { user, profile } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  const isFarmer = isFarmerRole(user);

  const loadOrders = useCallback(async () => {
    if (!profile?.id) return;

    setLoading(true);
    setError('');

    try {
      const res = isFarmer
        ? await orderAPI.getByFarmer(profile.id)
        : await orderAPI.getByBuyer(profile.id);

      setOrders(res?.data || []);
    } catch (err) {
      console.error('Failed to load orders:', err);
      setError(
        err.response?.data?.error ||
          'Failed to load orders. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [profile?.id, isFarmer]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleUpdateStatus = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    setError('');

    try {
      await orderAPI.updateStatus(orderId, newStatus);
      await loadOrders();
    } catch (err) {
      setError(
        err.response?.data?.error ||
          'Failed to update order status.'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const getStepIndex = (status) =>
    statusSteps.indexOf(status);

  const getTotalAmount = (order) => {
    const price = parseFloat(order.final_price || 0);
    const quantity = parseFloat(order.quantity || 0);

    return price * quantity;
  };

  const getTransportCost = (order) => {
    const cost = parseFloat(order.transport_cost || 0);

    return Number.isFinite(cost) ? cost : 0;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{
            borderColor: 'var(--bg-overlay)',
            borderTopColor: 'var(--accent)',
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* =========================================================
          HEADER
      ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

        <div>
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: isFarmer
                  ? 'rgba(34,197,94,0.12)'
                  : 'rgba(59,130,246,0.12)',
              }}
            >
              {isFarmer ? (
                <Package
                  className="h-5 w-5"
                  style={{ color: 'var(--accent)' }}
                />
              ) : (
                <ShoppingBag
                  className="h-5 w-5"
                  style={{ color: 'var(--info)' }}
                />
              )}
            </div>

            <div>
              <h1
                className="text-2xl font-bold gradient-text"
              >
                {isFarmer
                  ? 'Received Orders'
                  : 'My Orders'}
              </h1>

              <p
                className="text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                {isFarmer
                  ? 'Manage buyer orders and update delivery progress.'
                  : 'Track your purchases and confirm deliveries.'}
              </p>
            </div>
          </div>
        </div>

        {/* Order count */}
        <div
          className="self-start sm:self-auto px-3 py-2 rounded-xl text-xs font-semibold"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          {orders.length}{' '}
          {orders.length === 1 ? 'Order' : 'Orders'}
        </div>
      </div>

      {/* =========================================================
          ERROR
      ========================================================= */}
      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'rgba(239,68,68,0.10)',
            color: '#dc2626',
            border: '1px solid rgba(239,68,68,0.15)',
          }}
        >
          {error}
        </div>
      )}

      {/* =========================================================
          EMPTY STATE
      ========================================================= */}
      {orders.length === 0 ? (
        <div className="card-atmospheric p-10 text-center animate-fade-in-up">

          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{
              background: isFarmer
                ? 'rgba(34,197,94,0.10)'
                : 'rgba(59,130,246,0.10)',
            }}
          >
            {isFarmer ? (
              <Package
                className="h-8 w-8"
                style={{ color: 'var(--accent)' }}
              />
            ) : (
              <ShoppingBag
                className="h-8 w-8"
                style={{ color: 'var(--info)' }}
              />
            )}
          </div>

          <p
            className="font-semibold text-lg"
            style={{ color: 'var(--text-primary)' }}
          >
            {isFarmer
              ? 'No orders received yet'
              : 'No orders yet'}
          </p>

          <p
            className="text-sm mt-1 max-w-md mx-auto"
            style={{ color: 'var(--text-muted)' }}
          >
            {isFarmer
              ? 'When buyers purchase your produce, their orders will appear here.'
              : 'Orders will appear here after you purchase produce from the marketplace.'}
          </p>

          <a
            href="/marketplace"
            className="inline-flex items-center gap-1.5 mt-5 btn-primary text-sm"
          >
            <ShoppingCart className="h-3.5 w-3.5" />

            {isFarmer
              ? 'View Marketplace'
              : 'Browse Marketplace'}
          </a>
        </div>
      ) : (
        <div className="space-y-5">

          {orders.map((o) => {
            const currentStep = getStepIndex(
              o.order_status
            );

            const isCancelled =
              o.order_status === 'CANCELLED';

            const status =
              statusStyles[o.order_status] ||
              statusStyles.PENDING;

            const transportCost =
              getTransportCost(o);

            const produceValue =
              getTotalAmount(o);

            const totalWithTransport =
              produceValue + transportCost;

            const deliveryMode =
              deliveryModeConfig[o.delivery_mode];

            const otherPersonName = isFarmer
              ? o.buyer_name
              : o.farmer_name;

            const otherPersonPhone = isFarmer
              ? o.buyer_phone
              : o.farmer_phone;

            return (
              <div
                key={o.id}
                className="card-surface overflow-hidden transition-all hover-lift"
              >

                {/* =================================================
                    ORDER HEADER
                ================================================= */}
                <div
                  className="p-5 sm:p-6 border-b"
                  style={{
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">

                    <div className="min-w-0">

                      <div className="flex flex-wrap items-center gap-2 mb-2">

                        <span
                          className="text-[11px] font-bold tracking-wide"
                          style={{
                            color: 'var(--text-muted)',
                          }}
                        >
                          ORDER #
                          {o.id
                            ?.substring(0, 8)
                            .toUpperCase()}
                        </span>

                        {deliveryMode && (
                          <span
                            className={`text-[10px] font-semibold px-2 py-1 rounded-md ${deliveryMode.className}`}
                          >
                            {deliveryMode.label}
                          </span>
                        )}
                      </div>

                      <h3
                        className="text-lg sm:text-xl font-bold"
                        style={{
                          color: 'var(--text-primary)',
                        }}
                      >
                        {formatCommodity(o.commodity)}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">

                        {o.variety && (
                          <span
                            className="text-xs"
                            style={{
                              color: 'var(--text-muted)',
                            }}
                          >
                            Variety: {o.variety}
                          </span>
                        )}

                        {o.grade && (
                          <span
                            className="text-xs"
                            style={{
                              color: 'var(--text-muted)',
                            }}
                          >
                            Grade: {formatGrade(o.grade)}
                          </span>
                        )}
                      </div>

                      <div
                        className="flex items-center gap-1.5 mt-2 text-xs"
                        style={{
                          color: 'var(--text-muted)',
                        }}
                      >
                        <CalendarDays className="h-3.5 w-3.5" />
                        Placed {formatDate(o.created_at)}
                      </div>
                    </div>

                    <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-2">

                      <span
                        className="badge"
                        style={{
                          background: status.bg,
                          color: status.color,
                        }}
                      >
                        {status.label}
                      </span>

                      <div className="text-right">
                        <p
                          className="text-[10px] uppercase tracking-wide"
                          style={{
                            color: 'var(--text-muted)',
                          }}
                        >
                          Order Value
                        </p>

                        <p
                          className="text-lg font-bold font-numeric"
                          style={{
                            color: 'var(--text-primary)',
                          }}
                        >
                          {formatCurrency(
                            totalWithTransport
                          )}
                        </p>
                      </div>

                    </div>
                  </div>
                </div>

                {/* =================================================
                    ORDER INFORMATION
                ================================================= */}
                <div className="p-5 sm:p-6">

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                    {/* Quantity */}
                    <div
                      className="rounded-xl p-4"
                      style={{
                        background:
                          'var(--bg-elevated)',
                        border:
                          '1px solid var(--border)',
                      }}
                    >
                      <div
                        className="flex items-center gap-2 text-xs"
                        style={{
                          color: 'var(--text-muted)',
                        }}
                      >
                        <Package className="h-3.5 w-3.5" />
                        Quantity
                      </div>

                      <p
                        className="font-bold mt-2"
                        style={{
                          color: 'var(--text-primary)',
                        }}
                      >
                        {o.quantity} kg
                      </p>

                      <p
                        className="text-xs mt-1"
                        style={{
                          color: 'var(--text-muted)',
                        }}
                      >
                        {formatCurrency(
                          o.final_price
                        )}{' '}
                        / kg
                      </p>
                    </div>

                    {/* Buyer/Farmer */}
                    <div
                      className="rounded-xl p-4"
                      style={{
                        background:
                          'var(--bg-elevated)',
                        border:
                          '1px solid var(--border)',
                      }}
                    >
                      <div
                        className="flex items-center gap-2 text-xs"
                        style={{
                          color: 'var(--text-muted)',
                        }}
                      >
                        {isFarmer ? (
                          <Building2 className="h-3.5 w-3.5" />
                        ) : (
                          <User className="h-3.5 w-3.5" />
                        )}

                        {isFarmer
                          ? 'Buyer'
                          : 'Farmer'}
                      </div>

                      <p
                        className="font-semibold mt-2 truncate"
                        style={{
                          color: 'var(--text-primary)',
                        }}
                      >
                        {otherPersonName || '—'}
                      </p>

                      {isFarmer &&
                        o.buyer_company && (
                          <p
                            className="text-xs mt-1 truncate"
                            style={{
                              color: 'var(--text-muted)',
                            }}
                          >
                            {o.buyer_company}
                          </p>
                        )}

                      {otherPersonPhone && (
                        <a
                          href={`tel:${otherPersonPhone}`}
                          className="flex items-center gap-1 text-xs mt-2 font-semibold"
                          style={{
                            color: 'var(--accent)',
                          }}
                        >
                          <Phone className="h-3 w-3" />
                          {otherPersonPhone}
                        </a>
                      )}
                    </div>

                    {/* Delivery */}
                    <div
                      className="rounded-xl p-4"
                      style={{
                        background:
                          'var(--bg-elevated)',
                        border:
                          '1px solid var(--border)',
                      }}
                    >
                      <div
                        className="flex items-center gap-2 text-xs"
                        style={{
                          color: 'var(--text-muted)',
                        }}
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        Delivery
                      </div>

                      <p
                        className="font-semibold mt-2 text-sm leading-5"
                        style={{
                          color: 'var(--text-primary)',
                        }}
                      >
                        {o.delivery_location ||
                          '—'}
                      </p>
                    </div>

                    {/* Cost */}
                    <div
                      className="rounded-xl p-4"
                      style={{
                        background:
                          'var(--bg-elevated)',
                        border:
                          '1px solid var(--border)',
                      }}
                    >
                      <div
                        className="flex items-center gap-2 text-xs"
                        style={{
                          color: 'var(--text-muted)',
                        }}
                      >
                        <IndianRupee className="h-3.5 w-3.5" />
                        Cost
                      </div>

                      <p
                        className="font-bold mt-2"
                        style={{
                          color: 'var(--accent)',
                        }}
                      >
                        {formatCurrency(
                          produceValue
                        )}
                      </p>

                      <p
                        className="text-xs mt-1"
                        style={{
                          color: 'var(--text-muted)',
                        }}
                      >
                        {transportCost > 0
                          ? `+ ${formatCurrency(
                              transportCost
                            )} transport`
                          : 'No transport charge'}
                      </p>
                    </div>
                  </div>

                  {/* =================================================
                      DELIVERY INFORMATION
                  ================================================= */}
                  <div
                    className="mt-4 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    style={{
                      background:
                        'rgba(59,130,246,0.06)',
                      border:
                        '1px solid rgba(59,130,246,0.10)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Truck
                        className="h-4 w-4"
                        style={{
                          color: 'var(--info)',
                        }}
                      />

                      <span
                        className="text-xs"
                        style={{
                          color: 'var(--text-muted)',
                        }}
                      >
                        Delivery Mode
                      </span>

                      <span
                        className="text-xs font-semibold"
                        style={{
                          color: 'var(--text-primary)',
                        }}
                      >
                        {deliveryMode?.label ||
                          o.delivery_mode ||
                          'Not specified'}
                      </span>
                    </div>

                    {o.route_distance_km && (
                      <span
                        className="text-xs"
                        style={{
                          color: 'var(--text-muted)',
                        }}
                      >
                        Route:{' '}
                        <strong
                          style={{
                            color:
                              'var(--text-primary)',
                          }}
                        >
                          {o.route_distance_km} km
                        </strong>
                      </span>
                    )}
                  </div>

                  {/* =================================================
                      PROGRESS
                  ================================================= */}
                  {!isCancelled && (
                    <div className="pt-7 pb-3">

                      <div className="relative flex items-center justify-between w-full">

                        {/* Background track */}
                        <div
                          className="absolute left-[14px] right-[14px] h-[2px] top-[14px] -z-0 rounded-full"
                          style={{
                            background:
                              'var(--bg-overlay)',
                          }}
                        />

                        {/* Progress */}
                        <div
                          className="absolute left-[14px] h-[2px] top-[14px] -z-0 rounded-full transition-all duration-500"
                          style={{
                            background:
                              'linear-gradient(90deg, var(--accent) 0%, #22c55e 100%)',
                            width:
                              currentStep >= 0
                                ? `calc(${(currentStep /
                                    (statusSteps.length -
                                      1)) *
                                    100}% - 28px)`
                                : '0%',
                            boxShadow:
                              '0 0 8px var(--accent-glow)',
                          }}
                        />

                        {statusSteps.map(
                          (step, index) => {
                            const isDone =
                              index < currentStep;

                            const isCurrent =
                              index === currentStep;

                            return (
                              <div
                                key={step}
                                className="flex flex-col items-center relative z-10"
                              >
                                <div className="relative">

                                  {isCurrent && (
                                    <div
                                      className="absolute inset-[-5px] rounded-full animate-pulse-glow"
                                      style={{
                                        background:
                                          'var(--accent-glow)',
                                      }}
                                    />
                                  )}

                                  <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all duration-300 relative"
                                    style={{
                                      background: isDone
                                        ? 'linear-gradient(135deg, #22c55e 0%, var(--accent) 100%)'
                                        : isCurrent
                                          ? 'var(--accent)'
                                          : 'var(--bg-surface)',

                                      borderColor: isDone
                                        ? '#22c55e'
                                        : isCurrent
                                          ? 'var(--accent)'
                                          : 'var(--border-strong)',

                                      color:
                                        isDone ||
                                        isCurrent
                                          ? 'var(--text-inverse)'
                                          : 'var(--text-muted)',

                                      boxShadow:
                                        isCurrent
                                          ? '0 0 0 4px var(--accent-glow), 0 2px 8px rgba(34,197,94,0.3)'
                                          : 'none',
                                    }}
                                  >
                                    {isDone ? (
                                      <Check className="h-3.5 w-3.5" />
                                    ) : isCurrent ? (
                                      <div className="w-2 h-2 rounded-full bg-white" />
                                    ) : (
                                      <span className="text-[10px]">
                                        {index + 1}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <span
                                  className="text-[10px] font-semibold mt-2 hidden md:block"
                                  style={{
                                    color: isCurrent
                                      ? 'var(--accent)'
                                      : isDone
                                        ? 'var(--text-secondary)'
                                        : 'var(--text-muted)',
                                  }}
                                >
                                  {stepLabels[step]}
                                </span>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  )}

                  {/* =================================================
                      CANCELLED STATUS
                  ================================================= */}
                  {isCancelled && (
                    <div
                      className="mt-5 rounded-xl p-4 flex items-center gap-3"
                      style={{
                        background:
                          'rgba(239,68,68,0.08)',
                        border:
                          '1px solid rgba(239,68,68,0.15)',
                      }}
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center"
                        style={{
                          background:
                            'rgba(239,68,68,0.12)',
                        }}
                      >
                        <X
                          className="h-4 w-4"
                          style={{
                            color: 'var(--danger)',
                          }}
                        />
                      </div>

                      <div>
                        <p
                          className="text-sm font-semibold"
                          style={{
                            color: 'var(--danger)',
                          }}
                        >
                          Order Cancelled
                        </p>

                        <p
                          className="text-xs mt-0.5"
                          style={{
                            color: 'var(--text-muted)',
                          }}
                        >
                          This order is no longer active.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* =================================================
                      ACTION AREA
                  ================================================= */}
                  <div
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-5 pt-5 border-t"
                    style={{
                      borderColor: 'var(--border)',
                    }}
                  >

                    {/* Transport information */}
                    <div
                      className="text-xs"
                      style={{
                        color: 'var(--text-muted)',
                      }}
                    >
                      {transportCost > 0 ? (
                        <span>
                          Transport:{' '}
                          <strong
                            style={{
                              color:
                                'var(--text-primary)',
                            }}
                          >
                            {formatCurrency(
                              transportCost
                            )}
                          </strong>

                          {o.route_distance_km
                            ? ` · ${o.route_distance_km} km`
                            : ''}
                        </span>
                      ) : o.delivery_mode ===
                        'BUYER_PICKUP' ? (
                        <span>
                          Self Pickup · No transport cost
                        </span>
                      ) : (
                        <span>
                          No additional transport charge
                          recorded
                        </span>
                      )}
                    </div>

                    {/* =================================================
                        FARMER ACTIONS
                    ================================================= */}
                    {isFarmer && (
                      <div className="flex flex-wrap gap-2">

                        {/* Pending */}
                        {o.order_status ===
                          'PENDING' && (
                          <>
                            <button
                              onClick={() =>
                                handleUpdateStatus(
                                  o.id,
                                  'CONFIRMED'
                                )
                              }
                              disabled={
                                updatingId === o.id
                              }
                              className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
                            >
                              {updatingId === o.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Accept Order
                            </button>

                            <button
                              onClick={() =>
                                handleUpdateStatus(
                                  o.id,
                                  'CANCELLED'
                                )
                              }
                              disabled={
                                updatingId === o.id
                              }
                              className="text-xs flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
                              style={{
                                background:
                                  'rgba(239,68,68,0.10)',
                                color:
                                  'var(--danger)',
                                border:
                                  '1px solid rgba(239,68,68,0.15)',
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                              Reject
                            </button>
                          </>
                        )}

                        {/* Confirmed */}
                        {o.order_status ===
                          'CONFIRMED' && (
                          <button
                            onClick={() =>
                              handleUpdateStatus(
                                o.id,
                                'PICKUP_READY'
                              )
                            }
                            disabled={
                              updatingId === o.id
                            }
                            className="text-xs flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
                            style={{
                              background: '#a855f7',
                              color: 'white',
                            }}
                          >
                            {updatingId === o.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Package className="h-3.5 w-3.5" />
                            )}

                            Mark Ready

                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Ready */}
                        {o.order_status ===
                          'PICKUP_READY' && (
                          <button
                            onClick={() =>
                              handleUpdateStatus(
                                o.id,
                                'IN_TRANSIT'
                              )
                            }
                            disabled={
                              updatingId === o.id
                            }
                            className="text-xs flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
                            style={{
                              background: '#6366f1',
                              color: 'white',
                            }}
                          >
                            {updatingId === o.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Truck className="h-3.5 w-3.5" />
                            )}

                            Dispatch

                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* In transit */}
                        {o.order_status ===
                          'IN_TRANSIT' && (
                          <button
                            onClick={() =>
                              handleUpdateStatus(
                                o.id,
                                'DELIVERED'
                              )
                            }
                            disabled={
                              updatingId === o.id
                            }
                            className="text-xs flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
                            style={{
                              background: '#06b6d4',
                              color: 'white',
                            }}
                          >
                            {updatingId === o.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="h-3.5 w-3.5" />
                            )}

                            Mark Delivered
                          </button>
                        )}
                      </div>
                    )}

                    {/* =================================================
                        BUYER ACTIONS
                    ================================================= */}
                    {!isFarmer && (
                      <div className="flex flex-wrap gap-2">

                        {/* Pending */}
                        {o.order_status ===
                          'PENDING' && (
                          <button
                            onClick={() =>
                              handleUpdateStatus(
                                o.id,
                                'CANCELLED'
                              )
                            }
                            disabled={
                              updatingId === o.id
                            }
                            className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {updatingId === o.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                            Cancel Order
                          </button>
                        )}

                        {/* Delivered */}
                        {o.order_status ===
                          'DELIVERED' && (
                          <button
                            onClick={() =>
                              handleUpdateStatus(
                                o.id,
                                'COMPLETED'
                              )
                            }
                            disabled={
                              updatingId === o.id
                            }
                            className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {updatingId === o.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="h-3.5 w-3.5" />
                            )}

                            Confirm Receipt
                          </button>
                        )}

                        {/* Completed */}
                        {o.order_status ===
                          'COMPLETED' && (
                          <span
                            className="text-xs font-semibold flex items-center gap-1.5 px-3 py-2 rounded-lg"
                            style={{
                              background:
                                'rgba(34,197,94,0.10)',
                              color:
                                'var(--accent)',
                            }}
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Purchase Completed
                          </span>
                        )}
                      </div>
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