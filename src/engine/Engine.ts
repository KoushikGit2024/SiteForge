// @ts-nocheck
import {
  ROLES,
  TECHNICAL_PALETTE,
  MIN_AGENTS,
  MAX_AGENTS,
  FLOCK_AGENTS,
  INTRO_AGENTS,
  rand,
  clamp,
  easeInOut,
  easeOut,
  bump,
} from '../core/constants';
import { sound } from '../core/audio';
export class Engine {
  constructor(view) {
    this.view = view;
    this.vp = view.vp;
    this.items = null;
    this.tasks = [];
    this.groups = [];
    this.guides = [];
    this.editLines = new Set();
    this.cursors = [];
    this.started = false;
    this.ready = false;
    this.frontier = 0;
    this.vel = 0;
    this.tempo = 1;
    this.speed = 1;
    this.time = 0;
    this.rulers = { want: 0, t: 0, lastNeed: -10 };
    this.lastScroll = null;
    this.nextId = 0;
    this.spawnCooldown = 0;
    this.flocking = false;
    this.lastT = null;
    this.tv = { x: 0, y: 0 };
    this.mouse = null;
    this.retired = 0;
    this.doneCount = 0;
    this.waitCount = 0;
    const vp = this.vp;
    for (let n = 0; n < INTRO_AGENTS; n++) {
      const side = n % 2 === 0;
      const p = this.fromViewport(
        side ? vp.ox - 40 - rand(0, 200) : vp.ox + vp.vw + 40 + rand(0, 200),
        vp.oy + rand(0.05, 0.95) * vp.vh,
      );
      const c = this.makeCursor(p.x, p.y, n < MIN_AGENTS);
      c.follow = true;
      this.cursors.push(c);
    }
  }

  setModel(m) {
    this.items = m.items;
    this.tasks = m.tasks;
    this.groups = m.groups;
    this.guides = m.guides;
    this.guideDeps = new Map(m.guides.map((g) => [g, g.deps || []]));
    this.waitCount = m.tasks.length;
    this.ready = true;
  }

  makeCursor(x, y, home = false) {
    const id = this.nextId++;
    const fast = Math.random() < 0.25;
    return {
      id,
      x,
      y,
      home,
      name: ROLES[id % ROLES.length],
      color: TECHNICAL_PALETTE[id % TECHNICAL_PALETTE.length],
      shape: 'cross',
      press: 0,
      task: null,
      gen: null,
      ov: null,
      idleFor: 0,
      leaving: false,
      worked: false,
      sticky: false,
      vx: 0,
      vy: 0,
      angle: 0,
      speed: fast ? rand(1000, 1500) : rand(300, 750),
      soundDistance: 0,
      soundLastAt: -Infinity,
      force: fast ? rand(3500, 6000) : rand(700, 1800),
      spin: fast ? rand(2.2, 3.4) : rand(0.8, 1.8),
      curl: rand(-1, 1),
      orbit: rand(70, 170),
      follow: false,
      wanderX: rand(-120, 120),
      wanderY: rand(-90, 90),
      wanderAt: 0,
    };
  }

  get viewTop() {
    return this.vp.sy;
  }
  get viewBot() {
    return this.vp.sy + this.vp.vh;
  }
  fromViewport(x, y) {
    const vp = this.vp;
    return { x: x - vp.ox + vp.sx, y: y - vp.oy + vp.sy };
  }
  taskY(t) {
    return t.layer === 'world' ? t.y : this.viewTop + t.y;
  }

  start() {
    if (this.started || !this.ready) return;
    this.started = true;
    this.startTime = this.time;
    sound.startCue();
    for (const c of this.cursors) {
      c.follow = false;
      c.gen = null;
      c.angle = ((((c.angle + 180) % 360) + 360) % 360) - 180;
    }
    if (this.onStart) this.onStart();
  }

  bounds(it) {
    if (it.kind === 'text') {
      let h = it.tb.h;
      if (it.editing && !it.selAll && it.total) {
        const lines = Math.max(1, Math.round(it.tb.h / it.lh));
        h = Math.min(it.tb.h, Math.max(it.lh, Math.ceil((it.shown / it.total) * lines) * it.lh));
      }
      const s = it.scale;
      const ax =
        it.align === 'center'
          ? (it.tb.w * (1 - s)) / 2
          : it.align === 'right' || it.align === 'end'
            ? it.tb.w * (1 - s)
            : 0;
      return { x: it.tb.x + it.dx + ax, y: it.tb.y + it.dy, w: it.tb.w * s, h: h * s };
    }
    if (it.kind === 'line') {
      return { x: it.x + it.dx, y: it.y + it.dy, w: it.w, h: it.h };
    }
    return {
      x: it.x + it.dx,
      y: it.y + it.dy,
      w: it.draw ? it.draw.w : it.w,
      h: it.draw ? it.draw.h : it.h,
    };
  }

