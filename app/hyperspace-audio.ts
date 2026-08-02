const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const JUMP_SOUNDTRACK_URL = `${BASE_PATH}/audio/hyperspace-jump.mp3?v=theater-5`;
const SCORE_LOOP_URL = `${BASE_PATH}/audio/black-vector-score-loop.mp3?v=score-2`;
const PLAYBACK_GAIN = 0.96;
const MUSIC_GAIN = 0.051;
const MUSIC_ENTRY_SECONDS = 15.04;

type AudioWindow = Window & typeof globalThis & {
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
  private muted = false;

  constructor(muted = false) {
    this.muted = muted;
  }

  get isMuted() {
    return this.muted;
  }

  prepare() {
    const context = this.getContext();
    if (!context) return;
    this.jumpBufferPromise ??= this.loadBuffer(context, JUMP_SOUNDTRACK_URL, "hyperspace audio");
    this.musicBufferPromise ??= this.loadBuffer(context, SCORE_LOOP_URL, "Black Vector score");
  }

  async start() {
    if (this.muted) return;
    const context = this.getContext();
    if (!context) return;
    this.prepare();
    await context.resume();
    const jumpBuffer = await this.jumpBufferPromise;
    if (!jumpBuffer || this.muted || !this.master) return;

    this.stopJump(0.018);
    this.stopMusic(0.08);

    const start = context.currentTime + 0.04;
    const jumpGain = context.createGain();
    const jumpSource = context.createBufferSource();
    jumpSource.buffer = jumpBuffer;
    jumpSource.connect(jumpGain).connect(this.master);
    jumpGain.gain.setValueAtTime(0.0001, context.currentTime);
    jumpGain.gain.exponentialRampToValueAtTime(1, start + 0.12);
    jumpSource.addEventListener("ended", () => {
      if (this.jumpSource === jumpSource) {
        this.jumpSource = null;
        this.jumpGain = null;
      }
    }, { once: true });
    this.jumpSource = jumpSource;
    this.jumpGain = jumpGain;
    jumpSource.start(start);

    const musicBuffer = await this.musicBufferPromise;
    if (musicBuffer && !this.muted && this.jumpSource === jumpSource) {
      this.createMusicSource(
        musicBuffer,
        Math.max(start + MUSIC_ENTRY_SECONDS, context.currentTime + 0.04),
        4,
      );
    }
  }

  async startMusic() {
    if (this.muted) return;
    const context = this.getContext();
    if (!context) return;
    this.prepare();
    await context.resume();
    const musicBuffer = await this.musicBufferPromise;
    if (!musicBuffer || this.muted || !this.master) return;
    this.stopMusic(0.08);
    this.createMusicSource(musicBuffer, context.currentTime + 0.04, 2.2);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : PLAYBACK_GAIN;
    if (muted) {
      this.stop(0.08);
      return;
    }
    this.prepare();
  }

  stop(fadeSeconds = 0.08) {
    this.stopJump(fadeSeconds);
    this.stopMusic(fadeSeconds);
  }

  dispose() {
    this.stop(0.02);
    const context = this.context;
    this.context = null;
    this.master = null;
    this.jumpBufferPromise = null;
    this.musicBufferPromise = null;
    if (context && context.state !== "closed") void context.close();
  }

  private createMusicSource(buffer: AudioBuffer, start: number, fadeSeconds: number) {
    if (!this.context || !this.master) return;
    const musicGain = this.context.createGain();
    const musicSource = this.context.createBufferSource();
    musicSource.buffer = buffer;
    musicSource.loop = true;
    musicSource.connect(musicGain).connect(this.master);
    musicGain.gain.setValueAtTime(0.0001, Math.min(this.context.currentTime, start));
    musicGain.gain.exponentialRampToValueAtTime(MUSIC_GAIN, start + fadeSeconds);
    musicSource.addEventListener("ended", () => {
      if (this.musicSource === musicSource) {
        this.musicSource = null;
        this.musicGain = null;
      }
    }, { once: true });
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

  private fadeAndStop(source: AudioBufferSourceNode, gain: GainNode, fadeSeconds: number) {
    if (!this.context) return;
    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0.0001, now, Math.max(fadeSeconds / 3, 0.006));
    window.setTimeout(() => {
      try { source.stop(); } catch { /* The source may have ended naturally. */ }
      source.disconnect();
      gain.disconnect();
    }, Math.max(fadeSeconds * 1000 + 70, 90));
  }

  private loadBuffer(context: AudioContext, url: string, label: string) {
    return fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load ${label}: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .catch(() => null);
  }

  private getContext() {
    if (this.context) return this.context;
    const AudioContextClass = window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!AudioContextClass) return null;
    const context = new AudioContextClass({ latencyHint: "playback" });
    const master = context.createGain();
    master.gain.value = this.muted ? 0 : PLAYBACK_GAIN;
    master.connect(context.destination);
    this.context = context;
    this.master = master;
    return context;
  }
}
