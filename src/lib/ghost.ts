import type { TrackPoint } from '../types';
import { cumulativeDistances } from './geo';

// A track prepared for the ghost race: full-resolution points plus the
// precomputed cumulative-distance and elapsed-seconds axes the race samples
// against. Alignment is by distance-along-route, so `cumDists` is the primary
// axis; `elapsed` lets the race report the time each runner took to reach a
// given distance (the time-delta readout).
export interface GhostTrack {
  points: TrackPoint[];
  cumDists: number[];
  elapsed: number[] | null; // seconds from start per point; null when no usable time
  total: number; // total route distance in meters
}

export interface GhostSample {
  lat: number;
  lon: number;
  ele: number | null;
  elapsed: number | null; // seconds from start to reach `distance`; null when no usable time
}

// Seconds-from-start per point, carry-forward over missing intermediate
// timestamps (same convention as Playback). Returns null when the track has no
// start time OR when every timestamp is equal (route exports) — in both cases
// there is no usable elapsed clock, so the race shows distances only.
export function elapsedSeconds(points: TrackPoint[]): number[] | null {
  const n = points.length;
  if (n === 0) return null;
  const t0 = points[0].time?.getTime();
  if (t0 == null) return null;
  const arr = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const ti = points[i].time?.getTime();
    arr[i] = ti == null ? (i > 0 ? arr[i - 1] : 0) : (ti - t0) / 1000;
  }
  return arr[n - 1] > 0 ? arr : null;
}

export function buildGhostTrack(points: TrackPoint[]): GhostTrack {
  const cumDists = cumulativeDistances(points);
  return {
    points,
    cumDists,
    elapsed: elapsedSeconds(points),
    total: cumDists[cumDists.length - 1] ?? 0,
  };
}

// Interpolate a track's state at a given distance-along-route (meters). Clamps
// to [0, total]; linearly interpolates lat/lon/ele/elapsed between the two
// points bracketing that distance. This is the only novel algorithm in the
// ghost race — both ghosts are advanced by the same distance, then their
// elapsed times are compared.
export function positionAt(track: GhostTrack, distance: number): GhostSample {
  const { points, cumDists, elapsed, total } = track;
  const n = points.length;
  if (n === 0) return { lat: 0, lon: 0, ele: null, elapsed: null };

  const d = Math.max(0, Math.min(distance, total));

  let lo: number;
  let hi: number;
  if (d <= 0) {
    lo = 0;
    hi = Math.min(1, n - 1);
  } else if (d >= total) {
    lo = Math.max(0, n - 2);
    hi = n - 1;
  } else {
    let a = 0;
    let b = n - 1;
    while (b - a > 1) {
      const mid = (a + b) >> 1;
      if (cumDists[mid] <= d) a = mid;
      else b = mid;
    }
    lo = a;
    hi = b;
  }

  const seg = cumDists[hi] - cumDists[lo];
  const frac = seg > 0 ? (d - cumDists[lo]) / seg : 0;
  const pLo = points[lo];
  const pHi = points[hi];

  return {
    lat: pLo.lat + (pHi.lat - pLo.lat) * frac,
    lon: pLo.lon + (pHi.lon - pLo.lon) * frac,
    ele:
      pLo.ele !== undefined && pHi.ele !== undefined
        ? pLo.ele + (pHi.ele - pLo.ele) * frac
        : null,
    elapsed: elapsed ? elapsed[lo] + (elapsed[hi] - elapsed[lo]) * frac : null,
  };
}

interface BBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export function boundingBox(points: TrackPoint[]): BBox {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

// Intersection-over-union of two bounding boxes (0..1). Cheap proxy for "are
// these the same course" — two runs of the same route share nearly all of
// their bounding box; runs in different places barely overlap. Two identical
// degenerate (zero-area) boxes count as fully similar.
export function bboxIoU(a: BBox, b: BBox): number {
  const ix = Math.max(0, Math.min(a.maxLon, b.maxLon) - Math.max(a.minLon, b.minLon));
  const iy = Math.max(0, Math.min(a.maxLat, b.maxLat) - Math.max(a.minLat, b.minLat));
  const inter = ix * iy;
  const areaA = (a.maxLon - a.minLon) * (a.maxLat - a.minLat);
  const areaB = (b.maxLon - b.minLon) * (b.maxLat - b.minLat);
  const union = areaA + areaB - inter;
  if (union > 0) return inter / union;
  // Both boxes are degenerate (single point / straight line): similar only if
  // they coincide.
  return a.minLat === b.minLat && a.maxLat === b.maxLat && a.minLon === b.minLon && a.maxLon === b.maxLon
    ? 1
    : 0;
}

// Below this bbox-IoU the two tracks are treated as different courses and the
// race is soft-blocked (a distance-aligned race between unrelated routes is
// meaningless).
export const ROUTE_SIMILARITY_THRESHOLD = 0.3;

export function routeSimilarity(a: TrackPoint[], b: TrackPoint[]): number {
  return bboxIoU(boundingBox(a), boundingBox(b));
}

export function routesSimilar(
  a: TrackPoint[],
  b: TrackPoint[],
  threshold = ROUTE_SIMILARITY_THRESHOLD,
): boolean {
  return routeSimilarity(a, b) >= threshold;
}