  unionBounds(list) {
    const bs = list
      .map((it) => this.bounds(it))
      .filter(
        (b) =>
          b &&
          Number.isFinite(b.x) &&
          Number.isFinite(b.y) &&
          Number.isFinite(b.w) &&
          Number.isFinite(b.h),
      );
    if (!bs.length) return null;
    const x = Math.min(...bs.map((b) => b.x));
    const y = Math.min(...bs.map((b) => b.y));
    return {
      x,
      y,
      w: Math.max(...bs.map((b) => b.x + b.w)) - x,
      h: Math.max(...bs.map((b) => b.y + b.h)) - y,
    };
  }

  underline(it, b) {
    return {
      x: b.x,
      y: b.y + (it.lh * 0.5 + it.fs * 0.42) * it.scale,
      w: Math.min(b.w, it.tb.w * it.scale),
      h: 0,
    };
  }

  selection(it, extra) {
    const b = this.bounds(it);
    return Object.assign(
      {
        t: 'box',
        b,
        handles: true,
        badge: `${Math.round(b.w)} × ${Math.round(b.h)}`,
        rulerLines: true,
        underline: it.kind === 'text' ? this.underline(it, b) : undefined,
      },
      extra,
    );
  }

  available() {
    const out = [];
    for (const t of this.tasks) {
      if (t.state !== 'wait') continue;
      if (t.layer === 'world' && t.gate > this.frontier) continue;
      let ok = true;
      for (const d of t.deps)
        if (d.state !== 'done') {
          ok = false;
          break;
        }
      if (ok) out.push(t);
    }
    return out;
  }

  pick(c, list) {
    let best = null;
    let bestS = Infinity;
    const top = this.viewTop - 40;
    const bot = this.viewBot;
    const cy = c.sticky ? c.y + this.viewTop : c.y;
    for (const t of list) {
      const y = this.taskY(t);
      const u = y >= top && y <= bot ? 0 : y < top ? 1 : 2;
      const s =
        u * 1e6 +
        (u === 1 ? top - y : y) * 0.6 +
        Math.abs(y - cy) * 0.4 -
        (t.spec.type === 'guide' ? 5e5 : 0);
      if (s < bestS) {
        bestS = s;
        best = t;
      }
    }
    return best;
  }

  // work that's unlocked but unfinished (things past the frontier need scrolling, not waiting)
  backlog() {
    let n = 0;
    for (const t of this.tasks)
      if (t.state !== 'done' && (t.layer !== 'world' || t.gate <= this.frontier)) n++;
    return n;
  }

  step(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const vp = (this.vp = this.view.vp);
    const sv =
      Math.abs(vp.sy - (this.lastScroll == null ? vp.sy : this.lastScroll)) / Math.max(dt, 0.001);
    this.lastScroll = vp.sy;
    this.vel = Math.max(this.vel * Math.exp(-dt * 1.2), this.vel * 0.7 + sv * 0.3);
    if (this.started) this.frontier = Math.max(this.frontier, this.viewBot);
    const avail = this.started ? this.available() : [];
    this.tempo =
      clamp(
        2.1 + this.vel / 900 + (avail.length / Math.max(1, this.cursors.length)) * 0.5,
        2.1,
        4.5,
      ) * this.speed;

    if (this.rulers.want > 0) this.rulers.lastNeed = this.time;
    const rt = this.time - this.rulers.lastNeed < 0.7 ? 1 : 0;
    this.rulers.t += (rt - this.rulers.t) * Math.min(1, dt * 10);
    if (Math.abs(rt - this.rulers.t) < 0.002) this.rulers.t = rt;

    for (const g of this.guides) {
      if (!g.vis) continue;
      if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 1.5);
      const deps = this.guideDeps.get(g) || [];
      if (g.shownAt == null) g.shownAt = this.time;
      if (
        !g.dragging &&
        g.op > 0 &&
        this.time - g.shownAt > 7 &&
        !deps.some((t) => t.state === 'active')
      )
        g.op = Math.max(0, g.op - dt * 1.2);
      else if (!g.dragging && deps.every((t) => t.state === 'done')) {
        const last = Math.max(0, ...deps.map((t) => t.doneAt));
        if (this.time - last > 1.2 && g.op > 0) g.op = Math.max(0, g.op - dt * 1.2);
      }
    }

    if (!this.flocking && this.started && this.waitCount === 0) {
      for (const c of this.cursors)
        if (!c.task && !c.follow) {
          c.follow = true;
          c.gen = null;
          c.leaving = false;
          c.ov = null;
          c.shape = 'cross';
        }
      if (this.cursors.every((c) => c.follow)) {
        this.flocking = true;
        this.endTime = this.time;
        sound.complete();
        if (this.onComplete) this.onComplete();
      }
    }
    if (this.flocking) {
      this.flock(dt);
      return;
    }
    if (!this.started) {
      const center = this.fromViewport(vp.ox + vp.vw / 2, vp.oy + vp.vh / 2);
      if (this.follow(dt, this.cursors, center, 0.7) && this.ready) this.start();
      return;
    }
    if (this.cursors.some((c) => c.follow))
      this.follow(
        dt,
        this.cursors.filter((c) => c.follow),
      );

