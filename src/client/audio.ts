/** Procedural WebAudio sound (no external assets). Volume comes from settings. */
type Sfx = 'pickup' | 'lantern' | 'pulse' | 'hit' | 'jump' | 'dash' | 'win' | 'lose' | 'shade' | 'tick' | 'wind';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: { stop: () => void } | null = null;
  private volume = 0.6;

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number): void {
    if (!this.ctx || !this.master) return;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 600;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  play(s: Sfx): void {
    switch (s) {
      case 'pickup': this.tone(1200, 0.12, 'sine', 0.2, 1800); break;
      case 'lantern': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.18, undefined, i * 0.08)); break;
      case 'pulse': this.tone(300, 0.5, 'sine', 0.3, 900); break;
      case 'hit': this.tone(180, 0.35, 'sawtooth', 0.25, 60); break;
      case 'jump': this.tone(400, 0.15, 'square', 0.08, 700); break;
      case 'dash': this.noise(0.18, 0.4); break;
      case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.18, undefined, i * 0.12)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.2, undefined, i * 0.18)); break;
      case 'shade': this.tone(90, 0.8, 'sawtooth', 0.12, 45); break;
      case 'tick': this.tone(880, 0.06, 'square', 0.1); break;
      case 'wind': this.noise(1.6, 0.25); break;
    }
  }

  /** Soft night pad + slow pentatonic notes. */
  startMusic(): void {
    if (!this.ctx || !this.master || this.music) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    g.connect(this.master);
    const drones = [110, 165].map((f) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(); return o; });
    const notes = [440, 494, 587, 659, 784];
    const id = window.setInterval(() => this.tone(notes[Math.floor(Math.random() * notes.length)]!, 1.6, 'sine', 0.05), 1400);
    this.music = { stop: () => { drones.forEach((o) => o.stop()); window.clearInterval(id); g.disconnect(); } };
  }

  stopMusic(): void {
    this.music?.stop();
    this.music = null;
  }
}
