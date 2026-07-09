import { toast } from "sonner";
import { userAPI, restaurantAPI, deliveryAPI, adminAPI } from "@food/api";
import { initializeApp, getApp, getApps } from "firebase/app";
const fallbackNotificationSound = "/alert.mp3";

const pushNotificationSoundPath = "/zomato_sms.mp3";
const restaurantAlertSoundPath = "/restaurant_alert.mp3";

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: "",
  messagingSenderId: "",
};

const tokenCachePrefix = "fcm_web_registered_token_";
const pushSoundEnabledStorageKey = "push_sound_enabled";
let publicEnvPromise = null;
let foregroundListenerAttached = false;
let registrationInFlight = null;
let serviceWorkerMessageListenerAttached = false;
const MESSAGING_APP_NAME = "web-push-app";
const recentForegroundNotifications = new Map();
let pushSoundAudio = null;
let pushSoundUnlocked = false;
let pushSoundContext = null;
const PUSH_DEBUG_PREFIX = "[push-debug]";
const notificationDedupWindowMs = 8000;
const pushDebugLog = (prefix, message, data = {}) => {
  if (typeof window !== "undefined" && localStorage.getItem("push_debug") === "true") {
    console.log(`${prefix} ${message}`, data);
  }
};
const pushDebugWarn = (prefix, message, data = {}) => {
  if (typeof window !== "undefined" && localStorage.getItem("push_debug") === "true") {
    console.warn(`${prefix} ${message}`, data);
  }
};

function normalizeModuleFromPath(pathname = window.location.pathname) {
  if (pathname.includes("/restaurant") && !pathname.includes("/restaurants")) return "restaurant";
  if (pathname.includes("/delivery")) return "delivery";
  if (pathname.includes("/admin")) return "admin";
  return "user";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPushSoundSources(moduleName = normalizeModuleFromPath()) {
  if (moduleName === "restaurant") {
    return [restaurantAlertSoundPath];
  }
  if (moduleName === "delivery") {
    return [fallbackNotificationSound];
  }
  return [pushNotificationSoundPath, fallbackNotificationSound];
}

function isSupportedBrowser() {
  if (typeof window === "undefined") return false;

  // iOS check (Web Push is only supported on iOS Safari/Chrome if added to the Home Screen)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    if (!isStandalone) {
      return false;
    }
  }

  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function isFlutterWebView() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.flutter_inappwebview) &&
    typeof window.flutter_inappwebview.callHandler === "function"
  );
}

const FCM_BRIDGE_HANDLER_NAMES = [
  "getFcmToken",
  "getFCMToken",
  "getPushToken",
  "getFirebaseToken",
];

const FCM_PERMISSION_HANDLER_NAMES = [
  "requestNotificationPermission",
  "requestPushPermission",
  "enableNotifications",
];

export function normalizeFcmBridgeToken(raw) {
  if (raw == null) return "";

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length >= 20 ? trimmed : "";
  }

  if (typeof raw === "object") {
    const candidates = [
      raw.token,
      raw.fcmToken,
      raw.fcm_token,
      raw.deviceToken,
      raw.pushToken,
      raw.value,
      raw.data,
    ];
    for (const candidate of candidates) {
      const normalized = normalizeFcmBridgeToken(candidate);
      if (normalized) return normalized;
    }
  }

  return "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestNativeNotificationPermission(moduleName) {
  if (!isFlutterWebView()) return false;

  for (const handlerName of FCM_PERMISSION_HANDLER_NAMES) {
    try {
      await window.flutter_inappwebview.callHandler(handlerName, { module: moduleName });
      return true;
    } catch {
      // Try next handler.
    }
  }
  return false;
}

/** True when running inside the Flutter InAppWebView shell (no browser Allow popup). */
export function isNativeAppWebView() {
  return isFlutterWebView();
}

export const FCM_FAST_OPTIONS = { maxAttempts: 5, delayMs: 200 };
export const FCM_COLLECT_TIMEOUT_MS = 2000;
export const FCM_SUBMIT_COLLECT_TIMEOUT_MS = 6000;

let fcmVisibilityListenerAttached = false;

/**
 * Collect FCM token quickly (max ~2 seconds) for signup/login flows.
 * Pass skipCache: true when syncing to server so rotated tokens are picked up.
 */
export async function collectFcmTokenFast(moduleName, options = {}) {
  const fastOptions = { ...FCM_FAST_OPTIONS, ...options };
  const skipCache = options.skipCache === true;

  if (!skipCache) {
    const cached = getSavedToken(moduleName);
    if (cached.length >= 20) {
      return {
        fcmToken: cached,
        platform: isFlutterWebView() ? "mobile" : "web",
      };
    }
  }

  const collectTimeoutMs = options.collectTimeoutMs ?? FCM_COLLECT_TIMEOUT_MS;

  const result = await Promise.race([
    collectNativeFcmToken(moduleName, { ...fastOptions, ...options }),
    sleep(collectTimeoutMs).then(() => ({
      fcmToken: normalizeFcmBridgeToken(getSavedToken(moduleName)) || null,
      platform: isFlutterWebView() ? "mobile" : "web",
    })),
  ]);

  if (result.fcmToken) {
    setSavedToken(moduleName, result.fcmToken);
  }

  return result;
}

