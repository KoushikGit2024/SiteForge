// @ts-nocheck
import { sound } from '../core/audio';
import { sleep, nextFrame, MIN_AGENTS } from '../core/constants';
import { detectEnv } from '../core/env';
import { captureModel, captureDebugSnapshot } from '../core/capture';
import { View } from '../ui/View';
import { Engine } from '../engine/Engine';
import { extractTailwind, exportCleanHTML } from '../exporters/tailwindExporter';

let lastShot: any = null;
let lastShotCleanup: ReturnType<typeof setTimeout> | null = null;

function stop(reveal?: boolean) {
  sound.stop();
  if (window.__siteForge) {
    window.__siteForge.stop(reveal);
  }
}
export class App {
  constructor() {
    this.dead = false;
    this.t0 = performance.now();
    this.complete = false;
    this.dismissTimer = null;
    this.exitTimers = [];
    this.soundGestureUnlocked = false;
    this.timing = {};
    this.exportMode = false;
    this.inspected = null;
    this.flashUntil = 0;
  }

  async loadShot() {
    let src = window.__siteForgeShot;
    window.__siteForgeShot = null;
    if (src) {
      const cached = { src, at: this.env.geom(), href: location.href, ts: Date.now() };
      lastShot = cached;
      if (lastShotCleanup !== null) clearTimeout(lastShotCleanup);
      lastShotCleanup = setTimeout(() => {
        if (lastShot === cached) lastShot = null;
        lastShotCleanup = null;
      }, 60000);
    } else if (lastShot && lastShot.href === location.href && Date.now() - lastShot.ts < 60000)
      src = lastShot.src;
    else {
      lastShot = null;
      if (lastShotCleanup !== null) clearTimeout(lastShotCleanup);
      lastShotCleanup = null;
    }
    if (!src) return null;
    const img = new Image();
    img.src = src;
    try {
      await img.decode();
    } catch (_) {
      return null;
    }
    const g = lastShot && lastShot.src === src ? lastShot.at : this.env.geom();
    return { img, sx: g.sx, sy: g.sy, scale: img.naturalWidth / innerWidth, valid: false };
  }

  async run() {
    try {
      sound.begin();
      this.env = detectEnv();
      const shotP = this.loadShot();
      this.view = new View(this.env);
      this.engine = new Engine(this.view);
      this.engine.onStart = () => this.view.intro.classList.add('gone');
      this.engine.onComplete = () => this.onComplete();
      this.bind();
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
      await nextFrame();
      this.view.bg.classList.add('on');
      this.view.intro.classList.add('on');
      if (this.view && this.view.hud) this.view.hud.classList.add('on');
      const mark = (k) => (this.timing[k] = Math.round(performance.now() - this.t0));
      await sleep(520);
      await unhidePage();
      mark('blank');
      if (this.dead) return;
      await this.scan();
      mark('scan');
      if (this.dead) return;
      await Promise.race([document.fonts.ready, sleep(1200)]);
      if (this.dead) return;
      mark('fonts');
      this.view.measure();
      const shot = await shotP;
      if (this.dead) return;
      if (shot) {
        const g = this.env.geom();
        shot.valid = Math.abs(g.sx - shot.sx) < 1 && Math.abs(g.sy - shot.sy) < 1;
      }
      let model;
      try {
        model = captureModel(this.env, shot);
      } catch (err) {
        console.error('[SiteForge] capture failed', err);
        sound.stop();
        await unhidePage();
        this.statusText('CAPTURE FAILED - Open the console for details.');
        this.view.barFill.style.width = '0%';
        this.view.intro.classList.remove('on');
        this.dismissTimer = setTimeout(() => stop(false), 2500);
        return;
      }
      mark('capture');
      if (this.dead) return;
      this.view.mount(model);
      this.engine.setModel(model);
      this.model = model;
      mark('mount');
      const wait = 1500 - (performance.now() - this.t0);
      if (wait > 0) await sleep(wait);
      if (this.dead) return;
      this.engine.start();
    } catch (err) {
      console.error('[SiteForge] run failed', err);
      sound.stop();
      await unhidePage();
      if (this.view?.status) {
        this.statusText('STARTUP FAILED - Open the console for details.');
        this.view.intro.classList.remove('on');
        this.dismissTimer = setTimeout(() => stop(false), 2500);
        return;
      }
      stop(false);
    }
  }

  async scan() {
    const env = this.env;
    const g = env.geom();
    const H = env.scrollHeight();
    if (H <= g.vh * 1.25) return;
    this.view.frozen = { ...this.view.vp };
    const steps = Math.min(28, Math.ceil(H / (g.vh * 0.85)));
    for (let i = 1; i <= steps && !this.dead; i++) {
      env.scrollTo(Math.min(H, (H / steps) * i));
      await nextFrame();
      await sleep(30);
    }
    env.scrollTo(g.sy, g.sx);
    await nextFrame();
    await sleep(750);
    env.scrollTo(g.sy, g.sx);
    this.view.frozen = null;
  }

