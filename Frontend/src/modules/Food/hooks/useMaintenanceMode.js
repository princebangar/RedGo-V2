import { useCallback, useEffect, useRef, useState } from "react";
import apiClient from "@food/api/axios";

const POLL_WHEN_ON_MS = 2500;
const POLL_WHEN_OFF_MS = 8000;

/**
 * Strict maintenance flag: only true when API returns maintenance_mode_enabled === true.
 * Defaults to false so toggle-off never accidentally shows the maintenance screen.
 */
export function useMaintenanceMode({ active = true } = {}) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const enabledRef = useRef(false);

  const applyFlag = useCallback((value) => {
    const next = value === true;
    enabledRef.current = next;
    setEnabled(next);

    try {
      const raw = localStorage.getItem("redgo_customization_settings");
      const parsed = raw ? JSON.parse(raw) : {};
      const nextSettings = { ...parsed, maintenance_mode_enabled: next };
      localStorage.setItem("redgo_customization_settings", JSON.stringify(nextSettings));
    } catch {
      /* ignore */
    }
  }, []);

  const fetchFlag = useCallback(async () => {
    try {
      const response = await apiClient.get("/food/public/customization-settings");
      const settings = response?.data?.data || response?.data || {};
      applyFlag(settings?.maintenance_mode_enabled === true);
    } catch {
      // Fail open: if settings cannot be fetched, never lock the apps.
      applyFlag(false);
    } finally {
      setReady(true);
    }
  }, [applyFlag]);

  useEffect(() => {
    if (!active) {
      setEnabled(false);
      setReady(true);
      return undefined;
    }

    let cancelled = false;
    let timer = null;

    const tick = async () => {
      if (cancelled) return;
      await fetchFlag();
      if (cancelled) return;
      const delay = enabledRef.current ? POLL_WHEN_ON_MS : POLL_WHEN_OFF_MS;
      timer = setTimeout(tick, delay);
    };

    tick();

    const onFocus = () => {
      fetchFlag();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchFlag();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    const onMaintenanceEvent = (event) => {
      if (event?.detail && typeof event.detail.enabled === "boolean") {
        applyFlag(event.detail.enabled === true);
      } else {
        fetchFlag();
      }
    };
    window.addEventListener("maintenanceModeChanged", onMaintenanceEvent);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("maintenanceModeChanged", onMaintenanceEvent);
    };
  }, [active, fetchFlag, applyFlag]);

  return { enabled, ready };
}

export default useMaintenanceMode;
