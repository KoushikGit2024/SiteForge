import { boxyStyle } from './capture';
import { sound } from './audio';

export function wsOf(n: Node, root: Node): string {
  for (let e: Node | null = n; e && e !== root.parentNode; e = e.parentNode) {
    const w = (e as HTMLElement).style && (e as HTMLElement).style.whiteSpace;
    if (w) return w;
  }
  return 'normal';
}

const ATOMIC = new Set(['img', 'picture', 'video', 'canvas', 'svg', 'iframe', 'object', 'embed']);

export interface TextUnit {
  t?: Text;
  s?: string;
  e?: HTMLElement | SVGElement;
  len: number;
  box: HTMLElement | null;
  on?: boolean;
}

export function prepText(it: any): void {
  const live = it.full.cloneNode(true) as HTMLElement;
  const units: TextUnit[] = [];
  let seq = '';
  const boxes: HTMLElement[] = [];

  function rec(n: Node, box: HTMLElement | null): void {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === 3) {
        let s = (c as Text).data;
        const ws = wsOf(n, live);
        if (!/^pre|break-spaces/.test(ws)) s = s.replace(/[\t\n\r ]+/g, ' ');
        if (!s.length) {
          c.remove();
          continue;
        }
        units.push({ t: c as Text, s, len: s.length, box });
        seq += s;
      } else if (c.nodeType === 1) {
        const el = c as HTMLElement;
        if (
          ATOMIC.has(el.localName) ||
          el instanceof SVGElement ||
          (!/\S/.test(el.textContent || '') && el.style && boxyStyle(el.style))
        ) {
          units.push({ e: el, len: 1, box, on: true });
          seq += ' ';
        } else {
          const b = el.style && boxyStyle(el.style) ? el : box;
          if (b === el) boxes.push(el);
          rec(el, b);
        }
      }
    }
  }

  rec(live, null);

  for (const u of units) {
    if (u.t) u.t.data = '';
    else if (u.e) {
      u.e.style.visibility = 'hidden';
      u.on = false;
    }
  }
  for (const b of boxes) {
    b.style.visibility = 'hidden';
    (b as any).__on = false;
  }

  it.live = live;
  it.units = units;
  it.seq = seq;
  it.total = seq.length;
  it.shown = 0;
  it.rshown = 0;
  it.soundShown = 0;
}

export function reveal(it: any, n: number): Node | null {
  let left = n;
  let last: Node | null = null;
  const prevSoundShown = it.soundShown || 0;

  for (const u of it.units) {
    const k = left <= 0 ? 0 : left >= u.len ? u.len : left;
    left -= k;
    if (u.t) {
      const want = k === u.len ? u.s! : u.s!.slice(0, k);
      if (u.t.data !== want) {
        u.t.data = want;
      }
      if (k) last = u.t;
    } else if (u.e) {
      const on = k > 0;
      if (u.on !== on) {
        u.e.style.visibility = on ? '' : 'hidden';
        u.on = on;
      }
      if (on) last = u.e;
    }
    if (k && u.box && (u.box as any).__on === false) {
      for (let b: Node | null = u.box; b && b !== it.live; b = b.parentNode) {
        if ((b as any).__on === false) {
          (b as HTMLElement).style.visibility = '';
          (b as any).__on = true;
        }
      }
    }
  }

  it.shown = n;
  if (n > prevSoundShown && it.total > 0) {
    sound.typeProgress(n - prevSoundShown);
  }
  it.soundShown = n;

  return last;
}
