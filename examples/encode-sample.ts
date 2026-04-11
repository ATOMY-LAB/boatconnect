import {
  decodeFrame,
  encodeHeartbeat,
  encodeTelemetrySummaryFrame,
} from "../src/index.ts";

const hb = encodeHeartbeat({ boatId: 7, seq: 1 });
console.log("heartbeat bytes:", hb.length, hb);

const tel = encodeTelemetrySummaryFrame(
  { boatId: 7, seq: 2 },
  {
    timestampMs: 1_234_567n,
    latE7: 225863047,
    lonE7: 1139744550,
    speedMmS: 3_500,
    spmX100: 7_200,
    dpsX100: 292,
    telemetryFlags: 1,
  },
);
console.log("telemetry bytes:", tel.length);

const decoded = decodeFrame(tel);
if (decoded.msgType === 1 && "telemetry" in decoded) {
  console.log("decoded SPM (human):", decoded.telemetry.spmX100 / 100);
}
