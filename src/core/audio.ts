export type SoundKind = 'rect' | 'image' | 'text' | 'line' | 'duplicate' | 'guide' | 'restyle';
export type SizeTier = 'small' | 'medium' | 'large';
export type DragKind = 'rect' | 'line' | 'text' | 'guide' | 'duplicate';

export interface MovementSoundEvent {
  velocity: number;
  distance: number;
  kind: string;
}

interface Voice {
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  output: GainNode;
  ended: number;
  closed: boolean;
}

interface VoiceBuilder {
  (
    ctx: AudioContext,
    when: number,
    output: GainNode,
    voice: Voice,
    addSource: (source: AudioScheduledSourceNode) => void,
  ): void;
}

interface ActiveDrag {
  kind: DragKind;
  velocity: number;
}

const MASTER_LEVEL = 0.68;
const MAX_ACTIVE_VOICES = 18;
const RESERVED_LIFECYCLE_VOICES = 1;
const MAX_MOVEMENT_EVENTS_PER_SECOND = 8;
const MOVEMENT_COOLDOWN = 0.16;
const TYPE_FLUSH_MS = 42;
const DRAG_TICK_MS = 125;
const MAX_TYPE_BURST_UNITS = 18;
const NOISE_BUFFER_SECONDS = 0.2;

