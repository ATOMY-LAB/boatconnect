import assert from "node:assert/strict";
import test from "node:test";
import { encodeHeartbeat, FleetHub } from "../dist/index.js";

test("FleetHub feedDatagram dispatches subscribers", () => {
  const hub = new FleetHub();
  const seen: number[] = [];
  const off = hub.subscribe(({ frame }) => seen.push(frame.seq));
  const pkt = encodeHeartbeat({ boatId: 9, seq: 3 });
  hub.feedDatagram(pkt);
  assert.deepEqual(seen, [3]);
  off();
  hub.feedDatagram(encodeHeartbeat({ boatId: 9, seq: 4 }));
  assert.deepEqual(seen, [3]);
});

test("FleetHub getLast returns latest per boat", () => {
  const hub = new FleetHub();
  hub.feedDatagram(encodeHeartbeat({ boatId: 1, seq: 1 }));
  hub.feedDatagram(encodeHeartbeat({ boatId: 2, seq: 10 }));
  hub.feedDatagram(encodeHeartbeat({ boatId: 1, seq: 2 }));
  assert.equal(hub.getLast(1)?.seq, 2);
  assert.equal(hub.getLast(2)?.seq, 10);
});
