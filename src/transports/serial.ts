import type { FleetHub } from "../session/fleet-hub.js";

/**
 * Minimal structural type matching what we need from the `serialport` package
 * (and from any node `Duplex` stream used in tests). We avoid a static import
 * of `serialport` so the dependency stays truly optional.
 */
export type SerialPortLike = {
  on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
  on(event: "error", listener: (err: Error) => void): unknown;
  on(event: "close", listener: () => void): unknown;
  write(data: Uint8Array, cb?: (err?: Error | null) => void): boolean;
  close(cb?: (err?: Error | null) => void): unknown;
};

export type SerialPortTransportOptions = {
  hub: FleetHub;
  /**
   * Either provide a fully-constructed serialport-compatible stream...
   * (used by tests with a `Duplex` stub, or by callers that want to manage
   * the port lifecycle themselves).
   */
  port?: SerialPortLike;
  /**
   * ...or pass `path` (and optionally `baudRate`) to have `start()` open
   * the system serial port via the `serialport` npm package on demand.
   */
  path?: string;
  baudRate?: number;
  /** Called for asynchronous port errors after `start()` resolves. */
  onError?: (err: Error) => void;
};

/**
 * Reads bytes from a USB CDC / UART link (typically a BoatConnect BLE Mesh
 * gateway) and feeds them into a per-connection `FrameParser`, dispatching
 * decoded frames via `FleetHub.ingestDecoded`. Mirrors the multi-stream
 * pattern used by `TcpServerTransport`, so multiple gateways can share a
 * single hub safely.
 */
export class SerialPortTransport {
  private port: SerialPortLike | null = null;
  private readonly parser: ReturnType<FleetHub["createStreamParser"]>;

  constructor(private readonly opts: SerialPortTransportOptions) {
    this.parser = opts.hub.createStreamParser();
  }

  async start(): Promise<void> {
    let port = this.opts.port;
    if (!port) {
      if (!this.opts.path) {
        throw new Error("SerialPortTransport requires either `port` or `path`");
      }
      const mod = (await import("serialport")) as {
        SerialPort: new (init: { path: string; baudRate: number }) => SerialPortLike;
      };
      port = new mod.SerialPort({
        path: this.opts.path,
        baudRate: this.opts.baudRate ?? 115200,
      });
    }
    this.port = port;
    port.on("data", (chunk: Uint8Array) => {
      this.parser.push(chunk, (frame) => this.opts.hub.ingestDecoded(frame));
    });
    port.on("error", (err) => {
      this.opts.onError?.(err);
    });
  }

  send(frame: Uint8Array): Promise<void> {
    const port = this.port;
    if (!port) return Promise.reject(new Error("SerialPortTransport not started"));
    return new Promise((resolve, reject) => {
      port.write(frame, (err) => (err ? reject(err) : resolve()));
    });
  }

  stop(): Promise<void> {
    const port = this.port;
    this.port = null;
    if (!port) return Promise.resolve();
    return new Promise((resolve, reject) => {
      port.close((err) => (err ? reject(err) : resolve()));
    });
  }

  /** Bytes buffered in the per-port stream parser awaiting a complete frame. */
  pendingBytes(): number {
    return this.parser.pendingLength();
  }
}
