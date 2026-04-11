/**
 * DPS (distance per stroke) consistent with speedcoach: speed_m_s / (SPM / 60) when SPM > 0.
 * @see https://github.com/ATOMY-LAB/speedcoach
 */
export function dpsFromSpeedMpsAndSpm(speedMps: number, spm: number): number {
  if (!(spm > 0) || !Number.isFinite(speedMps)) return 0;
  return speedMps / (spm / 60);
}

/** `speedMmS` in mm/s, `spmX100` = SPM * 100 → returns DPS * 100 for wire payloads. */
export function dpsX100FromSpeedMmSAndSpmX100(speedMmS: number, spmX100: number): number {
  const spm = spmX100 / 100;
  const dps = dpsFromSpeedMpsAndSpm(speedMmS / 1000, spm);
  return Math.max(0, Math.min(0xffff, Math.round(dps * 100)));
}
