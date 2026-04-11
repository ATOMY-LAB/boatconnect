import type { TelemetrySummary } from "./telemetry.js";

export type DecodedFrameBase = {
  version: number;
  msgType: number;
  flags: number;
  boatId: number;
  seq: number;
  rawPayload: Uint8Array;
};

export type DecodedHeartbeat = DecodedFrameBase & {
  msgType: 0;
};

export type DecodedTelemetrySummary = DecodedFrameBase & {
  msgType: 1;
  telemetry: TelemetrySummary;
};

export type DecodedUnknown = DecodedFrameBase & {
  msgType: number;
};

export type DecodedFrame = DecodedHeartbeat | DecodedTelemetrySummary | DecodedUnknown;