/**
 * Signup finish / complete — same flow that worked for delivery (commit 5f54105).
 * 1) collectFcmTokenFast on button click (+ retry)
 * 2) token sent in register API
 * 3) finalize* → syncPendingPartnerFcmQuick saves again in background
 */
export async function collectFcmTokenForSignup(moduleName) {
  if (isFlutterWebView()) {
    await requestNativeNotificationPermission(moduleName);
    const result = await collectNativeFcmToken(moduleName, { maxAttempts: 10, delayMs: 400 });
    if (result.fcmToken) {
      setSavedToken(moduleName, result.fcmToken);
    }
    return { fcmToken: result.fcmToken || null, platform: "mobile" };
  }

  let fcmToken = null;
  let platform = "web";
  try {
    const collected = await collectFcmTokenFast(moduleName);
    fcmToken = collected.fcmToken;
    platform = collected.platform;
    if (!fcmToken) {
      const retry = await collectFcmTokenFast(moduleName, { maxAttempts: 8, delayMs: 250 });
      fcmToken = retry.fcmToken;
      platform = retry.platform;
    }
  } catch {
    // Non-blocking — pending-save will retry on verification screen.
  }
  if (fcmToken) {
    setSavedToken(moduleName, fcmToken);
  }
  return { fcmToken, platform };
}

/** @deprecated Use collectFcmTokenForSignup */
export async function collectFcmTokenOnSignupSubmit(moduleName) {
  return collectFcmTokenForSignup(moduleName);
}

/**
 * Flutter shell: sync native FCM token after registration (no browser UI).
 */
export async function syncNativeAppPushToken(moduleName, phone) {
  if (!isFlutterWebView() || !phone) return false;
  await requestNativeNotificationPermission(moduleName);
  const { fcmToken, platform } = await collectNativeFcmToken(moduleName, {
    maxAttempts: 10,
    delayMs: 400,
  });
  if (!fcmToken) return false;
  setSavedToken(moduleName, fcmToken);
  return persistPendingModuleFcmToken(moduleName, phone, {
    fcmToken,
    platform: platform || "mobile",
    requestPermission: false,
    maxAttempts: 3,
  });
}

/**
 * Onboarding submit fallback — cached token only (prefer collectFcmTokenOnSignupSubmit).
 */
export function getCachedFcmTokenForSubmit(moduleName) {
  const cached = normalizeFcmBridgeToken(getSavedToken(moduleName));
  return {
    fcmToken: cached || null,
    platform: isFlutterWebView() ? "mobile" : "web",
  };
}

/**
 * Collect FCM token from Flutter WebView (iPhone app) or web cache.
 * Retries because the native bridge is often not ready on first call.
 */
export async function collectNativeFcmToken(moduleName, options = {}) {
  const maxAttempts = options.maxAttempts ?? 8;
  const delayMs = options.delayMs ?? 400;
  let platform = "web";

  if (isFlutterWebView()) {
    platform = "mobile";
    await requestNativeNotificationPermission(moduleName);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      for (const handlerName of FCM_BRIDGE_HANDLER_NAMES) {
        try {
          const raw = await window.flutter_inappwebview.callHandler(handlerName, {
            module: moduleName,
          });
          const token = normalizeFcmBridgeToken(raw);
          if (token) {
            setSavedToken(moduleName, token);
            return { fcmToken: token, platform };
          }
        } catch {
          // Try next handler.
        }
      }

      if (attempt < maxAttempts - 1) {
        await sleep(delayMs);
      }
    }

    const cached = getSavedToken(moduleName);
    if (cached && cached.length >= 20) {
      return { fcmToken: cached, platform: "mobile" };
    }

    return { fcmToken: null, platform: "mobile" };
  }

  const skipCache = options.skipCache === true;
  if (!skipCache) {
    const webCached = localStorage.getItem(`${tokenCachePrefix}${moduleName}`) || "";
    if (webCached.length >= 20) {
      return { fcmToken: webCached, platform };
    }
  }

  const resolved = await resolveWebFcmToken(moduleName, options);
  return {
    fcmToken: resolved,
    platform,
  };
}

/** @deprecated Use collectFcmTokenFast("restaurant") — kept for older bundles */
export function collectRestaurantFcmToken(options = {}) {
  return collectFcmTokenFast("restaurant", options);
}

/** @deprecated Use collectFcmTokenFast("delivery") — kept for older bundles */
export function collectDeliveryFcmToken(options = {}) {
  return collectFcmTokenFast("delivery", options);
}

/**
 * Save FCM token to backend when the user is logged in.
 */
export async function persistModuleFcmToken(moduleName, options = {}) {
  let fcmToken = options.fcmToken || null;
  let platform = options.platform || (isFlutterWebView() ? "mobile" : "web");

  if (!fcmToken) {
    const collected = await collectFcmTokenFast(moduleName, options);
    fcmToken = collected.fcmToken;
    platform = collected.platform;
  }

  if (!fcmToken) return false;

  setSavedToken(moduleName, fcmToken);

  const accessToken = localStorage.getItem(`${moduleName}_accessToken`);
  if (!accessToken) {
    pushDebugLog(PUSH_DEBUG_PREFIX, "FCM token cached locally; no auth session to sync yet", {
      moduleName,
    });
    return false;
  }

  try {
    await saveTokenByModule(moduleName, fcmToken, platform);
    pushDebugLog(PUSH_DEBUG_PREFIX, "FCM token synced to backend", { moduleName, platform });
    return true;
  } catch (error) {
    pushDebugWarn(PUSH_DEBUG_PREFIX, "Failed to sync FCM token to backend", {
      moduleName,
      error: error?.message || error,
    });
    return false;
  }
}

