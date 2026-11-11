// @ts-nocheck
import { RULER, cursorSVG, HOT, f1, clamp, RED, BLUE, IMG_ICON } from '../core/constants';
import { STYLE } from './styles';
import { reveal, prepText } from '../core/textReveal';
export class View {
  constructor(env) {
    this.env = env;
    this.frozen = null;
    for (const old of document.querySelectorAll('siteforge-overlay')) old.remove();
    const host = document.createElement('siteforge-overlay');
    host.style.cssText =
      'all:initial !important;position:fixed !important;inset:0 !important;z-index:2147483647 !important;display:block !important;pointer-events:auto !important;contain:strict !important;opacity:1;transition:opacity .6s ease;';
    env.host = host;
    this.host = host;
    const root = host.attachShadow({ mode: 'open' });
    this.root = root;
    root.innerHTML = `<style>${STYLE}</style>
<div class="bg" aria-hidden="true"></div>
<div class="cad-grid" aria-hidden="true"></div>
<div class="pulse-band" aria-hidden="true"></div>
<div class="layer under" aria-hidden="true" inert></div>
<div class="port" aria-hidden="true" inert><div class="world"></div></div>
<div class="layer over" aria-hidden="true" inert></div>
<div class="intro" aria-hidden="true"></div>
<svg class="ov" aria-hidden="true"></svg>
<div class="badges" aria-hidden="true"></div>
<div class="cursors" aria-hidden="true"></div>
<div class="sf-inspect-box" aria-hidden="true" inert hidden></div>
<div class="rulers" aria-hidden="true"></div>
<div class="hud" role="group" aria-label="SiteForge controls">
  <span class="title-tag">SITEFORGE</span>
  <div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="txt"><span class="status">Surveying DOM...</span></div>
  <span class="sr-status" aria-live="polite" aria-atomic="true"></span>
  <div class="bar"><i></i></div>
  <button data-a="export" aria-pressed="false" title="Hover a layer, or use arrow keys to select one; activate its badge to copy">EXPORT</button>
  <button data-a="sound" title="Tap to activate sound; click again to mute">SND: ON</button>
</div>
<button class="sf-inspector-badge" type="button" aria-label="Copy Tailwind classes and HTML" hidden>COPY TAILWIND</button>`;
    const $ = (s) => root.querySelector(s);
    this.bg = $('.bg');
    this.pulseBand = $('.pulse-band');
    this.under = $('.under');
    this.over = $('.over');
    this.port = $('.port');
    this.world = $('.world');
    this.intro = $('.intro');
    this.ov = $('.ov');
    this.badges = $('.badges');
    this.cursorsEl = $('.cursors');
    this.rulers = $('.rulers');
    this.hud = $('.hud');
    this.status = $('.status');
    this.accessibleStatus = $('.sr-status');
    this.barFill = $('.bar i');
    this.dots = $('.dots');
    this.cursorEls = new Map();
    this._ovS = '';
    this._ovB = '';
    this._rulersOn = false;
    this.modelItems = [];
    this.inspectorBadge = $('.sf-inspector-badge');
    this.inspectBox = $('.sf-inspect-box');
    this.inspectedItem = null;

    const pb = env.pageBg || { color: 'rgb(255, 255, 255)', image: 'none' };
    const pbColor = typeof pb === 'string' ? pb : pb.color || 'rgb(255, 255, 255)';
    this.bg.style.backgroundColor = pbColor;
    const rgb = ((pbColor || '').match(/[\d.]+/g) || [255, 255, 255]).map(Number);
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    if (lum < 0.4) this.host.style.setProperty('--ph', '#3B3D42');
    if (pb.image && pb.image !== 'none') {
      this.bg.style.backgroundImage = pb.image;
      this.bg.style.backgroundSize = pb.size;
      this.bg.style.backgroundPosition = pb.position;
      this.bg.style.backgroundRepeat = pb.repeat;
    }
    this.makeIntroLogo();
    document.documentElement.appendChild(host);
    this.measure();
  }

  makeIntroLogo() {
    this.intro.innerHTML = '<div class="logo-box">SITEFORGE : RECONSTRUCTION PAGE</div>';
  }

