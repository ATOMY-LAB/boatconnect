/**
 * Send a sample heartbeat + telemetry frame via UDP (one datagram per frame).
 *
 *   bun examples/udp-send.ts
 *   set HOST=192.168.4.1&& set PORT=9100&& bun examples/udp-send.ts
 */
import { encodeHeartbeat, encodeTelemetrySummaryFrame } from "../src/index.ts";
import { UdpSenderTransport } from "../src/transports/udp-sender.ts";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "9100");

const udp = new UdpSenderTransport({ host, port });
await udp.start();

const hb = encodeHeartbeat({ boatId: 1, seq: 1 });
await udp.sendFrame(hb);
console.log("sent heartbeat", hb.length, "bytes to", host, port);

const tel = encodeTelemetrySummaryFrame(
  { boatId: 1, seq: 2 },
  {
    timestampMs: BigInt(Date.now()),
    latE7: 225863047,
    lonE7: 1139744550,
    speedMmS: 3500,
    spmX100: 7200,
    dpsX100: 292,
    telemetryFlags: 1,
  },
);
await udp.sendFrame(tel);
console.log("sent telemetry", tel.length, "bytes");

await udp.stop();
