import * as dgram from "node:dgram";

export type UdpSenderOptions = {
  host: string;
  port: number;
};

/**
 * Sends one complete encoded frame per UDP datagram (see PROTOCOL.md).
 */
export class UdpSenderTransport {
  private socket: dgram.Socket | null = null;

  constructor(private readonly opts: UdpSenderOptions) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = dgram.createSocket("udp4");
      this.socket = s;
      s.once("error", reject);
      s.connect(this.opts.port, this.opts.host, () => resolve());
    });
  }

  sendFrame(frame: Uint8Array): Promise<void> {
    const s = this.socket;
    if (!s) return Promise.reject(new Error("UdpSenderTransport not started"));
    return new Promise((resolve, reject) => {
      s.send(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength), (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  stop(): Promise<void> {
    const s = this.socket;
    this.socket = null;
    if (!s) return Promise.resolve();
    return new Promise((resolve) => s.close(() => resolve()));
  }
}
