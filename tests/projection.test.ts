import { projectToENU } from '../src/lib/projection';
import { haversine } from '../src/lib/geo';
import type { TrackPoint } from '../src/types';

describe('projectToENU', () => {
  it('returns an empty array for no points', () => {
    expect(projectToENU([])).toEqual([]);
  });

  it('places the origin at (0, 0, 0)', () => {
    const pts: TrackPoint[] = [{ lat: 39.0, lon: -94.5, ele: 300 }];
    const [o] = projectToENU(pts);
    expect(o.e).toBeCloseTo(0, 6);
    expect(o.n).toBeCloseTo(0, 6);
    expect(o.u).toBeCloseTo(0, 6);
  });

  it('maps increasing longitude to +east and increasing latitude to +north', () => {
    const pts: TrackPoint[] = [
      { lat: 39.0, lon: -94.5 },
      { lat: 39.0, lon: -94.49 }, // due east
      { lat: 39.01, lon: -94.5 }, // due north
    ];
    const [, east, north] = projectToENU(pts);
    expect(east.e).toBeGreaterThan(0);
    expect(east.n).toBeCloseTo(0, 3);
    expect(north.n).toBeGreaterThan(0);
    expect(north.e).toBeCloseTo(0, 3);
  });

  it('horizontal distance matches haversine within 1%', () => {
    const a: TrackPoint = { lat: 39.0, lon: -94.5 };
    const b: TrackPoint = { lat: 39.02, lon: -94.47 };
    const [pa, pb] = projectToENU([a, b]);
    const planar = Math.hypot(pb.e - pa.e, pb.n - pa.n);
    const great = haversine(a, b);
    expect(Math.abs(planar - great) / great).toBeLessThan(0.01);
  });

  it('applies elevation exaggeration to the up axis', () => {
    const pts: TrackPoint[] = [
      { lat: 39.0, lon: -94.5, ele: 100 },
      { lat: 39.001, lon: -94.5, ele: 150 },
    ];
    const [, hi] = projectToENU(pts, 3);
    expect(hi.u).toBeCloseTo(150, 6); // (150 - 100) * 3
  });

  it('carries forward the last known elevation across gaps', () => {
    const pts: TrackPoint[] = [
      { lat: 39.0, lon: -94.5, ele: 100 },
      { lat: 39.001, lon: -94.5 }, // missing ele
      { lat: 39.002, lon: -94.5, ele: 120 },
    ];
    const [, gap] = projectToENU(pts, 1);
    expect(gap.u).toBeCloseTo(0, 6); // carries 100 → 100 - 100 = 0
  });

  it('uses the first defined elevation as the origin reference', () => {
    const pts: TrackPoint[] = [
      { lat: 39.0, lon: -94.5 }, // origin missing ele
      { lat: 39.001, lon: -94.5, ele: 250 },
    ];
    const [origin, next] = projectToENU(pts, 1);
    expect(origin.u).toBeCloseTo(0, 6); // origin references the first known ele (250)
    expect(next.u).toBeCloseTo(0, 6); // 250 - 250 = 0
  });
});
