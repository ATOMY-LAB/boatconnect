import * as net from "node:net";
import type { FleetHub } from "../session/fleet-hub.js";

export type TcpServerOptions = {
  host?: string;
  port: number;
  hub: FleetHub;
};

/**
 * TCP server: each accepted socket uses its own `FrameParser` and forwards decoded frames via `hub.ingestDecoded`.
 * Useful for bench tests and firmware that opens an outbound TCP connection to the coach machine.
 */
export class TcpServerTransport {
  private server: net.Server | null = null;

  constructor(private readonly opts: TcpServerOptions) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const srv = net.createServer((socket) => {
        const parser = this.opts.hub.createStreamParser();
        socket.on("data", (buf: Buffer) => {
          parser.push(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), (frame) =>
            this.opts.hub.ingestDecoded(frame),
          );
        });
      });
      this.server = srv;
      srv.once("error", reject);
      srv.listen(this.opts.port, this.opts.host ?? "0.0.0.0", () => resolve());
    });
  }

  stop(): Promise<void> {
    const s = this.server;
    this.server = null;
    if (!s) return Promise.resolve();
    return new Promise((resolve, reject) => {
      s.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
