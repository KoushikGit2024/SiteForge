import { alphaOf } from './constants';

export interface PageBg {
  color: string;
  image: string;
  size?: string;
  position?: string;
  repeat?: string;
  from?: Element | null;
}

export interface EnvGeom {
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  vw: number;
  vh: number;
}

export interface Env {
  scroller: Element;
  isRoot: boolean;
  host: HTMLElement | null;
  pageBg: PageBg;
  geom: () => EnvGeom;
  scrollHeight: () => number;
  scrollWidth: () => number;
  scrollTo: (y: number, x?: number) => void;
  scrollBy: (dy: number) => void;
}

export function pageBackground(): PageBg {
  const h = document.documentElement;
  const b = document.body;
  const hs = getComputedStyle(h);
  const bs = b ? getComputedStyle(b) : null;
  const pick = (cs: CSSStyleDeclaration): PageBg => ({
    color: cs.backgroundColor || 'rgb(255, 255, 255)',
    image: cs.backgroundImage || 'none',
    size: cs.backgroundSize,
    position: cs.backgroundPosition,
    repeat: cs.backgroundRepeat,
  });

  if (alphaOf(hs.backgroundColor) > 0.01 || (hs.backgroundImage && hs.backgroundImage !== 'none')) {
    return { ...pick(hs), from: h };
  }
  if (
    bs &&
    (alphaOf(bs.backgroundColor) > 0.01 || (bs.backgroundImage && bs.backgroundImage !== 'none'))
  ) {
    return { ...pick(bs), from: b };
  }
  const dark =
    /dark/.test(hs.colorScheme) &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return { color: dark ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)', image: 'none', from: null };
}

export function detectEnv(): Env {
  const se = document.scrollingElement || document.documentElement;
  let scroller: Element = se;
  let isRoot = true;

  if (se.scrollHeight <= window.innerHeight + 4) {
    let best: HTMLElement | null = null;
    let bestArea = 0;
    const all = document.body ? document.body.getElementsByTagName('*') : [];
    for (let i = 0; i < all.length && i < 20000; i++) {
      const el = all[i] as HTMLElement;
      if (el.scrollHeight <= el.clientHeight + 40 || el.clientHeight < window.innerHeight * 0.4)
        continue;
      const oy = getComputedStyle(el).overflowY;
      if (!/(auto|scroll|overlay)/.test(oy)) continue;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea && r.width > window.innerWidth * 0.35) {
        best = el;
        bestArea = area;
      }
    }
    if (best) {
      scroller = best;
      isRoot = false;
    }
  }

  const env: Env = {
    scroller,
    isRoot,
    host: null,
    pageBg: pageBackground(),
    geom(): EnvGeom {
      if (isRoot) {
        return {
          ox: 0,
          oy: 0,
          sx: window.scrollX,
          sy: window.scrollY,
          vw: document.documentElement.clientWidth,
          vh: window.innerHeight,
        };
      }
      const r = scroller.getBoundingClientRect();
      return {
        ox: r.left + (scroller as HTMLElement).clientLeft,
        oy: r.top + (scroller as HTMLElement).clientTop,
        sx: scroller.scrollLeft,
        sy: scroller.scrollTop,
        vw: scroller.clientWidth,
        vh: scroller.clientHeight,
      };
    },
    scrollHeight: () =>
      isRoot
        ? Math.max(se.scrollHeight, document.body ? document.body.scrollHeight : 0)
        : scroller.scrollHeight,
    scrollWidth: () => (isRoot ? se.scrollWidth : scroller.scrollWidth),
    scrollTo(y: number, x?: number) {
      const opts: ScrollToOptions = { top: y, behavior: 'instant' };
      if (x != null) opts.left = x;
      if (isRoot) window.scrollTo(opts);
      else scroller.scrollTo(opts);
    },
    scrollBy(dy: number) {
      if (isRoot) window.scrollBy({ top: dy, behavior: 'instant' });
      else scroller.scrollBy({ top: dy, behavior: 'instant' });
    },
  };

  return env;
}
