// @ts-nocheck
import { SVGNS, alphaOf, intersect, ltrb, MAX_ITEMS, MAX_WORLD_H, clamp } from './constants';
// ------------------------------------------------------------------ capture

const SKIP = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'head',
  'meta',
  'link',
  'title',
  'base',
  'datalist',
  'area',
  'map',
  'source',
  'track',
  'param',
  'siteforge-overlay',
]);
const DROP_IN_CLONE = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
]);
const REPLACED = new Set(['img', 'svg', 'video', 'canvas', 'iframe', 'embed', 'object', 'picture']);
const FORMS = new Set(['input', 'textarea', 'select']);

const TEXT_PROPS = [
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'font-stretch',
  'font-feature-settings',
  'font-variation-settings',
  'font-kerning',
  'font-optical-sizing',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-transform',
  'text-align',
  'text-indent',
  'text-decoration-line',
  'text-decoration-color',
  'text-decoration-style',
  'text-decoration-thickness',
  'text-underline-offset',
  'text-shadow',
  'white-space',
  'white-space-collapse',
  'text-wrap-mode',
  'text-wrap-style',
  'direction',
  'overflow-wrap',
  'word-break',
  'hyphens',
  'tab-size',
  '-webkit-text-fill-color',
  '-webkit-text-stroke-width',
  '-webkit-text-stroke-color',
  'text-rendering',
  '-webkit-font-smoothing',
  'list-style-type',
  'list-style-position',
  'list-style-image',
  'writing-mode',
];
const BOX_PROPS = [
  'display',
  'box-sizing',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'background-clip',
  '-webkit-background-clip',
  'box-shadow',
  'opacity',
  'vertical-align',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'flex-direction',
  'flex-wrap',
  'align-items',
  'justify-content',
  'gap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'align-self',
  'object-fit',
  'object-position',
  'overflow-x',
  'overflow-y',
  'text-overflow',
  '-webkit-line-clamp',
  '-webkit-box-orient',
  'visibility',
  'transform',
  'filter',
  'float',
  'fill',
  'stroke',
  'clip-path',
  'mix-blend-mode',
  '-webkit-mask-image',
  '-webkit-mask-size',
  '-webkit-mask-position',
  '-webkit-mask-repeat',
];
const ELEM_PROPS = [...TEXT_PROPS, ...BOX_PROPS];
const SVG_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'fill-opacity',
  'stroke-opacity',
  'fill-rule',
  'clip-rule',
  'opacity',
  'color',
  'stop-color',
  'stop-opacity',
  'display',
  'visibility',
  'font-family',
  'font-size',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'mix-blend-mode',
  'filter',
];
const SVG_OUTER_PROPS = [
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'vertical-align',
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'transform',
  'transform-origin',
  'flex-shrink',
  'flex-grow',
  'align-self',
  'order',
  'overflow',
];
const RECT_PROPS = [
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'background-origin',
  'background-clip',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'box-shadow',
  'backdrop-filter',
  'filter',
  'clip-path',
  '-webkit-mask-image',
  '-webkit-mask-size',
  '-webkit-mask-position',
  '-webkit-mask-repeat',
];

function styleString(cs, props) {
  let s = '';
  for (const p of props) {
    const v = cs.getPropertyValue(p);
    if (v !== '') s += `${p}:${v};`;
  }
  return s;
}

const lhPx = (cs) => {
  const v = parseFloat(cs.lineHeight);
  return isNaN(v) ? (parseFloat(cs.fontSize) || 16) * 1.2 : v;
};

function kidsOf(el) {
  if (el.shadowRoot) return [...el.shadowRoot.childNodes];
  if (el.localName === 'slot') {
    const a = el.assignedNodes({ flatten: true });
    return a.length ? a : [...el.childNodes];
  }
  return [...el.childNodes];
}

// Copy one element's computed style onto its clone, fix up media sources.
// ::before / ::after become real spans so icons, chevrons and separators survive.
function pseudoClone(src, which) {
  const ps = getComputedStyle(src, which);
  const c = ps.content;
  if (!c || c === 'none' || c === 'normal' || ps.display === 'none') return null;
  const sp = document.createElement('span');
  const str = c.match(/^"((?:[^"\\]|\\.)*)"/);
  if (str) sp.textContent = str[1].replace(/\\(.)/g, '$1');
  else if (/^url\(/.test(c)) {
    const u = c.match(/^url\(\s*["']?([^"')]+)["']?\s*\)/);
    if (u) {
      const im = document.createElement('img');
      im.src = u[1];
      im.setAttribute('style', 'display:inline-block;vertical-align:middle;');
      sp.appendChild(im);
    }
  }
  sp.setAttribute('style', styleString(ps, ELEM_PROPS));
  return sp;
}

function addPseudos(src, dst) {
  const b = pseudoClone(src, '::before');
  if (b) dst.insertBefore(b, dst.firstChild);
  const a = pseudoClone(src, '::after');
  if (a) dst.appendChild(a);
}

function prepClone(src, dst) {
  const tag = src.localName;
  if (DROP_IN_CLONE.has(tag)) {
    dst.remove();
    return null;
  }
  const cs = getComputedStyle(src);
  if (cs.display === 'none') {
    dst.remove();
    return null;
  }
  const isSvg = src instanceof SVGElement;
  let st = styleString(cs, isSvg ? SVG_PROPS : ELEM_PROPS);
  if (isSvg && tag === 'svg' && !src.ownerSVGElement) {
    dst.setAttribute('width', src.clientWidth || src.getBoundingClientRect().width);
    dst.setAttribute('height', src.clientHeight || src.getBoundingClientRect().height);
    st += styleString(cs, SVG_OUTER_PROPS);
  }
  dst.setAttribute('style', st);
  for (const a of [...dst.attributes]) {
    const n = a.name;
    if (
      n.startsWith('on') ||
      n === 'contenteditable' ||
      n === 'tabindex' ||
      n === 'autofocus' ||
      n === 'srcset' ||
      n === 'sizes' ||
      n === 'loading'
    )
      dst.removeAttribute(n);
  }
  if (tag === 'img') {
    dst.setAttribute('src', imgSrc(src));
    dst.setAttribute('decoding', 'async');
  }
  if (tag === 'svg') fixSvgRefs(dst);
  // Clones live in the page's document: custom elements would be upgraded by the
  // site's own JS (and often wipe their content), media would play. Swap in inert stand-ins.
  if (tag === 'audio') {
    dst.remove();
    return null;
  }
  if (tag === 'video' || tag === 'canvas' || (!isSvg && tag.includes('-'))) {
    let rep;
    if (tag === 'video' || tag === 'canvas') {
      let url = tag === 'video' ? src.poster : canvasPixels(src);
      rep = document.createElement(url ? 'img' : 'span');
      if (url) rep.setAttribute('src', url);
      else st += 'background:#1b1b1f;';
    } else {
      rep = document.createElement('span');
      while (dst.firstChild) rep.appendChild(dst.firstChild);
    }
    rep.setAttribute('style', st);
    if (dst.parentNode) dst.replaceWith(rep);
    dst = rep;
  }
  if (!isSvg && !REPLACED.has(tag) && !FORMS.has(tag) && tag !== 'img') addPseudos(src, dst);
  return dst;
}

