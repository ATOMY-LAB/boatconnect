/** Decoded `telemetrySummary` payload (see PROTOCOL.md). */
export type TelemetrySummary = {
  timestampMs: bigint;
  latE7: number;
  lonE7: number;
  speedMmS: number;
  spmX100: number;
  dpsX100: number;
  telemetryFlags: number;
};

export const TelemetryFlag = {
  gpsFix: 1 << 0,
} as const;
