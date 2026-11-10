import type { Rect, CursorShape } from '../types';

export const ROLES: readonly string[] = [
  'Grid Architect',
  'Layout Drafter',
  'Dimension Lead',
  'Structural Engineer',
  'Metric Surveyor',
  'Frame Modeler',
  'Precision Drafter',
  'Vector Specifier',
  'Assembly Tech',
  'Alignment Lead',
  'Viewport Planner',
  'Component Analyst',
  'Boundary Inspector',
  'Matrix Surveyor',
  'Profile Modeler',
  'Draftsman',
  'CAD Operator',
  'Elevation Lead',
  'Plan Modeler',
  'Vector Lead',
  'Detail Specialist',
  'Spacing Surveyor',
  'Scale Engineer',
  'Blueprint Lead',
  'Tolerance Inspector',
  'Geometrician',
  'Subdivision Drafter',
  'Layout Analyst',
  'System Modeler',
  'Structural Planner',
  'Datum Specialist',
  'Cadence Drafter',
];

export const TECHNICAL_PALETTE: readonly string[] = [
  '#2563EB',
  '#0D9488',
  '#0284C7',
  '#4F46E5',
  '#059669',
  '#D97706',
  '#7C3AED',
  '#DB2777',
  '#16A34A',
  '#2563EB',
  '#EA580C',
  '#0891B2',
];

export const BLUE = '#0284C7';
export const RED = '#DC2626';
export const RULER = 20;
export const MIN_AGENTS = 8;
export const MAX_AGENTS = 48;
export const FLOCK_AGENTS = 36;
export const INTRO_AGENTS = 18;
export const MAX_ITEMS = 4000;
export const MAX_WORLD_H = 40000;
export const SVGNS = 'http://www.w3.org/2000/svg';

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
export const bump = (it: { v: number }): void => {
  it.v++;
};
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
export const nextFrame = (): Promise<number> => new Promise((r) => requestAnimationFrame(r));
export const f1 = (n: number): number => Math.round(n * 10) / 10;

export function alphaOf(c: string | undefined): number {
  if (!c || c === 'transparent') return 0;
  const slash = c.match(/\/\s*([\d.]+%?)\s*\)/);
  if (slash) return slash[1].endsWith('%') ? parseFloat(slash[1]) / 100 : parseFloat(slash[1]);
  const m = c.match(/^rgba\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',');
    return p.length >= 4 ? parseFloat(p[3]) : 1;
  }
  return 1;
}

export function intersect(a: Rect | null | undefined, b: Rect | null | undefined): Rect | null {
  if (!a || !b) return null;
  const l = Math.max(a.l, b.l);
  const t = Math.max(a.t, b.t);
  const r = Math.min(a.r, b.r);
  const bt = Math.min(a.b, b.b);
  return r > l && bt > t ? { l, t, r, b: bt } : null;
}

export const ltrb = (
  r: DOMRect | ClientRect | { left: number; top: number; right: number; bottom: number },
): Rect => ({
  l: r.left,
  t: r.top,
  r: r.right,
  b: r.bottom,
});

export const HOT: Record<CursorShape, [number, number]> = {
  arrow: [1, 1],
  dup: [1, 1],
  pen: [4, 4],
  'pen-add': [4, 4],
  'pen-close': [4, 4],
  cross: [12, 12],
  ibeam: [12, 12],
  ew: [12, 12],
  ns: [12, 12],
};

export function cursorSVG(shape: CursorShape, c: string): string {
  switch (shape) {
    case 'arrow':
      return `<path d="M1 1 L1 18 L6 13 L11 23 L14 21.5 L9 11.5 L15 11.5 Z" fill="${c}" stroke="#0F172A" stroke-width="1.2" stroke-linejoin="miter"/>`;
    case 'dup':
      return (
        `<path d="M5 5 L5 21 L9.5 16.5 L14 25.5 L16.8 24 L12.3 15 L17.5 15 Z" fill="#FFFFFF" stroke="${c}" stroke-width="1.2" stroke-linejoin="miter"/>` +
        `<path d="M1 1 L1 17 L5.5 12.5 L10 21.5 L12.8 20 L8.3 11 L13.5 11 Z" fill="${c}" stroke="#0F172A" stroke-width="1.2" stroke-linejoin="miter"/>`
      );
    case 'pen':
    case 'pen-add':
    case 'pen-close': {
      let s =
        `<path d="M3 3 L15 7 L19 11 L11 19 L7 15 Z" fill="${c}" stroke="#0F172A" stroke-width="1.2" stroke-linejoin="miter"/>` +
        `<path d="M3 3 L9 9" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="square"/>` +
        `<rect x="11" y="11" width="3" height="3" fill="#FFFFFF" stroke="#0F172A" stroke-width="0.8"/>`;
      if (shape === 'pen-add') {
        s +=
          `<path d="M22 18 V24 M19 21 H25" stroke="#0F172A" stroke-width="2.4" stroke-linecap="square"/>` +
          `<path d="M22 18 V24 M19 21 H25" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="square"/>`;
      }
      if (shape === 'pen-close') {
        s +=
          `<rect x="19" y="19" width="6" height="6" fill="none" stroke="#0F172A" stroke-width="2.2"/>` +
          `<rect x="19" y="19" width="6" height="6" fill="none" stroke="#FFFFFF" stroke-width="1.2"/>`;
      }
      return s;
    }
    case 'cross':
      return (
        `<g stroke-linecap="square">` +
        `<path d="M12 2 V22 M2 12 H22" stroke="#0F172A" stroke-width="2.6"/>` +
        `<path d="M12 2 V22 M2 12 H22" stroke="${c}" stroke-width="1.2"/>` +
        `<circle cx="12" cy="12" r="4" fill="none" stroke="${c}" stroke-width="1" stroke-dasharray="2 2"/>` +
        `</g>`
      );
    case 'ibeam':
      return (
        `<g fill="none" stroke-linecap="square">` +
        `<path d="M8 4 H16 M12 4 V20 M8 20 H16" stroke="#0F172A" stroke-width="2.8"/>` +
        `<path d="M8 4 H16 M12 4 V20 M8 20 H16" stroke="${c}" stroke-width="1.2"/>` +
        `</g>`
      );
    case 'ew':
    case 'ns':
      return `<path d="M3 12 L7 8 V10.5 H17 V8 L21 12 L17 16 V13.5 H7 V16 Z"${
        shape === 'ns' ? ' transform="rotate(90 12 12)"' : ''
      } fill="${c}" stroke="#0F172A" stroke-width="1.2" stroke-linejoin="miter"/>`;
  }
}

export const IMG_ICON =
  '<svg class="ph" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="1.4" stroke-linecap="square"><rect x="3" y="3" width="18" height="18"/><line x1="3" y1="3" x2="21" y2="21"/><line x1="21" y1="3" x2="3" y2="21"/></svg>';
