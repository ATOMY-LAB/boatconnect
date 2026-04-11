import * as net from "node:net";
import type { FleetHub } from "../session/fleet-hub.js";

export type TcpClientOptions = {
  host: string;
  port: number;
  hub: FleetHub;
};

/**
 * TCP client: pushes all received bytes into the hub's stream parser.
 * Send pre-encoded frames from `encodeFrame` / helpers.
 */
export class TcpClientTransport {
  private socket: net.Socket | null = null;

  constructor(private readonly opts: TcpClientOptions) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host: this.opts.host, port: this.opts.port }, () => {
        this.socket = s;
        resolve();
      });
      s.on("data", (buf: Buffer) => {
        this.opts.hub.feedStream(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      });
      s.once("error", reject);
    });
  }

  send(frame: Uint8Array): Promise<void> {
    const sock = this.socket;
    if (!sock) return Promise.reject(new Error("TcpClientTransport not connected"));
    return new Promise((resolve, reject) => {
      sock.write(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength), (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  close(): Promise<void> {
    const sock = this.socket;
    this.socket = null;
    if (!sock) return Promise.resolve();
    return new Promise((resolve) => {
      sock.end(() => resolve());
    });
  }
}
