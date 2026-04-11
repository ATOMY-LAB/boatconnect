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

test("FleetHub lastSeen and stale", () => {
  const hub = new FleetHub();
  assert.equal(hub.getLastSeenMs(1), undefined);
  assert.equal(hub.isStale(1, 1000), true);
  hub.feedDatagram(encodeHeartbeat({ boatId: 1, seq: 1 }));
  const seen = hub.getLastSeenMs(1);
  assert.ok(typeof seen === "number");
  assert.equal(hub.isStale(1, 1000, seen! + 500), false);
  assert.equal(hub.isStale(1, 1000, seen! + 2000), true);
  hub.clearBoat(1);
  assert.equal(hub.getLast(1), undefined);
  assert.equal(hub.getLastSeenMs(1), undefined);
});

test("FleetHub snapshotLastSeenMs and resetAll", () => {
  const hub = new FleetHub();
  hub.feedDatagram(encodeHeartbeat({ boatId: 1, seq: 1 }));
  hub.feedDatagram(encodeHeartbeat({ boatId: 2, seq: 1 }));
  const snap = hub.snapshotLastSeenMs();
  assert.equal(snap.size, 2);
  assert.ok(typeof snap.get(1) === "number");
  snap.set(1, 0);
  assert.notEqual(hub.getLastSeenMs(1), 0);

  hub.resetAll();
  assert.equal(hub.getLast(1), undefined);
  assert.equal(hub.getLastSeenMs(1), undefined);
  assert.equal(hub.snapshotLastSeenMs().size, 0);
});
