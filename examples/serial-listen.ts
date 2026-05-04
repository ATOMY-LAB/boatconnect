/**
 * Read BTC1 frames from a BoatConnect BLE Mesh gateway over USB CDC / UART.
 * The gateway forwards received vendor-model payloads (one full frame each)
 * to its UART verbatim; we feed those bytes into the FleetHub stream parser.
 *
 *   PORT=/dev/ttyACM0 bun examples/serial-listen.ts        # macOS / Linux
 *   PORT=COM5         bun examples/serial-listen.ts        # Windows
 */
import { FleetHub } from "../src/session/fleet-hub.ts";
import { SerialPortTransport } from "../src/transports/serial.ts";

const path = process.env.PORT ?? "/dev/ttyACM0";
const baudRate = Number(process.env.BAUD ?? "115200");

const hub = new FleetHub({
  onDecodeError: (e) => console.warn("decode", e.code, e.message),
});

hub.subscribe(({ boatId, frame }) => {
  console.log(`[boat ${boatId}] msgType=${frame.msgType} seq=${frame.seq}`);
  if (frame.msgType === 1 && "telemetry" in frame) {
    const t = frame.telemetry;
    console.log(
      `  speed=${(t.speedMmS / 1000).toFixed(2)} m/s spm=${(t.spmX100 / 100).toFixed(2)} dps=${(t.dpsX100 / 100).toFixed(2)}`,
    );
  }
});

const serial = new SerialPortTransport({
  hub,
  path,
  baudRate,
  onError: (err) => console.error("serial error:", err.message),
});

await serial.start();
console.log(`SerialPortTransport listening on ${path} @ ${baudRate} baud`);
