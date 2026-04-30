import { useEffect, useRef, useState } from "react";
import { Settings, Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@food/api";
import { Card, CardHeader, CardTitle, CardContent } from "@food/components/ui/card";
import { Label } from "@food/components/ui/label";
import { Switch } from "@food/components/ui/switch";

const CUSTOMIZATION_TOGGLES = [
  {
    key: "takeaway_cod_enabled",
    label: "Takeaway COD",
    description:
      "Controls Cash on Delivery (COD) visibility for takeaway orders across the Restaurant panel and User takeaway checkout.",
    defaultValue: true,
  },
];

const getAdminToastOffsetPx = () => {
  try {
    if (typeof window === "undefined") return 0;
    if (window.innerWidth < 1024) return 0;

    const raw = localStorage.getItem("admin_sidebar_state");
    const isCollapsed = raw ? Boolean(JSON.parse(raw)?.isCollapsed) : false;
    return isCollapsed ? 40 : 160; 
  } catch {
    return 0;
  }
};

export default function CustomizationSettings() {
  const [loading, setLoading] = useState(true);
  const [savingByKey, setSavingByKey] = useState({});
  const loadToastShownRef = useRef(false);
  const inFlightReqRef = useRef({}); 
  const unlockTimersRef = useRef({}); 
  const [settings, setSettings] = useState(() => {
    const initial = {};
    for (const t of CUSTOMIZATION_TOGGLES) initial[t.key] = t.defaultValue;
    return initial;
  });

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        setLoading(true);
        const res = await adminAPI.getCustomizationSettings();
        if (!cancelled) {
          const next = {};
          const data = res?.data?.data || {};
          for (const t of CUSTOMIZATION_TOGGLES) {
            next[t.key] = data[t.key] !== false;
          }
          setSettings(next);
        }
      } catch (_error) {
        if (!cancelled) {
          if (!loadToastShownRef.current) {
            loadToastShownRef.current = true;
            toast.error("Failed to load customization settings", {
              duration: 2000,
              style: {
                width: "fit-content",
                maxWidth: "calc(100vw - 32px)",
                marginLeft: `${getAdminToastOffsetPx()}px`,
              },
            });
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSettings();
    return () => {
      cancelled = true;
      try {
        for (const k of Object.keys(unlockTimersRef.current || {})) {
          if (unlockTimersRef.current[k]) clearTimeout(unlockTimersRef.current[k]);
        }
      } catch {}
    };
  }, []);

  const handleToggle = async (key, checked) => {
    const prevValue = settings[key];
    setSettings((prev) => ({ ...prev, [key]: checked }));

    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    inFlightReqRef.current[key] = requestId;
    setSavingByKey((prev) => ({ ...prev, [key]: true }));

    if (unlockTimersRef.current[key]) clearTimeout(unlockTimersRef.current[key]);
    unlockTimersRef.current[key] = setTimeout(() => {
      if (inFlightReqRef.current[key] === requestId) {
        inFlightReqRef.current[key] = null;
        setSavingByKey((prev) => ({ ...prev, [key]: false }));
      }
    }, 6000);

    const meta = CUSTOMIZATION_TOGGLES.find((t) => t.key === key);
    const label = meta?.label || key;

    toast.success(`${label} ${checked ? "ON" : "OFF"}`, {
      duration: 2000,
      style: {
        width: "fit-content",
        maxWidth: "calc(100vw - 32px)",
        marginLeft: `${getAdminToastOffsetPx()}px`,
      },
    });

    try {
      await adminAPI.updateCustomizationSettings({ [key]: checked });
    } catch (_error) {
      setSettings((prev) => ({ ...prev, [key]: prevValue }));
      toast.error("Failed to update setting", {
        duration: 2000,
        style: {
          width: "fit-content",
          maxWidth: "calc(100vw - 32px)",
          marginLeft: `${getAdminToastOffsetPx()}px`,
        },
      });
    } finally {
      if (inFlightReqRef.current[key] === requestId) {
        inFlightReqRef.current[key] = null;
        setSavingByKey((prev) => ({ ...prev, [key]: false }));
      }
      if (unlockTimersRef.current[key]) {
        clearTimeout(unlockTimersRef.current[key]);
        unlockTimersRef.current[key] = null;
      }
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="inline-flex items-center">
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Settings className="w-7 h-7 text-neutral-800 dark:text-neutral-200" />
            Customization Settings
          </h1>
        </div>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">Control global customization toggles for the platform.</p>
      </div>

      <Card className="dark:bg-[#1a1a1a] dark:border-neutral-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-neutral-700 dark:text-neutral-300" />
            <CardTitle className="dark:text-white">Manage All Toggles Here</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {CUSTOMIZATION_TOGGLES.map((t) => (
              <div
                key={t.key}
                className="flex items-start justify-between gap-3 p-3 border rounded-lg bg-neutral-50/50 dark:bg-neutral-900/50 dark:border-neutral-800"
              >
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold dark:text-neutral-200">{t.label}</Label>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-snug">{t.description}</p>
                </div>
                <div className="shrink-0 pt-0.5">
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                  ) : (
                    <Switch
                      checked={settings[t.key] !== false}
                      onCheckedChange={(checked) => handleToggle(t.key, checked)}
                      disabled={savingByKey[t.key] === true}
                      className="scale-90 data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-zinc-400 shadow-sm"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
