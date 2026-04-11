import { decodeFrame } from "../codec/frame.js";
import { FrameParser } from "../codec/stream-parser.js";
import type { DecodedFrame } from "../types/frame.js";

export type FleetFrameEvent = { boatId: number; frame: DecodedFrame };

export type FleetListener = (event: FleetFrameEvent) => void;

/**
 * Multiplexes decoded frames from UDP datagrams and from one or more **independent** byte streams.
 * Keeps the latest frame per `boatId` for snapshot queries.
 */
export class FleetHub {
  /** Shared parser for a single stream only (e.g. one `TcpClientTransport`). */
  private readonly parser = new FrameParser();
  private readonly listeners = new Set<FleetListener>();
  private readonly lastByBoat = new Map<number, DecodedFrame>();
  /** Wall-clock ms (`Date.now()`) when each boat last emitted a frame. */
  private readonly lastSeenMs = new Map<number, number>();

  /**
   * Feed bytes from **one** TCP/WebSocket connection. Do not interleave multiple sockets here;
   * use a dedicated `FrameParser` per socket and call `ingestDecoded` instead.
   */
  feedStream(chunk: Uint8Array): void {
    this.parser.push(chunk, (frame) => this.dispatch(frame));
  }

  /** One complete binary frame per UDP datagram. */
  feedDatagram(datagram: Uint8Array): void {
    const frame = decodeFrame(datagram);
    this.dispatch(frame);
  }

  /** Apply an already-decoded frame (e.g. from a per-connection `FrameParser`). */
  ingestDecoded(frame: DecodedFrame): void {
    this.dispatch(frame);
  }

  private dispatch(frame: DecodedFrame): void {
    this.lastByBoat.set(frame.boatId, frame);
    this.lastSeenMs.set(frame.boatId, Date.now());
    for (const l of this.listeners) l({ boatId: frame.boatId, frame });
  }

  subscribe(listener: FleetListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getLast(boatId: number): DecodedFrame | undefined {
    return this.lastByBoat.get(boatId);
  }

  /** Last `Date.now()` when a frame was observed for this boat, or undefined if never seen. */
  getLastSeenMs(boatId: number): number | undefined {
    return this.lastSeenMs.get(boatId);
  }

  /** True if the boat was never seen or its last frame is older than `maxAgeMs` (relative to `Date.now()`). */
  isStale(boatId: number, maxAgeMs: number, nowMs: number = Date.now()): boolean {
    const t = this.lastSeenMs.get(boatId);
    if (t === undefined) return true;
    return nowMs - t > maxAgeMs;
  }

  snapshot(): Map<number, DecodedFrame> {
    return new Map(this.lastByBoat);
  }

  snapshotLastSeenMs(): Map<number, number> {
    return new Map(this.lastSeenMs);
  }

  clearBoat(boatId: number): void {
    this.lastByBoat.delete(boatId);
    this.lastSeenMs.delete(boatId);
  }

  resetAll(): void {
    this.lastByBoat.clear();
    this.lastSeenMs.clear();
    this.parser.reset();
  }

  resetParser(): void {
    this.parser.reset();
  }

  pendingStreamBytes(): number {
    return this.parser.pendingLength();
  }
}