/**
 * Save FCM for pending partners using phone (no login required).
 * Requires an existing restaurant/delivery record in DB (post-registration or pending OTP login).
 */
export async function persistPendingModuleFcmToken(moduleName, phone, options = {}) {
  const hasKnownToken = Boolean(options.fcmToken);
  const maxAttempts = options.maxAttempts ?? (hasKnownToken ? 1 : 2);
  const retryDelayMs = options.retryDelayMs ?? 400;
  const syncOptions = {
    ...options,
    skipCache: options.skipCache ?? true,
    collectTimeoutMs: options.collectTimeoutMs ?? FCM_COLLECT_TIMEOUT_MS,
    requestPermission: options.requestPermission ?? false,
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let fcmToken = options.fcmToken || null;
    let platform = options.platform || (isFlutterWebView() ? "mobile" : "web");

    if (!fcmToken) {
      const collected = await collectFcmTokenFast(moduleName, syncOptions);
      fcmToken = collected.fcmToken;
      platform = collected.platform;
    }

    if (!fcmToken || !phone) {
      if (attempt < maxAttempts - 1) {
        await sleep(retryDelayMs);
        continue;
      }
      return false;
    }

    setSavedToken(moduleName, fcmToken);

    const normalizedPhone = String(phone || "").replace(/\D/g, "").slice(-10);
    if (!normalizedPhone) return false;

    try {
      const apiClient = (await import("@food/api")).default;
      await apiClient.post("/fcm-tokens/pending-save", {
        phone: normalizedPhone,
        token: fcmToken,
        platform,
        role: moduleName,
      });
      pushDebugLog(PUSH_DEBUG_PREFIX, "Pending FCM token saved by phone", {
        moduleName,
        phone: normalizedPhone,
        attempt: attempt + 1,
      });
      return true;
    } catch (error) {
      pushDebugWarn(PUSH_DEBUG_PREFIX, "Failed to save pending FCM token", {
        moduleName,
        attempt: attempt + 1,
        error: error?.message || error,
      });
      if (attempt < maxAttempts - 1) {
        options.fcmToken = null;
        await sleep(retryDelayMs);
      }
    }
  }

  return false;
}

/** Warm FCM cache during onboarding (no permission popup). */
export function prefetchModuleFcmToken(moduleName) {
  void collectFcmTokenFast(moduleName, { requestPermission: false }).catch(() => {});
}

/**
 * Drop local FCM prefetch when user leaves onboarding before profile submit.
 * Server tokens are only stored after registration; nothing to remove remotely yet.
 */
export function clearOnboardingFcmLocal(moduleName) {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(`${tokenCachePrefix}${moduleName}`);
}

/**
 * Background FCM sync after registration (delivery 5f54105 pattern).
 */
export function syncPendingPartnerFcmQuick(moduleName, phone, options = {}) {
  if (!phone || typeof window === "undefined") return;

  const runSync = () => {
    void persistPendingModuleFcmToken(moduleName, phone, {
      ...options,
      maxAttempts: 3,
      retryDelayMs: 500,
    });
  };

  runSync();
  [1500, 3500, 7000].forEach((delayMs) => {
    window.setTimeout(runSync, delayMs);
  });
}

/**
 * Navigate to delivery pending screen immediately; persist FCM in background (restaurant parity).
 */
export function finalizeDeliveryPendingSubmission(
  navigate,
  phone,
  { fcmToken, platform, status = "pending", message, rejectionReason } = {},
  navigateState = {},
) {
  const normalizedPhone = String(phone || "").replace(/\D/g, "").slice(-10);

  if (normalizedPhone) {
    sessionStorage.setItem("delivery_pendingPhone", normalizedPhone);
  }
  sessionStorage.setItem("delivery_pendingStatus", status);
  if (message) {
    sessionStorage.setItem("delivery_pendingMessage", message);
  } else {
    sessionStorage.removeItem("delivery_pendingMessage");
  }
  if (rejectionReason) {
    sessionStorage.setItem("delivery_pendingRejectionReason", rejectionReason);
  } else {
    sessionStorage.removeItem("delivery_pendingRejectionReason");
  }

  try {
    syncPendingPartnerFcmQuick("delivery", normalizedPhone, { fcmToken, platform });
  } catch {}

  if (typeof localStorage !== "undefined" && localStorage.getItem("delivery_accessToken")) {
    try {
      void persistModuleFcmToken("delivery", { fcmToken, platform });
    } catch {}
  }

  navigate("/food/delivery/pending-verification", {
    replace: true,
    state: {
      phone: normalizedPhone,
      isRejected: status === "rejected",
      message,
      rejectionReason,
      ...navigateState,
    },
  });
}