// Clones are made in a document without a custom-element registry so the
// site's component code never runs on them.
let inertDoc = null;
const inert = () => inertDoc || (inertDoc = document.implementation.createHTMLDocument(''));

function cloneStyled(src) {
  const dst = inert().importNode(src, true);
  const a = [...src.querySelectorAll('*')];
  const b = [...dst.querySelectorAll('*')];
  const root = prepClone(src, dst) || document.createElement('span');
  for (let i = 0; i < a.length && i < b.length; i++) prepClone(a[i], b[i]);
  return root;
}

function cloneDescendantsStyled(src, dst) {
  const a = src.querySelectorAll('*');
  const b = dst.querySelectorAll('*');
  for (let i = 0; i < a.length && i < b.length; i++) prepClone(a[i], b[i]);
}

function imgSrc(img) {
  let s = img.currentSrc || img.src || '';
  const lazy =
    img.getAttribute('data-src') ||
    img.getAttribute('data-lazy-src') ||
    img.getAttribute('data-original');
  if (lazy && (!s || s.startsWith('data:') || !img.complete || !img.naturalWidth)) {
    try {
      s = new URL(lazy, location.href).href;
    } catch (_) {}
  }
  return s;
}

// Shadow trees can't see document-level <symbol>/<linearGradient> ids, so
// inline anything the clone references.
function fixSvgRefs(dst) {
  for (const u of dst.querySelectorAll('use')) {
    const href = u.getAttribute('href') || u.getAttribute('xlink:href');
    if (!href || href[0] !== '#') continue;
    const ref = document.getElementById(href.slice(1));
    if (!ref) continue;
    const isSym = ref.localName === 'symbol';
    const g = document.createElementNS(SVGNS, isSym ? 'svg' : 'g');
    if (isSym) {
      for (const at of ['viewBox', 'preserveAspectRatio'])
        if (ref.getAttribute(at)) g.setAttribute(at, ref.getAttribute(at));
      g.setAttribute('width', u.getAttribute('width') || '100%');
      g.setAttribute('height', u.getAttribute('height') || '100%');
      g.setAttribute('x', u.getAttribute('x') || 0);
      g.setAttribute('y', u.getAttribute('y') || 0);
      g.setAttribute('overflow', 'visible');
    } else if (u.getAttribute('x') || u.getAttribute('y')) {
      g.setAttribute(
        'transform',
        `translate(${u.getAttribute('x') || 0} ${u.getAttribute('y') || 0})`,
      );
    }
    const us = u.getAttribute('style');
    if (us) g.setAttribute('style', us);
    for (const ch of ref.childNodes) {
      if (ch.nodeType !== 1) {
        g.appendChild(ch.cloneNode(true));
        continue;
      }
      g.appendChild(cloneStyled(ch));
    }
    u.replaceWith(g);
  }
  const html = dst.outerHTML;
  const ids = new Set();
  html.replace(/url\(\s*["']?#([^"')\s]+)["']?\s*\)/g, (_, id) => ids.add(id));
  if (!ids.size) return;
  let defs = null;
  for (const id of ids) {
    if (dst.querySelector(`[id="${CSS.escape(id)}"]`)) continue;
    const ref = document.getElementById(id);
    if (!ref) continue;
    if (!defs) {
      defs = document.createElementNS(SVGNS, 'defs');
      dst.insertBefore(defs, dst.firstChild);
    }
    defs.appendChild(ref.cloneNode(true));
  }
}

// Pixels for things the DOM can't give back (WebGL canvases, playing video,
// cross-origin iframes) come from a screenshot taken when the user clicked.
export function cropShot(shot, r) {
  if (!shot || !shot.valid) return null;
  if (r.height > innerHeight * 3 || r.width > innerWidth * 2) return null;
  const vis = intersect(ltrb(r), { l: 0, t: 0, r: innerWidth, b: innerHeight });
  if (!vis) return null;
  const k = shot.scale;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(r.width * k));
  c.height = Math.max(1, Math.round(r.height * k));
  const w = (vis.r - vis.l) * k;
  const h = (vis.b - vis.t) * k;
  c.getContext('2d').drawImage(
    shot.img,
    vis.l * k,
    vis.t * k,
    w,
    h,
    (vis.l - r.left) * k,
    (vis.t - r.top) * k,
    w,
    h,
  );
  const full =
    vis.l <= r.left + 1 && vis.t <= r.top + 1 && vis.r >= r.right - 1 && vis.b >= r.bottom - 1;
  try {
    return c.toDataURL(full ? 'image/jpeg' : 'image/webp', 0.9);
  } catch (_) {
    return null;
  }
}

export function canvasPixels(el) {
  try {
    const probe = document.createElement('canvas');
    probe.width = probe.height = 12;
    const g = probe.getContext('2d');
    g.drawImage(el, 0, 0, 12, 12);
    const d = g.getImageData(0, 0, 12, 12).data;
    let a = 0;
    for (let i = 3; i < d.length; i += 4) a += d[i];
    return a > 0 ? el.toDataURL() : null;
  } catch (_) {
    return null;
  }
}

export function boxyStyle(st) {
  if (alphaOf(st.backgroundColor) > 0.02) return true;
  if (st.backgroundImage && st.backgroundImage !== 'none') return true;
  if (st.boxShadow && st.boxShadow !== 'none') return true;
  for (const s of ['Top', 'Right', 'Bottom', 'Left']) {
    if (
      parseFloat(st['border' + s + 'Width']) > 0 &&
      st['border' + s + 'Style'] !== 'none' &&
      alphaOf(st['border' + s + 'Color']) > 0.02
    )
      return true;
  }
  return false;
}

export function sameColor(a, b) {
  return (a || '').replace(/\s/g, '') === (b || '').replace(/\s/g, '');
}

export function captureDebugSnapshot(model, env) {
  const item = (it) => {
    const out = {};
    for (const key of [
      'id',
      'kind',
      'layer',
      'x',
      'y',
      'w',
      'h',
      'key',
      'op',
      'text',
      'fs',
      'lh',
      'sig',
      'tag',
      'depth',
      'zIndex',
    ]) {
      if (it[key] !== undefined && typeof it[key] !== 'object') out[key] = it[key];
    }
    if (it.tb) out.textBox = { x: it.tb.x, y: it.tb.y, w: it.tb.w, h: it.tb.h };
    if (it.pts) out.points = it.pts.map((p) => ({ x: p.x, y: p.y }));
    if (it.source) {
      out.source = {
        tag: it.source.localName,
        id: it.source.id || '',
        classes: typeof it.source.className === 'string' ? it.source.className : '',
      };
    }
    return out;
  };
  const task = (t) => ({
    id: t.id,
    y: t.y,
    layer: t.layer,
    state: t.state,
    gate: t.gate,
    deps: (t.deps || []).map((d) => d.id),
    type: t.spec && t.spec.type,
    itemId: t.spec && t.spec.it ? t.spec.it.id : undefined,
  });
  const g = env.geom();
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      isRoot: env.isRoot,
      viewport: { x: g.ox, y: g.oy, width: g.vw, height: g.vh },
      scroll: { x: g.sx, y: g.sy },
      document: { width: env.scrollWidth(), height: env.scrollHeight() },
    },
    model: {
      docW: model.docW,
      docH: model.docH,
      portKey: model.portKey,
      itemCount: model.items.length,
      taskCount: model.tasks.length,
      groupCount: model.groups.length,
      guideCount: model.guides.length,
      items: model.items.map(item),
      tasks: model.tasks.map(task),
      groups: model.groups.map((group) => ({
        id: group.id,
        master: { start: group.master.start, end: group.master.end },
        copies: group.copies.map((copy) => ({
          start: copy.start,
          end: copy.end,
          layer: copy.layer,
        })),
      })),
      guides: model.guides.map((guide) => ({
        axis: guide.axis,
        pos: guide.pos,
        current: guide.cur,
        visible: guide.vis,
        taskId: guide.task && guide.task.id,
        dependencyIds: (guide.deps || []).map((d) => d.id),
      })),
    },
  };
}