  bind() {
    const on = (t, ev, fn, o) => {
      t.addEventListener(ev, fn, o);
      (this.unbinds || (this.unbinds = [])).push(() => t.removeEventListener(ev, fn, o));
    };
    const scrollTarget = this.env.isRoot ? window : this.env.scroller;
    on(window, 'pointerdown', () => this.unlockSound(), { once: true, passive: true });
    on(
      scrollTarget,
      'scroll',
      () => {
        if (!this.view.frozen) this.view.syncWorld();
      },
      { passive: true },
    );
    on(window, 'resize', () => this.view.measure());
    on(
      window,
      'wheel',
      () => {
        if (this.engine.ready) {
          this.unlockSound();
          this.engine.start();
        }
      },
      { passive: true },
    );
    on(
      window,
      'pointermove',
      (e) => {
        this.engine.mouse = { x: e.clientX, y: e.clientY };
        if (!this.exportMode) return;
        const path = e.composedPath();
        if (path.includes(this.view.inspectorBadge)) return;
        if (path.includes(this.view.hud)) {
          this.inspected = null;
          this.view.showInspector(null);
          return;
        }
        this.inspected = this.model ? this.view.inspectAt(e.clientX, e.clientY) : null;
        this.view.showInspector(this.inspected, e.clientX, e.clientY);
      },
      { passive: true },
    );
    on(document.documentElement, 'pointerleave', () => {
      this.engine.mouse = null;
      if (this.exportMode) {
        this.inspected = null;
        this.view.showInspector(null);
      }
    });
    on(this.view.inspectorBadge, 'click', (e) => {
      e.stopPropagation();
      this.copyInspected();
    });
    on(
      window,
      'keydown',
      (e) => {
        if (this.exportMode && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
          e.preventDefault();
          e.stopPropagation();
          this.moveInspector(e.key === 'ArrowRight' ? 1 : -1);
          return;
        }
        if (e.key === 'Escape') {
          e.stopPropagation();
          stop(false);
        }
      },
      true,
    );
    if (!this.env.isRoot) {
      on(
        this.view.host,
        'wheel',
        (e) => {
          e.preventDefault();
          this.env.scroller.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: 'instant' });
        },
        { passive: false },
      );
    }
    on(this.view.hud, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'export') {
        this.exportMode = !this.exportMode;
        b.classList.toggle('on', this.exportMode);
        b.setAttribute('aria-pressed', String(this.exportMode));
        if (this.exportMode) {
          clearTimeout(this.dismissTimer);
          this.dismissTimer = null;
        } else if (this.complete && !this.dismissTimer) {
          this.dismissTimer = setTimeout(() => stop(true), 1500);
        }
        this.inspected = null;
        this.view.showInspector(null);
        return;
      }
      if (a === 'sound') {
        if (sound.isEnabled() && sound.needsUnlock()) {
          this.soundGestureUnlocked = true;
          sound.unlock();
        } else {
          const on = sound.toggle();
          if (on) {
            this.soundGestureUnlocked = true;
            sound.unlock();
          }
        }
        b.textContent = sound.label();
        b.classList.toggle('on', sound.label() === 'SND: ON');
        b.setAttribute('aria-pressed', String(sound.isEnabled()));
      }
    });
  }

  unlockSound() {
    if (this.soundGestureUnlocked || !sound.isEnabled()) return;
    this.soundGestureUnlocked = true;
    sound.unlock();
  }

  statusText(text) {
    this.view.status.textContent = text;
    this.view.accessibleStatus.textContent = text;
    this.flashUntil = performance.now() + 2500;
  }

  moveInspector(direction) {
    const candidates = this.view.modelItems.filter(
      (item) =>
        item.layer === 'world' && item.kind !== 'line' && item.source instanceof HTMLElement,
    );
    if (!candidates.length) {
      this.statusText('No exportable layers were captured.');
      return;
    }
    const current = candidates.indexOf(this.inspected);
    const next =
      current < 0
        ? direction > 0
          ? 0
          : candidates.length - 1
        : (current + direction + candidates.length) % candidates.length;
    this.inspected = candidates[next];
    this.inspected.source.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: 'instant',
    });
    const bounds = this.inspected.source.getBoundingClientRect();
    this.view.showInspector(
      this.inspected,
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    this.view.inspectorBadge.focus();
  }

  async copyInspected() {
    const el = this.inspected && this.inspected.source;
    if (!(el instanceof HTMLElement)) return;
    try {
      const classes = extractTailwind(el);
      const output = `${classes}\n\n${exportCleanHTML(el, classes)}`;
      await navigator.clipboard.writeText(output);
      this.statusText('Copied Tailwind classes + HTML.');
    } catch (err) {
      console.error('[SiteForge] export failed', err);
      this.statusText('Copy failed: clipboard unavailable on this page.');
    }
  }

  exportCaptureDebug() {
    if (!this.model) {
      this.statusText('Capture is not ready yet.');
      return;
    }
    const payload = JSON.stringify(captureDebugSnapshot(this.model, this.env), null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `siteforge-capture-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.statusText('Capture diagnostics JSON downloaded.');
  }

  frame(now) {
    if (this.dead) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    try {
      this.engine.step(dt);
      this.view.render(this.engine);
      if (!this._hudT || now - this._hudT > 200) {
        this._hudT = now;
        this.updateHud();
      }
    } catch (err) {
      console.error('[SiteForge]', err);
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  updateHud() {
    const E = this.engine;
    const v = this.view;
    const soundButton = v.hud.querySelector('[data-a="sound"]');
    if (soundButton) {
      soundButton.textContent = sound.label();
      soundButton.classList.toggle('on', sound.label() === 'SND: ON');
      soundButton.setAttribute('aria-pressed', String(sound.isEnabled()));
    }
    if (!E.ready) return;
    const workers = E.cursors.filter((c) => c.worked).length + E.retired;
    const total = E.tasks.length;
    const done = E.doneCount;
    if (this.complete) return;
    if (performance.now() >= this.flashUntil) {
      if (!E.started)
        v.status.innerHTML = `<b>${E.cursors.length}</b> agents ready<span class="sep"></span>${total.toLocaleString()} layers`;
      else {
        const pend = E.tasks.length - done;
        const below = E.tasks.some(
          (t) => t.state === 'wait' && t.layer === 'world' && t.gate > E.frontier,
        );
        v.status.innerHTML =
          `<b>${workers}</b> agents<span class="sep"></span><b>${done.toLocaleString()}</b> / ${total.toLocaleString()} layers` +
          (below && pend && E.backlog() === 0
            ? `<span class="sep"></span>scroll to keep building`
            : '');
      }
    }
    v.barFill.style.width = total ? `${(done / total) * 100}%` : '0%';
    const busy = E.cursors.filter((c) => c.task).slice(-5);
    const key = busy.map((c) => c.id).join(',');
    if (key !== this._dots) {
      this._dots = key;
      v.dots.innerHTML = busy
        .map((c) => `<i style="background:${c.color}" title="${c.name}">${c.name[0]}</i>`)
        .join('');
    }
  }

  onComplete() {
    this.complete = true;
    const E = this.engine;
    const v = this.view;
    const workers = E.cursors.filter((c) => c.worked).length + E.retired;
    const secs = (E.endTime - E.startTime).toFixed(1);
    v.status.innerHTML = `Rebuilt by <b>${workers}</b> agents in <b>${secs}s</b>`;
    v.accessibleStatus.textContent = `Rebuilt by ${workers} agents in ${secs} seconds.`;
    v.barFill.style.width = '100%';
    v.dots.innerHTML = '';
    if (!this.dismissTimer && !this.exportMode) {
      this.dismissTimer = setTimeout(() => stop(true), 1500);
    }
  }

  destroy(reveal) {
    if (this.dead) return;
    for (const timer of this.exitTimers) clearTimeout(timer);
    this.exitTimers = [];
    sound.stop();
    unhidePage();
    if (!this.view || !this.engine) {
      this.dead = true;
      cancelAnimationFrame(this.raf);
      if (this.dismissTimer) clearTimeout(this.dismissTimer);
      for (const u of this.unbinds || []) u();
      this.view?.host?.remove();
      return;
    }
    const finish = () => {
      this.dead = true;
      for (const timer of this.exitTimers) clearTimeout(timer);
      this.exitTimers = [];
      cancelAnimationFrame(this.raf);
      if (this.dismissTimer) clearTimeout(this.dismissTimer);
      for (const u of this.unbinds || []) u();
      if (this.view && this.view.host) this.view.host.remove();
    };
    if (reveal) {
      this.engine.releasing = true;
      this.engine.flocking = true;
      for (const c of this.engine.cursors) {
        c.gen = null;
        c.follow = false;
      }
      if (this.view && this.view.hud) this.view.hud.classList.remove('on');
      this.exitTimers.push(
        setTimeout(() => {
          this.view.host.style.setProperty('opacity', '0', 'important');
        }, 450),
      );
      this.exitTimers.push(setTimeout(finish, 1150));
    } else {
      this.view.host.style.setProperty('transition', 'opacity .25s ease', 'important');
      this.view.host.style.setProperty('opacity', '0', 'important');
      this.dead = true;
      cancelAnimationFrame(this.raf);
      for (const u of this.unbinds || []) u();
      this.exitTimers.push(setTimeout(finish, 260));
    }
  }
}

// background.js may have hidden everything but media for its screenshot;
// put the page back once our canvas covers it (or if we bail out early).
async function unhidePage() {
  if (!window.__siteForgeHidden) return;
  window.__siteForgeHidden = false;
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage)
      await chrome.runtime.sendMessage({ type: 'siteforge:unhide' });
  } catch (_) {}
  await nextFrame();
}
