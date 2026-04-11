import { BoatConnectError } from "./errors.js";
import type { TelemetrySummary } from "../types/telemetry.js";

export const TELEMETRY_SUMMARY_PAYLOAD_SIZE = 26;

export function encodeTelemetrySummary(t: TelemetrySummary): Uint8Array {
  const out = new Uint8Array(TELEMETRY_SUMMARY_PAYLOAD_SIZE);
  const dv = new DataView(out.buffer);
  dv.setBigUint64(0, t.timestampMs, true);
  dv.setInt32(8, t.latE7, true);
  dv.setInt32(12, t.lonE7, true);
  dv.setUint32(16, t.speedMmS >>> 0, true);
  dv.setUint16(20, t.spmX100 & 0xffff, true);
  dv.setUint16(22, t.dpsX100 & 0xffff, true);
  dv.setUint16(24, t.telemetryFlags & 0xffff, true);
  return out;
}

export function decodeTelemetrySummary(payload: Uint8Array): TelemetrySummary {
  if (payload.byteLength !== TELEMETRY_SUMMARY_PAYLOAD_SIZE) {
    throw new BoatConnectError(
      `telemetrySummary payload must be ${TELEMETRY_SUMMARY_PAYLOAD_SIZE} bytes, got ${payload.byteLength}`,
      "TELEMETRY_PAYLOAD_SIZE",
    );
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    timestampMs: dv.getBigUint64(0, true),
    latE7: dv.getInt32(8, true),
    lonE7: dv.getInt32(12, true),
    speedMmS: dv.getUint32(16, true),
    spmX100: dv.getUint16(20, true),
    dpsX100: dv.getUint16(22, true),
    telemetryFlags: dv.getUint16(24, true),
  };
}