function setupFcmTokenRefreshOnVisibility(moduleName) {
  if (typeof window === "undefined" || fcmVisibilityListenerAttached) return;
  fcmVisibilityListenerAttached = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const activeModule = normalizeModuleFromPath(window.location.pathname);
    if (activeModule === "admin") return;

    const accessToken = localStorage.getItem(`${activeModule}_accessToken`);
    if (accessToken) {
      void persistModuleFcmToken(activeModule, {
        skipCache: true,
        requestPermission: false,
      }).catch(() => {});
      return;
    }

    const pendingPhone =
      activeModule === "delivery"
        ? sessionStorage.getItem("delivery_pendingPhone")
        : localStorage.getItem("restaurant_pendingPhone");
    if (
      pendingPhone &&
      (activeModule === "delivery" || activeModule === "restaurant") &&
      window.location.pathname.includes("/pending-verification")
    ) {
      void persistPendingModuleFcmToken(activeModule, pendingPhone, {
        requestPermission: true,
        collectTimeoutMs: FCM_SUBMIT_COLLECT_TIMEOUT_MS,
      }).catch(() => {});
    }
  });
}

function isSecureContextForPush() {
  return window.isSecureContext || window.location.hostname === "localhost";
}

function sanitize(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function getNotificationKey(payload = {}) {
  return (
    payload?.data?.notificationId ||
    payload?.data?.messageId ||
    payload?.messageId ||
    [
      payload?.notification?.title || "",
      payload?.notification?.body || "",
      payload?.data?.orderId || "",
      payload?.data?.targetUrl || "",
    ].join("::")
  );
}

function wasRecentlyHandled(notificationKey) {
  if (!notificationKey) return false;
  const now = Date.now();

  for (const [key, timestamp] of recentForegroundNotifications.entries()) {
    if (now - timestamp > notificationDedupWindowMs) {
      recentForegroundNotifications.delete(key);
    }
  }

  if (recentForegroundNotifications.has(notificationKey)) {
    pushDebugLog(PUSH_DEBUG_PREFIX, "Duplicate notification skipped", { notificationKey });
    return true;
  }

  recentForegroundNotifications.set(notificationKey, now);
  return false;
}

function ensurePushSoundAudio() {
  if (typeof window === "undefined") return null;
  if (!pushSoundAudio) {
    const [primarySource] = getPushSoundSources();
    const audioUrl = primarySource.startsWith("/")
      ? new URL(primarySource, window.location.origin).toString()
      : primarySource;
    pushDebugLog(PUSH_DEBUG_PREFIX, "Creating primary push audio", { audioUrl });
    pushSoundAudio = new Audio(audioUrl);
    pushSoundAudio.preload = "auto";
    pushSoundAudio.volume = 1;
    pushSoundAudio.load();
  }
  return pushSoundAudio;
}

function createPushPlaybackAudio() {
  const moduleName = normalizeModuleFromPath();
  const audioSources = getPushSoundSources(moduleName).map((source) =>
    typeof window === "undefined" || !source.startsWith("/")
      ? source
      : new URL(source, window.location.origin).toString(),
  );
  pushDebugLog(PUSH_DEBUG_PREFIX, "Preparing push playback sources", { audioSources });
  return audioSources.map((source) => {
    const playbackAudio = new Audio(source);
    playbackAudio.preload = "auto";
    playbackAudio.volume = 1;
    playbackAudio.load();
    return playbackAudio;
  });
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!pushSoundContext) {
    pushSoundContext = new AudioContextClass();
  }

  return pushSoundContext;
}

async function playSynthNotificationBeep() {
  const ctx = getAudioContext();
  if (!ctx) return false;
  pushDebugLog(PUSH_DEBUG_PREFIX, "Playing synth notification beep");

  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const now = ctx.currentTime;
  const pulses = [
    { start: 0, duration: 0.11, frequency: 880 },
    { start: 0.16, duration: 0.11, frequency: 988 },
    { start: 0.34, duration: 0.18, frequency: 1046 },
  ];

  pulses.forEach(({ start, duration, frequency }) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + start);
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now + start);
    oscillator.stop(now + start + duration);
  });

  return true;
}

export function isPushSoundEnabled() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(pushSoundEnabledStorageKey) === "true";
}

async function triggerWebViewNativeNotification(payload = {}) {
  if (typeof window === "undefined") return false;

  const bridgePayload = {
    title: payload?.notification?.title || payload?.data?.title || "New notification",
    body: payload?.notification?.body || payload?.data?.body || "",
    notificationId: payload?.data?.notificationId || payload?.messageId || "",
    targetUrl: payload?.data?.targetUrl || payload?.data?.link || "",
    imageUrl: payload?.notification?.image || payload?.data?.image || payload?.data?.imageUrl || "",
  };

  try {
    if (
      window.flutter_inappwebview &&
      typeof window.flutter_inappwebview.callHandler === "function"
    ) {
      const handlerNames = [
        "playNotificationSound",
        "triggerNotificationFeedback",
        "onPushNotification",
      ];

      for (const handlerName of handlerNames) {
        try {
          pushDebugLog(PUSH_DEBUG_PREFIX, "Trying native notification handler", { handlerName, bridgePayload });
          await window.flutter_inappwebview.callHandler(handlerName, bridgePayload);
          pushDebugLog(PUSH_DEBUG_PREFIX, "Native notification handler succeeded", { handlerName });
          return true;
        } catch {
          // Try the next available handler name.
        }
      }
    }
  } catch {
    // Ignore bridge failures.
  }

  return false;
}

