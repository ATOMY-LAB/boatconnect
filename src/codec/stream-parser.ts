import { decodeFrame, trySliceOneFrame } from "./frame.js";
import { FRAME_MAGIC } from "./constants.js";
import { BoatConnectError } from "./errors.js";
import type { DecodedFrame } from "../types/frame.js";

export type FrameHandler = (frame: DecodedFrame) => void;

export type FrameParserOptions = {
  /** When set, decode failures are reported here and the bad frame is skipped; otherwise errors propagate. */
  onDecodeError?: (err: BoatConnectError) => void;
};

/** Move bytes so the buffer starts at magic (or keep last 3 bytes if no magic). Returns new used length. */
function alignMagicFront(buf: Uint8Array, len: number): number {
  if (len < 4) return len;
  for (let i = 0; i <= len - 4; i++) {
    if (
      buf[i] === FRAME_MAGIC[0] &&
      buf[i + 1] === FRAME_MAGIC[1] &&
      buf[i + 2] === FRAME_MAGIC[2] &&
      buf[i + 3] === FRAME_MAGIC[3]
    ) {
      if (i > 0) buf.copyWithin(0, i, len);
      return len - i;
    }
  }
  buf.copyWithin(0, len - 3, len);
  return 3;
}

/**
 * Incrementally parses length-prefixed frames from a byte stream (TCP / WebSocket binary).
 */
export class FrameParser {
  /** `subarray()` is typed with `ArrayBufferLike`; keep field wide so TS 5.7+ accepts it. */
  private buf: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private len = 0;
  private readonly onDecodeError?: (err: BoatConnectError) => void;

  constructor(options?: FrameParserOptions) {
    this.onDecodeError = options?.onDecodeError;
  }

  push(chunk: Uint8Array, onFrame: FrameHandler): void {
    const need = this.len + chunk.byteLength;
    if (need > this.buf.byteLength) {
      let cap = this.buf.byteLength || 64;
      while (cap < need) cap *= 2;
      const next = new Uint8Array(cap);
      if (this.len > 0) next.set(this.buf.subarray(0, this.len), 0);
      this.buf = next;
    }
    this.buf.set(chunk, this.len);
    this.len = need;

    this.len = alignMagicFront(this.buf, this.len);

    while (this.len > 0) {
      const window = this.buf.subarray(0, this.len);
      const sliced = trySliceOneFrame(window);
      if (!sliced) {
        this.len = alignMagicFront(this.buf, this.len);
        break;
      }
      const frameLen = sliced.frame.byteLength;
      try {
        onFrame(decodeFrame(sliced.frame));
      } catch (e) {
        if (e instanceof BoatConnectError) {
          if (this.onDecodeError) this.onDecodeError(e);
          else throw e;
        } else {
          throw e;
        }
      }
      this.buf.copyWithin(0, frameLen, this.len);
      this.len -= frameLen;
    }
  }

  reset(): void {
    this.buf = new Uint8Array(0);
    this.len = 0;
  }

  /** Bytes waiting for a complete frame (for debugging). */
  pendingLength(): number {
    return this.len;
  }
}
