import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppShellSkeleton } from "@food/components/ui/loading-skeletons";
import {
  getCategoryLastClick,
  categoryBrowseNeedsRestore,
  runCategoryScrollLock,
} from "@food/utils/browseScrollMemory";

const CategoryPage = lazy(() => import("@food/pages/user/CategoryPage"));

/**
 * Keeps CategoryPage mounted under restaurant details.
 * Applies an immediate scroll lock on show so window doesn't stick at top
 * while CategoryPage expands the lazy list.
 */
export default function CategoryBrowseKeepAlive({
  categorySlug,
  isVisible,
}) {
  const [mountedSlug, setMountedSlug] = useState(categorySlug || null);
  const scrollYRef = useRef(0);

  useEffect(() => {
    if (categorySlug) setMountedSlug(categorySlug);
  }, [categorySlug]);

  useLayoutEffect(() => {
    if (!isVisible) {
      if (typeof window !== "undefined" && window.scrollY > 0) {
        scrollYRef.current = window.scrollY;
      }
      return undefined;
    }

    if (!categoryBrowseNeedsRestore()) {
      const pending = getCategoryLastClick();
      const targetY = Math.max(
        0,
        Number(pending?.scrollY) || scrollYRef.current || 0,
      );
      if (targetY > 0) {
        window.scrollTo({ top: targetY, left: 0, behavior: "instant" });
      }
      return undefined;
    }

    return runCategoryScrollLock({ durationMs: 280 });
  }, [isVisible, categorySlug]);

  if (!mountedSlug) return null;

  return (
    <div
      style={{ display: isVisible ? "block" : "none" }}
      aria-hidden={!isVisible}
      data-category-browse-preserved={!isVisible ? "true" : undefined}
    >
      <Suspense fallback={isVisible ? <AppShellSkeleton /> : null}>
        <CategoryPage
          embeddedCategorySlug={mountedSlug}
          isBrowseActive={isVisible}
          disableAutoScroll
        />
      </Suspense>
    </div>
  );
}