  measure() {
    this.W = innerWidth;
    this.H = innerHeight;
    this.g = this.env.geom();
    const g = this.g;
    this.port.style.left = g.ox + 'px';
    this.port.style.top = g.oy + 'px';
    this.port.style.width = g.vw + 'px';
    this.port.style.height = g.vh + 'px';
  }

  get vp() {
    if (this.frozen) return this.frozen;
    const g = this.env.geom();
    return { ...g, ox: this.g.ox, oy: this.g.oy };
  }

  syncWorld() {
    const vp = this.vp;
    this.world.style.transform = `translate(${-vp.sx}px,${-vp.sy}px)`;
  }

  mount(model) {
    this.modelItems = model.items;
    this.world.style.width = model.docW + 'px';
    this.world.style.height = model.docH + 'px';
    const by = { world: [], under: [], over: [] };
    for (const it of model.items) by[it.layer].push(it);
    if (model.portKey != null) {
      // inner scroller: its scrolling content sits at the scroller's own place in
      // the stacking order (above its dialog/panel background, below later UI)
      const screen = [...by.under, ...by.over].sort((a, b) => a.key - b.key);
      const frag = document.createDocumentFragment();
      let placed = false;
      for (const it of screen) {
        if (!placed && it.key > model.portKey) {
          frag.appendChild(this.port);
          placed = true;
        }
        frag.appendChild(this.makeNode(it));
      }
      if (!placed) frag.appendChild(this.port);
      this.over.appendChild(frag);
      const wl = by.world.sort((a, b) => a.key - b.key);
      const wf = document.createDocumentFragment();
      for (const it of wl) wf.appendChild(this.makeNode(it));
      this.world.appendChild(wf);
    } else
      for (const layer of ['under', 'world', 'over']) {
        const list = by[layer].sort((a, b) => a.key - b.key);
        const frag = document.createDocumentFragment();
        for (const it of list) frag.appendChild(this.makeNode(it));
        (layer === 'world' ? this.world : this[layer]).appendChild(frag);
      }
    this.backdrops = (model.backdrops || []).map((b) => {
      const d = document.createElement('div');
      d.className = 'bd';
      const rgb = (b.color.match(/[\d.]+/g) || [255, 255, 255]).slice(0, 3).join(',');
      d.setAttribute(
        'style',
        `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;background:rgba(${rgb},.82);`,
      );
      this.over.insertBefore(d, this.over.firstChild);
      return d;
    });
    this.bdStart = this.env.geom().sy;
  }

