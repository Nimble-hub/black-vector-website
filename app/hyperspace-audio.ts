const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const JUMP_SOUNDTRACK_URL = `${BASE_PATH}/audio/hyperspace-jump.mp3?v=theater-19`;
const SCORE_LOOP_URL = `${BASE_PATH}/audio/black-vector-score-loop.mp3?v=score-2`;
// The source mix measures roughly -13.7 LUFS / -0.9 dBTP. This trim leaves
// cinematic headroom for the live hull-resonance layer and full-volume devices.
const PLAYBACK_GAIN = 0.72;
const MUSIC_GAIN = 0.051;
const MUSIC_ENTRY_SECONDS = 16.54;
const JUMP_FADE_IN_SECONDS = 1;

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

export class HyperspaceAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private jumpBufferPromise: Promise<AudioBuffer | null> | null = null;
  private musicBufferPromise: Promise<AudioBuffer | null> | null = null;
  private jumpSource: AudioBufferSourceNode | null = null;
  private jumpGain: GainNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private structuralSources: AudioScheduledSourceNode[] = [];
  private structuralGain: GainNode | null = null;
  private structuralNoiseBuffer: AudioBuffer | null = null;
  private playbackEpoch = 0;
  private muted = false;
  private volume = 0.5;

  constructor(muted = false, volume = 0.5) {
    this.muted = muted;
    this.volume = Math.max(0, Math.min(1, volume));
  }

  get isMuted() {
    return this.muted;
  }

  get currentVolume() {
    return this.volume;
  }

  prepare() {
    const context = this.getContext();
    if (!context) return;
    this.jumpBufferPromise ??= this.loadBuffer(
      context,
      JUMP_SOUNDTRACK_URL,
      "hyperspace audio",
    );
    this.musicBufferPromise ??= this.loadBuffer(
      context,
      SCORE_LOOP_URL,
      "Black Vector score",
    );
    this.getStructuralNoiseBuffer(context);
  }

  async start() {
    if (this.muted) return;
    const playbackEpoch = ++this.playbackEpoch;
    const context = this.getContext();
    if (!context) return;
    this.prepare();
    await context.resume();
    if (playbackEpoch !== this.playbackEpoch) return;
    const jumpBuffer = await this.jumpBufferPromise;
    if (
      !jumpBuffer ||
      this.muted ||
      !this.master ||
      playbackEpoch !== this.playbackEpoch
    )
      return;

    this.stopJump(0.018);
    this.stopMusic(0.08);
    this.stopStructural(0.018);

    const start = context.currentTime + 0.04;
    const jumpGain = context.createGain();
    const jumpSource = context.createBufferSource();
    jumpSource.buffer = jumpBuffer;
    jumpSource.connect(jumpGain).connect(this.master);
    jumpGain.gain.setValueAtTime(0, start);
    jumpGain.gain.linearRampToValueAtTime(1, start + JUMP_FADE_IN_SECONDS);
    jumpSource.addEventListener(
      "ended",
      () => {
        if (this.jumpSource === jumpSource) {
          this.jumpSource = null;
          this.jumpGain = null;
        }
      },
      { once: true },
    );
    this.jumpSource = jumpSource;
    this.jumpGain = jumpGain;
    jumpSource.start(start);
    this.createStructuralResonance(start);

    const musicBuffer = await this.musicBufferPromise;
    if (
      musicBuffer &&
      !this.muted &&
      this.jumpSource === jumpSource &&
      playbackEpoch === this.playbackEpoch
    ) {
      this.createMusicSource(
        musicBuffer,
        Math.max(start + MUSIC_ENTRY_SECONDS, context.currentTime + 0.04),
        4,
      );
    }
  }

  async startMusic() {
    if (this.muted || this.musicSource) return;
    const playbackEpoch = this.playbackEpoch;
    const context = this.getContext();
    if (!context) return;
    this.prepare();
    await context.resume();
    const musicBuffer = await this.musicBufferPromise;
    if (
      !musicBuffer ||
      this.muted ||
      !this.master ||
      this.musicSource ||
      playbackEpoch !== this.playbackEpoch
    )
      return;
    this.stopMusic(0.08);
    this.createMusicSource(musicBuffer, context.currentTime + 0.04, 2.2);
  }

  finishTransit(fadeSeconds = 0.1) {
    this.playbackEpoch += 1;
    this.stopJump(fadeSeconds);
    this.stopStructural(fadeSeconds);
    if (!this.muted) void this.startMusic();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.updateMasterGain();
    if (muted) {
      this.stop(0.08);
      return;
    }
    this.prepare();
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.updateMasterGain();
  }

  stop(fadeSeconds = 0.08) {
    this.playbackEpoch += 1;
    this.stopJump(fadeSeconds);
    this.stopMusic(fadeSeconds);
    this.stopStructural(fadeSeconds);
  }

  dispose() {
    this.stop(0.02);
    const context = this.context;
    this.context = null;
    this.master = null;
    this.jumpBufferPromise = null;
    this.musicBufferPromise = null;
    this.structuralNoiseBuffer = null;
    if (context && context.state !== "closed") void context.close();
  }

  private createStructuralResonance(start: number) {
    if (!this.context || !this.master) return;
    const context = this.context;
    const structuralGain = context.createGain();
    structuralGain.gain.setValueAtTime(0.0001, start);
    structuralGain.gain.linearRampToValueAtTime(0.009, start + 3.55);
    structuralGain.gain.linearRampToValueAtTime(0.032, start + 4.85);
    structuralGain.gain.linearRampToValueAtTime(0.068, start + 5.72);
    structuralGain.gain.linearRampToValueAtTime(0.082, start + 5.79);
    structuralGain.gain.exponentialRampToValueAtTime(0.026, start + 6.8);
    structuralGain.gain.linearRampToValueAtTime(0.018, start + 12.9);
    structuralGain.gain.linearRampToValueAtTime(0.052, start + 14.15);
    structuralGain.gain.exponentialRampToValueAtTime(0.0001, start + 16.25);
    structuralGain.connect(this.master);
    this.structuralGain = structuralGain;

    const fundamental = context.createOscillator();
    const fundamentalGain = context.createGain();
    fundamental.type = "triangle";
    fundamental.frequency.setValueAtTime(47, start);
    fundamental.frequency.linearRampToValueAtTime(43, start + 6.8);
    fundamental.frequency.linearRampToValueAtTime(39, start + 14.15);
    fundamentalGain.gain.value = 0.46;
    fundamental.connect(fundamentalGain).connect(structuralGain);

    const harmonic = context.createOscillator();
    const harmonicFilter = context.createBiquadFilter();
    const harmonicGain = context.createGain();
    harmonic.type = "sawtooth";
    harmonic.frequency.setValueAtTime(94, start);
    harmonic.frequency.linearRampToValueAtTime(86, start + 6.8);
    harmonicFilter.type = "bandpass";
    harmonicFilter.frequency.value = 188;
    harmonicFilter.Q.value = 3.6;
    harmonicGain.gain.value = 0.13;
    harmonic
      .connect(harmonicFilter)
      .connect(harmonicGain)
      .connect(structuralGain);

    const noiseSource = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noiseSource.buffer = this.getStructuralNoiseBuffer(context);
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 320;
    noiseFilter.Q.value = 1.15;
    noiseGain.gain.value = 0.34;
    noiseSource.connect(noiseFilter).connect(noiseGain).connect(structuralGain);

    const stopAt = start + 16.4;
    fundamental.addEventListener(
      "ended",
      () => {
        if (this.structuralGain !== structuralGain) return;
        this.structuralSources.length = 0;
        this.structuralGain = null;
        structuralGain.disconnect();
      },
      { once: true },
    );
    for (const source of [fundamental, harmonic, noiseSource]) {
      source.start(start);
      source.stop(stopAt);
      this.structuralSources.push(source);
    }
  }

  private getStructuralNoiseBuffer(context: AudioContext) {
    if (this.structuralNoiseBuffer) return this.structuralNoiseBuffer;
    const frameCount = Math.ceil(context.sampleRate * 16.5);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    let pressure = 0;
    for (let index = 0; index < frameCount; index += 1) {
      pressure = pressure * 0.985 + (Math.random() * 2 - 1) * 0.015;
      data[index] = pressure * 3.2;
    }
    this.structuralNoiseBuffer = buffer;
    return buffer;
  }

  private createMusicSource(
    buffer: AudioBuffer,
    start: number,
    fadeSeconds: number,
  ) {
    if (!this.context || !this.master) return;
    const musicGain = this.context.createGain();
    const musicSource = this.context.createBufferSource();
    musicSource.buffer = buffer;
    musicSource.loop = true;
    musicSource.connect(musicGain).connect(this.master);
    musicGain.gain.setValueAtTime(
      0.0001,
      Math.min(this.context.currentTime, start),
    );
    musicGain.gain.exponentialRampToValueAtTime(
      MUSIC_GAIN,
      start + fadeSeconds,
    );
    musicSource.addEventListener(
      "ended",
      () => {
        if (this.musicSource === musicSource) {
          this.musicSource = null;
          this.musicGain = null;
        }
      },
      { once: true },
    );
    this.musicSource = musicSource;
    this.musicGain = musicGain;
    musicSource.start(start);
  }

  private stopJump(fadeSeconds: number) {
    if (!this.context || !this.jumpSource || !this.jumpGain) return;
    const source = this.jumpSource;
    const gain = this.jumpGain;
    this.jumpSource = null;
    this.jumpGain = null;
    this.fadeAndStop(source, gain, fadeSeconds);
  }

  private stopMusic(fadeSeconds: number) {
    if (!this.context || !this.musicSource || !this.musicGain) return;
    const source = this.musicSource;
    const gain = this.musicGain;
    this.musicSource = null;
    this.musicGain = null;
    this.fadeAndStop(source, gain, fadeSeconds);
  }

  private stopStructural(fadeSeconds: number) {
    if (!this.context || !this.structuralGain) return;
    const gain = this.structuralGain;
    const sources = this.structuralSources.splice(0);
    this.structuralGain = null;
    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0.0001, now, Math.max(fadeSeconds / 3, 0.006));
    window.setTimeout(
      () => {
        for (const source of sources) {
          try {
            source.stop();
          } catch {
            /* The source may have ended naturally. */
          }
          source.disconnect();
        }
        gain.disconnect();
      },
      Math.max(fadeSeconds * 1000 + 70, 90),
    );
  }

  private fadeAndStop(
    source: AudioBufferSourceNode,
    gain: GainNode,
    fadeSeconds: number,
  ) {
    if (!this.context) return;
    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0.0001, now, Math.max(fadeSeconds / 3, 0.006));
    window.setTimeout(
      () => {
        try {
          source.stop();
        } catch {
          /* The source may have ended naturally. */
        }
        source.disconnect();
        gain.disconnect();
      },
      Math.max(fadeSeconds * 1000 + 70, 90),
    );
  }

  private loadBuffer(context: AudioContext, url: string, label: string) {
    return fetch(url)
      .then((response) => {
        if (!response.ok)
          throw new Error(`Unable to load ${label}: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .catch(() => null);
  }

  private getContext() {
    if (this.context) return this.context;
    const AudioContextClass =
      window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!AudioContextClass) return null;
    const context = new AudioContextClass({ latencyHint: "playback" });
    const master = context.createGain();
    master.gain.value = this.muted ? 0 : PLAYBACK_GAIN * this.volume;
    master.connect(context.destination);
    this.context = context;
    this.master = master;
    return context;
  }

  private updateMasterGain() {
    if (!this.context || !this.master) return;
    const target = this.muted ? 0 : PLAYBACK_GAIN * this.volume;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(target, now, 0.025);
  }
}