/**
 * Walk the live DOM and produce a blueprint for SiteForge to reconstruct.
 * Items live in "world" coords (scroller content space) or, for fixed UI,
 * in screen coords on an "over"/"under" layer.
 */
export function captureModel(env, shot) {
  const { ox, oy, sx, sy, vw, vh } = env.geom();
  const docW = Math.max(env.scrollWidth(), vw);
  const docH = Math.min(Math.max(env.scrollHeight(), vh), MAX_WORLD_H);
  const items = [];
  const roots = [];
  let order = 0;
  const csCache = new Map();
  const css = (el) => {
    let c = csCache.get(el);
    if (!c) {
      c = getComputedStyle(el);
      csCache.set(el, c);
    }
    return c;
  };
  const inlineCache = new Map();
  const fullClip = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
  const viewClip = { l: 0, t: 0, r: innerWidth, b: innerHeight };
  const pageBg = env.pageBg;
  const floats = [];
  const bars = [];
  let portKey = null;
  const html = document.documentElement;
  const body = document.body;

  const conv = (r, layer) =>
    layer === 'world'
      ? { x: r.left - ox + sx, y: r.top - oy + sy, w: r.width, h: r.height }
      : { x: r.left, y: r.top, w: r.width, h: r.height };
  const convClip = (c, layer) =>
    layer === 'world'
      ? { l: c.l - ox + sx, t: c.t - oy + sy, r: c.r - ox + sx, b: c.b - oy + sy }
      : { ...c };
  const clipFor = (r, clip, layer) => {
    if (
      r.left >= clip.l - 0.5 &&
      r.top >= clip.t - 0.5 &&
      r.right <= clip.r + 0.5 &&
      r.bottom <= clip.b + 0.5
    )
      return null;
    return convClip(clip, layer);
  };
  const inDoc = (b, layer) =>
    layer === 'world'
      ? b.x + b.w > 0 && b.x < docW && b.y + b.h > 0 && b.y < docH
      : b.x + b.w > 0 && b.x < innerWidth && b.y + b.h > 0 && b.y < innerHeight;

  function add(it) {
    it.id = items.length;
    it.v = 1;
    it.rv = 0;
    it.vis = false;
    it.dx = 0;
    it.dy = 0;
    it.scale = 1;
    it.mode = 'own';
    items.push(it);
    return it;
  }

  function allInline(el) {
    let v = inlineCache.get(el);
    if (v !== undefined) return v;
    v = !el.shadowRoot;
    if (v)
      for (const c of el.children) {
        const tag = c.localName;
        if (SKIP.has(tag) || tag === 'br' || tag === 'wbr') continue;
        if (c instanceof SVGElement) continue;
        const d = css(c).display;
        if (d === 'none') continue;
        if (d === 'inline') {
          if (!allInline(c)) {
            v = false;
            break;
          }
        } else if (!d.startsWith('inline')) {
          v = false;
          break;
        }
      }
    inlineCache.set(el, v);
    return v;
  }

  function rootStyle(cs, isRun) {
    let s = styleString(cs, TEXT_PROPS);
    if (isRun)
      return (
        s +
        'display:block;padding:0;margin:0;box-sizing:border-box;width:100%;height:100%;position:relative;'
      );
    const pad = (side) =>
      (parseFloat(cs.getPropertyValue(`padding-${side}`)) || 0) +
      (parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0);
    let d = cs.display;
    if (/flex/.test(d)) {
      d = 'flex';
      s += styleString(cs, [
        'flex-direction',
        'flex-wrap',
        'align-items',
        'justify-content',
        'align-content',
        'row-gap',
        'column-gap',
      ]);
    } else if (/grid/.test(d)) {
      d = 'grid';
      s += styleString(cs, [
        'grid-template-columns',
        'grid-template-rows',
        'grid-auto-flow',
        'grid-auto-columns',
        'grid-auto-rows',
        'align-items',
        'justify-items',
        'justify-content',
        'align-content',
        'row-gap',
        'column-gap',
      ]);
    } else if (d === 'list-item' || d === '-webkit-box') {
      // keep
    } else d = 'block';
    s += `display:${d};padding:${pad('top')}px ${pad('right')}px ${pad('bottom')}px ${pad('left')}px;`;
    if (
      cs.overflowX !== 'visible' ||
      cs.overflowY !== 'visible' ||
      cs.textOverflow === 'ellipsis' ||
      (cs.webkitLineClamp && cs.webkitLineClamp !== 'none')
    ) {
      s += styleString(cs, [
        'overflow-x',
        'overflow-y',
        'text-overflow',
        '-webkit-line-clamp',
        '-webkit-box-orient',
      ]);
    }
    return s + 'margin:0;box-sizing:border-box;width:100%;height:100%;position:relative;';
  }

  function textItem(base, root, tb, cs, extra) {
    const fs = parseFloat(cs.fontSize) || 16;
    const text = root.textContent.replace(/\s+/g, ' ').trim();
    return add({
      kind: 'text',
      ...base,
      source: base.source || null,
      tb,
      full: root,
      fs,
      lh: lhPx(cs),
      align: cs.textAlign,
      text,
      sig: text,
      ...extra,
    });
  }

  function emitLeaf(el, cs, r, ctx, key) {
    const root = document.createElement('div');
    root.setAttribute('style', rootStyle(cs, false));
    const clone = inert().importNode(el, true);
    cloneDescendantsStyled(el, clone);
    while (clone.firstChild) root.appendChild(clone.firstChild);
    addPseudos(el, root);
    const rg = document.createRange();
    rg.selectNodeContents(el);
    const tr = rg.getBoundingClientRect();
    // table cells center their content vertically; reproduce the offset
    if (cs.display === 'table-cell' && tr.height)
      root.style.paddingTop = Math.max(0, tr.top - r.top) + 'px';
    // floats outside the leaf (figures, infoboxes) shape its line boxes: add invisible shims
    if (/^(block|list-item)$/.test(root.style.display)) {
      const n = (p) => parseFloat(cs.getPropertyValue(p)) || 0;
      const cl = r.left + n('border-left-width') + n('padding-left');
      const ct = r.top + n('border-top-width') + n('padding-top');
      const cr = r.right - n('border-right-width') - n('padding-right');
      for (const f of floats) {
        if (f.b <= r.top + 1 || f.t >= r.bottom - 1 || f.r <= r.left + 1 || f.l >= r.right - 1)
          continue;
        if (f.el.contains(el)) continue;
        const shim = document.createElement('div');
        const top = Math.max(0, f.t - ct);
        const w = f.side === 'left' ? f.r - cl : cr - f.l;
        if (w <= 0) continue;
        shim.setAttribute(
          'style',
          `float:${f.side};clear:${f.side};width:${w}px;height:${Math.max(0, f.b - Math.max(f.t, ct))}px;margin-top:${top}px;`,
        );
        root.insertBefore(shim, root.firstChild);
      }
    }
    const box = conv(r, ctx.layer);
    const tb = tr.width > 0 && tr.height > 0 ? conv(tr, ctx.layer) : { ...box };
    tb.x = clamp(tb.x, box.x - 4, box.x + box.w);
    tb.y = clamp(tb.y, box.y - 4, box.y + box.h);
    textItem(
      {
        ...box,
        source: el,
        layer: ctx.layer,
        key,
        op: ctx.op,
        clip: clipFor(r, ctx.clip, ctx.layer),
        parentBox: ctx.boxItem,
        blend: cs.mixBlendMode !== 'normal' ? cs.mixBlendMode : ctx.blend || '',
      },
      root,
      tb,
      cs,
    );
  }

  function emitRun(el, cs, run, ctx) {
    const rg = document.createRange();
    rg.setStartBefore(run[0]);
    rg.setEndAfter(run[run.length - 1]);
    const r = rg.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if (!intersect(ltrb(r), ctx.clip)) return;
    const root = document.createElement('div');
    root.setAttribute('style', rootStyle(cs, true));
    const single = r.height < lhPx(cs) * 1.6;
    if (single) root.style.whiteSpace = 'nowrap';
    for (const n of run) {
      if (n.nodeType === 3) root.appendChild(document.createTextNode(n.data));
      else root.appendChild(cloneStyled(n));
    }
    const box = conv(r, ctx.layer);
    if (!inDoc(box, ctx.layer)) return;
    box.w += 1;
    textItem(
      {
        ...box,
        source: el,
        layer: ctx.layer,
        key: ctx.key(),
        op: ctx.op,
        clip: clipFor(r, ctx.clip, ctx.layer),
        parentBox: ctx.boxItem,
        blend: ctx.blend || '',
      },
      root,
      { ...box },
      cs,
    );
  }

  function lineItem(pts, stroke, sw, dash, ctx, key) {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return add({
      kind: 'line',
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
      pts,
      stroke,
      sw,
      dash,
      placed: 0,
      shut: false,
      edit: false,
      owner: null,
      layer: ctx.layer,
      key,
      op: ctx.op,
      clip: null,
      parentBox: ctx.boxItem,
      sig: pts.length + stroke,
    });
  }

  function emitBox(el, cs, r, ctx, key, forceRect) {
    if (el === html) return null;
    const tag = el.localName;
    const bgc = cs.backgroundColor;
    const bgi = cs.backgroundImage;
    const bgVisible = (alphaOf(bgc) > 0.01 && !sameColor(bgc, pageBg.color)) || bgi !== 'none';
    if (el === body && pageBg.from === body) return null;
    const sides = ['top', 'right', 'bottom', 'left'].map((s) => {
      const w = parseFloat(cs.getPropertyValue(`border-${s}-width`)) || 0;
      const st = cs.getPropertyValue(`border-${s}-style`);
      const c = cs.getPropertyValue(`border-${s}-color`);
      return w > 0 && st !== 'none' && st !== 'hidden' && alphaOf(c) > 0.02
        ? { s, w, st, c }
        : null;
    });
    const nb = sides.filter(Boolean).length;
    const shadow = cs.boxShadow && cs.boxShadow !== 'none';
    const backdrop = cs.backdropFilter && cs.backdropFilter !== 'none';
    const b = conv(r, ctx.layer);
    if (tag === 'hr') {
      const c = sides[0] ? sides[0].c : alphaOf(bgc) > 0.01 ? bgc : 'rgb(200,200,200)';
      const y = b.y + b.h / 2;
      lineItem(
        [
          { x: b.x, y },
          { x: b.x + b.w, y },
        ],
        c,
        Math.max(1, Math.min(b.h, 2)),
        null,
        ctx,
        key,
      );
      return null;
    }
    const sameAsPage = alphaOf(bgc) > 0.01 && sameColor(bgc, pageBg.color) && bgi === 'none';
    if (!forceRect && !bgVisible && !shadow && !backdrop) {
      if (nb === 0) return null;
      if (nb < 4) {
        for (const sd of sides) {
          if (!sd) continue;
          const hw = sd.w / 2;
          let pts;
          if (sd.s === 'top')
            pts = [
              { x: b.x, y: b.y + hw },
              { x: b.x + b.w, y: b.y + hw },
            ];
          else if (sd.s === 'bottom')
            pts = [
              { x: b.x, y: b.y + b.h - hw },
              { x: b.x + b.w, y: b.y + b.h - hw },
            ];
          else if (sd.s === 'left')
            pts = [
              { x: b.x + hw, y: b.y },
              { x: b.x + hw, y: b.y + b.h },
            ];
          else
            pts = [
              { x: b.x + b.w - hw, y: b.y },
              { x: b.x + b.w - hw, y: b.y + b.h },
            ];
          const dash =
            sd.st === 'dashed'
              ? `${sd.w * 3} ${sd.w * 2}`
              : sd.st === 'dotted'
                ? `${sd.w} ${sd.w * 1.5}`
                : null;
          lineItem(pts, sd.c, sd.w, dash, ctx, key);
        }
        return null;
      }
    }
    if (sameAsPage && nb === 0 && !shadow && !backdrop && !forceRect) return null;
    const cssText = styleString(cs, RECT_PROPS);
    return add({
      kind: 'rect',
      source: el,
      blend: cs.mixBlendMode !== 'normal' ? cs.mixBlendMode : ctx.blend || '',
      big: b.w * b.h > vw * vh * 0.4,
      ...b,
      css: cssText,
      radius: cs.borderRadius,
      draw: null,
      styled: false,
      layer: ctx.layer,
      key,
      op: ctx.op,
      clip: clipFor(r, ctx.clip, ctx.layer),
      parentBox: ctx.boxItem,
      sig: cssText,
    });
  }

  // Decorative ::before/::after on containers (overlays, glows, standalone icons).
  // Their boxes aren't exposed, so derive them from the host box and the pseudo's insets.
  const PSEUDO_EL = { localName: 'pseudo' };
  function emitPseudoBox(el, cs, r, ctx, which, empty) {
    const ps = getComputedStyle(el, which);
    const c = ps.content;
    if (
      !c ||
      c === 'none' ||
      c === 'normal' ||
      ps.display === 'none' ||
      ps.visibility !== 'visible'
    )
      return;
    const pop = parseFloat(ps.opacity);
    if (!(pop > 0.03)) return;
    const n = (v) => parseFloat(v) || 0;
    const w = parseFloat(ps.width);
    const h = parseFloat(ps.height);
    if (!(w > 0 && h > 0)) return;
    const pad = {
      l: r.left + n(cs.borderLeftWidth),
      t: r.top + n(cs.borderTopWidth),
      r: r.right - n(cs.borderRightWidth),
      b: r.bottom - n(cs.borderBottomWidth),
    };
    let L;
    let T;
    if (ps.position === 'absolute') {
      if (cs.position === 'static') return; // containing block is some other ancestor
      const bw =
        w + n(ps.paddingLeft) + n(ps.paddingRight) + n(ps.borderLeftWidth) + n(ps.borderRightWidth);
      const bh =
        h + n(ps.paddingTop) + n(ps.paddingBottom) + n(ps.borderTopWidth) + n(ps.borderBottomWidth);
      L =
        ps.left !== 'auto'
          ? pad.l + n(ps.left)
          : ps.right !== 'auto'
            ? pad.r - n(ps.right) - bw
            : pad.l;
      T =
        ps.top !== 'auto'
          ? pad.t + n(ps.top)
          : ps.bottom !== 'auto'
            ? pad.b - n(ps.bottom) - bh
            : pad.t;
      const m = ps.transform.match(/^matrix\(([^)]+)\)$/);
      if (m) {
        const k = m[1].split(',').map(Number);
        L += k[4];
        T += k[5];
      }
      const fake = { left: L, top: T, right: L + bw, bottom: T + bh, width: bw, height: bh };
      if (!intersect(ltrb(fake), ctx.clip)) return;
      emitBox(PSEUDO_EL, ps, fake, { ...ctx, op: ctx.op * pop }, ctx.key(), false);
    } else {
      const cl = pad.l + n(cs.paddingLeft);
      const ct = pad.t + n(cs.paddingTop);
      const cw = pad.r - n(cs.paddingRight) - cl;
      const ch = pad.b - n(cs.paddingBottom) - ct;
      const align = (ps.alignSelf !== 'auto' ? ps.alignSelf : cs.alignItems) || '';
      const vAlign = () =>
        /center/.test(align) ? ct + (ch - h) / 2 : /end/.test(align) ? ct + ch - h : ct;
      if (empty) {
        // the only content of an icon-ish element: centre it in the content box
        L = cl + Math.max(0, (cw - w) / 2);
        T = ct + Math.max(0, (ch - h) / 2);
      } else if (/flex/.test(cs.display) && /^row/.test(cs.flexDirection)) {
        // icon before the first / after the last item of a flex row (chevrons, arrows)
        const kidsR = [...el.children]
          .filter(
            (k) =>
              css(k).display !== 'none' &&
              css(k).position !== 'absolute' &&
              css(k).position !== 'fixed',
          )
          .map((k) => k.getBoundingClientRect())
          .filter((k) => k.width || k.height);
        if (!kidsR.length) return;
        const gap = n(cs.columnGap);
        if (which === '::after') L = kidsR[kidsR.length - 1].right + gap + n(ps.marginLeft);
        else L = kidsR[0].left - gap - n(ps.marginRight) - w;
        T = vAlign();
      } else return;
      const fake = { left: L, top: T, right: L + w, bottom: T + h, width: w, height: h };
      if (!intersect(ltrb(fake), ctx.clip)) return;
      emitBox(PSEUDO_EL, ps, fake, { ...ctx, op: ctx.op * pop }, ctx.key(), false);
    }
  }

  function mediaFor(el, cs, r) {
    const tag = el.localName;
    const fit = `object-fit:${cs.objectFit};object-position:${cs.objectPosition};`;
    if (tag === 'img') {
      const src = imgSrc(el);
      if (!src) return null;
      const m = document.createElement('img');
      m.src = src;
      m.decoding = 'async';
      m.setAttribute('style', fit + 'display:block;');
      m.draggable = false;
      return { el: m, sig: src };
    }
    if (tag === 'svg') {
      const m = cloneStyled(el);
      m.setAttribute('width', '100%');
      m.setAttribute('height', '100%');
      m.style.display = 'block';
      m.style.overflow = 'visible';
      m.style.margin = '0';
      m.style.position = 'static';
      // the box we draw is the transformed bounding box; keep only a pure rotation/flip
      const mt = cs.transform.match(/^matrix\(([^)]+)\)$/);
      const k = mt ? mt[1].split(',').map(Number) : null;
      m.style.transform =
        k &&
        Math.abs(Math.hypot(k[0], k[1]) - 1) < 0.02 &&
        Math.abs(Math.hypot(k[2], k[3]) - 1) < 0.02
          ? `matrix(${k[0]},${k[1]},${k[2]},${k[3]},0,0)`
          : 'none';
      m.style.transformOrigin = '50% 50%';
      const h = m.outerHTML;
      return { el: m, sig: h.length + ':' + h.slice(0, 160) };
    }
    const imgOf = (src, extra) => {
      const m = document.createElement('img');
      m.src = src;
      m.setAttribute('style', (extra || '') + 'display:block;width:100%;height:100%;');
      m.draggable = false;
      return { el: m, sig: src.slice(0, 120) + src.length };
    };
    if (
      tag === 'video' ||
      tag === 'canvas' ||
      tag === 'iframe' ||
      tag === 'embed' ||
      tag === 'object'
    ) {
      const crop = cropShot(shot, r);
      if (crop) return imgOf(crop);
    }
    if (tag === 'video') {
      let src = el.poster || '';
      if (!src && el.videoWidth) {
        try {
          const c = document.createElement('canvas');
          c.width = el.videoWidth;
          c.height = el.videoHeight;
          c.getContext('2d').drawImage(el, 0, 0);
          src = c.toDataURL('image/jpeg', 0.82);
        } catch (_) {}
      }
      if (src) {
        const m = document.createElement('img');
        m.src = src;
        m.setAttribute('style', fit + 'display:block;');
        return { el: m, sig: src.slice(0, 200) };
      }
      const d = document.createElement('div');
      d.setAttribute('style', 'background:#111;');
      return { el: d, sig: 'video' };
    }
    if (tag === 'canvas') {
      const src = canvasPixels(el);
      if (src) return imgOf(src);
      return null;
    }
    // iframe / embed / object
    const d = document.createElement('div');
    let host = '';
    try {
      host = new URL(el.src || el.data || '', location.href).hostname.replace(/^www\./, '');
    } catch (_) {}
    d.setAttribute(
      'style',
      'background:#F1F2F4;display:flex;align-items:center;justify-content:center;font:500 12px/1.2 system-ui,sans-serif;color:#8A8F98;letter-spacing:.01em;',
    );
    d.textContent = host || 'embed';
    return { el: d, sig: 'frame:' + host };
  }

  function emitMedia(el, cs, r, ctx, key) {
    let src = el;
    let scs = cs;
    if (el.localName === 'picture') {
      src = el.querySelector('img');
      if (!src) return;
      scs = css(src);
    }
    const m = mediaFor(src, scs, r);
    if (!m) return;
    const b = conv(r, ctx.layer);
    add({
      kind: 'image',
      source: el,
      ...b,
      blend: cs.mixBlendMode !== 'normal' ? cs.mixBlendMode : ctx.blend || '',
      media: m.el,
      frame: styleString(cs, [
        'border-top-width',
        'border-right-width',
        'border-bottom-width',
        'border-left-width',
        'border-top-style',
        'border-right-style',
        'border-bottom-style',
        'border-left-style',
        'border-top-color',
        'border-right-color',
        'border-bottom-color',
        'border-left-color',
      ]),
      radius: cs.borderRadius,
      shadow: cs.boxShadow !== 'none' ? cs.boxShadow : '',
      bg: alphaOf(cs.backgroundColor) > 0.01 ? cs.backgroundColor : '',
      draw: null,
      styled: false,
      layer: ctx.layer,
      key,
      op: ctx.op,
      clip: clipFor(r, ctx.clip, ctx.layer),
      parentBox: ctx.boxItem,
      sig: m.sig,
    });
  }

  function emitForm(el, cs, r, ctx, key) {
    const tag = el.localName;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'hidden') return;
    const b = conv(r, ctx.layer);
    if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
      const accent = cs.accentColor && cs.accentColor !== 'auto' ? cs.accentColor : '#0B6CFF';
      const s = document.createElementNS(SVGNS, 'svg');
      s.setAttribute('viewBox', '0 0 16 16');
      s.setAttribute('width', '100%');
      s.setAttribute('height', '100%');
      const on = el.checked;
      s.innerHTML =
        type === 'radio'
          ? `<circle cx="8" cy="8" r="7" fill="#fff" stroke="${on ? accent : '#767676'}" stroke-width="1.2"/>${on ? `<circle cx="8" cy="8" r="4" fill="${accent}"/>` : ''}`
          : `<rect x="1" y="1" width="14" height="14" rx="2.5" fill="${on ? accent : '#fff'}" stroke="${on ? accent : '#767676'}" stroke-width="1.2"/>${on ? '<path d="M4.2 8.3 L7 11 L12 5.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' : ''}`;
      add({
        kind: 'image',
        source: el,
        ...b,
        media: s,
        frame: '',
        radius: '0px',
        shadow: '',
        bg: '',
        draw: null,
        styled: false,
        layer: ctx.layer,
        key,
        op: ctx.op,
        clip: null,
        parentBox: ctx.boxItem,
        sig: type + on,
      });
      return;
    }
    const boxIt = emitBox(el, cs, r, ctx, key, false);
    let text = '';
    let ph = false;
    if (tag === 'select')
      text = (el.selectedOptions && el.selectedOptions[0] && el.selectedOptions[0].text) || '';
    else if (['submit', 'button', 'reset'].includes(type))
      text = el.value || (type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : '');
    else if (type === 'password') text = '•'.repeat((el.value || '').length);
    else if (['range', 'color', 'file', 'image'].includes(type)) text = '';
    else text = el.value || '';
    if (!text && el.placeholder) {
      text = el.placeholder;
      ph = true;
    }
    if (!text.trim()) return;
    const root = document.createElement('div');
    const pad = (side) =>
      (parseFloat(cs.getPropertyValue(`padding-${side}`)) || 0) +
      (parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0);
    const isButton = ['submit', 'button', 'reset'].includes(type);
    let st = styleString(cs, TEXT_PROPS);
    st += `padding:${pad('top')}px ${pad('right')}px ${pad('bottom')}px ${pad('left')}px;margin:0;box-sizing:border-box;width:100%;height:100%;overflow:hidden;`;
    st +=
      tag === 'textarea'
        ? 'display:block;white-space:pre-wrap;'
        : `display:flex;align-items:center;white-space:pre;${isButton ? 'justify-content:center;' : ''}`;
    if (ph)
      st += `color:${getComputedStyle(el, '::placeholder').color};-webkit-text-fill-color:currentColor;`;
    root.setAttribute('style', st);
    root.textContent = text;
    textItem(
      {
        ...b,
        layer: ctx.layer,
        key: key + 0.5,
        op: ctx.op,
        clip: clipFor(r, ctx.clip, ctx.layer),
        parentBox: boxIt || ctx.boxItem,
      },
      root,
      { ...b },
      cs,
    );
  }

  function walk(el, ctx, parent) {
    if (items.length >= MAX_ITEMS) return;
    const tag = el.localName;
    if (SKIP.has(tag) || el === env.host) return;
    const cs = css(el);
    const disp = cs.display;
    if (disp === 'none') return;
    if (disp === 'contents') {
      // transparent wrapper (incl. <slot>): its loose text still renders, styled by it
      let run = [];
      const flushRun = () => {
        if (ctx.key && run.some((n) => /\S/.test(n.data))) emitRun(el, cs, run, ctx);
        run = [];
      };
      for (const c of kidsOf(el)) {
        if (c.nodeType === 3) run.push(c);
        else if (c.nodeType === 1) {
          flushRun();
          walk(c, ctx, parent);
        }
      }
      flushRun();
      return;
    }
    const op = ctx.op * parseFloat(cs.opacity);
    if (!(op > 0.03)) return;
    const r = el.getBoundingClientRect();
    // "visually hidden" accessibility text: 1px boxes, clip:rect(0 0 0 0), clip-path:inset(50%)
    // (html/body overflow belongs to the viewport, so a 0px-tall body clips nothing)
    const clipsSelf =
      el !== html &&
      el !== body &&
      el !== env.scroller &&
      cs.overflowX !== 'visible' &&
      cs.overflowY !== 'visible';
    if (clipsSelf && (r.width <= 2 || r.height <= 2)) return;
    if (cs.position === 'absolute' && /rect\(0px,? 0px,? 0px,? 0px\)/.test(cs.clip)) return;
    if (/inset\(50%\)|circle\(0px/.test(cs.clipPath)) return;
    if (cs.float !== 'none' && r.width > 1 && r.height > 1) {
      const n = (p) => parseFloat(cs.getPropertyValue(p)) || 0;
      floats.push({
        el,
        side: cs.float,
        l: r.left - n('margin-left'),
        t: r.top - n('margin-top'),
        r: r.right + n('margin-right'),
        b: r.bottom + n('margin-bottom'),
      });
    }
    let layer = ctx.layer;
    let clip = ctx.clip;
    let zTop = ctx.zTop;
    let posd = ctx.posd;
    const pos = cs.position;
    if (pos === 'fixed' && layer !== 'over') {
      layer = 'over';
      clip = viewClip;
    } else if (pos === 'sticky' && layer === 'world') {
      // stuck (or sitting exactly where it would stick) at the top of its scroller
      const top = parseFloat(cs.top);
      if (!isNaN(top) && Math.abs(r.top - oy - top) < 2 && r.height < vh * 0.4) {
        layer = 'over';
        clip = viewClip;
      }
    }
    // z-index counts for positioned boxes and for flex/grid items (even when static)
    const pe = el.parentElement;
    const flexItem = pos === 'static' && pe && /flex|grid/.test(css(pe).display);
    if (pos !== 'static' || flexItem) {
      if (cs.zIndex !== 'auto') {
        if (zTop == null) zTop = parseInt(cs.zIndex, 10) || 0;
      } else if (pos !== 'static') posd = true;
    }
    const keyFn = () => (zTop || 0) * 1e7 + (posd ? 5e6 : 0) + order++;
    if (
      layer === 'over' &&
      ctx.layer !== 'over' &&
      r.top <= 4 &&
      r.width >= vw * 0.8 &&
      r.height > 20 &&
      r.height <= 200
    ) {
      bars.push({
        node: null,
        r,
        start: items.length,
        key: (zTop || 0) * 1e7 + (posd ? 5e6 : 0) + order - 0.5,
      });
    }
    const isScroller = !env.isRoot && el === env.scroller;
    const kidLayer = isScroller ? 'world' : layer;
    const box = conv(r, layer);
    const visible = cs.visibility === 'visible';
    const sized = r.width >= 1 && r.height >= 1;
    const emit = visible && sized && !!intersect(ltrb(r), clip) && inDoc(box, layer);

    const node = {
      el,
      tag,
      cls: (el.getAttribute && el.getAttribute('class')) || '',
      layer,
      start: items.length,
      end: items.length,
      kids: [],
      box,
    };
    (parent ? parent.kids : roots).push(node);

    if (REPLACED.has(tag) || FORMS.has(tag)) {
      if (emit) {
        if (FORMS.has(tag)) emitForm(el, cs, r, { ...ctx, layer, clip, op }, keyFn());
        else emitMedia(el, cs, r, { ...ctx, layer, clip, op }, keyFn());
      }
      node.end = items.length;
      return;
    }

    let boxItem = ctx.boxItem;
    if (emit) {
      const b = emitBox(el, cs, r, { ...ctx, layer, clip, op }, keyFn(), false);
      if (b) boxItem = b;
    }

    let kidClip = clip;
    if (isScroller) {
      kidClip = fullClip;
      portKey = keyFn();
    } else if (
      el !== html &&
      el !== body &&
      (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')
    ) {
      const bl = parseFloat(cs.borderLeftWidth) || 0;
      const bt = parseFloat(cs.borderTopWidth) || 0;
      const br = parseFloat(cs.borderRightWidth) || 0;
      const bb = parseFloat(cs.borderBottomWidth) || 0;
      kidClip = intersect(clip, {
        l: r.left + bl,
        t: r.top + bt,
        r: r.right - br,
        b: r.bottom - bb,
      });
      if (!kidClip) {
        node.end = items.length;
        return;
      }
    }
    const blend = cs.mixBlendMode !== 'normal' ? cs.mixBlendMode : ctx.blend;
    const kctx = { op, layer: kidLayer, clip: kidClip, zTop, posd, boxItem, key: keyFn, blend };

    // Decide: one text leaf, or a mix of text runs and nested blocks.
    // Closed <details> and content-visibility:hidden still report real boxes for
    // content that isn't painted, so only the summary (or nothing) gets built.
    if (cs.contentVisibility === 'hidden') {
      node.end = items.length;
      return;
    }
    let kids = kidsOf(el);
    if (tag === 'details' && !el.open) {
      const sum = kids.find((n) => n.nodeType === 1 && n.localName === 'summary');
      kids = sum ? [sum] : [];
    }
    const emptyEl = !kids.some((k) => (k.nodeType === 3 && /\S/.test(k.data)) || k.nodeType === 1);
    const pctx = { ...kctx, layer, clip };
    const directText = kids.some((n) => n.nodeType === 3 && /\S/.test(n.data));
    const kinds = [];
    let allRun = !el.shadowRoot;
    let anyText = directText;
    for (const n of kids) {
      if (n.nodeType === 3) {
        kinds.push(1);
        continue;
      }
      if (n.nodeType !== 1 || SKIP.has(n.localName)) {
        kinds.push(0);
        continue;
      }
      const d = css(n).display;
      if (d === 'none') {
        kinds.push(0);
        continue;
      }
      let inl = false;
      const nt = n.localName;
      if (n.shadowRoot || nt === 'slot') inl = false;
      else if (nt === 'br' || nt === 'wbr') inl = true;
      else if (d === 'inline') inl = allInline(n);
      else if (directText && d.startsWith('inline')) inl = true;
      if (inl && !anyText && /\S/.test(n.textContent)) anyText = true;
      kinds.push(inl ? 1 : 2);
      if (!inl) allRun = false;
    }

    if (allRun && anyText && !isScroller) {
      if (visible && sized && emit) emitLeaf(el, cs, r, { ...kctx, layer }, keyFn());
      node.end = items.length;
      return;
    }
    // (text leaves carry their pseudos inside the clone instead)
    if (emit && visible) emitPseudoBox(el, cs, r, pctx, '::before', emptyEl);
    const afterPseudo = () => {
      if (emit && visible) emitPseudoBox(el, cs, r, pctx, '::after', emptyEl);
    };

    let run = [];
    const flush = () => {
      if (!run.length) return;
      const hasText = run.some((n) =>
        n.nodeType === 3 ? /\S/.test(n.data) : /\S/.test(n.textContent),
      );
      if (hasText) {
        if (visible) emitRun(el, cs, run, kctx);
      } else {
        for (const n of run) if (n.nodeType === 1) walk(n, kctx, node);
      }
      run = [];
    };
    kids.forEach((n, i) => {
      if (kinds[i] === 1) run.push(n);
      else if (kinds[i] === 2) {
        flush();
        walk(n, kctx, node);
      }
    });
    flush();
    afterPseudo();
    node.end = items.length;
  }

  const rootLayer = env.isRoot ? 'world' : 'under';
  const rootClip = env.isRoot ? fullClip : viewClip;
  walk(
    html,
    { op: 1, layer: rootLayer, clip: rootClip, zTop: null, posd: false, boxItem: null },
    null,
  );

  // --------------------------------------------- repeated components (dup)
  const groups = [];
  const kindsSig = (n) => {
    let s = '';
    for (let i = n.start; i < n.end; i++) s += items[i].kind[0];
    return s;
  };
  const similar = (a, b, loose) =>
    a.w > 0 &&
    b.w > 0 &&
    a.h > 0 &&
    b.h > 0 &&
    a.h / b.h < 1.8 &&
    b.h / a.h < 1.8 &&
    (loose || (a.w / b.w < 1.6 && b.w / a.w < 1.6));
  function findGroups(node, inCopy) {
    if (inCopy) return;
    const buckets = new Map();
    for (const k of node.kids) {
      const n = k.end - k.start;
      if (n < 1 || n > 48) continue;
      // long single paragraphs read better typed than duplicated
      if (n === 1 && items[k.start].kind === 'text' && items[k.start].text.length > 40) continue;
      const sig = `${k.tag}|${k.cls}|${k.layer}|${kindsSig(k)}`;
      if (!buckets.has(sig)) buckets.set(sig, []);
      buckets.get(sig).push(k);
    }
    const copies = new Set();
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const m = list[0];
      const loose = m.end - m.start === 1 && items[m.start].kind === 'text';
      const members = list.filter((k) => similar(k.box, m.box, loose));
      if (members.length < 2) continue;
      const g = { id: groups.length, master: members[0], copies: members.slice(1) };
      groups.push(g);
      for (const c of g.copies) copies.add(c);
    }
    for (const k of node.kids) findGroups(k, copies.has(k));
  }
  for (const r of roots) findGroups(r, false);

  for (const g of groups) {
    for (const c of g.copies) {
      for (let i = c.start; i < c.end; i++) {
        const it = items[i];
        if (it.copyOf) continue;
        it.copyOf = items[g.master.start + (i - c.start)];
        it.group = g;
      }
    }
  }

  const twinKey = new Map();
  for (const it of items) {
    if (it.kind !== 'text' || it.copyOf || !it.text) continue;
    const k = `${it.layer}|${Math.round(it.tb.x / 4)}|${Math.round(it.tb.y / 4)}|${it.text}`;
    const m = twinKey.get(k);
    if (m) it.twinOf = m;
    else twinKey.set(k, it);
  }

  // ------------------------------------------------------------- tasks
  const tasks = [];
  const mk = (y, spec, deps, layer) => {
    const t = { id: tasks.length, y, spec, deps, state: 'wait', doneAt: 0, layer };
    tasks.push(t);
    return t;
  };
  const KIND_TASK = { rect: 'rect', image: 'image', text: 'text', line: 'line' };
  for (const it of items) {
    if (it.copyOf) continue;
    if (it.twinOf) {
      it.final = it.twinOf.final;
      continue;
    }
    const deps = it.parentBox && it.parentBox.final ? it.parentBox.final : [];
    const y = it.kind === 'text' ? it.tb.y : it.y;
    it.task = mk(y, { type: KIND_TASK[it.kind], it }, deps, it.layer);
    it.final = [it.task];
  }
  // inner groups first so outer copies can wait for them
  for (let gi = groups.length - 1; gi >= 0; gi--) {
    const g = groups[gi];
    const mItems = items.slice(g.master.start, g.master.end);
    const masterFinals = [];
    for (const it of mItems) if (it.final) masterFinals.push(...it.final);
    if (
      g.master.start < g.master.end &&
      items[g.master.start].parentBox &&
      items[g.master.start].parentBox.final
    )
      masterFinals.push(...items[g.master.start].parentBox.final);
    g.src = { items: mItems, box: g.master.box };
    g.dst = g.copies.map((c, k) => {
      const its = items.slice(c.start, c.end).filter((it) => it.group === g);
      const minY = Math.min(...its.map((it) => (it.kind === 'text' ? it.tb.y : it.y)));
      const task = mk(minY, { type: 'dup', g, k }, masterFinals, c.layer);
      for (const it of its) {
        it.dupTask = task;
        it.final = [task];
        const m = it.copyOf;
        let type = null;
        if (it.kind === 'text' && it.sig !== m.sig) type = 'edit';
        else if (it.kind === 'image' && it.sig !== m.sig) type = 'swap';
        else if (it.kind === 'rect' && it.sig !== m.sig) type = 'restyle';
        if (type) {
          it.editTask = mk(it.kind === 'text' ? it.tb.y : it.y, { type, it }, [task], it.layer);
          it.final = [task, it.editTask];
        }
      }
      return { items: its, box: c.box, task };
    });
  }

  // -------------------------------------------------- guides & snapping
  const guides = [];
  const texts = items.filter(
    (it) => it.kind === 'text' && it.task && it.layer === 'world' && it.fs >= 13 && it.tb.w > 30,
  );
  const BAND = 900;
  const bands = new Map();
  for (const it of texts) {
    const k = Math.floor(it.tb.y / BAND);
    if (!bands.has(k)) bands.set(k, []);
    bands.get(k).push(it);
  }
  for (const [, list] of [...bands.entries()].sort((a, b) => a[0] - b[0])) {
    if (guides.length >= 16) break;
    const byX = new Map();
    for (const it of list) {
      const x = Math.round(it.tb.x);
      if (!byX.has(x)) byX.set(x, []);
      byX.get(x).push(it);
    }
    let best = null;
    for (const [x, l] of byX)
      if (l.length >= 3 && (!best || l.length > best[1].length)) best = [x, l];
    if (best) {
      const top = Math.min(...best[1].map((m) => m.tb.y));
      const members = best[1]
        .filter((m) => m.tb.y < top + 450)
        .sort((a, b) => b.fs - a.fs)
        .slice(0, 2);
      const g = {
        axis: 'x',
        pos: best[0],
        cur: best[0],
        op: 1,
        flash: 0,
        dragging: false,
        vis: false,
      };
      guides.push(g);
      const gy = Math.min(...members.map((m) => m.tb.y)) - 30;
      g.task = mk(gy, { type: 'guide', g }, [], 'world');
      g.deps = [];
      for (const m of members) {
        m.task.spec.snap = g;
        m.task.spec.snapDx = m.tb.x - best[0];
        g.deps.push(m.task);
      }
    }
    const byY = new Map();
    for (const it of list) {
      const y = Math.round(it.tb.y);
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push(it);
    }
    let row = null;
    for (const [y, l] of byY) if (l.length >= 3 && (!row || l.length > row[1].length)) row = [y, l];
    if (row) {
      const m = row[1].find((it) => !it.task.spec.snap);
      if (m) {
        const g = {
          axis: 'y',
          pos: row[0],
          cur: row[0],
          op: 1,
          flash: 0,
          dragging: false,
          vis: false,
        };
        guides.push(g);
        g.task = mk(row[0] - 30, { type: 'guide', g }, [], 'world');
        g.deps = [m.task];
        m.task.spec.snap = g;
      }
    }
  }
  for (const it of items)
    if (it.kind === 'text' && it.task && it.fs >= 28 && it.tb.h < 400) it.task.spec.grow = true;
  // deps always have lower ids, so one reverse pass propagates the earliest need
  for (const t of tasks) t.gate = t.y;
  for (let i = tasks.length - 1; i >= 0; i--)
    for (const d of tasks[i].deps) if (tasks[i].gate < d.gate) d.gate = tasks[i].gate;

  // A sticky header that is transparent at the top of the page still needs
  // something behind it once content scrolls underneath (sites add it on scroll).
  const backdrops = [];
  if (pageBg.image === 'none')
    for (const b of bars) {
      const area = b.r.width * b.r.height;
      const covered = items.some(
        (it) =>
          it.id >= b.start &&
          it.layer === 'over' &&
          it.kind === 'rect' &&
          it.w * it.h >= area * 0.85 &&
          /rgba?\(/.test(it.css) &&
          !/background-color:\s*rgba\([^)]*,\s*0(\.\d+)?\)/.test(it.css),
      );
      if (!covered)
        backdrops.push({
          x: b.r.left,
          y: b.r.top,
          w: b.r.width,
          h: b.r.height,
          key: b.key,
          color: pageBg.color,
        });
    }

  return { items, tasks, groups, guides, docW, docH, backdrops, portKey };
}
