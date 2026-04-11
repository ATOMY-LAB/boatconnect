import assert from "node:assert/strict";
import test from "node:test";
import {
  dpsFromSpeedMpsAndSpm,
  dpsX100FromSpeedMmSAndSpmX100,
  latLonToE7,
  speedMpsToMmS,
  spmToX100,
  StrokeRateEstimator,
} from "../dist/index.js";

test("dpsFromSpeedMpsAndSpm", () => {
  assert.equal(dpsFromSpeedMpsAndSpm(3, 60), 3);
  assert.equal(dpsFromSpeedMpsAndSpm(3, 0), 0);
  assert.equal(dpsFromSpeedMpsAndSpm(3, -1), 0);
});

test("dpsX100FromSpeedMmSAndSpmX100", () => {
  // Wire: DPS in m/stroke × 100 (PROTOCOL.md). 3 m/s @ 60 SPM → 3 m/stroke → 300.
  assert.equal(dpsX100FromSpeedMmSAndSpmX100(3000, 60_00), 300);
  // 3 m/s @ 72 SPM → 2.5 m/stroke → 250 (matches README quick-usage numbers).
  assert.equal(dpsX100FromSpeedMmSAndSpmX100(3000, 72_00), 250);
});

test("telemetry scale helpers", () => {
  assert.equal(latLonToE7(22.5863047), 225_863_047);
  assert.equal(speedMpsToMmS(3.5), 3500);
  assert.equal(spmToX100(72.3), 7230);
});

test("StrokeRateEstimator detects peaks and SPM", () => {
  const est = new StrokeRateEstimator({ threshold: 5, minPeakIntervalMs: 500, spmWindowMs: 10_000 });
  const base = 1000;
  const series = [
    [0, 0],
    [100, 2],
    [200, 8],
    [300, 2],
    [800, 2],
    [900, 9],
    [1000, 1],
  ] as const;
  let strokes = 0;
  for (const [dt, v] of series) {
    if (est.pushSample(base + dt, v)) strokes++;
  }
  assert.equal(strokes, 2);
  const spm = est.spmAt(base + 1000);
  assert.ok(spm > 0);
});
