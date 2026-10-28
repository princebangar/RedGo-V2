import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { deliveryAPI } from '@food/api';

const LAPTOP_TEST_FALLBACK = { lat: 22.7196, lng: 75.8577, heading: 0 };

const geoOptions = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 15000,
};

/** Send GPS to the backend at most this often (Feed sends its own, faster updates). */
const BACKEND_SYNC_MS = 20000;

/** Orders tab only — Feed uses DeliveryHomeV2 map tracking; Pocket/Profile do not need GPS. */
export function isOrdersRoute(pathname = '') {
  return /\/orders\/?$/.test(pathname) || pathname.endsWith('/orders');
}

/** Feed screen (/food/delivery or /food/delivery/feed): DeliveryHomeV2 tracks GPS itself there. */
export function isFeedRoute(pathname = '') {
  return /\/delivery\/?(feed\/?)?$/.test(pathname);
}

/**
 * Fills riderLocation for new-order distance/ETA on the Orders screen, and keeps the rider's
 * location fresh on the backend on every screen except Feed. Dispatch only offers orders to riders
 * whose GPS is recent, so a rider waiting on the Orders / Pocket / Profile screen used to stop
 * getting new orders after 10 minutes.
 */
export function useRiderLocationSync() {
  const { pathname } = useLocation();
  const isOnline = useDeliveryStore((state) => state.isOnline);
  const setRiderLocation = useDeliveryStore((state) => state.setRiderLocation);
  const shouldSync = isOnline && !isFeedRoute(pathname);
  const isOrders = isOrdersRoute(pathname);

  useEffect(() => {
    if (!shouldSync || typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }

    let lastCoords = null;
    let lastSentAt = 0;

    const sendToBackend = (force = false) => {
      // updateLocation also sends status "online": never send it after the rider went offline.
      if (!lastCoords || !useDeliveryStore.getState().isOnline) return;
      const now = Date.now();
      if (!force && now - lastSentAt < BACKEND_SYNC_MS) return;
      lastSentAt = now;
      deliveryAPI
        .updateLocation(lastCoords.lat, lastCoords.lng, true, { heading: lastCoords.heading || 0 })
        .catch(() => {});
    };

    const applyPosition = (pos) => {
      const { latitude: lat, longitude: lng, heading } = pos.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      lastCoords = { lat, lng, heading: heading || 0 };
      if (isOrders) setRiderLocation(lastCoords);
      sendToBackend();
    };

    const applyFallback = () => {
      // Indore fallback is DEV-only — fake GPS caused 700–800 km distance on live trips.
      if (!import.meta.env.DEV) return;
      if (isOrders && !useDeliveryStore.getState().riderLocation) {
        setRiderLocation(LAPTOP_TEST_FALLBACK);
      }
    };

    navigator.geolocation.getCurrentPosition(applyPosition, applyFallback, geoOptions);

    const watchId = navigator.geolocation.watchPosition(
      applyPosition,
      applyFallback,
      geoOptions,
    );

    // watchPosition does not fire while the phone is not moving; re-send the last position so
    // the backend still sees this rider as recently located.
    const heartbeat = setInterval(() => sendToBackend(true), BACKEND_SYNC_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(heartbeat);
    };
  }, [shouldSync, isOrders, setRiderLocation]);

  // Back from screen lock / background (any screen, Feed too): GPS stopped meanwhile, so send a
  // fresh position right away instead of waiting for the next watch/heartbeat tick.
  useEffect(() => {
    if (!isOnline || typeof document === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }
    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng, heading } = pos.coords;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          if (!useDeliveryStore.getState().isOnline) return;
          setRiderLocation({ lat, lng, heading: heading || 0 });
          deliveryAPI.updateLocation(lat, lng, true, { heading: heading || 0 }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
    };
  }, [isOnline, setRiderLocation]);
}
