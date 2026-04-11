/**
 * Listen for inbound TCP connections and decode frames into FleetHub (stdout logs).
 * Each client socket uses its own `FrameParser` (safe for multiple simultaneous connections).
 *
 *   bun examples/tcp-server.ts
 */
import { FleetHub } from "../src/session/fleet-hub.ts";
import { TcpServerTransport } from "../src/transports/tcp-server.ts";

const port = Number(process.env.PORT ?? "9000");
const hub = new FleetHub();

hub.subscribe(({ boatId, frame }) => {
  console.log(`[boat ${boatId}] msgType=${frame.msgType} seq=${frame.seq}`);
  if (frame.msgType === 1 && "telemetry" in frame) {
    const t = frame.telemetry;
    console.log(
      `  t=${t.timestampMs} latE7=${t.latE7} lonE7=${t.lonE7} speedMmS=${t.speedMmS} spm=${(t.spmX100 / 100).toFixed(2)}`,
    );
  }
});

const srv = new TcpServerTransport({ port, hub });
await srv.start();
console.log(`TCP server listening on 0.0.0.0:${port}`);
