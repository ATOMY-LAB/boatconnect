import { decodeFrame } from "./frame.js";
import { trySliceOneFrame } from "./frame.js";
import { FRAME_MAGIC } from "./constants.js";
import type { DecodedFrame } from "../types/frame.js";

export type FrameHandler = (frame: DecodedFrame) => void;

function alignToMagic(buf: Uint8Array): Uint8Array {
  if (buf.byteLength < 4) return buf;
  for (let i = 0; i <= buf.byteLength - 4; i++) {
    if (
      buf[i] === FRAME_MAGIC[0] &&
      buf[i + 1] === FRAME_MAGIC[1] &&
      buf[i + 2] === FRAME_MAGIC[2] &&
      buf[i + 3] === FRAME_MAGIC[3]
    ) {
      return i === 0 ? buf : buf.subarray(i);
    }
  }
  return buf.subarray(buf.byteLength - 3);
}

/**
 * Incrementally parses length-prefixed frames from a byte stream (TCP / WebSocket binary).
 */
export class FrameParser {
  /** `subarray()` is typed with `ArrayBufferLike`; keep field wide so TS 5.7+ accepts it. */
  private buf: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  push(chunk: Uint8Array, onFrame: FrameHandler): void {
    const next = new Uint8Array(this.buf.byteLength + chunk.byteLength);
    next.set(this.buf, 0);
    next.set(chunk, this.buf.byteLength);
    this.buf = alignToMagic(next);

    while (this.buf.byteLength > 0) {
      const sliced = trySliceOneFrame(this.buf);
      if (!sliced) {
        this.buf = alignToMagic(this.buf);
        break;
      }
      this.buf = sliced.rest;
      onFrame(decodeFrame(sliced.frame));
    }
  }

  reset(): void {
    this.buf = new Uint8Array(0);
  }

  /** Bytes waiting for a complete frame (for debugging). */
  pendingLength(): number {
    return this.buf.byteLength;
  }
}
