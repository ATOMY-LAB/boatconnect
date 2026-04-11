import { FleetHub } from "../src/session/fleet-hub.ts";
import { UdpListenerTransport } from "../src/transports/udp-listener.ts";

const port = Number(process.env.PORT ?? "9100");
const hub = new FleetHub();

hub.subscribe(({ boatId, frame }) => {
  console.log("boat", boatId, "msgType", frame.msgType, "seq", frame.seq);
  if (frame.msgType === 1 && "telemetry" in frame) {
    console.log("  speedMmS", frame.telemetry.speedMmS);
  }
});

const udp = new UdpListenerTransport({ port, hub });
await udp.start();
console.log(`UDP listening on :${port} (one frame per datagram)`);
