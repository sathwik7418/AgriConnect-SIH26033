import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { orderAPI } from '../services/api';
import { ShoppingBag, CheckCircle, Clock, Truck, ShieldAlert, ArrowRight, Check, X, Phone, User } from 'lucide-react';

const statusSteps = ['PENDING', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];
const statusColors = {
  PENDING: 'text-amber-600 bg-amber-50 border-amber-200',
  CONFIRMED: 'text-blue-600 bg-blue-50 border-blue-200',
  IN_TRANSIT: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  DELIVERED: 'text-teal-600 bg-teal-50 border-teal-200',
  COMPLETED: 'text-green-600 bg-green-50 border-green-200',
  CANCELLED: 'text-gray-600 bg-gray-50 border-gray-200',
};

const statusLabels = {
  PENDING: '🕐 Order Placed',
  CONFIRMED: '✅ Order Accepted',
  IN_TRANSIT: '🚚 Shipped',
  DELIVERED: '📍 Delivered',
  COMPLETED: '✅ Completed',
  CANCELLED: '❌ Cancelled'
};

const stepLabels = {
  PENDING: 'Placed',
  CONFIRMED: 'Accepted',
  IN_TRANSIT: 'Shipped',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed'
};

export default function Orders() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile?.id) {
      loadOrders();
    }
  }, [profile]);

  const loadOrders = async () => {
    setLoading(true);
    setError('');
    try {
      if (user.role === 'FARMER' || user.role === 'FPO') {
        const res = await orderAPI.getByFarmer(profile.id);
        setOrders(res.data);
      } else {
        const res = await orderAPI.getByBuyer(profile.id);
        setOrders(res.data);
      }
    } catch (err) {
      setError('Failed to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      await orderAPI.updateStatus(orderId, newStatus);
      alert(`Order status updated to ${newStatus}`);
      loadOrders();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update order status');
    }
  };

  const getStepIndex = (status) => statusSteps.indexOf(status);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Your Orders</h1>
        <p className="text-gray-500 text-sm">
          {user.role === 'FARMER' || user.role === 'FPO'
            ? 'Manage received crop orders and update dispatch status'
            : 'Track your placed orders and confirm deliveries'}
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {orders.length === 0 ? (
        <div className="bg-white rounded-xl card-shadow p-8 text-center text-gray-500">
          <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="font-semibold text-lg">No orders found</p>
          <p className="text-sm mt-1">Transactions will appear here once orders are placed in the marketplace.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const currentStep = getStepIndex(o.order_status);
            const isCancelled = o.order_status === 'CANCELLED';
            const isFarmer = user.role === 'FARMER' || user.role === 'FPO';

            return (
              <div key={o.id} className="bg-white rounded-xl card-shadow border p-6 space-y-4 hover:border-gray-300 transition-all">
                {/* Header */}
                <div className="flex flex-wrap justify-between items-start gap-4 pb-4 border-b">
                  <div>
                    <span className="text-xs font-semibold text-gray-400">ORDER ID: {o.id.substring(0, 8).toUpperCase()}</span>
                    <h3 className="text-lg font-bold text-gray-900 mt-0.5">{o.commodity} <span className="text-sm font-normal text-gray-500">({o.variety} | {o.grade})</span></h3>
                    <p className="text-xs text-gray-400 mt-1">Placed on {new Date(o.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`px-3 py-1 text-xs font-bold rounded-full border ${statusColors[o.order_status]}`}>
                      {statusLabels[o.order_status] || o.order_status}
                    </span>
                    <span className="text-sm font-semibold text-gray-700 font-numeric">
                      Total: Rs{(parseFloat(o.final_price) * parseFloat(o.quantity)).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400 text-xs uppercase block">Transaction Qty</span>
                    <span className="font-semibold text-gray-800">{o.quantity} kg</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase block">
                      {isFarmer ? 'Buyer Details' : 'Farmer Details'}
                    </span>
                    <div className="flex items-center gap-1 font-semibold text-gray-800 mt-0.5">
                      <User className="h-3.5 w-3.5 text-gray-400" />
                      <span>{isFarmer ? o.buyer_name : o.farmer_name}</span>
                    </div>
                    {isFarmer && o.buyer_company && (
                      <span className="text-xs text-gray-500 block">{o.buyer_company}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase block">Delivery Location</span>
                    <span className="font-semibold text-gray-800">{o.delivery_location}</span>
                  </div>
                </div>

                {/* Progress bar tracker */}
                {!isCancelled && (
                  <div className="pt-4 pb-2">
                    <div className="relative flex items-center justify-between w-full">
                      {/* Background Line */}
                      <div className="absolute left-0 right-0 h-1 bg-gray-100 top-1/2 transform -translate-y-1/2 -z-10 rounded"></div>
                      {/* Colored Active Line */}
                      <div
                        className="absolute left-0 h-1 bg-green-600 top-1/2 transform -translate-y-1/2 -z-10 transition-all duration-300 rounded"
                        style={{ width: `${currentStep >= 0 ? (currentStep / (statusSteps.length - 1)) * 100 : 0}%` }}
                      ></div>

                      {statusSteps.map((step, idx) => {
                        const isDone = idx <= currentStep;
                        const isCurrent = idx === currentStep;

                        return (
                          <div key={step} className="flex flex-col items-center">
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                                isDone
                                  ? 'bg-green-600 border-green-600 text-white'
                                  : 'bg-white border-gray-200 text-gray-400'
                              } ${isCurrent ? 'ring-4 ring-green-100 scale-110' : ''}`}
                            >
                              {isDone ? <Check className="h-3.5 w-3.5 font-bold" /> : <span className="text-xs">{idx + 1}</span>}
                            </div>
                            <span className={`text-[10px] font-semibold mt-2 hidden md:block ${isCurrent ? 'text-green-700 font-bold' : isDone ? 'text-gray-600' : 'text-gray-400'}`}>
                              {stepLabels[step] || step}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Actions Section */}
                <div className="flex flex-wrap justify-between items-center gap-4 pt-4 border-t">
                  <div className="text-xs text-gray-500">
                    {o.transport_cost && parseFloat(o.transport_cost) > 0 ? (
                      <span>Logistics Route Cost: <span className="font-bold text-gray-700 font-numeric">Rs{o.transport_cost}</span></span>
                    ) : (
                      <span>* Logistics cost calculated on accepting/readying order</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {/* Farmer actions */}
                    {isFarmer && (
                      <>
                        {o.order_status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(o.id, 'CONFIRMED')}
                              className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-green-700 flex items-center gap-1 shadow-sm"
                            >
                              <Check className="h-3.5 w-3.5" /> Confirm Order
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(o.id, 'CANCELLED')}
                              className="border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1"
                            >
                              <X className="h-3.5 w-3.5" /> Reject
                            </button>
                          </>
                        )}
                        {o.order_status === 'CONFIRMED' && (
                          <button
                            onClick={() => handleUpdateStatus(o.id, 'IN_TRANSIT')}
                            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-purple-700 flex items-center gap-1"
                          >
                            <Truck className="h-3.5 w-3.5" /> Dispatch (In Transit) <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {o.order_status === 'IN_TRANSIT' && (
                          <button
                            onClick={() => handleUpdateStatus(o.id, 'DELIVERED')}
                            className="bg-teal-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-teal-700 flex items-center gap-1"
                          >
                            <CheckCircle className="h-3.5 w-3.5" /> Mark as Delivered
                          </button>
                        )}
                      </>
                    )}

                    {/* Buyer actions */}
                    {!isFarmer && (
                      <>
                        {o.order_status === 'PENDING' && (
                          <button
                            onClick={() => handleUpdateStatus(o.id, 'CANCELLED')}
                            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-xs font-semibold hover:bg-gray-50 flex items-center gap-1"
                          >
                            <X className="h-3.5 w-3.5" /> Cancel Order
                          </button>
                        )}
                        {o.order_status === 'DELIVERED' && (
                          <button
                            onClick={() => handleUpdateStatus(o.id, 'COMPLETED')}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-green-700 flex items-center gap-1 shadow-sm"
                          >
                            <CheckCircle className="h-3.5 w-3.5" /> Confirm Receipt & Complete
                          </button>
                        )}
                      </>
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