async function playPushSound(payload = {}) {
  try {
    pushDebugLog(PUSH_DEBUG_PREFIX, "playPushSound called", {
      notificationKey: getNotificationKey(payload),
      pushSoundUnlocked,
      notificationPermission: typeof Notification !== "undefined" ? Notification.permission : "unsupported",
      payload,
    });
    const usedNativeBridge = await triggerWebViewNativeNotification(payload);

    if (typeof window !== "undefined" && window.__userHasInteracted && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        pushDebugLog(PUSH_DEBUG_PREFIX, "Triggering vibration");
        navigator.vibrate([200, 100, 200, 100, 300]);
      } catch (_) {}
    }

    if (usedNativeBridge) {
      pushDebugLog(PUSH_DEBUG_PREFIX, "Push sound handled by native bridge");
      return;
    }

    if (!pushSoundUnlocked) {
      pushDebugWarn(PUSH_DEBUG_PREFIX, "Push sound blocked because sound is not enabled/unlocked");
      return;
    }

    const players = createPushPlaybackAudio();
    for (const audio of players) {
      try {
        audio.currentTime = 0;
        await audio.play();
        pushDebugLog(PUSH_DEBUG_PREFIX, "Audio playback succeeded", { source: audio.src });
        return;
      } catch (error) {
        pushDebugWarn(PUSH_DEBUG_PREFIX, "Audio playback failed", {
          source: audio.src,
          error: error?.message || error,
        });
        // Try next fallback sound source.
      }
    }

    await playSynthNotificationBeep();
  } catch (error) {
    pushDebugWarn(PUSH_DEBUG_PREFIX, "playPushSound failed", { error: error?.message || error });
  }
}

