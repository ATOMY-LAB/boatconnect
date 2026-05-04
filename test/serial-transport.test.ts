import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import {
  encodeHeartbeat,
  encodeTelemetrySummaryFrame,
  FleetHub,
  FRAME_HEADER_SIZE,
  SerialPortTransport,
  type SerialPortLike,
} from "../dist/index.js";

/**
 * Tiny `Duplex`-like stub matching `SerialPortLike`. Listeners are managed via
 * an EventEmitter; tests drive the read side with `pushData` and observe the
 * write side via the `written` array.
 */
class FakeSerialPort extends EventEmitter implements SerialPortLike {
  written: Uint8Array[] = [];
  closed = false;
  pushData(chunk: Uint8Array): void {
    this.emit("data", chunk);
  }
  override on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }
  write(data: Uint8Array, cb?: (err?: Error | null) => void): boolean {
    this.written.push(data);
    cb?.(null);
    return true;
  }
  close(cb?: (err?: Error | null) => void): unknown {
    this.closed = true;
    this.emit("close");
    cb?.(null);
    return undefined;
  }
}

test("SerialPortTransport ingests one full frame from a single chunk", async () => {
  const hub = new FleetHub();
  const port = new FakeSerialPort();
  const t = new SerialPortTransport({ hub, port });
  await t.start();

  port.pushData(encodeHeartbeat({ boatId: 11, seq: 1 }));
  assert.equal(hub.getLast(11)?.seq, 1);

  await t.stop();
  assert.equal(port.closed, true);
});

test("SerialPortTransport reassembles a frame split across chunks", async () => {
  const hub = new FleetHub();
  const port = new FakeSerialPort();
  const t = new SerialPortTransport({ hub, port });
  await t.start();

  const frame = encodeTelemetrySummaryFrame(
    { boatId: 7, seq: 42 },
    {
      timestampMs: 123n,
      latE7: 0,
      lonE7: 0,
      speedMmS: 4500,
      spmX100: 7000,
      dpsX100: 250,
      telemetryFlags: 0,
    },
  );
  const mid = FRAME_HEADER_SIZE + 5;
  port.pushData(frame.subarray(0, mid));
  assert.equal(hub.getLast(7), undefined, "no frame yet -- waiting for the rest");
  assert.ok(t.pendingBytes() > 0);
  port.pushData(frame.subarray(mid));

  const got = hub.getLast(7);
  assert.equal(got?.seq, 42);
  if (got?.msgType !== 1 || !("telemetry" in got)) throw new Error("expected telemetry");
  assert.equal(got.telemetry.speedMmS, 4500);

  await t.stop();
});

test("SerialPortTransport demultiplexes frames from multiple boats in one chunk", async () => {
  const hub = new FleetHub();
  const port = new FakeSerialPort();
  const t = new SerialPortTransport({ hub, port });
  await t.start();

  const a = encodeHeartbeat({ boatId: 1, seq: 1 });
  const b = encodeHeartbeat({ boatId: 2, seq: 9 });
  const c = encodeHeartbeat({ boatId: 1, seq: 2 });
  const combined = new Uint8Array(a.length + b.length + c.length);
  combined.set(a, 0);
  combined.set(b, a.length);
  combined.set(c, a.length + b.length);
  port.pushData(combined);

  assert.equal(hub.getLast(1)?.seq, 2);
  assert.equal(hub.getLast(2)?.seq, 9);

  await t.stop();
});

test("SerialPortTransport.send proxies to port.write", async () => {
  const hub = new FleetHub();
  const port = new FakeSerialPort();
  const t = new SerialPortTransport({ hub, port });
  await t.start();

  const frame = encodeHeartbeat({ boatId: 5, seq: 1 });
  await t.send(frame);
  assert.equal(port.written.length, 1);
  assert.deepEqual(port.written[0], frame);

  await t.stop();
});

test("SerialPortTransport surfaces async port errors via onError", async () => {
  const hub = new FleetHub();
  const port = new FakeSerialPort();
  const errors: string[] = [];
  const t = new SerialPortTransport({
    hub,
    port,
    onError: (err) => errors.push(err.message),
  });
  await t.start();

  port.emit("error", new Error("boom"));
  assert.deepEqual(errors, ["boom"]);

  await t.stop();
});

test("SerialPortTransport.send rejects when not started", async () => {
  const hub = new FleetHub();
  const port = new FakeSerialPort();
  const t = new SerialPortTransport({ hub, port });
  await assert.rejects(
    () => t.send(encodeHeartbeat({ boatId: 1, seq: 1 })),
    /not started/,
  );
});
