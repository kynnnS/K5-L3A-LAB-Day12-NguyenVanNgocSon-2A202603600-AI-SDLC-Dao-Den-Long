/**
 * Ticket-04 §1 frame-time metrics (pure). dts = frame times in ms of the N measured frames.
 *   avg_fps      = 1000 * N / sum(dt)
 *   p1_low_fps   = 1000 / mean(k largest dt), k = max(1, ceil(0.01 * N))
 *   frame_ms_p95 = 95th percentile of dt, nearest-rank: sorted ascending, element ceil(0.95 * N) (1-based)
 */
export interface FrameMetrics { frames: number; avg_fps: number; p1_low_fps: number; frame_ms_p95: number }

export function frameMetrics(dts: number[]): FrameMetrics {
  const n = dts.length;
  if (n === 0) throw new Error('no frames measured');
  const sum = dts.reduce((a, b) => a + b, 0);
  const sorted = [...dts].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(0.01 * n));
  const worst = sorted.slice(n - k);
  const meanWorst = worst.reduce((a, b) => a + b, 0) / k;
  const p95 = sorted[Math.max(0, Math.ceil(0.95 * n) - 1)]!;
  return { frames: n, avg_fps: (1000 * n) / sum, p1_low_fps: 1000 / meanWorst, frame_ms_p95: p95 };
}

export const round1 = (v: number): number => Math.round(v * 10) / 10;