function setupPushSoundUnlock() {
  if (typeof window === "undefined" || pushSoundUnlocked) return;

  const unlock = async () => {
    let audio = null;
    try {
      audio = ensurePushSoundAudio();
      if (!audio) return;
      pushDebugLog(PUSH_DEBUG_PREFIX, "Attempting passive push sound unlock");
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      pushSoundUnlocked = true;
      localStorage.setItem(pushSoundEnabledStorageKey, "true");
      pushDebugLog(PUSH_DEBUG_PREFIX, "Passive push sound unlock succeeded");
      window.dispatchEvent(new CustomEvent("push-sound-enabled"));
    } catch (error) {
      pushDebugWarn(PUSH_DEBUG_PREFIX, "Passive push sound unlock failed", {
        error: error?.message || error,
      });
    } finally {
      if (audio) {
        audio.muted = false;
      }
    }

    if (pushSoundUnlocked) {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    }
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
}

export async function enablePushNotificationSound() {
  if (typeof window === "undefined") return false;

  let audio = null;
  try {
    audio = ensurePushSoundAudio();
    if (!audio) return false;
    pushDebugLog(PUSH_DEBUG_PREFIX, "Manual push sound enable started");
    audio.muted = true;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    pushSoundUnlocked = true;
    localStorage.setItem(pushSoundEnabledStorageKey, "true");
    window.dispatchEvent(new CustomEvent("push-sound-enabled"));

    const players = createPushPlaybackAudio();
    for (const previewAudio of players) {
      try {
        previewAudio.currentTime = 0;
        await previewAudio.play();
        pushDebugLog(PUSH_DEBUG_PREFIX, "Manual sound preview succeeded", { source: previewAudio.src });
        return true;
      } catch (error) {
        pushDebugWarn(PUSH_DEBUG_PREFIX, "Manual sound preview failed", {
          source: previewAudio.src,
          error: error?.message || error,
        });
        // Try next preview source.
      }
    }

    await playSynthNotificationBeep();
    return true;
  } catch (error) {
    pushDebugWarn(PUSH_DEBUG_PREFIX, "Manual push sound enable failed, trying synth beep", {
      error: error?.message || error,
    });
    try {
      await playSynthNotificationBeep();
      pushSoundUnlocked = true;
      localStorage.setItem(pushSoundEnabledStorageKey, "true");
      window.dispatchEvent(new CustomEvent("push-sound-enabled"));
      }
    catch (beepError) {
      pushDebugWarn(PUSH_DEBUG_PREFIX, "Synth beep fallback failed", {
        error: beepError?.message || beepError,
      });
      return false;
    }
    return true;
  } finally {
    if (audio) {
      audio.muted = false;
    }
  }
}

async function getFirebasePublicEnv() {
  if (publicEnvPromise) return publicEnvPromise;

  publicEnvPromise = (async () => {
    try {
      return {
        apiKey: sanitize(import.meta.env.VITE_FIREBASE_API_KEY) || DEFAULT_FIREBASE_CONFIG.apiKey,
        authDomain: sanitize(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) || DEFAULT_FIREBASE_CONFIG.authDomain,
        projectId: sanitize(import.meta.env.VITE_FIREBASE_PROJECT_ID) || DEFAULT_FIREBASE_CONFIG.projectId,
        appId: sanitize(import.meta.env.VITE_FIREBASE_APP_ID) || DEFAULT_FIREBASE_CONFIG.appId,
        messagingSenderId:
          sanitize(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
        storageBucket: sanitize(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
        measurementId: sanitize(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID),
        vapidKey: sanitize(import.meta.env.VITE_FIREBASE_VAPID_KEY),
      };
    } catch {
      return {
        ...DEFAULT_FIREBASE_CONFIG,
        storageBucket: sanitize(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
        measurementId: sanitize(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID),
        vapidKey: sanitize(import.meta.env.VITE_FIREBASE_VAPID_KEY),
      };
    } finally {
      publicEnvPromise = null;
    }
  })();

  return publicEnvPromise;
}

function getMessagingFirebaseApp(config) {
  const appConfig = {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
    messagingSenderId: config.messagingSenderId,
    ...(config.storageBucket ? { storageBucket: config.storageBucket } : {}),
    ...(config.measurementId ? { measurementId: config.measurementId } : {}),
  };

  if (!appConfig.apiKey || !appConfig.projectId || !appConfig.appId || !appConfig.messagingSenderId) {
    return null;
  }

  const existing = getApps().find((a) => a.name === MESSAGING_APP_NAME);
  if (existing) return existing;

  try {
    return getApp(MESSAGING_APP_NAME);
  } catch {
    return initializeApp(appConfig, MESSAGING_APP_NAME);
  }
}

function getSavedToken(moduleName) {
  return localStorage.getItem(`${tokenCachePrefix}${moduleName}`) || "";
}

function setSavedToken(moduleName, token) {
  localStorage.setItem(`${tokenCachePrefix}${moduleName}`, token);
}

async function resolveWebFcmToken(moduleName, options = {}) {
  const shouldRequestPermission = options.requestPermission !== false;

  if (!isSupportedBrowser() || !isSecureContextForPush()) {
    return null;
  }

  try {
    const firebasePublicEnv = await getFirebasePublicEnv();
    if (!firebasePublicEnv?.vapidKey) return null;

    const app = getMessagingFirebaseApp(firebasePublicEnv);
    if (!app) return null;

    let permission = Notification.permission;
    if (permission === "default") {
      if (!shouldRequestPermission) return null;
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") return null;

    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
    const supported = await isSupported().catch(() => false);
    if (!supported) return null;

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: firebasePublicEnv.vapidKey,
      serviceWorkerRegistration: registration,
    });

    const normalized = normalizeFcmBridgeToken(token);
    if (normalized) {
      setSavedToken(moduleName, normalized);
      return normalized;
    }
  } catch (error) {
    pushDebugWarn(PUSH_DEBUG_PREFIX, "resolveWebFcmToken failed", {
      moduleName,
      error: error?.message || error,
    });
  }

  if (options.skipCache !== true) {
    const cached = getSavedToken(moduleName);
    if (cached.length >= 20) return cached;
  }

  return null;
}

async function saveTokenByModule(moduleName, token, platform = "web") {
  pushDebugLog(PUSH_DEBUG_PREFIX, "saveTokenByModule starting", { moduleName, platform, tokenPreview: `${token?.slice(0, 10)}...` });
  if (moduleName === "restaurant") {
    await restaurantAPI.saveFcmToken(token, platform);
    return;
  }
  if (moduleName === "delivery") {
    await deliveryAPI.saveFcmToken(token, platform);
    return;
  }
  if (moduleName === "user") {
    await userAPI.saveFcmToken(token, { platform });
  }
}

async function registerNativeWebViewFcmToken(moduleName) {
  return persistModuleFcmToken(moduleName, { maxAttempts: 6, delayMs: 350 });
}

function showForegroundNotification(payload = {}) {
  if (!isRecord(payload)) {
    pushDebugWarn(PUSH_DEBUG_PREFIX, "Ignoring malformed foreground notification payload", { payload });
    return;
  }
  const notificationKey = getNotificationKey(payload);
  pushDebugLog(PUSH_DEBUG_PREFIX, "showForegroundNotification received", { notificationKey, payload });
  if (wasRecentlyHandled(notificationKey)) {
    return;
  }

  const title =
    payload?.notification?.title ||
    payload?.data?.title ||
    "New notification";
  const body =
    payload?.notification?.body ||
    payload?.data?.body ||
    "";
  const image =
    payload?.notification?.image ||
    payload?.notification?.imageUrl ||
    payload?.data?.image ||
    payload?.data?.imageUrl ||
    undefined;

  playPushSound(payload);

  const notificationType = String(payload?.data?.type || "").toLowerCase();
  if (
    notificationType === "cash_deposit" ||
    notificationType === "cash_deposit_rejected"
  ) {
    window.dispatchEvent(new CustomEvent("delivery-wallet-refresh"));
  }

  // Force system notification even when the tab is in focus
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      pushDebugLog(PUSH_DEBUG_PREFIX, "Showing browser notification from page", {
        title,
        body,
        image,
        notificationKey,
      });
      // Use service worker to show native system notification to ensure it bypasses focus checks
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(registration => {
          if (registration) {
            registration.showNotification(title, {
              body,
              icon: "/favicon.ico",
              image,
              tag: notificationKey || undefined,
              data: payload?.data || {},
              requireInteraction: true,
              vibrate: [200, 100, 200, 100, 300]
            });
          } else {
            new Notification(title, {
              body,
              icon: "/favicon.ico",
              image,
              tag: notificationKey || undefined,
              requireInteraction: true
            });
          }
        }).catch(() => {
          new Notification(title, {
            body,
            icon: "/favicon.ico",
            image,
            tag: notificationKey || undefined,
          });
        });
      } else {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
          image,
          tag: notificationKey || undefined,
        });
      }
    } catch (error) {
      pushDebugWarn(PUSH_DEBUG_PREFIX, "Browser notification creation failed", {
        error: error?.message || error,
      });
    }
  }

  // Still show in-app toast for immediate context if we are in focus
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    if (body) {
      toast.success(`${title}: ${body}`);
    } else {
      toast.success(title);
    }
  }
}