    this.spawnCooldown -= dt;
    const want = clamp(
      MIN_AGENTS + Math.floor(this.vel / 40) + Math.floor(avail.length / 2),
      MIN_AGENTS,
      MAX_AGENTS,
    );
    const active = this.cursors.filter((c) => !c.leaving).length;
    const busy = this.cursors.filter((c) => c.task).length;
    if (active < want && avail.length > active - busy && this.spawnCooldown <= 0) {
      const left = Math.random() < 0.5;
      const p = this.fromViewport(
        left ? vp.ox - 40 : vp.ox + vp.vw + 40,
        vp.oy + rand(0.2, 0.8) * vp.vh,
      );
      this.cursors.push(this.makeCursor(p.x, p.y));
      this.spawnCooldown = 0.035;
    }

    for (const c of this.cursors) {
      if (c.task || c.leaving || c.follow) continue;
      const t = this.pick(c, avail);
      if (!t) continue;
      avail.splice(avail.indexOf(t), 1);
      t.state = 'active';
      this.waitCount--;
      c.task = t;
      c.worked = true;
      c.idleFor = 0;
      if (t.layer !== 'world') {
        c.sticky = true;
        c.x += vp.ox - vp.sx;
        c.y += vp.oy - vp.sy;
      }
      c.gen = this.run(c, t);
    }

