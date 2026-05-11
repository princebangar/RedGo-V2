import React from 'react';
import { MapPin, ChevronDown, Wallet } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useProfile } from "@food/context/ProfileContext";

const OutOfZoneScreen = ({ location, handleLocationClick }) => {
  const { userProfile } = useProfile();
  const BRAND_NAME = "RedGo"; // Change this for different projects

  const routerLocation = useLocation();
  const initials = React.useMemo(() => {
    if (!userProfile) return "";
    const name = userProfile.firstName || userProfile.name || "";
    return name[0]?.toUpperCase() || "U";
  }, [userProfile]);

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden fixed inset-0 z-40">
      {/* Navbar Overlay - Transparent and Absolute */}
      <div className="absolute top-0 left-0 right-0 pt-6 pb-4 px-4 z-50 bg-transparent">
        <div className="flex items-start gap-3">
          {/* Left: Location Selector */}
          <Link
            to="/food/user/address-selector"
            state={{ from: routerLocation.pathname }}
            className="flex items-center gap-2 cursor-pointer group min-w-0 flex-1 no-underline"
          >
            <div className="p-1.5 rounded-full group-active:scale-95 transition-all">
              <MapPin className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[17px] font-black text-white truncate drop-shadow-md">
                  {(() => {
                    const area = location?.area || location?.subLocality || location?.mainTitle || location?.neighborhood;
                    if (area && !/^-?\d+(\.\d+)?$/.test(area.trim())) return area;
                    return location?.city || "Select Location";
                  })()}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-white/90" />
              </div>
              <span className="text-[12px] font-bold text-white/90 truncate leading-tight drop-shadow-sm">
                {location?.city || "Pinpoint location"}
              </span>
            </div>
          </Link>

          {/* Right: Wallet and Profile */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/food/user/wallet"
              state={{ from: routerLocation.pathname }}
              className="h-9 w-9 flex items-center justify-center rounded-full active:scale-90 transition-all"
            >
              <Wallet className="h-5.5 w-5.5 text-white" />
            </Link>

            <Link
              to="/food/user/profile"
              state={{ from: routerLocation.pathname }}
              className="h-9 w-9 relative flex items-center justify-center rounded-full bg-[#FFF5E6] border border-white/60 shadow-2xl cursor-pointer active:scale-90 transition-all overflow-hidden"
            >
              <span className="text-[22px] font-black text-[#DC2626] leading-none tracking-tighter">
                {initials || 'U'}
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Top Image Part - Cropped with negative margin to remove gap */}
      <div className="w-full shrink-0 -mt-16">
        <img
          src="/assets/images/out-of-zone.png"
          alt="Service not available"
          className="w-full h-auto object-contain"
        />
      </div>

      {/* Absolute Positioned Bottom Content - Guarantees no overlap */}
      <div className="absolute bottom-52 left-0 right-0 flex flex-col items-center">
        {/* Text Context - Matching the provided Zomato screenshot exactly */}
        <div className="text-center mb-10 px-6">
          <h2 className="text-[24px] font-semibold text-[#1c1c1c] leading-[1.2] mb-3 tracking-tight">
            We'll be there soon –<br />hang tight!
          </h2>
          <p className="text-[16px] font-medium text-gray-500 leading-[1.4] max-w-[320px] mx-auto">
            Looks like online ordering isn't available<br />at your location yet.
          </p>
        </div>

        {/* Brand Logo - Styled like the Zomato logo reference */}
        <div className="w-full pl-8 mt-2">
          <span className="text-[34px] font-[1000] text-[#cbd5e1] italic tracking-tighter leading-none">
            {BRAND_NAME}
          </span>
        </div>
      </div>
    </div>
  );
};

export default OutOfZoneScreen;