function attachServiceWorkerMessageListener() {
  if (serviceWorkerMessageListenerAttached || typeof window === "undefined") {
    return;
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = isRecord(event?.data) ? event.data : null;
      if (!data || data.type !== "push-notification-received") return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        pushDebugLog(PUSH_DEBUG_PREFIX, "Skipping page notification render for SW relay because tab is hidden");
        return;
      }
      if (!isRecord(data.payload)) {
        pushDebugWarn(PUSH_DEBUG_PREFIX, "Ignoring malformed SW push relay payload", { payload: data.payload });
        return;
      }
      pushDebugLog(PUSH_DEBUG_PREFIX, "Received service worker message in page", { payload: data.payload });
      scheduleForegroundNotification(data.payload);
    });
  }

  window.addEventListener("native-push-notification", (event) => {
    const payload = isRecord(event?.detail) ? event.detail : null;
    if (!payload) {
      pushDebugWarn(PUSH_DEBUG_PREFIX, "Ignoring malformed native push event", { payload: event?.detail });
      return;
    }
    pushDebugLog(PUSH_DEBUG_PREFIX, "Received native push event", { payload });
    scheduleForegroundNotification(payload);
  });

  window.addEventListener("message", (event) => {
    const data = isRecord(event?.data) ? event.data : null;
    if (!data) return;
    if (data.type !== "native-push-notification") return;
    if (!isRecord(data.payload)) {
      pushDebugWarn(PUSH_DEBUG_PREFIX, "Ignoring malformed native postMessage payload", { payload: data.payload });
      return;
    }
    pushDebugLog(PUSH_DEBUG_PREFIX, "Received native postMessage push event", { payload: data.payload });
    scheduleForegroundNotification(data.payload);
  });

  serviceWorkerMessageListenerAttached = true;
}

function scheduleForegroundNotification(payload) {
  // Keep message handlers fast to avoid Chrome [Violation] warnings.
  // Defer heavier work (toast, audio) to idle time / next tick.
  const run = () => showForegroundNotification(payload);
  try {
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1000 });
      return;
    }
  } catch {
    // ignore
  }
  setTimeout(run, 0);
}

export function initPushNotificationClient() {
  if (typeof window === "undefined") return;
  const moduleName = normalizeModuleFromPath(window.location.pathname);
  pushDebugLog(PUSH_DEBUG_PREFIX, "Initializing push notification client", {
    path: window.location.pathname,
    moduleName,
    soundEnabled: isPushSoundEnabled(),
  });

  attachServiceWorkerMessageListener();

  if (moduleName === "admin") {
    return;
  }

  if (isPushSoundEnabled()) {
    pushSoundUnlocked = true;
  }

  setupPushSoundUnlock();
  setupFcmTokenRefreshOnVisibility(moduleName);
}

async function getMessagingAppForPush() {
  const firebasePublicEnv = await getFirebasePublicEnv();
  if (!firebasePublicEnv?.vapidKey) return null;
  const app = getMessagingFirebaseApp(firebasePublicEnv);
  if (!app) return null;
  const { isSupported } = await import("firebase/messaging");
  if (!(await isSupported().catch(() => false))) return null;
  return { app, firebasePublicEnv };
}

