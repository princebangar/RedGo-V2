import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  IoCube,
  IoCubeOutline,
  IoGrid,
  IoGridOutline,
  IoPerson,
  IoPersonOutline,
  IoTime,
  IoTimeOutline,
  IoWallet,
  IoWalletOutline,
} from 'react-icons/io5';
import { useDeliveryStore, dedupeOrdersByIdentity } from '@/modules/DeliveryV2/store/useDeliveryStore';

const ACCENT = '#15498B'; // --dv-primary
const IDLE = '#64748B';

// How many pixels the on-screen keyboard covers (0 = closed), so the bar can ride on top of it.
function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!viewport) return undefined;

    const sync = () => {
      const covered = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
      // a small difference is the browser's address bar, not a keyboard
      setOffset(covered > 120 ? covered : 0);
    };

    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    sync();
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, []);

  return offset;
}

// Floating bottom bar, same as the Hello Parth delivery app: white rounded bar 24px above the
// screen edge. Selected tab = filled icon in the delivery blue, slightly bigger, heavy blue label;
// idle tabs = grey outline icons.
export default function DeliveryBottomNav({ currentTab = 'feed' }) {
  const navigate = useNavigate();
  const keyboardOffset = useKeyboardOffset();
  const newOrders = useDeliveryStore((state) => state.newOrders);
  const acceptedOrders = useDeliveryStore((state) => state.acceptedOrders);
  // Badge = pending requests + accepted orders, so an admin-assigned order is visible too.
  const newOrdersCount = useMemo(
    () => dedupeOrdersByIdentity(newOrders).length + dedupeOrdersByIdentity(acceptedOrders).length,
    [newOrders, acceptedOrders],
  );

  const tabs = [
    { key: 'feed', label: 'Feed', Solid: IoGrid, Outline: IoGridOutline, path: '/food/delivery/feed' },
    {
      key: 'orders',
      label: 'Orders',
      Solid: IoCube,
      Outline: IoCubeOutline,
      path: '/food/delivery/orders',
      badge: newOrdersCount > 0 ? (newOrdersCount > 9 ? '9+' : newOrdersCount) : null,
    },
    { key: 'pocket', label: 'Pocket', Solid: IoWallet, Outline: IoWalletOutline, path: '/food/delivery/pocket' },
    { key: 'history', label: 'History', Solid: IoTime, Outline: IoTimeOutline, path: '/food/delivery/history' },
    { key: 'profile', label: 'Profile', Solid: IoPerson, Outline: IoPersonOutline, path: '/food/delivery/profile' },
  ];

  const nav = (
    <nav
      aria-label="Main navigation"
      // Same layer as the old bar (z-200), so popups keep opening above it as before.
      className="pointer-events-none fixed inset-x-0 z-[200] mx-auto w-[calc(100%-24px)] max-w-[448px] min-[381px]:w-[calc(100%-48px)]"
      style={{
        bottom: keyboardOffset
          ? keyboardOffset + 8
          : 'calc(24px + env(safe-area-inset-bottom, 0px))',
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      <div className="pointer-events-auto flex h-[72px] items-center justify-around rounded-[32px] border border-slate-900/[0.06] bg-white px-2 shadow-[0_14px_36px_rgba(15,23,42,0.18)]">
        {tabs.map(({ key, label, Solid, Outline, path, badge }) => {
          const active = key === currentTab;
          const Icon = active ? Solid : Outline;
          const color = active ? ACCENT : IDLE;
          return (
            <button
              key={key}
              type="button"
              onClick={() => navigate(path)}
              aria-current={active ? 'page' : undefined}
              className="flex h-14 min-w-0 flex-1 basis-0 flex-col items-center justify-center rounded-3xl outline-none touch-manipulation [-webkit-tap-highlight-color:transparent]"
            >
              <span className="flex max-w-full flex-col items-center gap-0.5">
                <span className={`relative transition-transform duration-200 ${active ? 'scale-110' : ''}`}>
                  <Icon size={22} color={color} aria-hidden="true" />
                  {badge ? (
                    <span className="absolute -right-[9px] -top-[5px] flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-[#EA580C] px-1 text-[9px] font-black leading-3 text-white">
                      {badge}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`block max-w-full overflow-hidden whitespace-nowrap text-[9px] uppercase leading-[11px] tracking-[0.18px] ${
                    active ? 'font-black' : 'font-bold'
                  }`}
                  style={{ color }}
                >
                  {label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );

  // In <body> so animated page wrappers cannot make it scroll with the page.
  return typeof document === 'undefined' ? nav : createPortal(nav, document.body);
}
