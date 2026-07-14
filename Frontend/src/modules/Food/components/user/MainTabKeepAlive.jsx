import { Suspense, lazy, useEffect, useRef, useState } from "react";
import Home from "@food/pages/user/Home";
import ProtectedRoute from "@food/components/ProtectedRoute";
import { AppShellSkeleton } from "@food/components/ui/loading-skeletons";
import { registerFoodPageCacheLifecycle } from "@food/utils/foodPageCache";

const Dining = lazy(() => import("@food/pages/user/Dining"));
const Under250 = lazy(() => import("@food/pages/user/Under250"));
const Profile = lazy(() => import("@food/pages/user/profile/Profile"));

const TAB_SHELL_CLASS = "main-tab-keep-alive-pane";

function TabSuspense({ children }) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      {children}
    </Suspense>
  );
}

/**
 * Keeps main nav tabs mounted after first visit so tab switches are instant
 * (no remount, no duplicate API calls, scroll preserved per tab).
 */
export default function MainTabKeepAlive({ activeTab }) {
  const [visited, setVisited] = useState(() => new Set(activeTab ? [activeTab] : []));
  const scrollPositionsRef = useRef({});
  const prevTabRef = useRef(activeTab);

  useEffect(() => {
    registerFoodPageCacheLifecycle();
  }, []);

  useEffect(() => {
    if (!activeTab) return;
    setVisited((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    const prevTab = prevTabRef.current;
    if (prevTab && prevTab !== activeTab) {
      scrollPositionsRef.current[prevTab] = window.scrollY;
    }

    if (!activeTab) {
      prevTabRef.current = activeTab;
      return;
    }

    const savedY = scrollPositionsRef.current[activeTab];
    requestAnimationFrame(() => {
      window.scrollTo({
        top: typeof savedY === "number" ? savedY : 0,
        left: 0,
        behavior: "instant",
      });
    });

    prevTabRef.current = activeTab;
  }, [activeTab]);

  const paneProps = (tabId) => ({
    className: TAB_SHELL_CLASS,
    style: { display: activeTab === tabId ? "block" : "none" },
    "aria-hidden": activeTab !== tabId,
    "data-main-tab": tabId,
  });

  return (
    <>
      {visited.has("delivery") && (
        <div {...paneProps("delivery")}>
          <Home homeMode="delivery" isTabActive={activeTab === "delivery"} />
        </div>
      )}

      {visited.has("takeaway") && (
        <div {...paneProps("takeaway")}>
          <Home homeMode="takeaway" isTabActive={activeTab === "takeaway"} />
        </div>
      )}

      {visited.has("dining") && (
        <div {...paneProps("dining")}>
          <TabSuspense>
            <Dining isTabActive={activeTab === "dining"} />
          </TabSuspense>
        </div>
      )}

      {visited.has("under250") && (
        <div {...paneProps("under250")}>
          <TabSuspense>
            <Under250 isTabActive={activeTab === "under250"} />
          </TabSuspense>
        </div>
      )}

      {visited.has("profile") && (
        <div {...paneProps("profile")}>
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
            <TabSuspense>
              <Profile isTabActive={activeTab === "profile"} />
            </TabSuspense>
          </ProtectedRoute>
        </div>
      )}
    </>
  );
}