export function getWebNotificationPermission() {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/**
 * Pending verification screen: register service worker + foreground listener (no login).
 * Without this, FCM delivers but the browser tab never shows the notification.
 */
export async function setupPendingVerificationPushListeners(moduleName) {
  if (isFlutterWebView()) {
    initPushNotificationClient();
    return true;
  }
  if (!isSupportedBrowser() || !isSecureContextForPush()) return false;
  initPushNotificationClient();
  const ready = await getMessagingAppForPush();
  if (!ready) return false;
  try {
    await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    await attachForegroundListener(ready.app);
    return true;
  } catch {
    return false;
  }
}

/**
 * User taps "Enable notifications" on pending screen (browser requires a click for Allow).
 */
export async function enablePendingVerificationPush(moduleName, phone) {
  if (!phone || !moduleName) return false;
  if (isFlutterWebView()) {
    return syncNativeAppPushToken(moduleName, phone);
  }
  if (!isSupportedBrowser() || !isSecureContextForPush()) return false;

  const ready = await getMessagingAppForPush();
  if (!ready) return false;

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return false;

  await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  await attachForegroundListener(ready.app);

  const { getMessaging, getToken } = await import("firebase/messaging");
  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(ready.app);
  const token = await getToken(messaging, {
    vapidKey: ready.firebasePublicEnv.vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) return false;
  setSavedToken(moduleName, token);

  return persistPendingModuleFcmToken(moduleName, phone, {
    fcmToken: token,
    platform: "web",
    requestPermission: false,
    maxAttempts: 2,
  });
}

async function attachForegroundListener(firebaseAppInstance) {
  if (foregroundListenerAttached) return;

  const { getMessaging, onMessage, isSupported } = await import("firebase/messaging");
  const supported = await isSupported().catch(() => false);
  if (!supported) return;

  const messaging = getMessaging(firebaseAppInstance);
  setupPushSoundUnlock();
  attachServiceWorkerMessageListener();

  onMessage(messaging, (payload) => {
    pushDebugLog(PUSH_DEBUG_PREFIX, "Received Firebase foreground message", { payload });
    scheduleForegroundNotification(payload);
  });

  foregroundListenerAttached = true;
}

export async function registerWebPushForCurrentModule(pathname = window.location.pathname) {
  const moduleName = normalizeModuleFromPath(pathname);
  if (moduleName === "admin") return;

  initPushNotificationClient();

  if (isFlutterWebView()) {
    await persistModuleFcmToken(moduleName, { maxAttempts: 6, delayMs: 350 });
    return;
  }

  const isPendingPath = pathname.includes("/pending-verification");
  const accessToken = localStorage.getItem(`${moduleName}_accessToken`);

  if (
    !accessToken &&
    isPendingPath &&
    (moduleName === "restaurant" || moduleName === "delivery")
  ) {
    const pendingPhone =
      moduleName === "delivery"
        ? sessionStorage.getItem("delivery_pendingPhone")
        : localStorage.getItem("restaurant_pendingPhone");
    void setupPendingVerificationPushListeners(moduleName);
    if (pendingPhone && typeof Notification !== "undefined" && Notification.permission === "granted") {
      void persistPendingModuleFcmToken(moduleName, pendingPhone, {
        requestPermission: false,
        collectTimeoutMs: FCM_SUBMIT_COLLECT_TIMEOUT_MS,
      });
    }
    return;
  }

  if (!accessToken) return;

  const supportsBrowserPush = isSupportedBrowser() && isSecureContextForPush();

  if (supportsBrowserPush) {
    if (registrationInFlight) return registrationInFlight;

    registrationInFlight = (async () => {
      const firebasePublicEnv = await getFirebasePublicEnv();
      if (!firebasePublicEnv?.vapidKey) {
        pushDebugWarn(PUSH_DEBUG_PREFIX, "FCM web registration skipped: FIREBASE_VAPID_KEY is missing in env setup.");
        return;
      }

      const app = getMessagingFirebaseApp(firebasePublicEnv);
      if (!app) {
        pushDebugWarn(PUSH_DEBUG_PREFIX, "FCM web registration skipped: Firebase public web config is incomplete.");
        return;
      }

      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;

      if (permission !== "granted") {
        pushDebugLog(PUSH_DEBUG_PREFIX, "FCM web registration skipped: Notification permission not granted.", { permission });
        return;
      }

      const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
      const supported = await isSupported().catch(() => false);
      if (!supported) return;

      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      pushDebugLog(PUSH_DEBUG_PREFIX, "Service worker registered for push", {
        scope: registration.scope,
        moduleName,
      });
      const messaging = getMessaging(app);

      const token = await getToken(messaging, {
        vapidKey: firebasePublicEnv.vapidKey,
        serviceWorkerRegistration: registration,
      });

      if (!token) return;
      setSavedToken(moduleName, token);
      pushDebugLog(PUSH_DEBUG_PREFIX, "FCM token resolved", {
        moduleName,
        tokenPreview: `${token.slice(0, 12)}...`,
      });

      // Removed localStorage caching (getSavedToken/setSavedToken) as per user requirements.
      // The backend 'upsert' already handles duplicates efficiently.
      try {
        pushDebugLog(PUSH_DEBUG_PREFIX, "Synchronizing FCM token with backend database", { moduleName, tokenPreview: `${token?.slice(0, 10)}...` });
        await saveTokenByModule(moduleName, token);
        pushDebugLog(PUSH_DEBUG_PREFIX, "FCM token synchronized with backend successfully");
      } catch (e) {
        pushDebugWarn(PUSH_DEBUG_PREFIX, "Failed to synchronize FCM token to backend", { error: e?.message || e, stack: e?.stack });
      }
      
      await attachForegroundListener(app);
    })()
    .catch((e) => {
      console.error("FCM web registration failed:", e);
    })
    .finally(() => {
      registrationInFlight = null;
    });

    return registrationInFlight;
  }

  // Flutter WebView fallback: register native token when browser web push isn't available.
  // This keeps restaurant/delivery FCM alerts working even when Web Push APIs are limited.
  await registerNativeWebViewFcmToken(moduleName);
  return null;
}
