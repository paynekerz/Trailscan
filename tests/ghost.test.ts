import {
  buildGhostTrack,
  elapsedSeconds,
  positionAt,
  bboxIoU,
  boundingBox,
  routesSimilar,
  routeSimilarity,
} from '../src/lib/ghost';
import type { TrackPoint } from '../src/types';

const t = (s: number) => new Date(Date.UTC(2020, 0, 1, 0, 0, s));

// Three colinear points along the equator, evenly spaced in lon, ele, and time.
const track: TrackPoint[] = [
  { lat: 0, lon: 0, ele: 100, time: t(0) },
  { lat: 0, lon: 0.001, ele: 110, time: t(60) },
  { lat: 0, lon: 0.002, ele: 120, time: t(120) },
];

describe('elapsedSeconds', () => {
  it('returns seconds-from-start per point', () => {
    expect(elapsedSeconds(track)).toEqual([0, 60, 120]);
  });

  it('returns null when there is no time data', () => {
    expect(elapsedSeconds([{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }])).toBeNull();
  });

  it('returns null when every timestamp is equal (route export)', () => {
    const flat: TrackPoint[] = [
      { lat: 0, lon: 0, time: t(0) },
      { lat: 0, lon: 0.001, time: t(0) },
    ];
    expect(elapsedSeconds(flat)).toBeNull();
  });

  it('carries forward over a missing intermediate timestamp', () => {
    const sparse: TrackPoint[] = [
      { lat: 0, lon: 0, time: t(0) },
      { lat: 0, lon: 0.001 },
      { lat: 0, lon: 0.002, time: t(120) },
    ];
    expect(elapsedSeconds(sparse)).toEqual([0, 0, 120]);
  });
});

describe('positionAt', () => {
  const g = buildGhostTrack(track);

  it('returns the start at distance 0', () => {
    const s = positionAt(g, 0);
    expect(s.lat).toBeCloseTo(0, 9);
    expect(s.lon).toBeCloseTo(0, 9);
    expect(s.ele).toBeCloseTo(100, 9);
    expect(s.elapsed).toBeCloseTo(0, 9);
  });

  it('returns the finish at total distance', () => {
    const s = positionAt(g, g.total);
    expect(s.lon).toBeCloseTo(0.002, 9);
    expect(s.ele).toBeCloseTo(120, 9);
    expect(s.elapsed).toBeCloseTo(120, 9);
  });

  it('clamps beyond the route to the finish', () => {
    expect(positionAt(g, g.total + 5000).elapsed).toBeCloseTo(120, 9);
  });

  it('lands exactly on the middle point at its cumulative distance', () => {
    const s = positionAt(g, g.cumDists[1]);
    expect(s.lon).toBeCloseTo(0.001, 9);
    expect(s.ele).toBeCloseTo(110, 9);
    expect(s.elapsed).toBeCloseTo(60, 9);
  });

  it('interpolates linearly between two points', () => {
    const s = positionAt(g, g.cumDists[1] / 2);
    expect(s.lon).toBeCloseTo(0.0005, 9);
    expect(s.ele).toBeCloseTo(105, 9);
    expect(s.elapsed).toBeCloseTo(30, 9);
  });

  it('reports null elapsed when the track has no usable time', () => {
    const noTime = buildGhostTrack([
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0.001 },
    ]);
    expect(positionAt(noTime, noTime.total).elapsed).toBeNull();
  });

  it('reports null ele when elevation is absent', () => {
    const noEle = buildGhostTrack([
      { lat: 0, lon: 0, time: t(0) },
      { lat: 0, lon: 0.001, time: t(60) },
    ]);
    expect(positionAt(noEle, noEle.total).ele).toBeNull();
  });
});

describe('bboxIoU / route similarity', () => {
  const square = (lat: number, lon: number): TrackPoint[] => [
    { lat, lon },
    { lat: lat + 0.01, lon: lon + 0.01 },
  ];

  it('is 1 for identical bounding boxes', () => {
    const a = boundingBox(square(0, 0));
    expect(bboxIoU(a, a)).toBeCloseTo(1, 9);
  });

  it('is 0 for disjoint bounding boxes', () => {
    expect(bboxIoU(boundingBox(square(0, 0)), boundingBox(square(10, 10)))).toBe(0);
  });

  it('is between 0 and 1 for partial overlap', () => {
    const iou = bboxIoU(boundingBox(square(0, 0)), boundingBox(square(0.005, 0.005)));
    expect(iou).toBeGreaterThan(0);
    expect(iou).toBeLessThan(1);
  });

  it('treats the same route as similar and a far-away route as dissimilar', () => {
    const routeA = square(40, -105);
    expect(routesSimilar(routeA, routeA)).toBe(true);
    expect(routesSimilar(routeA, square(37, -119))).toBe(false);
    expect(routeSimilarity(routeA, routeA)).toBeCloseTo(1, 9);
  });
});