class AudioSynthesizer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private unavailable = false;
  private enabled = true;
  private active = true;
  private preferenceVersion = 0;
  private lastMovementAt = -Infinity;
  private movementTimes: number[] = [];
  private lastTypeAt = -Infinity;
  private pendingTypeUnits = 0;
  private typeTimer: ReturnType<typeof setTimeout> | null = null;
  private activeDrags = new Map<number, ActiveDrag>();
  private dragTimer: ReturnType<typeof setInterval> | null = null;
  private voices = new Set<Voice>();

  constructor() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    chrome.storage.local
      .get('siteforge:audio')
      .then((stored) => {
        if (this.preferenceVersion !== 0) return;
        const preference = stored['siteforge:audio'];
        if (typeof preference !== 'string') return;
        this.enabled = preference === '1';
        if (!this.enabled) {
          this.rampMaster(0, 0.035);
          this.stopVoices(0.035);
          this.clearPendingSounds();
        }
      })
      .catch((error: unknown) => {
        console.warn('[SiteForge audio] preference unavailable', error);
      });
  }

  private ensureGraph(): AudioContext | null {
    if (!this.ctx) {
      try {
        if (typeof AudioContext === 'undefined') {
          this.unavailable = true;
          return null;
        }
        this.ctx = new AudioContext({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -20;
        this.compressor.knee.value = 10;
        this.compressor.ratio.value = 4;
        this.compressor.attack.value = 0.006;
        this.compressor.release.value = 0.16;
        this.master.gain.value = 0;
        this.master.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);
        this.noiseBuffer = this.createNoiseBuffer(this.ctx, NOISE_BUFFER_SECONDS);
      } catch {
        this.unavailable = true;
        this.ctx = null;
        this.master = null;
        this.compressor = null;
        this.noiseBuffer = null;
        return null;
      }
    }
    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.ceil(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const fade = Math.min(1, i / (ctx.sampleRate * 0.008));
      samples[i] = (Math.random() * 2 - 1) * fade;
    }
    return buffer;
  }

  private ready(): boolean {
    return (
      !!this.ctx && !!this.master && this.enabled && this.active && this.ctx.state === 'running'
    );
  }

  private trace(event: string, values: Record<string, number | string>): void {
    try {
      if (localStorage.getItem('siteforge:audioDebug') !== '1') return;
      console.debug('[SiteForge audio]', { at: Math.round(performance.now()), event, ...values });
    } catch {
      // Diagnostics are optional and must not interfere with animation.
    }
  }

  private rampMaster(value: number, seconds: number): void {
    if (!this.ctx || !this.master) return;
    try {
      const now = this.ctx.currentTime;
      const gain = this.master.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(value, now + seconds);
    } catch {
      this.trace('gain-failed', {});
    }
  }

  public unlock(): void {
    if (!this.enabled) return;
    const ctx = this.ensureGraph();
    if (!ctx) return;
    try {
      ctx
        .resume()
        .then(() => {
          if (this.active && this.enabled) {
            this.rampMaster(MASTER_LEVEL, 0.035);
          }
        })
        .catch(() => {
          this.trace('unlock-failed', {});
        });
    } catch {
      this.trace('unlock-failed', {});
    }
  }

  public begin(): void {
    this.active = true;
    if (this.enabled && this.ctx?.state === 'running') {
      this.rampMaster(MASTER_LEVEL, 0.06);
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public label(): string {
    if (!this.enabled) return 'SND: OFF';
    if (this.unavailable) return 'SND: BLOCKED';
    if (!this.ctx) return 'SND: TAP';
    if (this.ctx && this.ctx.state !== 'running') return 'SND: BLOCKED';
    return 'SND: ON';
  }

  public needsUnlock(): boolean {
    return this.enabled && !this.unavailable && (!this.ctx || this.ctx.state !== 'running');
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    this.preferenceVersion++;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local
          .set({ 'siteforge:audio': this.enabled ? '1' : '0' })
          .catch((error: unknown) => {
            console.warn('[SiteForge audio] preference not saved', error);
          });
      }
    } catch (error) {
      console.warn('[SiteForge audio] preference not saved', error);
    }

    if (this.enabled) {
      this.unlock();
    } else {
      this.rampMaster(0, 0.035);
      this.stopVoices(0.035);
      this.clearPendingSounds();
    }
    return this.enabled;
  }

  public movement(event: MovementSoundEvent): void {
    if (!this.ready() || event.distance < 65 || event.velocity < 90) return;
    const now = this.ctx!.currentTime;
    this.movementTimes = this.movementTimes.filter((time) => now - time < 1);
    if (
      now - this.lastMovementAt < MOVEMENT_COOLDOWN ||
      this.movementTimes.length >= MAX_MOVEMENT_EVENTS_PER_SECOND
    )
      return;
    this.lastMovementAt = now;
    this.movementTimes.push(now);
    const intensity = Math.max(0.35, Math.min(1, event.velocity / 1200));
    this.playVoice((ctx, when, output, voice, addSource) => {
      this.addNoise(
        ctx,
        when,
        0.075,
        700 + intensity * 700,
        1.1,
        0.009 + intensity * 0.006,
        output,
        voice,
        addSource,
        1100 + intensity * 1000,
      );
    });
    this.trace('movement', {
      velocity: Math.round(event.velocity),
      distance: Math.round(event.distance),
      kind: event.kind,
    });
  }

  public startCue(): void {
    if (!this.enabled || !this.active) return;
    const ctx = this.ensureGraph();
    if (!ctx) return;
    if (ctx.state !== 'running') {
      this.trace('start-skipped', { state: ctx.state });
      return;
    }
    if (!this.ready()) return;
    this.playVoice((context, when, output, voice, addSource) => {
      this.addNoise(context, when, 0.12, 520, 0.9, 0.022, output, voice, addSource, 1850);
      this.addOscillator(
        context,
        when + 0.045,
        0.16,
        240,
        360,
        0.032,
        'triangle',
        output,
        voice,
        addSource,
      );
      this.addOscillator(
        context,
        when + 0.14,
        0.2,
        360,
        520,
        0.022,
        'sine',
        output,
        voice,
        addSource,
      );
    }, true);
    this.trace('start', {});
  }

  public drag(
    agentId: number,
    kind: DragKind,
    phase: 'start' | 'move' | 'end',
    velocity = 0,
  ): void {
    if (phase === 'end') {
      this.activeDrags.delete(agentId);
      if (!this.activeDrags.size && this.dragTimer !== null) {
        clearInterval(this.dragTimer);
        this.dragTimer = null;
      }
      return;
    }
    if (!this.ready()) return;
    this.activeDrags.set(agentId, { kind, velocity });
    if (this.dragTimer === null) {
      this.dragTimer = setInterval(() => this.playDragTexture(), DRAG_TICK_MS);
    }
  }

  private playDragTexture(): void {
    if (!this.ready() || !this.activeDrags.size) return;
    const drags = [...this.activeDrags.values()].filter((drag) => drag.velocity > 25);
    if (!drags.length) return;
    const kind = drags[drags.length - 1].kind;
    const intensity = Math.max(
      0.4,
      Math.min(1, drags.reduce((sum, drag) => sum + drag.velocity, 0) / 2400),
    );
    const profile =
      kind === 'line'
        ? { center: 3100, q: 4.5, level: 0.007 }
        : kind === 'guide'
          ? { center: 1250, q: 2, level: 0.006 }
          : kind === 'duplicate'
            ? { center: 850, q: 1.2, level: 0.006 }
            : { center: 1850, q: 2.8, level: 0.006 };
    this.playVoice((ctx, when, output, voice, addSource) => {
      this.addNoise(
        ctx,
        when,
        0.045,
        profile.center,
        profile.q,
        profile.level * intensity,
        output,
        voice,
        addSource,
        profile.center * 1.08,
      );
    });
  }

  public typeProgress(units: number): void {
    if (!this.ready() || units <= 0) return;
    this.pendingTypeUnits = Math.min(MAX_TYPE_BURST_UNITS, this.pendingTypeUnits + units);
    if (this.typeTimer !== null) return;
    this.typeTimer = setTimeout(() => {
      this.typeTimer = null;
      if (!this.ready() || !this.pendingTypeUnits) return;
      const density = Math.min(1, this.pendingTypeUnits / 8);
      this.pendingTypeUnits = 0;
      const now = this.ctx!.currentTime;
      if (now - this.lastTypeAt < 0.052) return;
      this.lastTypeAt = now;
      this.playVoice((ctx, when, output, voice, addSource) => {
        this.addNoise(ctx, when, 0.018, 2800, 4.5, 0.016, output, voice, addSource, 2100);
        if (density > 0.5) {
          this.addNoise(ctx, when + 0.028, 0.016, 2350, 4, 0.009, output, voice, addSource, 1950);
        }
      });
    }, TYPE_FLUSH_MS);
  }

  public construct(kind: SoundKind, areaRatio = 0.01): void {
    if (!this.ready()) return;
    const area = Math.max(0, Math.min(1, areaRatio));
    const tier: SizeTier = area > 0.08 ? 'large' : area > 0.012 ? 'medium' : 'small';
    const intensity = tier === 'large' ? 1 : tier === 'medium' ? 0.78 : 0.58;
    this.playVoice((ctx, when, output, voice, addSource) => {
      if (kind === 'image') {
        this.addNoise(ctx, when, 0.2, 650, 0.8, 0.024 * intensity, output, voice, addSource, 3600);
        this.addOscillator(
          ctx,
          when + 0.16,
          0.2,
          320,
          175,
          0.018,
          'triangle',
          output,
          voice,
          addSource,
        );
      } else if (kind === 'guide') {
        this.addNoise(ctx, when, 0.045, 1200, 2.2, 0.018, output, voice, addSource, 850);
      } else {
        this.addNoise(
          ctx,
          when,
          0.04,
          1050,
          2.5,
          0.019 * intensity,
          output,
          voice,
          addSource,
          1750,
        );
        this.addOscillator(
          ctx,
          when,
          0.11,
          190,
          130,
          0.026 * intensity,
          'triangle',
          output,
          voice,
          addSource,
        );
      }
    });
    this.trace('materialize', { kind, tier });
  }

  public duplicate(phase: 'pickup' | 'place'): void {
    if (!this.ready()) return;
    this.playVoice((ctx, when, output, voice, addSource) => {
      if (phase === 'pickup') {
        this.addNoise(ctx, when, 0.03, 1750, 3.8, 0.015, output, voice, addSource, 2350);
        this.addOscillator(ctx, when, 0.075, 480, 650, 0.012, 'sine', output, voice, addSource);
      } else {
        this.addNoise(ctx, when, 0.045, 1150, 1.8, 0.018, output, voice, addSource, 650);
        this.addOscillator(ctx, when, 0.11, 280, 190, 0.024, 'triangle', output, voice, addSource);
      }
    });
    this.trace('duplicate', { phase });
  }

  public linePoint(pointIndex: number, pointCount: number, closed = false): void {
    if (!this.ready() || pointCount < 1 || pointIndex < 0 || pointIndex >= pointCount) return;
    this.playVoice((ctx, when, output, voice, addSource) => {
      this.addNoise(
        ctx,
        when,
        closed ? 0.065 : 0.025,
        closed ? 1550 : 3200,
        closed ? 1.2 : 5,
        closed ? 0.022 : 0.018,
        output,
        voice,
        addSource,
        closed ? 700 : 2250,
      );
      if (closed)
        this.addOscillator(ctx, when, 0.095, 420, 260, 0.018, 'triangle', output, voice, addSource);
    });
    this.trace('line-point', { index: pointIndex, count: pointCount, closed: closed ? 1 : 0 });
  }

  public resolve(kind: SoundKind): void {
    if (!this.ready()) return;
    const parameters =
      kind === 'line'
        ? { center: 1450, q: 2.8, level: 0.02, start: 290, end: 220 }
        : kind === 'text'
          ? { center: 2100, q: 3.8, level: 0.014, start: 470, end: 390 }
          : kind === 'image'
            ? { center: 900, q: 1.2, level: 0.025, start: 360, end: 245 }
            : kind === 'duplicate'
              ? { center: 1700, q: 3, level: 0.018, start: 390, end: 300 }
              : { center: 1150, q: 2, level: 0.02, start: 330, end: 240 };
    this.playVoice((ctx, when, output, voice, addSource) => {
      this.addNoise(
        ctx,
        when,
        0.055,
        parameters.center,
        parameters.q,
        parameters.level,
        output,
        voice,
        addSource,
        parameters.center * 0.72,
      );
      this.addOscillator(
        ctx,
        when,
        0.14,
        parameters.start,
        parameters.end,
        0.026,
        'sine',
        output,
        voice,
        addSource,
      );
    });
    this.trace('resolve', { kind });
  }

  public complete(): void {
    if (!this.ready()) return;
    this.clearActiveDrags();
    this.playVoice((ctx, when, output, voice, addSource) => {
      this.addNoise(ctx, when, 0.16, 1900, 0.8, 0.018, output, voice, addSource, 620);
      this.addOscillator(ctx, when, 0.34, 440, 330, 0.036, 'triangle', output, voice, addSource);
      this.addOscillator(ctx, when + 0.12, 0.38, 330, 220, 0.026, 'sine', output, voice, addSource);
    }, true);
    this.trace('end', {});
  }

  public stop(): void {
    this.active = false;
    this.rampMaster(0, 0.045);
    this.stopVoices(0.045);
    this.clearPendingSounds();
  }

  private stopVoices(after: number): void {
    if (!this.ctx) return;
    const when = this.ctx.currentTime + after;
    for (const voice of this.voices) {
      try {
        const gain = voice.output.gain;
        gain.cancelScheduledValues(this.ctx.currentTime);
        gain.setValueAtTime(gain.value, this.ctx.currentTime);
        gain.linearRampToValueAtTime(0, when);
      } catch {
        // The master fade remains the fallback if a voice envelope is unavailable.
      }
      for (const source of voice.sources) {
        try {
          source.stop(when);
        } catch {
          // A voice may already have ended while its cleanup callback is queued.
        }
      }
    }
  }

  private clearPendingSounds(): void {
    if (this.typeTimer !== null) clearTimeout(this.typeTimer);
    this.typeTimer = null;
    this.pendingTypeUnits = 0;
    this.clearActiveDrags();
    this.movementTimes = [];
    this.lastMovementAt = -Infinity;
    this.lastTypeAt = -Infinity;
  }

  private clearActiveDrags(): void {
    this.activeDrags.clear();
    if (this.dragTimer !== null) clearInterval(this.dragTimer);
    this.dragTimer = null;
  }

  private playVoice(build: VoiceBuilder, lifecycle = false): void {
    const voiceLimit = lifecycle
      ? MAX_ACTIVE_VOICES
      : MAX_ACTIVE_VOICES - RESERVED_LIFECYCLE_VOICES;
    if (!this.ready() || this.voices.size >= voiceLimit || !this.master) return;
    const ctx = this.ctx!;
    const when = ctx.currentTime + 0.004;
    let voice: Voice | null = null;
    let output: GainNode | null = null;
    let cleanup = () => {};
    const disconnectVoice = (current: Voice) => {
      if (current.closed) return;
      current.closed = true;
      this.voices.delete(current);
      for (const node of current.nodes) {
        try {
          node.disconnect();
        } catch {
          // Nodes can already be disconnected by browser teardown.
        }
      }
    };

    try {
      output = ctx.createGain();
      voice = { sources: [], nodes: [output], output, ended: 0, closed: false };
      output.gain.value = 1;
      output.connect(this.master);
      this.voices.add(voice);
      cleanup = () => disconnectVoice(voice!);
      const addSource = (source: AudioScheduledSourceNode) => {
        voice!.sources.push(source);
        source.onended = () => {
          voice!.ended++;
          if (voice!.ended >= voice!.sources.length) cleanup();
        };
      };
      build(ctx, when, output, voice, addSource);
      if (!voice.sources.length) cleanup();
    } catch {
      if (voice) {
        for (const source of voice.sources) {
          try {
            source.stop();
          } catch {
            // Preserve animation if the browser rejects audio cleanup.
          }
        }
        cleanup();
      } else if (output) {
        try {
          output.disconnect();
        } catch {
          // Ignore partial Web Audio graph creation failures.
        }
      }
    }
  }

  private addOscillator(
    ctx: AudioContext,
    when: number,
    duration: number,
    startFrequency: number,
    endFrequency: number,
    level: number,
    type: OscillatorType,
    output: GainNode,
    voice: Voice,
    addSource: (source: AudioScheduledSourceNode) => void,
  ): void {
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(45, startFrequency), when);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, endFrequency), when + duration);
    envelope.gain.setValueAtTime(Math.max(0.0001, level), when);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(envelope);
    envelope.connect(output);
    voice.nodes.push(oscillator, envelope);
    addSource(oscillator);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.01);
  }

  private addNoise(
    ctx: AudioContext,
    when: number,
    duration: number,
    startFrequency: number,
    q: number,
    level: number,
    output: GainNode,
    voice: Voice,
    addSource: (source: AudioScheduledSourceNode) => void,
    endFrequency: number,
  ): void {
    if (!this.noiseBuffer) return;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(100, startFrequency), when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(100, endFrequency), when + duration);
    envelope.gain.setValueAtTime(Math.max(0.0001, level), when);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    voice.nodes.push(source, filter, envelope);
    addSource(source);
    const offset = Math.random() * Math.max(0, this.noiseBuffer.duration - duration);
    source.start(when, offset, duration);
    source.stop(when + duration + 0.01);
  }
}

export const sound = new AudioSynthesizer();
