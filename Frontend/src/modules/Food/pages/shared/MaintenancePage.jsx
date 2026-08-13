import { useEffect } from "react";
import { MAINTENANCE_CONTENT } from "@food/constants/maintenanceContent";
import maintenanceHero from "@food/assets/maintenance/maintenance-hero.png";

/**
 * Full-screen Under Maintenance UI for user / restaurant / delivery.
 * Visual comes from the generated hero asset (no social / no footer strip).
 * Editable fallback copy lives in `constants/maintenanceContent.js`.
 */
export default function MaintenancePage({ content = MAINTENANCE_CONTENT } = {}) {
  const title = content?.title || MAINTENANCE_CONTENT.title;

  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);

  return (
    <div className="maintenance-page flex min-h-[100dvh] w-full items-center justify-center overflow-y-auto bg-[#FFF8F0]">
      <style>{`
        @keyframes maintenance-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .maintenance-hero {
          animation: maintenance-fade-in 0.45s ease-out both;
        }
      `}</style>

      <div className="maintenance-hero mx-auto flex w-full max-w-lg justify-center px-3 py-4 sm:max-w-xl sm:px-6 sm:py-8">
        <img
          src={maintenanceHero}
          alt={title}
          className="h-auto w-full max-h-[100dvh] select-none object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}
