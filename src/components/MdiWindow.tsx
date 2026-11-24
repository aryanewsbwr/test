'use client';

import React, { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';

// Several screens open at once, like the old software: each sits in its own window on the desk,
// moved by dragging its title bar and resized from its right edge, bottom edge or corner. A click
// anywhere in a window brings it to the front. Keyboard shortcuts (Esc, Alt+S ...) go only to the
// window in front: each screen asks useWindowActive() before acting on a key.

const ActiveContext = createContext<{ current: boolean }>({ current: true });
export const useWindowActive = () => useContext(ActiveContext);

// A screen can ask its window for a size: a width (kept inside the desk) and 'full' height (down to
// the desk's bottom) or 'auto' (the screen's own height). Outside a window it does nothing.
type FitWindow = (size: { width?: number; height?: 'full' | 'auto' }) => void;
const FitContext = createContext<FitWindow>(() => {});
export const useFitWindow = () => useContext(FitContext);

export interface WinState { key: string; z: number; x: number; y: number; w?: number; h?: number }

const INTERACTIVE = 'button, input, select, textarea, a, label, [role="button"]';

export default function MdiWindow({ win, focused, keys = true, onFocus, onChange, children }: {
  win: WinState; focused: boolean; keys?: boolean; onFocus: () => void; onChange: (w: Partial<WinState>) => void; children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const active = useRef(focused);
  // keys go to the window in front, and to none while a box over all windows (Period, Backup) is open
  active.current = focused && keys;
  const [ready, setReady] = useState(!!win.w);

  // First size: the screen's own width (read while 'mdi-measuring' keeps the screen's own limit),
  // kept inside the desk
  useLayoutEffect(() => {
    if (win.w || !box.current) { setReady(true); return; }
    const el = box.current;
    const desk = el.parentElement;
    const inner = (el.querySelector('.d2-window') || el.firstElementChild) as HTMLElement | null;
    // its width laid out with room to spare (so a fixed width or a maximum width both show)
    const natural = inner ? inner.getBoundingClientRect().width : 0;
    const deskW = desk ? desk.clientWidth : window.innerWidth;
    const want = natural > 0 ? natural : 900;
    const w = Math.max(320, Math.min(want, deskW - win.x - 8));
    onChange({ w });
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fit: FitWindow = ({ width, height }) => {
    const desk = box.current?.parentElement;
    const deskW = desk ? desk.clientWidth : window.innerWidth;
    const deskH = desk ? desk.clientHeight : window.innerHeight;
    const next: Partial<WinState> = {};
    if (width) {
      const w = Math.max(320, Math.min(width, deskW - 16));
      next.w = w;
      // moved left if it would run off the desk
      if (win.x + w > deskW - 8) next.x = Math.max(8, deskW - 8 - w);
    }
    if (height === 'full') { next.y = Math.min(win.y, 8); next.h = Math.max(160, deskH - Math.min(win.y, 8) - 8); }
    if (height === 'auto') next.h = undefined;
    onChange(next);
  };

  // Drag by the title bar (not by its buttons)
  const startDrag = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.d2-title') || target.closest(INTERACTIVE)) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ox = win.x, oy = win.y;
    const desk = box.current?.parentElement;
    const move = (ev: PointerEvent) => {
      const maxX = (desk?.clientWidth || window.innerWidth) - 80;
      const maxY = (desk?.clientHeight || window.innerHeight) - 30;
      onChange({ x: Math.min(maxX, Math.max(-200, ox + ev.clientX - sx)), y: Math.min(maxY, Math.max(0, oy + ev.clientY - sy)) });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Resize from the right edge, the bottom edge or the corner
  const startResize = (dir: 'r' | 'b' | 'rb') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    onFocus();
    const el = box.current;
    if (!el) return;
    const sx = e.clientX, sy = e.clientY, ow = el.offsetWidth, oh = el.offsetHeight;
    const move = (ev: PointerEvent) => {
      const next: Partial<WinState> = {};
      if (dir !== 'b') next.w = Math.max(320, ow + ev.clientX - sx);
      if (dir !== 'r') next.h = Math.max(160, oh + ev.clientY - sy);
      onChange(next);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={box}
      className={`mdi-win absolute${win.h ? ' mdi-sized' : ''}${focused ? ' mdi-focus' : ''}${ready ? '' : ' mdi-measuring'}`}
      style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z, visibility: ready ? 'visible' : 'hidden' }}
      onPointerDownCapture={() => { if (!focused) onFocus(); }}
      onPointerDown={startDrag}
    >
      <FitContext.Provider value={fit}>
        <ActiveContext.Provider value={active}>{children}</ActiveContext.Provider>
      </FitContext.Provider>
      <div onPointerDown={startResize('r')} className="absolute top-0 right-0 w-2 h-full cursor-ew-resize" style={{ touchAction: 'none' }} />
      <div onPointerDown={startResize('b')} className="absolute bottom-0 left-0 h-2 w-full cursor-ns-resize" style={{ touchAction: 'none' }} />
      <div onPointerDown={startResize('rb')} className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize" style={{ touchAction: 'none' }}
        title="खींचकर छोटा/बड़ा करें" />
    </div>
  );
}
