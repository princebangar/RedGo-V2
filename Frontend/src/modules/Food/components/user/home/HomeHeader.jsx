import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ChevronDown, Search, Mic, CheckCircle2, Tag, Gift, AlertCircle, Clock, X, IndianRupee, User, Wallet } from 'lucide-react';
import { useProfile } from "@food/context/ProfileContext";
import useNotificationInbox from "@food/hooks/useNotificationInbox";

const ICON_MAP = {
  CheckCircle2,
  Tag,
  Gift,
  AlertCircle
};

export default function HomeHeader({
  activeTab,
  setActiveTab,
  location,
  savedAddressText,
  handleLocationClick,
  handleSearchFocus,
  placeholderIndex,
  placeholders,
  vegMode = false,
  handleVegModeChange,
  vegModeToggleRef
}) {
  const { userProfile } = useProfile();
  const initials = useMemo(() => {
    if (!userProfile) return "";
    const name = userProfile.firstName || userProfile.name || "";
    return name[0]?.toUpperCase() || "U";
  }, [userProfile]);

  return (
    <div className="relative pt-2 pb-0 px-4 transition-all duration-700 overflow-hidden bg-transparent shadow-none">
      {/* Subtle Artistic Glows - Adds depth without being 'boring' */}
      <div className="absolute top-[-20%] right-[-10%] w-48 h-48 bg-[#DC2626]/5 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-48 h-48 bg-[#48c479]/5 blur-[80px] rounded-full pointer-events-none" />

      {/* Main Header Content */}
      <div className="relative z-10 space-y-2.5">
        <div className="flex items-start gap-3">
          {/* Left: Location Selector */}
          <div
            className="flex items-center gap-2 cursor-pointer group min-w-0 flex-1"
            onClick={handleLocationClick}
          >
            <div className="bg-white/10 p-1.5 rounded-xl group-active:scale-95 transition-all">
              <MapPin className="h-4 w-4 text-white/90 fill-white/20" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[15px] font-black text-white truncate drop-shadow-sm">
                  {(() => {
                    const area = location?.area || location?.subLocality || location?.mainTitle || location?.neighborhood;
                    const city = (location?.city || "").toLowerCase();
                    const state = (location?.state || "").toLowerCase();

                    if (area && !/^-?\d+(\.\d+)?$/.test(area.trim())) {
                      const areaLower = area.toLowerCase();
                      if (areaLower !== city && areaLower !== state) {
                        return area;
                      }
                    }
                    
                    if (location?.address && location.address !== "Select location") {
                      const parts = location.address.split(',').map(p => p.trim());
                      for (const part of parts) {
                        const partLower = part.toLowerCase();
                        if (partLower && 
                            partLower !== city && 
                            partLower !== state && 
                            !/^-?\d/.test(part) &&
                            part.length > 2) {
                          return part;
                        }
                      }
                    }
                    
                    return location?.area || location?.city || "Select Location";
                  })()}
                </span>
                <ChevronDown className="h-3 w-3 text-white/70" />
              </div>
              
              <span className="text-[10px] font-medium text-white/80 truncate leading-tight mt-0.5">
                {(() => {
                  const state = location?.state || "";
                  const pincode = location?.pincode || "";
                  
                  if (state && pincode) return `${state}, ${pincode}`;
                  if (state) return state;
                  if (pincode) return pincode;
                  
                  const addr = location?.address || "";
                  if (addr && addr.length > 10) {
                     return addr.split(',').slice(1, 3).join(',').trim() || "Pinpoint location";
                  }
                  
                  return "Pinpoint location";
                })()}
              </span>
            </div>
          </div>

          {/* Right: Actions Column (Wallet, Profile, Veg Toggle) */}
          <div className="flex flex-col items-end gap-3 shrink-0">
            {/* Row 1: Wallet and Profile */}
            <div className="flex items-center gap-3">
              {/* Wallet Link - Icon Only */}
              <Link 
                to="/food/user/wallet"
                state={{ from: '/food/user' }}
                className="h-9 w-9 flex items-center justify-center rounded-full bg-white/10 border border-white/20 shadow-xl active:scale-90 transition-all"
              >
                <div className="bg-white/10 p-1.5 rounded-full">
                  <Wallet className="h-4.5 w-4.5 text-white" />
                </div>
              </Link>

              {/* Profile Initials - Compact circle, Large text inside */}
              <Link 
                to="/food/user/profile"
                className="h-9 w-9 relative flex items-center justify-center rounded-full bg-[#FFF5E6] border border-white/60 shadow-2xl cursor-pointer active:scale-90 transition-all overflow-hidden"
              >
                <span className="text-[22px] font-black text-[#DC2626] leading-none tracking-tighter antialiased">
                  {initials || 'U'}
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* Row 2: Search Bar and Veg Toggle */}
        <div className="flex items-center gap-3">
          <div
            className="flex-1 relative bg-white rounded-2xl flex items-center px-4 py-3 shadow-xl border border-black/5 cursor-pointer active:scale-[0.98] transition-all duration-300"
            onClick={handleSearchFocus}
          >
            <Search className="h-5 w-5 text-[#DC2626] mr-2 shrink-0" strokeWidth={3} />
            
            <div className="flex-1 overflow-hidden relative h-5">
              <AnimatePresence mode="wait">
                <motion.span
                  key={placeholderIndex}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 text-[15px] font-bold text-gray-400 truncate flex items-center"
                >
                  {placeholders?.[placeholderIndex] || 'Search'}
                </motion.span>
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-3 pl-3 border-l border-gray-100 ml-1">
              <Mic 
                className="h-5 w-5 text-gray-400" 
                onClick={(e) => {
                  e.stopPropagation();
                  handleVoiceSearchClick?.();
                }}
              />
            </div>
          </div>

          {/* Veg Mode Toggle - Styled like SS2 (Label above toggle) */}
          <div 
            ref={vegModeToggleRef}
            className="flex flex-col items-center gap-1 shrink-0 antialiased"
          >
            <span className="text-[9px] font-black text-white uppercase tracking-[0.1em] drop-shadow-md leading-none">Veg Mode</span>
            <div 
              className={`w-11 h-5 rounded-full relative transition-all duration-500 cursor-pointer border border-white/20 shadow-lg ${vegMode ? 'bg-[#48c479]' : 'bg-gray-500/60'}`}
              onClick={(e) => {
                e.stopPropagation();
                handleVegModeChange?.(!vegMode);
              }}
            >
              <motion.div 
                animate={{ x: vegMode ? 24 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
