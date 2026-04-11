import * as dgram from "node:dgram";
import type { FleetHub } from "../session/fleet-hub.js";

export type UdpListenerOptions = {
  port: number;
  address?: string;
  hub: FleetHub;
};

/**
 * UDP listener: each datagram must be one full encoded frame.
 */
export class UdpListenerTransport {
  private socket: dgram.Socket | null = null;

  constructor(private readonly opts: UdpListenerOptions) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = dgram.createSocket("udp4");
      this.socket = s;
      s.on("message", (msg: Buffer) => {
        this.opts.hub.feedDatagram(new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength));
      });
      s.once("error", reject);
      s.bind(this.opts.port, this.opts.address ?? "0.0.0.0", () => resolve());
    });
  }

  stop(): Promise<void> {
    const s = this.socket;
    this.socket = null;
    if (!s) return Promise.resolve();
    return new Promise((resolve) => s.close(() => resolve()));
  }
}
