export class AudioManager {
  private ctx: AudioContext | null = null;
  private muted = false;

  init(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
  }

  private ensureResumed(): boolean {
    if (!this.ctx) this.init();
    if (!this.ctx) return false;
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx.state !== "closed";
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }
  isMuted(): boolean {
    return this.muted;
  }

  playWarning(): void {
    this.playBeeps(2, 880, 0.15);
  }
  playEnd(): void {
    this.playBeeps(3, 1047, 0.15);
  }
  playOvertimeTick(): void {
    this.playBeeps(1, 440, 0.08);
  }

  private playBeeps(count: number, freq: number, duration: number): void {
    if (this.muted) return;
    if (!this.ensureResumed()) return;
    const ctx = this.ctx!;

    for (let i = 0; i < count; i++) {
      const startTime = ctx.currentTime + i * (duration + 0.08);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }
  }
}
