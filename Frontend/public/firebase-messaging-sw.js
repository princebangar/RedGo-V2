/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

const sanitize = (value) => String(value || "").trim().replace(/^['"]|['"]$/g, "");
const PUSH_DEBUG_PREFIX = "[push-sw]";
const pushDebugLog = () => {};
const OS_NOTIFICATION_DEDUP_STORAGE_KEY = "os_notification_dedup_v1";
const notificationDedupWindowMs = 30000;
const getNotificationKey = (payload) => {
  const data = payload?.data || {};
  if (data.notificationId || data.messageId || payload?.messageId) {
    return data.notificationId || data.messageId || payload.messageId;
  }

  const orderMongoId = String(data.orderMongoId || "").trim();
  const orderId = String(data.orderId || "").trim();
  const orderStatus = String(data.orderStatus || "").trim();

  if (orderMongoId || orderId) {
    return [orderMongoId || orderId, orderStatus || "update"].join("::");
  }

  return [
    data.type || "",
    data.title || payload?.notification?.title || "",
    data.targetUrl || data.link || "",
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("::");
};

function readSharedOsNotificationDedup() {
  try {
    const raw = sessionStorage.getItem(OS_NOTIFICATION_DEDUP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSharedOsNotificationDedup(map) {
  try {
    sessionStorage.setItem(OS_NOTIFICATION_DEDUP_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function shouldSkipDuplicateOsNotification(notificationKey) {
  if (!notificationKey) return false;
  const now = Date.now();
  const shared = readSharedOsNotificationDedup();

  for (const [key, timestamp] of Object.entries(shared)) {
    if (now - Number(timestamp) > notificationDedupWindowMs) {
      delete shared[key];
    }
  }

  const sharedTimestamp = Number(shared[notificationKey] || 0);
  if (sharedTimestamp && now - sharedTimestamp < notificationDedupWindowMs) {
    return true;
  }

  shared[notificationKey] = now;
  writeSharedOsNotificationDedup(shared);
  return false;
}

async function notifyOpenClients(payload) {
  pushDebugLog(PUSH_DEBUG_PREFIX, "Broadcasting push to open clients", { payload });
  const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
  windowClients.forEach((client) => {
    client.postMessage({
      type: "push-notification-received",
      payload,
    });
  });
}

function getTargetPathFromPayload(payload = {}) {
  const rawTarget =
    payload?.data?.targetUrl ||
    payload?.data?.link ||
    payload?.data?.click_action ||
    payload?.fcmOptions?.link ||
    "/";

  try {
    const url = new URL(rawTarget, self.location.origin);
    return url.pathname || "/";
  } catch {
    return "/";
  }
}

async function hasVisibleClientForTarget(payload = {}) {
  const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
  const hasExplicitTarget = Boolean(
    payload?.data?.targetUrl ||
      payload?.data?.link ||
      payload?.data?.click_action ||
      payload?.fcmOptions?.link,
  );

  // Approval / onboarding pushes often have no target — always show OS notification.
  if (!hasExplicitTarget) {
    return false;
  }

  const targetPath = getTargetPathFromPayload(payload);
  const normalizedTarget =
    targetPath.length > 1 && targetPath.endsWith("/")
      ? targetPath.slice(0, -1)
      : targetPath;

  const visibleClient = windowClients.find((client) => {
    const isVisible = client.visibilityState === "visible" || client.focused;
    if (!isVisible) return false;
    try {
      const clientPath = new URL(client.url).pathname.replace(/\/$/, "") || "/";
      if (normalizedTarget === "/" || !normalizedTarget) {
        return false;
      }
      return clientPath === normalizedTarget || clientPath.startsWith(`${normalizedTarget}/`);
    } catch {
      return false;
    }
  });
  pushDebugLog(PUSH_DEBUG_PREFIX, "Visible client check", {
    count: windowClients.length,
    targetPath: normalizedTarget,
    hasVisibleClient: Boolean(visibleClient),
    clients: windowClients.map((client) => ({
      url: client.url,
      visibilityState: client.visibilityState,
      focused: client.focused,
    })),
  });
  return Boolean(visibleClient);
}

async function loadFirebaseWebConfig() {
  const candidates = [
    "/api/v1/food/public/env",
    "/api/v1/env/public",
    "/api/env/public",
  ];
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const json = await response.json();
      const data = (json && json.data) || {};
      const config = {
        apiKey: sanitize(data.VITE_FIREBASE_API_KEY || data.FIREBASE_API_KEY),
        authDomain: sanitize(data.VITE_FIREBASE_AUTH_DOMAIN || data.FIREBASE_AUTH_DOMAIN),
        projectId: sanitize(data.VITE_FIREBASE_PROJECT_ID || data.FIREBASE_PROJECT_ID),
        appId: sanitize(data.VITE_FIREBASE_APP_ID || data.FIREBASE_APP_ID),
        messagingSenderId: sanitize(data.VITE_FIREBASE_MESSAGING_SENDER_ID || data.FIREBASE_MESSAGING_SENDER_ID),
        storageBucket: sanitize(data.VITE_FIREBASE_STORAGE_BUCKET || data.FIREBASE_STORAGE_BUCKET),
        measurementId: sanitize(data.VITE_FIREBASE_MEASUREMENT_ID || data.FIREBASE_MEASUREMENT_ID),
      };

      if (config.apiKey && config.projectId && config.appId && config.messagingSenderId) {
        pushDebugLog(PUSH_DEBUG_PREFIX, "Loaded Firebase web config");
        return config;
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

(async () => {
  const config = await loadFirebaseWebConfig();
  if (!config || !config.apiKey || !config.projectId || !config.appId || !config.messagingSenderId) {
    return;
  }

  firebase.initializeApp(config);
  pushDebugLog(PUSH_DEBUG_PREFIX, "Firebase messaging service worker initialized");
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(async (payload) => {
    pushDebugLog(PUSH_DEBUG_PREFIX, "Received Firebase background message", { payload });
    
    const visibleClient = await hasVisibleClientForTarget(payload);
    
    if (!visibleClient) {
      const title = payload?.notification?.title || payload?.data?.title || "New Notification";
      const body = payload?.notification?.body || payload?.data?.body || "";
      const image =
        payload?.notification?.image ||
        payload?.data?.image ||
        payload?.data?.imageUrl ||
        undefined;
      const notificationKey = getNotificationKey(payload);

      if (shouldSkipDuplicateOsNotification(notificationKey)) {
        await notifyOpenClients(payload);
        return;
      }
      
      pushDebugLog(PUSH_DEBUG_PREFIX, "Showing service worker notification", {
        title,
        body,
        image,
        notificationKey,
      });
  
      self.registration.showNotification(title, {
        body,
        icon: "/favicon.ico",
        image,
        tag: notificationKey,
        renotify: false,
        silent: false,
        requireInteraction: false,
        vibrate: [200, 100, 200, 100, 300],
        data: payload?.data || {},
      });
    }

    // Always notify clients regardless of visibility
    await notifyOpenClients(payload);
  });
})();

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    pushDebugLog(PUSH_DEBUG_PREFIX, "Received raw push event", { payload });
    // No client relay here. onBackgroundMessage handles delivery, and relaying in both
    // places can produce duplicate notifications in web clients.
    event.waitUntil(Promise.resolve());
  } catch {
    // Ignore malformed payloads.
  }
});

self.addEventListener("notificationclick", (event) => {
  pushDebugLog(PUSH_DEBUG_PREFIX, "Notification click received", {
    data: event?.notification?.data || {},
  });
  event.notification.close();
  const rawLink =
    event?.notification?.data?.link ||
    event?.notification?.data?.click_action ||
    event?.notification?.data?.targetUrl ||
    "/";
  const targetUrl = String(rawLink || "/").startsWith("/") ? String(rawLink || "/") : "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const client = windowClients.find((c) => c.url.includes(self.location.origin));
      if (client) {
        client.focus();
        return client.navigate(targetUrl);
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
