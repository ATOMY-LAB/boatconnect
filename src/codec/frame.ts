import {
  CRC_SIZE,
  FRAME_HEADER_SIZE,
  FRAME_MAGIC,
  MAX_PAYLOAD_LEN,
  PROTOCOL_VERSION,
} from "./constants.js";
import { crc32 } from "./crc32.js";
import { BoatConnectError } from "./errors.js";
import { decodeTelemetrySummary, encodeTelemetrySummary } from "./payload.js";
import { MessageType } from "../types/message-type.js";
import type { DecodedFrame } from "../types/frame.js";
import type { TelemetrySummary } from "../types/telemetry.js";

export type EncodeFrameInput = {
  version?: number;
  msgType: number;
  flags?: number;
  boatId: number;
  seq: number;
  payload?: Uint8Array;
};

function writeHeader(
  out: Uint8Array,
  version: number,
  msgType: number,
  flags: number,
  boatId: number,
  seq: number,
  payloadLen: number,
): void {
  out.set(FRAME_MAGIC, 0);
  out[4] = version & 0xff;
  out[5] = msgType & 0xff;
  out[6] = flags & 0xff;
  out[7] = 0;
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  dv.setUint32(8, boatId >>> 0, true);
  dv.setUint32(12, seq >>> 0, true);
  dv.setUint16(16, payloadLen & 0xffff, true);
}

export function encodeFrame(input: EncodeFrameInput): Uint8Array {
  const version = input.version ?? PROTOCOL_VERSION;
  const flags = input.flags ?? 0;
  const payload = input.payload ?? new Uint8Array(0);
  if (payload.byteLength > MAX_PAYLOAD_LEN) {
    throw new BoatConnectError(
      `payload length ${payload.byteLength} exceeds MAX_PAYLOAD_LEN ${MAX_PAYLOAD_LEN}`,
      "PAYLOAD_LENGTH",
    );
  }
  const total = FRAME_HEADER_SIZE + payload.byteLength + CRC_SIZE;
  const out = new Uint8Array(total);
  writeHeader(out, version, input.msgType, flags, input.boatId, input.seq, payload.byteLength);
  out.set(payload, FRAME_HEADER_SIZE);
  const crc = crc32(out.subarray(0, FRAME_HEADER_SIZE + payload.byteLength));
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  dv.setUint32(FRAME_HEADER_SIZE + payload.byteLength, crc, true);
  return out;
}

export function encodeHeartbeat(input: Omit<EncodeFrameInput, "msgType" | "payload">): Uint8Array {
  return encodeFrame({ ...input, msgType: MessageType.heartbeat, payload: new Uint8Array(0) });
}

export function encodeTelemetrySummaryFrame(
  meta: Omit<EncodeFrameInput, "msgType" | "payload">,
  telemetry: TelemetrySummary,
): Uint8Array {
  const payload = encodeTelemetrySummary(telemetry);
  return encodeFrame({ ...meta, msgType: MessageType.telemetrySummary, payload });
}

export function decodeFrame(buffer: Uint8Array): DecodedFrame {
  if (buffer.byteLength < FRAME_HEADER_SIZE + CRC_SIZE) {
    throw new BoatConnectError("frame too short", "TRUNCATED");
  }
  for (let i = 0; i < 4; i++) {
    if (buffer[i] !== FRAME_MAGIC[i]) {
      throw new BoatConnectError("bad magic", "MAGIC");
    }
  }
  const version = buffer[4]!;
  if (version !== PROTOCOL_VERSION) {
    throw new BoatConnectError(`unsupported version ${version}`, "VERSION");
  }
  const msgType = buffer[5]!;
  const flags = buffer[6]!;
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const boatId = dv.getUint32(8, true);
  const seq = dv.getUint32(12, true);
  const payloadLen = dv.getUint16(16, true);
  if (payloadLen > MAX_PAYLOAD_LEN) {
    throw new BoatConnectError(`payload length ${payloadLen} too large`, "PAYLOAD_LENGTH");
  }
  const endPayload = FRAME_HEADER_SIZE + payloadLen;
  if (buffer.byteLength < endPayload + CRC_SIZE) {
    throw new BoatConnectError("frame truncated", "TRUNCATED");
  }
  const expectedCrc = dv.getUint32(endPayload, true);
  const actualCrc = crc32(buffer.subarray(0, endPayload));
  if (expectedCrc !== actualCrc) {
    throw new BoatConnectError("crc mismatch", "CRC");
  }
  const rawPayload = buffer.subarray(FRAME_HEADER_SIZE, endPayload);

  const base = { version, msgType, flags, boatId, seq, rawPayload } as const;

  if (msgType === MessageType.heartbeat) {
    if (rawPayload.byteLength !== 0) {
      throw new BoatConnectError("heartbeat must have empty payload", "PAYLOAD_LENGTH");
    }
    return { ...base, msgType: MessageType.heartbeat };
  }
  if (msgType === MessageType.telemetrySummary) {
    const telemetry = decodeTelemetrySummary(rawPayload);
    return { ...base, msgType: MessageType.telemetrySummary, telemetry };
  }
  return { ...base, msgType };
}

/** Slice containing exactly one full frame, or null if buffer does not yet contain a full frame. */
export function trySliceOneFrame(buffer: Uint8Array): { frame: Uint8Array; rest: Uint8Array } | null {
  if (buffer.byteLength < FRAME_HEADER_SIZE + CRC_SIZE) return null;
  for (let i = 0; i < 4; i++) {
    if (buffer[i] !== FRAME_MAGIC[i]) return null;
  }
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const payloadLen = dv.getUint16(16, true);
  if (payloadLen > MAX_PAYLOAD_LEN) return null;
  const total = FRAME_HEADER_SIZE + payloadLen + CRC_SIZE;
  if (buffer.byteLength < total) return null;
  return {
    frame: buffer.subarray(0, total),
    rest: buffer.subarray(total),
  };
}
