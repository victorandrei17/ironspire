/**
 * WebAudio (SPEC §14).
 *
 * No <audio> elements: they cannot be scheduled, cannot be deduplicated, and
 * cost a DOM node each. The context is created eagerly but only UNLOCKED on the
 * first pointerdown, which iOS requires.
 *
 * Sounds are synthesised, not loaded. That keeps the "the game works with no
 * assets" contract that the sprite system already holds: audio files can
 * replace these later without touching a call site.
 */
/** One synthesised sound. The catalogue itself lives in `data/audio.ts`. */
export type SoundVoice = {
  /** Base frequency in Hz. */
  freq: number;
  /** Seconds. */
  dur: number;
  type: OscillatorType;
  /** Peak gain before the bus volume. */
  gain: number;
  /** Frequency at the end of the sweep, or 0 for no sweep. */
  sweepTo: number;
  bus: 'sfx' | 'ui';
};

/** At most this many of the SAME sound per frame (SPEC §14). */
const MAX_PER_SOUND = 3;
/** Repeated sounds get a pitch wobble so they do not fatigue. */
const PITCH_JITTER = 0.08;

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private unlocked = false;
  private failed = false;

  /** Counts requested this frame, per sound, for deduplication. */
  private readonly pending: Int32Array;
  private hasPending = false;

  /**
   * The catalogue is injected rather than imported: `platform/` is a device
   * abstraction and must not depend on game data (CLAUDE.md §3).
   */
  constructor(private readonly voices: readonly SoundVoice[]) {
    this.pending = new Int32Array(voices.length);
  }

  sfxVolume = 0.8;
  musicVolume = 0.6;

  /**
   * Creates the context. Safe to call before any user gesture: it starts
   * suspended and `unlock` resumes it.
   */
  init(): void {
    if (this.ctx !== null || this.failed) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) {
        this.failed = true;
        return;
      }
      const ctx = new Ctor();
      this.sfxBus = ctx.createGain();
      this.uiBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.sfxBus.connect(ctx.destination);
      this.uiBus.connect(ctx.destination);
      this.musicBus.connect(ctx.destination);
      this.ctx = ctx;
      this.applyVolumes();
    } catch {
      // Audio is never load-bearing: a missing context must not break the game.
      this.failed = true;
    }
  }

  /** Resumes the context. Must be called from a real user gesture on iOS. */
  unlock(): void {
    if (this.ctx === null || this.unlocked) return;
    void this.ctx.resume().then(
      () => {
        this.unlocked = true;
      },
      () => {
        this.failed = true;
      },
    );
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.sfxBus !== null) this.sfxBus.gain.value = this.sfxVolume;
    if (this.uiBus !== null) this.uiBus.gain.value = this.sfxVolume;
    if (this.musicBus !== null) this.musicBus.gain.value = this.musicVolume;
  }

  /**
   * Queues a sound. Called from systems, so it must not allocate or touch the
   * audio graph — `flush` does the work once per frame.
   */
  play(id: number): void {
    if (id < 0 || id >= this.voices.length) return;
    this.pending[id] = (this.pending[id] ?? 0) + 1;
    this.hasPending = true;
  }

  /**
   * Emits the queued sounds (SPEC §12.3 step 18).
   *
   * Deduplicated: past three of the same sound in a frame the gain rises
   * instead of more voices stacking. Forty enemies dying at once is otherwise
   * a clipped blast, not a sound.
   */
  flush(): void {
    if (!this.hasPending) return;
    this.hasPending = false;
    if (this.ctx === null || !this.unlocked) {
      this.pending.fill(0);
      return;
    }
    for (let id = 0; id < this.voices.length; id++) {
      const n = this.pending[id] ?? 0;
      if (n === 0) continue;
      this.pending[id] = 0;
      const voices = Math.min(n, MAX_PER_SOUND);
      const boost = 1 + Math.min(1, (n - voices) / 8);
      for (let k = 0; k < voices; k++) this.emit(id, boost, k * 0.012);
    }
  }

  private emit(id: number, boost: number, delay: number): void {
    const ctx = this.ctx;
    const voice = this.voices[id];
    if (ctx === null || voice === undefined) return;
    const bus = voice.bus === 'ui' ? this.uiBus : this.sfxBus;
    if (bus === null) return;

    try {
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = voice.type;
      const jitter = 1 + (Math.random() * 2 - 1) * PITCH_JITTER;
      osc.frequency.setValueAtTime(voice.freq * jitter, t);
      if (voice.sweepTo > 0) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(20, voice.sweepTo * jitter),
          t + voice.dur,
        );
      }
      gain.gain.setValueAtTime(Math.min(0.9, voice.gain * boost), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + voice.dur);
      osc.connect(gain);
      gain.connect(bus);
      osc.start(t);
      osc.stop(t + voice.dur + 0.02);
    } catch {
      // A browser refusing to build the graph must not take the frame with it.
    }
  }

  /** Ducks music while a boss is on screen (SPEC §14). */
  duckMusic(on: boolean): void {
    if (this.musicBus === null || this.ctx === null) return;
    const target = on ? this.musicVolume * 0.35 : this.musicVolume;
    this.musicBus.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
  }

  get available(): boolean {
    return this.ctx !== null && !this.failed;
  }
}
