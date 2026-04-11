import assert from "node:assert/strict";
import test from "node:test";
import {
  crc32,
  decodeFrame,
  encodeHeartbeat,
  encodeTelemetrySummaryFrame,
  FRAME_HEADER_SIZE,
  FrameParser,
} from "../dist/index.js";

test("heartbeat roundtrip", () => {
  const raw = encodeHeartbeat({ boatId: 42, seq: 99, flags: 0 });
  const f = decodeFrame(raw);
  assert.equal(f.msgType, 0);
  assert.equal(f.boatId, 42);
  assert.equal(f.seq, 99);
  assert.equal(f.rawPayload.byteLength, 0);
});

test("telemetry summary roundtrip", () => {
  const raw = encodeTelemetrySummaryFrame(
    { boatId: 3, seq: 10 },
    {
      timestampMs: 999n,
      latE7: -33_000_000,
      lonE7: 151_000_000,
      speedMmS: 4_000,
      spmX100: 6_000,
      dpsX100: 1_234,
      telemetryFlags: 1,
    },
  );
  const f = decodeFrame(raw);
  assert.equal(f.msgType, 1);
  if (f.msgType !== 1 || !("telemetry" in f)) throw new Error("expected telemetry");
  assert.equal(f.telemetry.timestampMs, 999n);
  assert.equal(f.telemetry.latE7, -33_000_000);
  assert.equal(f.telemetry.spmX100, 6_000);
});

test("crc failure", () => {
  const raw = encodeHeartbeat({ boatId: 1, seq: 1 });
  const corrupt = new Uint8Array(raw);
  corrupt[corrupt.byteLength - 1] ^= 0xff;
  assert.throws(() => decodeFrame(corrupt), /crc/i);
});

test("FrameParser splits across chunks", () => {
  const a = encodeHeartbeat({ boatId: 5, seq: 1 });
  const b = encodeTelemetrySummaryFrame(
    { boatId: 5, seq: 2 },
    {
      timestampMs: 1n,
      latE7: 0,
      lonE7: 0,
      speedMmS: 0,
      spmX100: 0,
      dpsX100: 0,
      telemetryFlags: 0,
    },
  );
  const combined = new Uint8Array(a.length + b.length);
  combined.set(a, 0);
  combined.set(b, a.length);

  const mid = FRAME_HEADER_SIZE + 3;
  const p1 = combined.subarray(0, mid);
  const p2 = combined.subarray(mid);

  const got: number[] = [];
  const parser = new FrameParser();
  parser.push(p1, (f) => got.push(f.msgType));
  parser.push(p2, (f) => got.push(f.msgType));
  assert.deepEqual(got, [0, 1]);
});

test("crc32 matches known vector", () => {
  const data = new TextEncoder().encode("123456789");
  assert.equal(crc32(data), 0xcbf43926);
});