    for (const c of [...this.cursors]) {
      if (c.follow) continue;
      const previousX = c.x;
      const previousY = c.y;
      const task = c.task;
      const taskType = task && task.spec ? task.spec.type : undefined;
      c.press = Math.max(0, c.press - dt * 6);
      if (c.angle !== 0)
        c.angle = Math.abs(c.angle) < 0.5 ? 0 : c.angle * (1 - Math.min(1, dt * 10));
      if (!c.task) {
        c.idleFor += dt;
        if (
          !c.leaving &&
          c.idleFor > 2.5 &&
          this.cursors.filter((m) => !m.leaving).length > MIN_AGENTS &&
          !c.home
        ) {
          c.leaving = true;
          c.gen = this.leave(c);
        }
        if (!c.gen) c.gen = this.idle(c);
      }
      const result = c.gen.next(dt);
      const moved = Math.hypot(c.x - previousX, c.y - previousY);
      if (moved > 0.5 && taskType) {
        c.soundDistance += moved;
        if (c.soundDistance >= 72 && this.time - c.soundLastAt >= 0.16) {
          sound.movement({
            distance: c.soundDistance,
            velocity: moved / Math.max(dt, 0.001),
            kind: taskType,
          });
          c.soundDistance = 0;
          c.soundLastAt = this.time;
        }
      }
      if (result.done) {
        if (c.task) {
          c.task.state = 'done';
          c.task.doneAt = this.time;
          this.doneCount++;
          c.task = null;
          c.ov = null;
          if (c.sticky) {
            c.sticky = false;
            c.x -= vp.ox - vp.sx;
            c.y -= vp.oy - vp.sy;
          }
          c.shape = 'cross';
        }
        c.gen = null;
        if (c.leaving) {
          if (c.worked) this.retired++;
          this.cursors.splice(this.cursors.indexOf(c), 1);
        }
      }
    }
  }

  flockTarget() {
    if (this.mouse) return this.fromViewport(this.mouse.x, this.mouse.y);
    const t = this.time;
    const vp = this.vp;
    return this.fromViewport(
      vp.ox + vp.vw * (0.5 + 0.28 * Math.sin(t * 0.37)),
      vp.oy + vp.vh * (0.5 + 0.25 * Math.sin(t * 0.53 + 1)),
    );
  }

  flock(dt) {
    this.spawnCooldown -= dt;
    if (this.cursors.length < FLOCK_AGENTS && this.spawnCooldown <= 0 && !this.releasing) {
      const vp = this.vp;
      const left = Math.random() < 0.5;
      const p = this.fromViewport(
        left ? vp.ox - 30 : vp.ox + vp.vw + 30,
        vp.oy + rand(0.1, 0.9) * vp.vh,
      );
      const c = this.makeCursor(p.x, p.y);
      c.follow = true;
      this.cursors.push(c);
      this.spawnCooldown = 0.04;
    }
    if (this.releasing) {
      for (const c of [...this.cursors]) {
        if (!c.gen) c.gen = this.leave(c);
        if (c.gen.next(dt).done) this.cursors.splice(this.cursors.indexOf(c), 1);
      }
      return;
    }
    this.surveyWeave(dt, this.cursors);
  }

  // Stateful waypoints create an irregular survey drift instead of a repeating orbit.
  surveyWeave(dt, list) {
    const target = this.flockTarget();
    const time = this.time;
    const width = Math.min(this.vp.vw * 0.42, 320);
    const height = Math.min(this.vp.vh * 0.3, 210);
    const mouse = this.mouse ? this.fromViewport(this.mouse.x, this.mouse.y) : null;

    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (time >= c.wanderAt) {
        c.wanderX = rand(-width, width);
        c.wanderY = rand(-height, height);
        c.wanderAt = time + rand(0.65, 1.8);
      }
      const desired = {
        x: target.x + c.wanderX,
        y: target.y + c.wanderY,
      };
      let fx = (desired.x - c.x) * (3.2 + c.spin * 0.35);
      let fy = (desired.y - c.y) * (3.2 + c.spin * 0.35);
      const drift = Math.sin(time * (0.7 + c.spin * 0.13) + c.id * 2.7) * 90;
      fx += Math.cos(c.id * 1.9 + time * 0.31) * drift;
      fy += Math.sin(c.id * 2.3 + time * 0.27) * drift;

      for (let j = 0; j < list.length; j++) {
        if (j === i) continue;
        const q = list[j];
        const dx = c.x - q.x;
        const dy = c.y - q.y;
        const d = Math.hypot(dx, dy);
        if (d > 76 || d < 0.01) continue;
        const push = (1 - d / 76) * 520;
        fx += (dx / d) * push;
        fy += (dy / d) * push;
      }

      if (mouse) {
        const dx = c.x - mouse.x;
        const dy = c.y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < 110 && d > 0.01) {
          const push = (1 - d / 110) * 900;
          fx += (dx / d) * push;
          fy += (dy / d) * push;
        }
      }

      const maxV = c.speed * 1.15;
      const desiredSpeed = Math.hypot(fx, fy);
      if (desiredSpeed > maxV) {
        fx *= maxV / desiredSpeed;
        fy *= maxV / desiredSpeed;
      }
      c.vx += (fx - c.vx) * Math.min(1, dt * 4.5);
      c.vy += (fy - c.vy) * Math.min(1, dt * 4.5);
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.angle = (Math.atan2(c.vy, c.vx) * 180) / Math.PI;
    }
  }

  // Boids-ish orbit used for the initial gathering phase.
  follow(dt, list, target, scale = 1) {
    const m = this.mouse ? this.fromViewport(this.mouse.x, this.mouse.y) : null;
    const o = target || this.flockTarget();
    const time = this.time;
    if (m && this.lastT && dt > 0) {
      const k = Math.min(1, dt * 18);
      this.tv.x += ((m.x - this.lastT.x) / dt - this.tv.x) * k;
      this.tv.y += ((m.y - this.lastT.y) / dt - this.tv.y) * k;
    }
    this.lastT = m;
    const R = 135 * scale * (1 + 0.18 * Math.sin(time * 0.55));
    const swirl = Math.tanh(Math.cos(time * 0.11) * 3);
    const want = [];
    for (const c of list) {
      const vx = c.x - o.x;
      const vy = c.y - o.y;
      const d = Math.hypot(vx, vy) || 0.01;
      const nx = vx / d;
      const ny = vy / d;
      const ang = Math.atan2(vy, vx);
      const off = (c.orbit - 120) * 0.55 * scale;
      const rr = R * (1 + 0.3 * Math.sin(3 * ang + time * 0.7)) + off;
      const tang = 300 * (0.7 + c.spin * 0.2) * swirl;
      const rad = clamp((rr - d) * 4, -2600, 1400);
      const far = Math.min(1, Math.max(0, (d - rr) / 600));
      want.push([
        -ny * tang + nx * rad - ny * c.curl * 400 * far,
        nx * tang + ny * rad + nx * c.curl * 400 * far,
      ]);
    }
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      let ax = 0;
      let ay = 0;
      let wsum = 0;
      for (let j = 0; j < list.length; j++) {
        if (j === i) continue;
        const q = list[j];
        const d = Math.hypot(q.x - c.x, q.y - c.y);
        if (d > 90) continue;
        const w = 1 - d / 90;
        ax += q.vx * w;
        ay += q.vy * w;
        wsum += w;
      }
      let [fx, fy] = want[i];
      if (wsum > 0) {
        fx = fx * 0.7 + (ax / wsum) * 0.3;
        fy = fy * 0.7 + (ay / wsum) * 0.3;
      }
      const dist = Math.max(0, Math.hypot(c.x - o.x, c.y - o.y) - 180 * scale);
      const maxV = c.speed * (1.3 + Math.min(3.2, dist / 90));
      const L = Math.hypot(fx, fy);
      if (L > maxV) {
        fx *= maxV / L;
        fy *= maxV / L;
      }
      let gx = (fx - c.vx) * 6;
      let gy = (fy - c.vy) * 6;
      const maxF = c.force * (1.4 + Math.min(5, dist / 50));
      const G = Math.hypot(gx, gy);
      if (G > maxF) {
        gx *= maxF / G;
        gy *= maxF / G;
      }
      c.vx += gx * dt;
      c.vy += gy * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }
    const R0 = 48;
    let touched = false;
    if (m)
      for (const c of list) {
        const vx = c.x - m.x;
        const vy = c.y - m.y;
        const d = Math.hypot(vx, vy) || 0.01;
        if (d >= R0) continue;
        touched = true;
        const nx = vx / d;
        const ny = vy / d;
        c.x = m.x + nx * R0;
        c.y = m.y + ny * R0;
        const rel = (c.vx - this.tv.x) * nx + (c.vy - this.tv.y) * ny;
        if (rel < 0) {
          c.vx -= nx * rel * 1.6;
          c.vy -= ny * rel * 1.6;
        }
        c.vx += nx * 260;
        c.vy += ny * 260;
      }
    for (const c of list) {
      if (Math.hypot(c.vx, c.vy) < 30) continue;
      const d =
        (((((Math.atan2(c.vy, c.vx) * 180) / Math.PI + 128 - c.angle + 540) % 360) + 360) % 360) -
        180;
      c.angle += d * Math.min(1, dt * 8);
      c.press = Math.max(0, c.press - dt * 6);
    }
    return touched;
  }

  // ------------------------------------------------------- primitives

  *wait(t) {
    let n = 0;
    while (n < t) n += (yield) * this.tempo;
  }

  *moveTo(c, target, o = {}) {
    const get = typeof target === 'function' ? target : () => target;
    const x0 = c.x;
    const y0 = c.y;
    const p0 = get();
    const dist = Math.hypot(p0.x - x0, p0.y - y0);
    if (dist < 0.5) {
      c.x = p0.x;
      c.y = p0.y;
      if (o.onStep) o.onStep();
      return;
    }
    const dur = clamp(0.12 + Math.sqrt(dist) * 0.021, 0.14, 0.9) / (o.speed || 1);
    const bend =
      (o.bend != null ? o.bend : (Math.random() < 0.5 ? -1 : 1) * rand(0.04, 0.14)) *
      Math.min(dist, 600);
    let t = 0;
    const dragKind = o.dragKind as Parameters<typeof sound.drag>[1] | undefined;
    if (o.drag && dragKind) sound.drag(c.id, dragKind, 'start');
    try {
      while (t < dur) {
        const dt = yield;
        t += dt * this.tempo;
        const k = Math.min(1, t / dur);
        const e = o.drag || k < 0.15 ? easeInOut(k) : easeOut(k);
        const p = get();
        const dx = p.x - x0;
        const dy = p.y - y0;
        const L = Math.hypot(dx, dy) || 1;
        const off = Math.sin(Math.PI * e) * bend;
        const previousX = c.x;
        const previousY = c.y;
        c.x = x0 + dx * e + (-dy / L) * off;
        c.y = y0 + dy * e + (dx / L) * off;
        if (o.drag && dragKind) {
          const velocity = Math.hypot(c.x - previousX, c.y - previousY) / Math.max(dt, 0.001);
          sound.drag(c.id, dragKind, 'move', velocity);
        }
        if (o.onStep) o.onStep();
      }
      const p = get();
      c.x = p.x;
      c.y = p.y;
      if (o.onStep) o.onStep();
    } finally {
      if (o.drag && dragKind) sound.drag(c.id, dragKind, 'end');
    }
  }

  *click(c) {
    c.press = 1;
    yield* this.wait(0.07);
  }

  *type(it) {
    const N = it.total;
    const k = clamp(70 / Math.max(1, N), 0.06, 1);
    let budget = 0;
    let i = it.shown;
    while (i < N) {
      budget += (yield) * this.tempo;
      while (i < N && budget > 0) {
        const ch = it.seq[i];
        let d = rand(0.012, 0.04);
        if (ch === ' ') d += rand(0, 0.03);
        if (ch === '\n') d += 0.1;
        if (Math.random() < 0.025) d += rand(0.08, 0.2);
        budget -= d * k;
        i++;
      }
      it.shown = i;
      bump(it);
    }
  }

  *idle(c) {
    for (;;) {
      const vp = this.vp;
      const top = this.viewTop;
      const bot = this.viewBot;
      const p = {
        x: rand(vp.sx + vp.vw * 0.17, vp.sx + vp.vw * 0.83),
        y: rand(top + (bot - top) * 0.2, top + (bot - top) * 0.8),
      };
      yield* this.moveTo(c, p, { speed: 0.35 });
      let w = rand(0.4, 1.4);
      while (w > 0) {
        w -= yield;
        if (c.y < this.viewTop || c.y > this.viewBot) break;
      }
    }
  }

  *leave(c) {
    const right = c.x > this.vp.sx + this.vp.vw / 2;
    yield* this.moveTo(
      c,
      () => {
        const vp = this.vp;
        return this.fromViewport(
          right ? vp.ox + vp.vw + 60 : vp.ox - 60,
          c.y - this.viewTop + vp.oy,
        );
      },
      { speed: 0.8 },
    );
  }

  run(c, t) {
    const s = t.spec;
    switch (s.type) {
      case 'rect':
        return this.drawBox(c, s.it, false);
      case 'image':
        return this.drawBox(c, s.it, true);
      case 'line':
        return this.drawLine(c, s.it);
      case 'text':
        return this.drawText(c, s.it, s.snap || null, !!s.grow);
      case 'guide':
        return this.dragGuide(c, s.g);
      case 'dup':
        return this.duplicate(c, s.g, s.k);
      case 'edit':
        return this.editText(c, s.it);
      case 'restyle':
      case 'swap':
        return this.restyle(c, s.it);
    }
    return this.wait(0.1);
  }

  // Where a drag should end so a huge box doesn't drag the cursor off-screen.
  dragEnd(c, it) {
    const vp = this.vp;
    const screen = c.sticky;
    const right = screen ? vp.ox + vp.vw : vp.sx + vp.vw;
    const bot = screen ? vp.oy + vp.vh : this.viewBot;
    const x =
      it.x + it.w > right - 16 ? Math.max(it.x + Math.min(it.w, 40), right - 30) : it.x + it.w;
    const y = it.y + it.h > bot - 16 ? Math.max(it.y + Math.min(it.h, 40), bot - 40) : it.y + it.h;
    return { x: Math.min(x, it.x + it.w), y: Math.min(y, it.y + it.h) };
  }

  *drawBox(c, it, isImg) {
    c.shape = 'cross';
    yield* this.moveTo(c, { x: it.x, y: it.y });
    c.press = 1;
    it.vis = true;
    sound.construct(isImg ? 'image' : 'rect', this.soundArea(it));
    if (it.big) it.styled = true;
    it.draw = { w: 0, h: 0 };
    bump(it);
    c.ov = () => [this.selection(it)];
    const end = this.dragEnd(c, it);
    yield* this.moveTo(c, end, {
      speed: 0.75,
      drag: true,
      dragKind: 'rect',
      bend: 0,
      onStep: () => {
        it.draw = { w: Math.max(0, c.x - it.x), h: Math.max(0, c.y - it.y) };
        bump(it);
      },
    });
    if (end.x < it.x + it.w - 0.5 || end.y < it.y + it.h - 0.5) {
      const w0 = it.draw.w;
      const h0 = it.draw.h;
      let k = 0;
      while (k < 1) {
        k = Math.min(1, k + ((yield) * this.tempo) / 0.5);
        const e = easeOut(k);
        it.draw = { w: w0 + (it.w - w0) * e, h: h0 + (it.h - h0) * e };
        bump(it);
      }
    }
    it.draw = null;
    bump(it);
    c.shape = 'cross';
    yield* this.wait(rand(0.18, 0.3));
    it.styled = true;
    sound.resolve(isImg ? 'image' : 'rect');
    bump(it);
    yield* this.wait(isImg ? 0.5 : 0.35);
    c.ov = null;
    it.done = true;
    bump(it);
  }

  *drawLine(c, it) {
    c.shape = 'pen-add';
    yield* this.moveTo(c, it.pts[0]);
    yield* this.click(c);
    it.vis = true;
    let soundedPoints = 0;
    sound.linePoint(0, it.pts.length, it.pts.length === 1 && it.shut);
    soundedPoints++;
    it.edit = true;
    it.placed = 1;
    it.owner = c;
    bump(it);
    this.editLines.add(it);
    c.shape = 'pen';
    for (let i = 1; i < it.pts.length; i++) {
      yield* this.moveTo(c, it.pts[i], {
        bend: rand(-0.03, 0.03),
        drag: true,
        dragKind: 'line',
      });
      yield* this.click(c);
      const middle = Math.ceil((it.pts.length - 1) / 2);
      if (soundedPoints < 3 && (i === middle || i === it.pts.length - 1)) {
        sound.linePoint(i, it.pts.length, i === it.pts.length - 1 && it.shut);
        soundedPoints++;
      }
      it.placed = i + 1;
      bump(it);
      yield* this.wait(rand(0.04, 0.12));
    }
    it.owner = null;
    bump(it);
    yield* this.moveTo(c, { x: c.x + rand(14, 30), y: c.y + rand(10, 24) }, { speed: 1.4 });
    yield* this.wait(0.3);
    it.edit = false;
    this.editLines.delete(it);
    sound.resolve('line');
    it.done = true;
    bump(it);
  }

  *drawText(c, it, guide, grow) {
    if (guide) {
      if (guide.axis === 'x') {
        it.dx = rand(28, 64);
        it.dy = rand(-8, 8);
      } else {
        it.dx = rand(-8, 8);
        it.dy = rand(18, 34) * (Math.random() < 0.5 ? -1 : 1);
      }
    }
    if (grow) it.scale = Math.min(1, 18 / it.fs);
    const b0 = this.bounds(it);
    c.shape = 'cross';
    yield* this.moveTo(c, { x: b0.x, y: b0.y });
    const lineH = Math.min(b0.h, it.lh * it.scale);
    if (b0.w < 140 && it.tb.h < it.lh * 1.6) {
      yield* this.click(c);
    } else {
      c.press = 1;
      const ghost = { x: b0.x, y: b0.y, w: 0, h: 0 };
      c.ov = () => [
        {
          t: 'box',
          b: ghost,
          handles: true,
          badge: `${Math.round(ghost.w)} × ${Math.round(ghost.h)}`,
          rulerLines: true,
        },
      ];
      yield* this.moveTo(
        c,
        { x: b0.x + b0.w, y: b0.y + lineH },
        {
          speed: 0.9,
          drag: true,
          dragKind: 'text',
          bend: 0,
          onStep: () => {
            ghost.w = Math.max(0, c.x - b0.x);
            ghost.h = Math.max(0, c.y - b0.y);
          },
        },
      );
    }
    it.vis = true;
    it.editing = true;
    it.shown = 0;
    bump(it);
    c.shape = 'ibeam';
    c.ov = () => [{ t: 'box', b: this.bounds(it) }];
    yield* this.moveTo(c, { x: c.x + rand(-30, 10), y: c.y + rand(10, 30) }, { speed: 1.5 });
    yield* this.type(it);
    yield* this.wait(0.12);
    it.editing = false;
    bump(it);
    c.shape = 'cross';
    c.ov = () => [this.selection(it)];
    if (grow) {
      const steps = [24, 32, 40, 48, 56, 64, 72, 88, 104].filter((s) => s < it.fs && s > 18);
      for (const s of [...steps, it.fs]) {
        yield* this.wait(0.06);
        it.scale = s / it.fs;
        bump(it);
      }
      it.scale = 1;
      bump(it);
      yield* this.wait(0.15);
    }
    if (guide) {
      // give the guide a moment to land; never block a cursor on it
      let waited = 0;
      while (guide.task.state !== 'done' && waited < 1.6) waited += (yield) * this.tempo;
      if (guide.task.state !== 'done') guide = null;
    }
    if (guide) {
      const u = this.bounds(it);
      const a = {
        x: u.x + Math.min(u.w * 0.4, 60) + rand(-6, 6),
        y: u.y + Math.min(u.h * 0.5, 22),
      };
      yield* this.moveTo(c, a);
      c.press = 1;
      const p = { x: a.x - it.dx, y: a.y - it.dy };
      const m = {
        x: p.x + (guide.axis === 'x' ? -rand(2, 5) : rand(-6, 6)),
        y: p.y + (guide.axis === 'y' ? -rand(2, 5) : rand(-3, 3)),
      };
      const drag = () => {
        let h = c.x - p.x;
        let v = c.y - p.y;
        if (guide.axis === 'x' && Math.abs(h) < 9) {
          if (h !== 0 && it.dx !== 0) guide.flash = 1;
          h = 0;
        }
        if (guide.axis === 'y' && Math.abs(v) < 9) {
          if (v !== 0 && it.dy !== 0) guide.flash = 1;
          v = 0;
        }
        it.dx = h;
        it.dy = v;
        bump(it);
      };
      yield* this.moveTo(c, m, {
        speed: 0.6,
        drag: true,
        dragKind: 'text',
        onStep: drag,
      });
      yield* this.wait(0.1);
      yield* this.moveTo(c, p, { speed: 2, onStep: drag });
      it.dx = 0;
      it.dy = 0;
      bump(it);
      yield* this.wait(0.25);
    } else if (it.dx || it.dy) {
      const dx0 = it.dx;
      const dy0 = it.dy;
      let k = 0;
      while (k < 1) {
        k = Math.min(1, k + ((yield) * this.tempo) / 0.3);
        const e = easeInOut(k);
        it.dx = dx0 * (1 - e);
        it.dy = dy0 * (1 - e);
        bump(it);
      }
      yield* this.wait(0.15);
    } else yield* this.wait(0.2);
    c.ov = null;
    sound.resolve('text');
    it.done = true;
    bump(it);
  }

  *dragGuide(c, g) {
    this.rulers.want++;
    try {
      const r = rand(-0.15, 0.15);
      const from = () => {
        const vp = this.vp;
        return g.axis === 'x'
          ? this.fromViewport(vp.ox + 10, vp.oy + vp.vh * (0.45 + r))
          : this.fromViewport(vp.ox + vp.vw * 0.3 + r * 200, vp.oy + 10);
      };
      c.shape = 'cross';
      yield* this.moveTo(c, from);
      while (this.rulers.t < 0.95) yield;
      yield* this.moveTo(c, from, { speed: 3 });
      c.press = 1;
      c.shape = g.axis === 'x' ? 'ew' : 'ns';
      g.vis = true;
      g.dragging = true;
      g.op = 1;
      sound.construct('guide');
      const upd = () => {
        g.cur = g.axis === 'x' ? c.x : c.y;
      };
      upd();
      const to = () => {
        const s = from();
        return g.axis === 'x' ? { x: g.pos, y: s.y + 40 } : { x: s.x + 30, y: g.pos };
      };
      yield* this.moveTo(c, to, {
        speed: 0.55,
        drag: true,
        dragKind: 'guide',
        onStep: upd,
      });
      g.cur = g.pos;
      g.dragging = false;
      sound.resolve('guide');
      c.shape = 'cross';
      yield* this.wait(0.25);
    } finally {
      this.rulers.want--;
    }
  }

  *duplicate(c, g, k) {
    const dst = g.dst[k];
    let src = g.src;
    const cand = [g.src, ...g.dst.filter((d) => d.task.state === 'done')];
    const dd = (a) => Math.hypot(a.box.x - dst.box.x, a.box.y - dst.box.y);
    for (const s of cand) if (dd(s) < dd(src)) src = s;
    const sb = this.unionBounds(src.items);
    if (!sb) return;
    c.shape = 'cross';
    const u = {
      x: sb.x + Math.min(sb.w * 0.45, 70) + rand(-8, 8),
      y: sb.y + Math.min(sb.h * 0.45, 30) + rand(-4, 4),
    };
    yield* this.moveTo(c, u);
    yield* this.click(c);
    c.ov = () => [
      { t: 'box', b: sb, handles: true, badge: `${Math.round(sb.w)} × ${Math.round(sb.h)}` },
    ];
    yield* this.wait(rand(0.15, 0.3));
    c.shape = 'dup';
    yield* this.wait(0.12);
    c.press = 1;
    const ox = src.box.x - dst.box.x;
    const oy = src.box.y - dst.box.y;
    for (const it of dst.items) {
      it.vis = true;
      it.mode = 'master';
      it.dx = ox;
      it.dy = oy;
      if (it.kind === 'rect' || it.kind === 'image') {
        it.styled = true;
        it.draw = null;
      }
      if (it.kind === 'line') {
        it.placed = it.pts.length;
      }
      bump(it);
    }
    sound.duplicate('pickup');
    const m = { x: u.x - ox, y: u.y - oy };
    c.ov = () => {
      const cb = this.unionBounds(dst.items);
      if (!cb) return [];
      const h = [
        { t: 'box', b: sb, color: 'red' },
        { t: 'box', b: cb, color: 'red' },
      ];
      const sp = this.spacing(sb, cb);
      if (sp) h.push(sp);
      return h;
    };
    yield* this.moveTo(c, m, {
      speed: 0.6,
      drag: true,
      dragKind: 'duplicate',
      onStep: () => {
        for (const it of dst.items) {
          it.dx = ox + (c.x - u.x);
          it.dy = oy + (c.y - u.y);
          bump(it);
        }
      },
    });
    for (const it of dst.items) {
      it.dx = 0;
      it.dy = 0;
      it.settle = true;
      if (!it.editTask) it.mode = 'own';
      if (it.kind === 'text' && it.mode === 'own') it.shown = it.total;
      bump(it);
    }
    yield* this.wait(0.1);
    c.shape = 'cross';
    c.ov = () => {
      const cb = this.unionBounds(dst.items);
      if (!cb) return [];
      return [
        { t: 'box', b: cb, handles: true, badge: `${Math.round(cb.w)} × ${Math.round(cb.h)}` },
      ];
    };
    yield* this.wait(0.35);
    for (const it of dst.items)
      if (!it.editTask) {
        it.done = true;
        bump(it);
      }
    sound.duplicate('place');
  }

  spacing(a, b) {
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    if (oy > 0) {
      const y = Math.max(a.y, b.y) + oy / 2;
      const [l, r] = a.x < b.x ? [a, b] : [b, a];
      const gap = r.x - (l.x + l.w);
      if (gap > 0)
        return {
          t: 'measure',
          a: { x: l.x + l.w, y },
          b: { x: r.x, y },
          label: String(Math.round(gap)),
        };
    } else if (ox > 0) {
      const x = Math.max(a.x, b.x) + ox / 2;
      const [t, btm] = a.y < b.y ? [a, b] : [b, a];
      const gap = btm.y - (t.y + t.h);
      if (gap > 0)
        return {
          t: 'measure',
          a: { x, y: t.y + t.h },
          b: { x, y: btm.y },
          label: String(Math.round(gap)),
        };
    }
    return null;
  }

  *editText(c, it) {
    c.shape = 'cross';
    const b = this.bounds(it);
    yield* this.moveTo(c, {
      x: b.x + Math.min(b.w * 0.5, 50) + rand(-5, 5),
      y: b.y + Math.min(it.lh, b.h) * 0.55,
    });
    yield* this.click(c);
    yield* this.wait(0.08);
    yield* this.click(c);
    it.selAll = true;
    it.editing = true;
    bump(it);
    c.shape = 'ibeam';
    c.ov = () => [{ t: 'box', b: this.bounds(it) }];
    yield* this.wait(rand(0.2, 0.35));
    it.mode = 'own';
    it.selAll = false;
    it.shown = 0;
    bump(it);
    yield* this.type(it);
    yield* this.wait(0.12);
    it.editing = false;
    bump(it);
    c.shape = 'cross';
    c.ov = () => [this.selection(it)];
    yield* this.wait(0.3);
    c.ov = null;
    sound.resolve('text');
    it.done = true;
    bump(it);
  }

  *restyle(c, it) {
    c.shape = 'cross';
    const b = this.bounds(it);
    yield* this.moveTo(c, {
      x: b.x + Math.min(b.w * 0.5, 60) + rand(-6, 6),
      y: b.y + Math.min(b.h * 0.5, 30) + rand(-4, 4),
    });
    yield* this.click(c);
    c.ov = () => [this.selection(it)];
    yield* this.wait(rand(0.15, 0.3));
    it.mode = 'own';
    bump(it);
    yield* this.wait(0.4);
    c.ov = null;
    sound.resolve(it.kind === 'line' ? 'line' : 'restyle');
    it.done = true;
    bump(it);
  }

  soundArea(it) {
    return Math.max(0, Math.min(1, (it.w * it.h) / Math.max(1, this.vp.vw * this.vp.vh)));
  }
}

// -------------------------------------------------------------------- app
