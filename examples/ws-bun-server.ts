/**
 * Bun-only: WebSocket server that treats each binary message as a TCP-style byte stream chunk
 * (frames may be split across messages; `FleetHub` + `FrameParser` reassemble).
 *
 *   bun examples/ws-bun-server.ts
 */
import { FleetHub } from "../src/session/fleet-hub.ts";
import { FrameParser } from "../src/codec/stream-parser.ts";

const port = Number(process.env.PORT ?? "9200");
const hub = new FleetHub();
const parsers = new Map<object, FrameParser>();

hub.subscribe(({ boatId, frame }) => {
  console.log("[fleet]", boatId, "type", frame.msgType, "seq", frame.seq);
});

Bun.serve({
  port,
  fetch(_req, server) {
    const upgraded = server.upgrade(_req);
    if (upgraded) return undefined;
    return new Response("Use WebSocket (binary frames)", { status: 426 });
  },
  websocket: {
    open(ws) {
      parsers.set(ws, new FrameParser());
      console.log("ws client connected");
    },
    message(ws, message) {
      const parser = parsers.get(ws);
      if (!parser) return;
      const push = (chunk: Uint8Array) =>
        parser.push(chunk, (frame) => hub.ingestDecoded(frame));
      if (message instanceof ArrayBuffer) {
        push(new Uint8Array(message));
      } else if (ArrayBuffer.isView(message)) {
        push(new Uint8Array(message.buffer, message.byteOffset, message.byteLength));
      }
    },
    close(ws) {
      parsers.delete(ws);
      console.log("ws client disconnected");
    },
  },
});

console.log(`WebSocket on ws://localhost:${port} (send binary chunks)`);
