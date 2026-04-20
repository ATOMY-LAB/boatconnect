/**
 * Lightweight peak-based stroke detector (scalar series, e.g. one accelerometer axis or magnitude).
 * Not a bit-accurate port of firmware; suitable for replay/analysis on the coach side.
 */
export type StrokeRateEstimatorOptions = {
  /** Minimum sample value at a local maximum to count as a stroke. */
  threshold: number;
  /** Refractory period between peaks (ms). */
  minPeakIntervalMs: number;
  /** SPM uses stroke timestamps within this window (default 60_000). */
  spmWindowMs?: number;
};

export class StrokeRateEstimator {
  private readonly threshold: number;
  private readonly minPeakIntervalMs: number;
  private readonly spmWindowMs: number;
  private readonly buf: { t: number; v: number }[] = [];
  private lastPeakT = -Infinity;
  private readonly strokeTimes: number[] = [];
  private strokeHead = 0;

  constructor(opts: StrokeRateEstimatorOptions) {
    this.threshold = opts.threshold;
    this.minPeakIntervalMs = opts.minPeakIntervalMs;
    this.spmWindowMs = opts.spmWindowMs ?? 60_000;
  }

  /**
   * Push one sample at time `tMs`. Returns true when a stroke peak is detected at the middle sample.
   */
  pushSample(tMs: number, value: number): boolean {
    this.buf.push({ t: tMs, v: value });
    if (this.buf.length > 3) this.buf.shift();
    if (this.buf.length < 3) return false;
    const [a, b, c] = this.buf;
    if (a.v < b.v && b.v > c.v && b.v >= this.threshold) {
      if (b.t - this.lastPeakT >= this.minPeakIntervalMs) {
        this.lastPeakT = b.t;
        this.strokeTimes.push(b.t);
        this.pruneOldStrokes(tMs);
        return true;
      }
    }
    return false;
  }

  /** Strokes per minute from peaks in the configured window ending at `nowMs`. */
  spmAt(nowMs: number): number {
    this.pruneOldStrokes(nowMs);
    const start = nowMs - this.spmWindowMs;
    let n = 0;
    for (let i = this.strokeTimes.length - 1; i >= this.strokeHead; i--) {
      const t = this.strokeTimes[i]!;
      if (t < start) break;
      n++;
    }
    if (this.spmWindowMs <= 0) return 0;
    return (n / this.spmWindowMs) * 60_000;
  }

  reset(): void {
    this.buf.length = 0;
    this.lastPeakT = -Infinity;
    this.strokeTimes.length = 0;
    this.strokeHead = 0;
  }

  private pruneOldStrokes(nowMs: number): void {
    const cutoff = nowMs - this.spmWindowMs * 2;
    while (this.strokeHead < this.strokeTimes.length && this.strokeTimes[this.strokeHead]! < cutoff) {
      this.strokeHead++;
    }
    if (this.strokeHead > 0 && this.strokeHead * 2 >= this.strokeTimes.length) {
      this.strokeTimes.splice(0, this.strokeHead);
      this.strokeHead = 0;
    }
  }
}
