import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SWIPE_PAGES } from './pages';

const LOCK_DISTANCE = 10; // px of movement before deciding horizontal (swipe) vs vertical (scroll)
const MIN_DISTANCE = 50; // px drag that changes page on release...
const FLICK_VELOCITY = 0.35; // ...or px/ms - a quick flick changes page even if short
const EDGE_GUARD = 25; // px - leave screen edges to the browser's back/forward gesture
const EDGE_RESISTANCE = 0.3; // drag damping when there's no page in that direction
const SLIDE_MS = 200;

// Touches that start in something that owns its own horizontal gestures:
// form fields, sideways scrollers (e.g. Shades room tabs), and modals/overlays (position: fixed)
const startsInExcludedArea = (el, root) => {
  for (; el && el !== root; el = el.parentElement) {
    if (el.matches('input, select, textarea')) return true;
    const style = getComputedStyle(el);
    if (style.position === 'fixed') return true;
    if (el.scrollWidth > el.clientWidth && /auto|scroll/.test(style.overflowX)) return true;
  }
  return false;
};

// Swipe left/right on the page body to move through SWIPE_PAGES (stops at the ends).
// The page follows the finger, then slides out/in (or springs back).
export default function useSwipeNav(ref) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const animating = useRef(false);

  useEffect(() => {
    const index = SWIPE_PAGES.findIndex(p => p.path === pathname);
    const el = ref.current;
    if (index === -1 || !el) return;

    // Clearing the transform (not translateX(0)) matters: any transform makes
    // position:fixed modals inside <main> position relative to <main> instead of the screen.
    const setX = (x, ms = 0) => {
      el.style.transition = ms ? `transform ${ms}ms ease-out` : '';
      el.style.transform = x ? `translateX(${x}px)` : '';
    };
    const neighbor = (dx) => SWIPE_PAGES[index + (dx < 0 ? 1 : -1)];

    let g = null; // current gesture: { x, y, t, dx, lock: null | 'x' | 'y' }

    const onStart = (e) => {
      const t = e.touches[0];
      const valid = !animating.current
        && e.touches.length === 1
        && t.clientX > EDGE_GUARD
        && t.clientX < window.innerWidth - EDGE_GUARD
        && !startsInExcludedArea(e.target, el);
      g = valid ? { x: t.clientX, y: t.clientY, t: e.timeStamp, dx: 0, lock: null } : null;
    };

    const onMove = (e) => {
      if (!g || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.lock) {
        if (Math.abs(dx) < LOCK_DISTANCE && Math.abs(dy) < LOCK_DISTANCE) return;
        g.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (g.lock === 'y') return; // normal vertical scroll
      e.preventDefault(); // horizontal: we own this gesture
      g.dx = dx;
      setX(neighbor(dx) ? dx : dx * EDGE_RESISTANCE);
    };

    const springBack = () => {
      setX(0, SLIDE_MS);
      setTimeout(() => setX(0), SLIDE_MS);
    };

    const onEnd = (e) => {
      if (!g) return;
      const { dx, lock } = g;
      const velocity = Math.abs(dx) / Math.max(1, e.timeStamp - g.t);
      g = null;
      if (lock !== 'x') return;

      const next = neighbor(dx);
      if (!next || (Math.abs(dx) < MIN_DISTANCE && velocity < FLICK_VELOCITY)) return springBack();

      // Slide current page out, switch route, slide new page in from the other side
      animating.current = true;
      const w = window.innerWidth * Math.sign(dx);
      setX(w, SLIDE_MS);
      setTimeout(() => {
        navigate(next.path);
        setX(-w);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          setX(0, SLIDE_MS);
          setTimeout(() => { setX(0); animating.current = false; }, SLIDE_MS);
        }));
      }, SLIDE_MS);
    };

    const onCancel = () => {
      if (g?.lock === 'x') springBack();
      g = null;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [pathname, navigate, ref]);
}
