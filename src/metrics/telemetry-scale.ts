/** Latitude/longitude as i32 × 1e7 for wire format. */
export function latLonToE7(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const v = Math.round(deg * 1e7);
  const clamped = Math.max(-1_000_000_000, Math.min(1_000_000_000, v));
  return clamped;
}

/** Boat speed in m/s → u32 mm/s (clamped). */
export function speedMpsToMmS(mps: number): number {
  if (!Number.isFinite(mps) || mps < 0) return 0;
  const mm = Math.round(mps * 1000);
  return Math.min(0xffff_ffff, mm);
}

/** SPM as float → u16 SPM×100 (clamped). */
export function spmToX100(spm: number): number {
  if (!Number.isFinite(spm) || spm < 0) return 0;
  return Math.max(0, Math.min(0xffff, Math.round(spm * 100)));
}
