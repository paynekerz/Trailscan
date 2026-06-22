import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGpx } from '../src/lib/parse';
import {
  computeMetrics,
  elapsedTime,
  elevationGainLoss,
  instantPaceAt,
  movingTime,
  totalDistance,
} from '../src/lib/metrics';
import { cumulativeDistances } from '../src/lib/geo';
import type { TrackPoint } from '../src/types';

const fixture = (name: string) =>
  parseGpx(readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf-8'));

describe('metrics — flat-run.gpx (20 pts, ~2111m, flat)', () => {
  const points = fixture('flat-run.gpx');

  it('total distance ≈ 2112.7m', () => {
    expect(totalDistance(points)).toBeCloseTo(2112.7, 0);
  });

  it('flat course has zero gain and loss', () => {
    expect(elevationGainLoss(points)).toEqual({ gain: 0, loss: 0 });
  });

  it('elapsed time is 570s (9.5 min)', () => {
    expect(elapsedTime(points)).toBe(570);
  });

  it('moving time equals elapsed (no stops)', () => {
    expect(movingTime(points)).toBe(570);
  });

  it('avg pace and avg moving pace match with no stops', () => {
    const m = computeMetrics(points);
    expect(m.avgPace?.secondsPerKm).toBeCloseTo(269.8, 0);
    expect(m.avgPace).toEqual(m.avgMovingPace);
  });
});

describe('metrics — big-climb.gpx (21 pts, +1000m linear)', () => {
  const points = fixture('big-climb.gpx');

  it('total distance ≈ 2223.9m', () => {
    expect(totalDistance(points)).toBeCloseTo(2223.9, 0);
  });

  // The smoothing window must not deflate a linear climb: official gain 1000m.
  it('elevation gain is exactly 1000m, loss 0m', () => {
    const e = elevationGainLoss(points);
    expect(e?.gain).toBeCloseTo(1000, 6);
    expect(e?.loss).toBeCloseTo(0, 6);
  });

  it('elapsed and moving time are both 1200s', () => {
    expect(elapsedTime(points)).toBe(1200);
    expect(movingTime(points)).toBe(1200);
  });
});

describe('metrics — no-elevation.gpx (10 pts, no ele)', () => {
  const points = fixture('no-elevation.gpx');

  it('distance still computes ≈ 1000.8m', () => {
    expect(totalDistance(points)).toBeCloseTo(1000.8, 0);
  });

  it('elevation gain/loss is null (degrades gracefully)', () => {
    expect(elevationGainLoss(points)).toBeNull();
  });

  it('computeMetrics reports null elevation but real distance/pace', () => {
    const m = computeMetrics(points);
    expect(m.elevationGain).toBeNull();
    expect(m.elevationLoss).toBeNull();
    expect(m.distance).toBeGreaterThan(0);
    expect(m.avgPace?.secondsPerKm).toBeGreaterThan(0);
  });
});

describe('metrics — noisy-elevation.gpx (flat truth + GPS jitter)', () => {
  const points = fixture('noisy-elevation.gpx');

  const rawGain = (() => {
    let g = 0;
    for (let i = 1; i < points.length; i++) {
      const d = (points[i].ele as number) - (points[i - 1].ele as number);
      if (d > 0) g += d;
    }
    return g;
  })();

  it('raw (unsmoothed) gain is badly inflated by noise (~80m)', () => {
    expect(rawGain).toBeCloseTo(80.3, 1);
  });

  it('smoothing rejects most of the noise (~18.7m, a >70% cut)', () => {
    const smoothedGain = elevationGainLoss(points)?.gain as number;
    expect(smoothedGain).toBeCloseTo(18.65, 1);
    expect(smoothedGain).toBeLessThan(rawGain * 0.3);
  });
});

describe('moving time vs elapsed time', () => {
  // Two 30s moving segments around a 300s stop at a fixed location.
  const points: TrackPoint[] = [
    { lat: 40.0, lon: -105.0, time: new Date('2024-01-01T00:00:00Z') },
    { lat: 40.001, lon: -105.0, time: new Date('2024-01-01T00:00:30Z') },
    { lat: 40.001, lon: -105.0, time: new Date('2024-01-01T00:05:30Z') },
    { lat: 40.002, lon: -105.0, time: new Date('2024-01-01T00:06:00Z') },
  ];

  it('excludes the stopped segment from moving time', () => {
    expect(elapsedTime(points)).toBe(360);
    expect(movingTime(points)).toBe(60);
  });
});

describe('instantPaceAt — live playback readout', () => {
  // 10 points, 30s apart. First half ~3.33 m/s (5:00/km), second half ~6.67 m/s
  // (2:30/km) by doubling the per-segment latitude step.
  const points: TrackPoint[] = Array.from({ length: 10 }, (_, i) => ({
    lat: 40.0 + (i < 5 ? i * 0.001 : 0.005 + (i - 5) * 0.002),
    lon: -105.0,
    time: new Date(Date.parse('2024-01-01T00:00:00Z') + i * 30_000),
  }));
  const dists = cumulativeDistances(points);

  it('reads a faster pace in the fast half than the slow half', () => {
    const slow = instantPaceAt(points, dists, 2)!;
    const fast = instantPaceAt(points, dists, 7)!;
    expect(slow.secondsPerKm).toBeGreaterThan(fast.secondsPerKm);
    expect(fast.secondsPerKm).toBeCloseTo(slow.secondsPerKm / 2, -1);
  });

  it('returns null while stopped', () => {
    const stopped: TrackPoint[] = [
      { lat: 40.0, lon: -105.0, time: new Date('2024-01-01T00:00:00Z') },
      { lat: 40.0, lon: -105.0, time: new Date('2024-01-01T00:00:30Z') },
      { lat: 40.0, lon: -105.0, time: new Date('2024-01-01T00:01:00Z') },
    ];
    expect(instantPaceAt(stopped, cumulativeDistances(stopped), 1)).toBeNull();
  });

  it('returns null when timestamps are absent', () => {
    const noTime: TrackPoint[] = [
      { lat: 40.0, lon: -105.0 },
      { lat: 40.001, lon: -105.0 },
    ];
    expect(instantPaceAt(noTime, cumulativeDistances(noTime), 1)).toBeNull();
  });
});

describe('metrics — missing timestamps', () => {
  const points: TrackPoint[] = [
    { lat: 40.0, lon: -105.0, ele: 1000 },
    { lat: 40.001, lon: -105.0, ele: 1010 },
  ];

  it('returns null times and null pace, but real distance and elevation', () => {
    const m = computeMetrics(points);
    expect(m.elapsedTime).toBeNull();
    expect(m.movingTime).toBeNull();
    expect(m.avgPace).toBeNull();
    expect(m.avgMovingPace).toBeNull();
    expect(m.distance).toBeGreaterThan(0);
    expect(m.elevationGain).toBeCloseTo(10, 6);
  });
});

describe('metrics — all timestamps identical (route export)', () => {
  // Every point shares one timestamp (e.g. Badwater-135.gpx) — no real elapsed
  // time, so every time-derived metric must degrade to null, not a bogus 0:00.
  const t = new Date('2023-07-11T18:16:01Z');
  const points: TrackPoint[] = [
    { lat: 36.0, lon: -116.0, ele: 100, time: t },
    { lat: 36.001, lon: -116.0, ele: 110, time: t },
    { lat: 36.002, lon: -116.0, ele: 120, time: t },
  ];

  it('treats elapsed time as absent and yields no pace, but keeps distance/elevation', () => {
    const m = computeMetrics(points);
    expect(elapsedTime(points)).toBeNull();
    expect(m.elapsedTime).toBeNull();
    expect(m.movingTime).toBeNull();
    expect(m.avgPace).toBeNull();
    expect(m.avgMovingPace).toBeNull();
    expect(m.distance).toBeGreaterThan(0);
    expect(m.elevationGain).toBeCloseTo(20, 6);
  });
});
