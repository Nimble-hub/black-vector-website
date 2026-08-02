const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SOUNDTRACK_URL = `${BASE_PATH}/audio/hyperspace-jump.mp3?v=theater-2`;
const PLAYBACK_GAIN = 0.96;

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export class HyperspaceAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private bufferPromise: Promise<AudioBuffer | null> | null = null;
  private source: AudioBufferSourceNode | null = null;
  private muted = false;

  constructor(muted = false) {
    this.muted = muted;
  }

  get isMuted() {
    return this.muted;
  }

  prepare() {
    const context = this.getContext();
    if (!context || this.bufferPromise) return;
    this.bufferPromise = fetch(SOUNDTRACK_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load hyperspace audio: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .catch(() => null);
  }

  async start() {
    if (this.muted) return;
    const context = this.getContext();
    if (!context) return;
    this.prepare();
    await context.resume();
    const buffer = await this.bufferPromise;
    if (!buffer || this.muted || !this.master) return;

    this.stop(0.018);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master);
    source.addEventListener("ended", () => {
      if (this.source === source) this.source = null;
    }, { once: true });
    this.source = source;

    const start = context.currentTime + 0.04;
    this.master.gain.cancelScheduledValues(context.currentTime);
    this.master.gain.setValueAtTime(0.0001, context.currentTime);
    this.master.gain.exponentialRampToValueAtTime(PLAYBACK_GAIN, start + 0.12);
    source.start(start);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stop(0.08);
      return;
    }
    this.prepare();
  }

  stop(fadeSeconds = 0.08) {
    if (!this.context || !this.master || !this.source) return;
    const source = this.source;
    const now = this.context.currentTime;
    this.source = null;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.0001, now, Math.max(fadeSeconds / 3, 0.006));
    window.setTimeout(() => {
      try { source.stop(); } catch { /* The soundtrack may have ended naturally. */ }
      source.disconnect();
    }, Math.max(fadeSeconds * 1000 + 70, 90));
  }

  dispose() {
    this.stop(0.02);
    const context = this.context;
    this.context = null;
    this.master = null;
    this.bufferPromise = null;
    if (context && context.state !== "closed") void context.close();
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
