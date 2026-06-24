import { useRef } from 'react';
import {
  useDeliveryStore,
  resolveOrderKey,
  mapDeliveryPhaseToTripStatus,
} from '@/modules/DeliveryV2/store/useDeliveryStore';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import { mapOrderLocations } from '@/modules/DeliveryV2/utils/orderMapping';

export const useOrderManager = () => {
  const {
    getFocusedOrder,
    focusedOrderId,
    acceptOrderToQueue,
    removeNewOrder,
    removeAcceptedOrder,
    updateTripStatus,
    updateOrderSession,
    setCapacity,
    riderLocation,
    orderSessions,
  } = useDeliveryStore();

  const resolveOrderId = (orderLike) => {
    const source = orderLike || getFocusedOrder();
    return resolveOrderKey(source);
  };

  const acceptOrderInFlight = useRef(false);

  const acceptOrder = async (order) => {
    if (acceptOrderInFlight.current) {
      toast.info('Already processing this order...');
      return;
    }
    const orderId = resolveOrderId(order);
    if (!orderId) {
      toast.error('Invalid order data');
      return;
    }

    acceptOrderInFlight.current = true;
    try {
      const response = await deliveryAPI.acceptOrder(orderId);

      if (response?.data?.success) {
        const fullOrder = response.data.data?.order || order;
        const mappedOrder = mapOrderLocations({
          ...fullOrder,
          orderId,
        });
        acceptOrderToQueue(mappedOrder);
        removeNewOrder(orderId);

        const capacity = response?.data?.data?.capacity;
        if (capacity) {
          setCapacity(capacity);
        } else {
          const current = useDeliveryStore.getState().capacity;
          const active = useDeliveryStore.getState().acceptedOrders.length;
          setCapacity({
            max: current.max,
            active,
            remaining: Math.max(0, current.max - active),
          });
        }
      } else {
        toast.error(response?.data?.message || 'Order already taken or unavailable');
        throw new Error('Accept failed');
      }
    } catch (error) {
      console.error('Accept Order Error:', error);
      const msg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        'Network error. Please try again.';
      if (
        error?.response?.status === 403 ||
        msg.toLowerCase().includes('already accepted')
      ) {
        toast.error('This order was just taken by another delivery partner.', {
          duration: 4000,
        });
      } else if (msg.toLowerCase().includes('maximum concurrent')) {
        toast.error('Maximum concurrent orders reached');
      } else {
        toast.error(msg);
      }
      throw error;
    } finally {
      acceptOrderInFlight.current = false;
    }
  };

  const reachPickup = async (orderLike) => {
    const orderId = resolveOrderId(orderLike);
    if (!orderId) {
      toast.error('Order id not found. Please refresh current trip.');
      throw new Error('Missing order id');
    }
    try {
      const response = await deliveryAPI.confirmReachedPickup(orderId);
      if (response?.data?.success) {
        updateTripStatus('REACHED_PICKUP', orderId);
      } else {
        throw new Error('Confirm pickup failed');
      }
    } catch (error) {
      toast.error(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          'Failed to update status',
      );
      throw error;
    }
  };

  const pickUpOrder = async (billImageUrl, orderLike) => {
    const order = orderLike || getFocusedOrder();
    const orderId = resolveOrderId(order);
    if (!orderId) {
      toast.error('Order id not found. Please refresh current trip.');
      throw new Error('Missing order id');
    }
    try {
      const response = await deliveryAPI.confirmOrderId(
        orderId,
        order?.displayOrderId || orderId,
        riderLocation || {},
        { billImageUrl },
      );

      if (response?.data?.success) {
        updateTripStatus('PICKED_UP', orderId);
      } else {
        throw new Error('Confirm order ID failed');
      }
    } catch (error) {
      toast.error(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          'Error confirming pickup',
      );
      throw error;
    }
  };

  const reachDrop = async (orderLike) => {
    const orderId = resolveOrderId(orderLike);
    if (!orderId) {
      toast.error('Order id not found. Please refresh current trip.');
      throw new Error('Missing order id');
    }
    try {
      const response = await deliveryAPI.confirmReachedDrop(orderId);
      if (response?.data?.success) {
        updateTripStatus('REACHED_DROP', orderId);
      } else {
        throw new Error('Confirm drop failed');
      }
    } catch (error) {
      toast.error(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          'Failed to notify arrival',
      );
      throw error;
    }
  };

  const completeDelivery = async (otp, paymentMethodOverride = null, orderLike) => {
    const order = orderLike || getFocusedOrder();
    const orderId = resolveOrderId(order);
    if (!orderId) {
      toast.error('Order id not found. Please refresh current trip.');
      throw new Error('Missing order id');
    }
    try {
      const verifyRes = await deliveryAPI.verifyDropOtp(orderId, otp);

      if (verifyRes?.data?.success) {
        let finalOrder = verifyRes.data?.data?.order || order;

        try {
          const completeRes = await deliveryAPI.completeDelivery(orderId, {
            otp,
            rating: 5,
            paymentMethod: paymentMethodOverride,
          });
          if (completeRes.data?.success && completeRes.data?.data?.order) {
            finalOrder = completeRes.data.data.order;
          }
        } catch (completeErr) {
          console.warn('Complete call failed, but OTP was verified.', completeErr);
        }

        if (finalOrder) {
          acceptOrderToQueue(mapOrderLocations({ ...finalOrder, orderId }));
        }

        updateTripStatus('COMPLETED', orderId);
        updateOrderSession(orderId, { showVerification: false });
      } else {
        toast.error('Invalid OTP. Please check with customer.');
        throw new Error('Invalid OTP');
      }
    } catch (error) {
      console.error('Completion Error:', error);
      toast.error(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          'Verification failed',
      );
      throw error;
    }
  };

  const resetTrip = (orderLike) => {
    const orderId = resolveOrderId(orderLike);
    if (!orderId) return;
    removeAcceptedOrder(orderId);
    const state = useDeliveryStore.getState();
    const active = state.acceptedOrders.length;
    setCapacity({
      max: state.capacity.max,
      active,
      remaining: Math.max(0, state.capacity.max - active),
    });
  };

  const switchFocusedOrder = (nextOrderId) => {
    const currentId = focusedOrderId || resolveOrderKey(getFocusedOrder());
    if (currentId) {
      const currentSession = orderSessions[currentId] || {};
      updateOrderSession(currentId, currentSession);
    }
    useDeliveryStore.getState().setFocusedOrder(nextOrderId);
    const nextOrder = useDeliveryStore
      .getState()
      .acceptedOrders.find((item) => resolveOrderKey(item) === String(nextOrderId));
    if (nextOrder) {
      const existing = useDeliveryStore.getState().orderSessions[String(nextOrderId)];
      if (!existing?.tripStatus) {
        updateTripStatus(mapDeliveryPhaseToTripStatus(nextOrder), String(nextOrderId));
      }
    }
  };

  return {
    acceptOrder,
    reachPickup,
    pickUpOrder,
    reachDrop,
    completeDelivery,
    resetTrip,
    switchFocusedOrder,
  };
};