  inspectAt(clientX, clientY) {
    const vp = this.vp;
    const x = clientX - vp.ox + vp.sx;
    const y = clientY - vp.oy + vp.sy;
    let found = null;
    let area = Infinity;
    for (const it of this.modelItems) {
      if (!(it.source instanceof HTMLElement) || it.layer !== 'world' || it.kind === 'line')
        continue;
      const b = it.kind === 'text' ? it.tb : it;
      if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) continue;
      const nextArea = Math.max(1, b.w * b.h);
      if (nextArea < area) {
        found = it;
        area = nextArea;
      }
    }
    return found;
  }

  showInspector(it, x, y) {
    this.inspectedItem = it && it.source instanceof HTMLElement ? it : null;
    this.placeInspectBox();
    if (!this.inspectedItem) {
      this.inspectorBadge.hidden = true;
      return;
    }
    this.inspectorBadge.textContent = 'COPY TAILWIND';
    this.inspectorBadge.hidden = false;
    this.inspectorBadge.style.left = `${Math.min(this.W - 120, Math.max(8, x + 12))}px`;
    this.inspectorBadge.style.top = `${Math.min(this.H - 28, Math.max(8, y + 12))}px`;
  }

  placeInspectBox() {
    const it = this.inspectedItem;
    if (!it) {
      this.inspectBox.hidden = true;
      return;
    }
    const bounds = it.source.getBoundingClientRect();
    const style = this.inspectBox.style;
    style.left = `${bounds.left}px`;
    style.top = `${bounds.top}px`;
    style.width = `${bounds.width}px`;
    style.height = `${bounds.height}px`;
    this.inspectBox.hidden = false;
  }

  makeNode(it) {
    const n = document.createElement('div');
    n.style.display = 'none';
    it.node = n;
    if (it.kind === 'rect') {
      n.className = 'it r';
      const f = document.createElement('div');
      f.className = 'f';
      n.appendChild(f);
    } else if (it.kind === 'image') {
      n.className = 'it m';
      n.innerHTML = IMG_ICON;
    } else if (it.kind === 'text') {
      n.className = 'it t';
      prepText(it);
    } else if (it.kind === 'line') {
      n.className = 'it l';
      n.innerHTML = '<svg width="1" height="1"><path fill="none"/></svg>';
    }
    if (it.op < 0.999) n.style.opacity = it.op;
    if (it.blend) n.style.mixBlendMode = it.blend;
    return n;
  }

  renderItem(it) {
    const tw = it.twinOf;
    if (tw && it._tv !== tw.v) {
      it._tv = tw.v;
      it.vis = tw.vis;
      it.shown = tw.total ? Math.round((tw.shown / tw.total) * it.total) : it.total;
      it.dx = tw.dx;
      it.dy = tw.dy;
      it.scale = tw.scale;
      it.done = tw.done;
      it.v++;
    }
    if (it.rv === it.v) return;
    it.rv = it.v;
    const n = it.node;
    if (!it.vis) {
      if (n.style.display !== 'none') n.style.display = 'none';
      return;
    }
    if (n.style.display === 'none') n.style.display = '';
    if (it.settle) {
      it.settle = false;
      n.classList.add('settle');
      clearTimeout(n._st);
      n._st = setTimeout(() => n.classList.remove('settle'), 340);
    }
    if (it.kind === 'line') {
      n.style.transform = `translate(${it.dx}px,${it.dy}px)`;
      const pts = it.pts.slice(0, it.placed);
      const d =
        pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ') + (it.shut ? ' Z' : '');
      const path = n.firstChild.firstChild;
      path.setAttribute('d', d);
      path.setAttribute('stroke', it.stroke);
      path.setAttribute('stroke-width', it.sw);
      path.setAttribute('stroke-linecap', 'square');
      if (it.dash) path.setAttribute('stroke-dasharray', it.dash);
      return;
    }
    const w = it.draw ? it.draw.w : it.w;
    const h = it.draw ? it.draw.h : it.h;
    let tf = `translate(${it.x + it.dx}px,${it.y + it.dy}px)`;
    if (it.scale !== 1) tf += ` scale(${it.scale})`;
    n.style.transform = tf;
    n.style.width = w + 'px';
    n.style.height = h + 'px';
    const c = it.clip;
    n.style.clipPath =
      it.done && c
        ? `inset(${Math.max(0, c.t - it.y)}px ${Math.max(0, it.x + it.w - c.r)}px ${Math.max(0, it.y + it.h - c.b)}px ${Math.max(0, c.l - it.x)}px)`
        : '';

    if (it.kind === 'rect') {
      const css = it.mode === 'master' ? it.copyOf.css : it.css;
      if (n._css !== css) {
        n.firstChild.setAttribute('style', css);
        n._css = css;
      }
      n.classList.toggle('st', !!it.styled);
      n.style.borderRadius = it.styled
        ? it.mode === 'master'
          ? it.copyOf.radius
          : it.radius
        : '0px';
    } else if (it.kind === 'image') {
      const src = it.mode === 'master' ? it.copyOf : it;
      if (n._src !== src) {
        const old = n.querySelector('.md');
        const m = src.media.cloneNode(true);
        m.classList.add('md');
        if (old) {
          m.classList.add('swap');
          old.replaceWith(m);
        } else n.appendChild(m);
        n._src = src;
        let fr = n.querySelector('.fr');
        if (src.frame) {
          if (!fr) {
            fr = document.createElement('div');
            fr.className = 'fr';
            n.appendChild(fr);
          }
          fr.setAttribute('style', src.frame + `border-radius:${src.radius};`);
        } else if (fr) fr.remove();
      }
      n.classList.toggle('st', !!it.styled);
      n.style.borderRadius = it.styled ? src.radius : '0px';
      n.style.boxShadow = it.styled ? src.shadow : '';
      n.style.backgroundColor = it.styled && src.bg ? src.bg : '';
    } else if (it.kind === 'text') {
      let content;
      if (it.mode === 'master') {
        if (!it._mv) it._mv = it.copyOf.full.cloneNode(true);
        content = it._mv;
      } else content = it.live;
      if (n.firstChild !== content) {
        n.textContent = '';
        n.appendChild(content);
      }
      if (it.mode !== 'master' && it.rshown !== it.shown) {
        it._last = reveal(it, it.shown);
        it.rshown = it.shown;
      }
      content.classList.toggle('sa', !!it.selAll);
      const wantCaret = it.editing && !it.selAll && it.mode !== 'master';
      if (wantCaret) {
        if (!it._caret) {
          it._caret = document.createElement('span');
          it._caret.className = 'caret';
        }
        const last = it._last;
        if (last && last.parentNode) last.parentNode.insertBefore(it._caret, last.nextSibling);
        else content.insertBefore(it._caret, content.firstChild);
      } else if (it._caret && it._caret.parentNode) it._caret.remove();
      if (it.scale !== 1) {
        const ox =
          it.tb.x -
          it.x +
          (it.align === 'center'
            ? it.tb.w / 2
            : it.align === 'right' || it.align === 'end'
              ? it.tb.w
              : 0);
        n.style.transformOrigin = `${ox}px ${it.tb.y - it.y}px`;
      }
    }
  }

  renderCursors(E) {
    const vp = E.vp;
    const seen = new Set();
    for (const c of E.cursors) {
      let el = this.cursorEls.get(c.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'cursor';
        el.style.color = c.color;
        el.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"></svg>';
        this.cursorsEl.appendChild(el);
        this.cursorEls.set(c.id, el);
        el._shape = '';
      }
      seen.add(c.id);
      const X = c.sticky ? c.x : c.x - vp.sx + vp.ox;
      const Y = c.sticky ? c.y : c.y - vp.sy + vp.oy;
      el.style.transform = `translate(${f1(X)}px,${f1(Y)}px)`;
      const svg = el.firstChild;
      if (el._shape !== c.shape) {
        svg.innerHTML = cursorSVG(c.shape, c.color);
        el._shape = c.shape;
        const [hx, hy] = HOT[c.shape];
        el._hx = hx;
        el._hy = hy;
        svg.style.transformOrigin = `${hx}px ${hy}px`;
      }
      const s = 1 - c.press * 0.12;
      svg.style.transform = `translate(${-el._hx}px,${-el._hy}px) rotate(${f1(c.angle)}deg) scale(${s})`;
    }
    for (const [id, el] of this.cursorEls)
      if (!seen.has(id)) {
        el.remove();
        this.cursorEls.delete(id);
      }
  }

  renderOverlay(E) {
    const vp = E.vp;
    const W = this.W;
    const H = this.H;
    const X = (x, st) => f1(st ? x : x - vp.sx + vp.ox);
    const Y = (y, st) => f1(st ? y : y - vp.sy + vp.oy);
    let s = '';
    let b = '';
    for (const g of E.guides) {
      if (!g.vis || g.op <= 0) continue;
      const sw = 1 + g.flash;
      const flt =
        g.flash > 0 ? ` style="filter:drop-shadow(0 0 ${f1(2 + g.flash * 3)}px ${RED})"` : '';
      if (g.axis === 'x') {
        const x = X(g.cur);
        s += `<line x1="${x}" x2="${x}" y1="0" y2="${H}" stroke="${RED}" stroke-width="${sw}" opacity="${f1(g.op)}"${flt}/>`;
      } else {
        const y = Y(g.cur);
        s += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="${RED}" stroke-width="${sw}" opacity="${f1(g.op)}"${flt}/>`;
      }
    }
    for (const it of E.editLines) {
      const st = it.layer !== 'world';
      const pts = it.pts.slice(0, it.placed).map((p) => [X(p.x + it.dx, st), Y(p.y + it.dy, st)]);
      const o = it.owner;
      const all = o ? [...pts, [X(o.x, o.sticky), Y(o.y, o.sticky)]] : pts;
      s += `<polyline points="${all.map((p) => p.join(',')).join(' ')}${it.shut && pts[0] ? ' ' + pts[0].join(',') : ''}" fill="none" stroke="${BLUE}" stroke-width="1.5"/>`;
      for (const p of pts)
        s += `<circle cx="${p[0]}" cy="${p[1]}" r="3.6" fill="#fff" stroke="${BLUE}" stroke-width="1.5"/>`;
    }
    const rt = E.rulers.t;
    for (const c of E.cursors) {
      if (!c.ov) continue;
      const st = c.sticky;
      for (const v of c.ov()) {
        if (v.t === 'box') {
          if (!v.b || ![v.b.x, v.b.y, v.b.w, v.b.h].every(Number.isFinite)) continue;
          const x = X(v.b.x, st);
          const y = Y(v.b.y, st);
          const w = Math.max(0, f1(v.b.w));
          const h = Math.max(0, f1(v.b.h));
          if (![x, y, w, h].every(Number.isFinite)) continue;
          const col = v.color === 'red' ? RED : BLUE;
          s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${col}" stroke-width="1"/>`;
          if (v.underline && v.underline.w > 0) {
            const u = v.underline;
            s += `<line x1="${X(u.x, st)}" x2="${X(u.x + u.w, st)}" y1="${Y(u.y, st)}" y2="${Y(u.y, st)}" stroke="${BLUE}" stroke-width="1.5"/>`;
          }
          if (v.rulerLines && rt > 0.05)
            s += `<g stroke="${BLUE}" stroke-width="1" stroke-dasharray="2 2" opacity="${f1(rt)}"><line x1="${RULER}" x2="${x}" y1="${f1(y + h / 2)}" y2="${f1(y + h / 2)}"/><line x1="${f1(x + w / 2)}" x2="${f1(x + w / 2)}" y1="${RULER}" y2="${y}"/></g>`;
          if (v.handles)
            for (const [hx, hy] of [
              [x, y],
              [x + w, y],
              [x, y + h],
              [x + w, y + h],
            ])
              s += `<rect x="${f1(hx - 3.5)}" y="${f1(hy - 3.5)}" width="7" height="7" fill="#fff" stroke="${col}" stroke-width="1"/>`;
          if (v.badge && w > 0)
            b += `<div class="badge" style="left:${f1(x + w / 2)}px;top:${f1(y + h + 8)}px;background:${col}">${v.badge}</div>`;
        } else if (v.t === 'measure') {
          const a = { x: X(v.a.x, st), y: Y(v.a.y, st) };
          const z = { x: X(v.b.x, st), y: Y(v.b.y, st) };
          s += `<line x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}" stroke="${RED}" stroke-width="1"/>`;
          const horiz = a.y === z.y;
          b += `<div class="badge" style="left:${f1(horiz ? (a.x + z.x) / 2 : a.x + 18)}px;top:${f1(horiz ? a.y + 8 : (a.y + z.y) / 2 - 9)}px;background:${RED}">${v.label}</div>`;
        }
      }
    }
    if (s !== this._ovS) {
      this.ov.innerHTML = s;
      this._ovS = s;
    }
    if (b !== this._ovB) {
      this.badges.innerHTML = b;
      this._ovB = b;
    }
  }

  renderRulers(E) {
    const t = E.rulers.t;
    if (t <= 0.001) {
      if (this._rulersOn) {
        this.rulers.innerHTML = '';
        this._rulersOn = false;
      }
      return;
    }
    this._rulersOn = true;
    const vp = E.vp;
    const W = this.W;
    const H = this.H;
    const step = 100;
    let u = '';
    let a = '';
    const x0 = Math.floor((vp.sx - vp.ox) / step) * step;
    for (let c = x0; c - vp.sx + vp.ox < W; c += step / 2) {
      const x = f1(c - vp.sx + vp.ox);
      const major = c % step === 0;
      u += `<line x1="${x}" x2="${x}" y1="${major ? 13 : 16}" y2="${RULER}" stroke="#5E5E5E"/>`;
      if (major) u += `<text x="${f1(x + 3)}" y="11" class="rtext">${c}</text>`;
    }
    const y0 = Math.floor((vp.sy - vp.oy) / step) * step;
    for (let c = y0; c - vp.sy + vp.oy < H; c += step / 2) {
      const y = f1(c - vp.sy + vp.oy);
      const major = c % step === 0;
      a += `<line y1="${y}" y2="${y}" x1="${major ? 13 : 16}" x2="${RULER}" stroke="#5E5E5E"/>`;
      if (major)
        a += `<text x="11" y="${f1(y - 3)}" class="rtext" transform="rotate(-90 11 ${f1(y - 3)})">${c}</text>`;
    }
    for (const c of E.cursors) {
      if (!c.ov || c.sticky) continue;
      for (const v of c.ov()) {
        if (v.t !== 'box' || !v.handles) continue;
        if (!v.b || ![v.b.x, v.b.y, v.b.w, v.b.h].every(Number.isFinite)) continue;
        const l = f1(v.b.x - vp.sx + vp.ox);
        const r = f1(v.b.x + v.b.w - vp.sx + vp.ox);
        const tp = f1(v.b.y - vp.sy + vp.oy);
        const bt = f1(v.b.y + v.b.h - vp.sy + vp.oy);
        if (![l, r, tp, bt].every(Number.isFinite)) continue;
        u =
          `<rect x="${l}" y="0" width="${f1(r - l)}" height="${RULER}" fill="rgba(13,153,255,0.22)"/>` +
          u +
          `<text x="${f1(l + 3)}" y="11" class="rtext rsel">${Math.round(v.b.x)}</text>`;
        a =
          `<rect y="${tp}" x="0" height="${Math.max(0, f1(bt - tp))}" width="${RULER}" fill="rgba(13,153,255,0.22)"/>` +
          a;
      }
    }
    for (const g of E.guides) {
      if (!g.dragging) continue;
      if (g.axis === 'x') {
        const x = f1(g.cur - vp.sx + vp.ox);
        u += `<line x1="${x}" x2="${x}" y1="0" y2="${RULER}" stroke="${RED}"/><text x="${f1(x + 4)}" y="11" class="rtext" fill="${RED}" style="fill:${RED}">${Math.round(g.cur)}</text>`;
      } else {
        const y = f1(g.cur - vp.sy + vp.oy);
        a += `<line y1="${y}" y2="${y}" x1="0" x2="${RULER}" stroke="${RED}"/>`;
      }
    }
    this.rulers.innerHTML =
      `<div class="ruler ruler-top" style="transform:translateY(${f1((t - 1) * 100)}%)"><svg width="${W}" height="${RULER}">${u}</svg></div>` +
      `<div class="ruler ruler-left" style="transform:translateX(${f1((t - 1) * 100)}%)"><svg width="${RULER}" height="${H}">${a}</svg></div>` +
      `<div class="ruler-corner" style="opacity:${f1(t)}"></div>`;
  }

  render(E) {
    this.syncWorld();
    const active = E.started && !E.flocking;
    const bandY = E.vp.oy + Math.max(0, Math.min(E.vp.vh, E.frontier - E.vp.sy));
    this.pulseBand.style.opacity = active ? '1' : '0';
    this.pulseBand.style.transform = `translateY(${f1(bandY)}px)`;
    if (this.backdrops && this.backdrops.length) {
      const o = f1(clamp((Math.abs(E.vp.sy - this.bdStart) - 8) / 80, 0, 1));
      if (o !== this._bdO) {
        this._bdO = o;
        for (const d of this.backdrops) d.style.opacity = o;
      }
    }
    if (E.items) for (const it of E.items) this.renderItem(it);
    this.renderOverlay(E);
    this.renderCursors(E);
    this.renderRulers(E);
    this.placeInspectBox();
  }
}

// ----------------------------------------------------------------- engine
