type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export class HyperspaceAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private activeSources = new Set<AudioScheduledSourceNode>();
  private muted = false;

  constructor(muted = false) {
    this.muted = muted;
  }

  get isMuted() {
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.context || !this.master) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(muted ? 0 : 0.52, this.context.currentTime, 0.035);
  }

  async start() {
    const context = this.getContext();
    if (!context || this.muted) return;
    await context.resume();
    this.stop(0.025);

    const start = context.currentTime + 0.055;
    const master = this.master;
    if (!master) return;
    master.gain.cancelScheduledValues(start);
    master.gain.setValueAtTime(0.0001, start);
    master.gain.exponentialRampToValueAtTime(0.52, start + 0.18);

    this.scheduleHullTone(context, master, start);
    this.scheduleCharge(context, master, start);
    this.scheduleLaunch(context, master, start + 3.0);
    this.scheduleTunnel(context, master, start + 3.15);
    this.scheduleFlyBy(context, master, start + 5.15, -0.82, 0.7);
    this.scheduleFlyBy(context, master, start + 7.45, 0.76, 0.92);
    this.scheduleFlyBy(context, master, start + 10.15, -0.68, 1.08);
    this.scheduleExit(context, master, start + 12.62);
    this.scheduleArrival(context, master, start + 13.1);
  }

  stop(fadeSeconds = 0.08) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.0001, now, Math.max(fadeSeconds / 3, 0.008));
    const sources = [...this.activeSources];
    window.setTimeout(() => {
      for (const source of sources) {
        try { source.stop(); } catch { /* The source may have ended naturally. */ }
        this.activeSources.delete(source);
      }
    }, Math.max(fadeSeconds * 1000 + 80, 100));
  }

  dispose() {
    this.stop(0.02);
    const context = this.context;
    this.context = null;
    this.master = null;
    if (context && context.state !== "closed") void context.close();
  }

  private getContext() {
    if (this.context) return this.context;
    const AudioContextClass = window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!AudioContextClass) return null;

    const context = new AudioContextClass({ latencyHint: "interactive" });
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -19;
    compressor.knee.value = 13;
    compressor.ratio.value = 7;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.24;
    master.gain.value = this.muted ? 0 : 0.52;
    master.connect(compressor).connect(context.destination);
    this.context = context;
    this.master = master;
    return context;
  }

  private track<T extends AudioScheduledSourceNode>(source: T) {
    this.activeSources.add(source);
    source.addEventListener("ended", () => this.activeSources.delete(source), { once: true });
    return source;
  }

  private noiseBuffer(context: AudioContext, duration: number, brown = false) {
    const length = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      let memory = 0;
      for (let index = 0; index < length; index += 1) {
        const white = Math.random() * 2 - 1;
        memory = brown ? (memory + 0.018 * white) / 1.018 : white;
        data[index] = brown ? memory * 3.25 : white * 0.72;
      }
    }
    return buffer;
  }

  private scheduleHullTone(context: AudioContext, destination: AudioNode, start: number) {
    const gain = context.createGain();
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(92, start);
    lowpass.frequency.exponentialRampToValueAtTime(280, start + 3.15);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 2.82);
    gain.gain.exponentialRampToValueAtTime(0.032, start + 3.2);
    gain.gain.setValueAtTime(0.032, start + 12.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 13.05);
    gain.connect(destination);

    for (const [frequency, detune] of [[42, -5], [57, 7]] as const) {
      const oscillator = this.track(context.createOscillator());
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.42, start + 3.05);
      oscillator.detune.value = detune;
      oscillator.connect(lowpass);
      oscillator.start(start);
      oscillator.stop(start + 13.1);
    }
    lowpass.connect(gain);
  }

  private scheduleCharge(context: AudioContext, destination: AudioNode, start: number) {
    const source = this.track(context.createBufferSource());
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noiseBuffer(context, 3.15, true);
    filter.type = "bandpass";
    filter.Q.value = 0.72;
    filter.frequency.setValueAtTime(120, start);
    filter.frequency.exponentialRampToValueAtTime(4200, start + 3.04);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.006, start + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.15, start + 2.96);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 3.13);
    source.connect(filter).connect(gain).connect(destination);
    source.start(start);
    source.stop(start + 3.15);

    const tension = this.track(context.createOscillator());
    const tensionGain = context.createGain();
    tension.type = "triangle";
    tension.frequency.setValueAtTime(82, start);
    tension.frequency.exponentialRampToValueAtTime(760, start + 3.04);
    tensionGain.gain.setValueAtTime(0.0001, start);
    tensionGain.gain.exponentialRampToValueAtTime(0.026, start + 2.65);
    tensionGain.gain.exponentialRampToValueAtTime(0.0001, start + 3.12);
    tension.connect(tensionGain).connect(destination);
    tension.start(start);
    tension.stop(start + 3.14);
  }

  private scheduleLaunch(context: AudioContext, destination: AudioNode, start: number) {
    const impact = this.track(context.createOscillator());
    const impactGain = context.createGain();
    impact.type = "sine";
    impact.frequency.setValueAtTime(72, start);
    impact.frequency.exponentialRampToValueAtTime(24, start + 0.95);
    impactGain.gain.setValueAtTime(0.44, start);
    impactGain.gain.exponentialRampToValueAtTime(0.0001, start + 1.05);
    impact.connect(impactGain).connect(destination);
    impact.start(start);
    impact.stop(start + 1.08);

    const crack = this.track(context.createBufferSource());
    const crackFilter = context.createBiquadFilter();
    const crackGain = context.createGain();
    crack.buffer = this.noiseBuffer(context, 0.42);
    crackFilter.type = "highpass";
    crackFilter.frequency.value = 620;
    crackGain.gain.setValueAtTime(0.24, start);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
    crack.connect(crackFilter).connect(crackGain).connect(destination);
    crack.start(start);
    crack.stop(start + 0.42);
  }

  private scheduleTunnel(context: AudioContext, destination: AudioNode, start: number) {
    const duration = 9.72;
    for (const pan of [-0.62, 0.62]) {
      const source = this.track(context.createBufferSource());
      const filter = context.createBiquadFilter();
      const panner = context.createStereoPanner();
      const gain = context.createGain();
      source.buffer = this.noiseBuffer(context, duration, true);
      filter.type = "bandpass";
      filter.Q.value = 0.46;
      filter.frequency.setValueAtTime(pan < 0 ? 680 : 980, start);
      filter.frequency.exponentialRampToValueAtTime(pan < 0 ? 2600 : 3900, start + 5.2);
      filter.frequency.exponentialRampToValueAtTime(1300, start + 9.35);
      panner.pan.value = pan;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.32);
      gain.gain.setValueAtTime(0.16, start + 8.72);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 9.68);
      source.connect(filter).connect(panner).connect(gain).connect(destination);
      source.start(start);
      source.stop(start + duration);
    }

    const drive = this.track(context.createOscillator());
    const driveGain = context.createGain();
    drive.type = "triangle";
    drive.frequency.setValueAtTime(104, start);
    drive.frequency.linearRampToValueAtTime(136, start + 8.9);
    driveGain.gain.setValueAtTime(0.0001, start);
    driveGain.gain.exponentialRampToValueAtTime(0.037, start + 0.65);
    driveGain.gain.setValueAtTime(0.037, start + 8.7);
    driveGain.gain.exponentialRampToValueAtTime(0.0001, start + 9.55);
    drive.connect(driveGain).connect(destination);
    drive.start(start);
    drive.stop(start + 9.6);
  }

  private scheduleFlyBy(context: AudioContext, destination: AudioNode, start: number, pan: number, pitch: number) {
    const source = this.track(context.createBufferSource());
    const filter = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const gain = context.createGain();
    source.buffer = this.noiseBuffer(context, 0.62);
    filter.type = "bandpass";
    filter.Q.value = 3.4;
    filter.frequency.setValueAtTime(640 * pitch, start);
    filter.frequency.exponentialRampToValueAtTime(7200 * pitch, start + 0.28);
    filter.frequency.exponentialRampToValueAtTime(1800 * pitch, start + 0.6);
    panner.pan.setValueAtTime(pan, start);
    panner.pan.linearRampToValueAtTime(-pan * 0.38, start + 0.58);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.085, start + 0.24);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.61);
    source.connect(filter).connect(panner).connect(gain).connect(destination);
    source.start(start);
    source.stop(start + 0.62);
  }

  private scheduleExit(context: AudioContext, destination: AudioNode, start: number) {
    const hit = this.track(context.createOscillator());
    const gain = context.createGain();
    hit.type = "sine";
    hit.frequency.setValueAtTime(64, start);
    hit.frequency.exponentialRampToValueAtTime(21, start + 1.15);
    gain.gain.setValueAtTime(0.38, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.18);
    hit.connect(gain).connect(destination);
    hit.start(start);
    hit.stop(start + 1.2);

    const air = this.track(context.createBufferSource());
    const filter = context.createBiquadFilter();
    const airGain = context.createGain();
    air.buffer = this.noiseBuffer(context, 0.78, true);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(6800, start);
    filter.frequency.exponentialRampToValueAtTime(160, start + 0.74);
    airGain.gain.setValueAtTime(0.19, start);
    airGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.76);
    air.connect(filter).connect(airGain).connect(destination);
    air.start(start);
    air.stop(start + 0.78);
  }

  private scheduleArrival(context: AudioContext, destination: AudioNode, start: number) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.026, start + 0.85);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 7.8);
    gain.connect(destination);
    for (const frequency of [36, 49]) {
      const oscillator = this.track(context.createOscillator());
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(start);
      oscillator.stop(start + 8);
    }
  }
}
