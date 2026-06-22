import type { PaceMetric, Split, TrackMetrics, TrackPoint } from '../types';
import { haversine, smooth } from './geo';

// Raw GPS elevation is noisy; averaging over this many points on each side
// removes sample-to-sample jitter before gain/loss is summed. Symmetric edge
// handling (see smooth) keeps a linear climb exact.
export const ELEVATION_SMOOTHING_RADIUS = 2;

// A segment slower than this is treated as stopped and excluded from moving
// time. ~0.5 m/s sits below a slow walk: fast enough to drop GPS jitter while
// standing still, slow enough to keep genuine slow movement.
export const MOVING_SPEED_THRESHOLD_MPS = 0.5;

const METERS_PER_KM = 1000;
export const METERS_PER_MILE = 1609.344;

export function totalDistance(points: TrackPoint[]): number {
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    distance += haversine(points[i - 1], points[i]);
  }
  return distance;
}

export function elevationGainLoss(
  points: TrackPoint[],
): { gain: number; loss: number } | null {
  if (points.length < 2 || !points.every((p) => p.ele !== undefined)) return null;

  const smoothed = smooth(
    points.map((p) => p.ele as number),
    ELEVATION_SMOOTHING_RADIUS,
  );

  let gain = 0;
  let loss = 0;
  for (let i = 1; i < smoothed.length; i++) {
    const delta = smoothed[i] - smoothed[i - 1];
    if (delta > 0) gain += delta;
    else loss -= delta;
  }
  return { gain, loss };
}

export function elapsedTime(points: TrackPoint[]): number | null {
  if (points.length < 2) return null;
  const start = points[0].time;
  const end = points[points.length - 1].time;
  if (!start || !end) return null;
  // A track whose every <time> is identical (route exports, manually-stamped
  // files) has no real elapsed time — treat it as absent, not zero, so all
  // time-derived metrics degrade together instead of showing a bogus 0:00.
  const seconds = (end.getTime() - start.getTime()) / 1000;
  return seconds > 0 ? seconds : null;
}

export function movingTime(points: TrackPoint[]): number | null {
  let moving = 0;
  let counted = false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a.time || !b.time) continue;
    const dt = (b.time.getTime() - a.time.getTime()) / 1000;
    if (dt <= 0) continue;
    counted = true;
    if (haversine(a, b) / dt >= MOVING_SPEED_THRESHOLD_MPS) moving += dt;
  }
  return counted ? moving : null;
}

function paceFor(distance: number, seconds: number): PaceMetric | null {
  if (distance <= 0 || seconds <= 0) return null;
  return {
    secondsPerKm: seconds / (distance / METERS_PER_KM),
    secondsPerMile: seconds / (distance / METERS_PER_MILE),
  };
}

// Returns the pace in s/km for the incoming segment at each point.
// Point 0 is always null (no preceding segment). Stopped or degenerate segments are null.
export function computePointPaces(points: TrackPoint[]): (number | null)[] {
  const paces: (number | null)[] = [null];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a.time || !b.time) { paces.push(null); continue; }
    const dt = (b.time.getTime() - a.time.getTime()) / 1000;
    if (dt <= 0) { paces.push(null); continue; }
    const d = haversine(a, b);
    if (d < 1) { paces.push(null); continue; }
    const mps = d / dt;
    if (mps < MOVING_SPEED_THRESHOLD_MPS) { paces.push(null); continue; }
    paces.push(1000 / mps);
  }
  return paces;
}

// Smoothed instantaneous pace at a point, for a live playback readout. The
// window expands symmetrically until it spans at least minWindowSeconds so the
// number doesn't jitter on a single noisy GPS segment. Distances come from a
// precomputed cumulative array (same indexing as points). Null when stopped,
// degenerate, or time is unavailable.
export function instantPaceAt(
  points: TrackPoint[],
  cumulativeDist: number[],
  index: number,
  minWindowSeconds = 4,
): PaceMetric | null {
  const n = points.length;
  if (n < 2 || index < 0 || index >= n || !points[index].time) return null;

  let lo = index;
  let hi = index;
  for (;;) {
    const loT = points[lo].time;
    const hiT = points[hi].time;
    if (!loT || !hiT) return null;
    if ((hiT.getTime() - loT.getTime()) / 1000 >= minWindowSeconds) break;
    const canLo = lo > 0;
    const canHi = hi < n - 1;
    if (!canLo && !canHi) break;
    if (canLo) lo--;
    if (canHi) hi++;
  }

  const dt = (points[hi].time!.getTime() - points[lo].time!.getTime()) / 1000;
  const dd = cumulativeDist[hi] - cumulativeDist[lo];
  if (dt <= 0 || dd <= 0) return null;
  const mps = dd / dt;
  if (mps < MOVING_SPEED_THRESHOLD_MPS) return null;
  return { secondsPerKm: METERS_PER_KM / mps, secondsPerMile: METERS_PER_MILE / mps };
}

export function computeSplits(points: TrackPoint[], splitDistanceMeters: number): Split[] {
  if (points.length < 2) return [];

  const splits: Split[] = [];
  let nextBoundary = splitDistanceMeters;
  let cumulativeDist = 0;
  let splitStartIdx = 0;
  let splitStartCumDist = 0;
  let splitNum = 1;

  const recordSplit = (endIdx: number): void => {
    const start = points[splitStartIdx];
    const end = points[endIdx];
    const splitDist = cumulativeDist - splitStartCumDist;
    if (splitDist <= 0) return;

    let durationSeconds: number | null = null;
    if (start.time && end.time) {
      const dt = (end.time.getTime() - start.time.getTime()) / 1000;
      if (dt > 0) durationSeconds = dt;
    }

    const elevationChangeMeters =
      start.ele !== undefined && end.ele !== undefined ? end.ele - start.ele : null;

    const pace: PaceMetric | null =
      durationSeconds !== null
        ? {
            secondsPerKm: durationSeconds / (splitDist / 1000),
            secondsPerMile: durationSeconds / (splitDist / METERS_PER_MILE),
          }
        : null;

    splits.push({
      index: splitNum++,
      distanceMeters: splitDist,
      durationSeconds,
      pace,
      elevationChangeMeters,
      startPointIndex: splitStartIdx,
      endPointIndex: endIdx,
    });

    splitStartIdx = endIdx;
    splitStartCumDist = cumulativeDist;
    nextBoundary = cumulativeDist + splitDistanceMeters;
  };

  for (let i = 1; i < points.length; i++) {
    cumulativeDist += haversine(points[i - 1], points[i]);
    if (cumulativeDist >= nextBoundary) {
      recordSplit(i);
    }
  }

  if (splitStartIdx < points.length - 1) {
    recordSplit(points.length - 1);
  }

  return splits;
}

export function computeMetrics(points: TrackPoint[]): TrackMetrics {
  const distance = totalDistance(points);
  const elapsed = elapsedTime(points);
  const moving = movingTime(points);
  const elevation = elevationGainLoss(points);

  return {
    distance,
    elapsedTime: elapsed,
    movingTime: moving,
    elevationGain: elevation?.gain ?? null,
    elevationLoss: elevation?.loss ?? null,
    avgPace: elapsed !== null ? paceFor(distance, elapsed) : null,
    avgMovingPace: moving !== null ? paceFor(distance, moving) : null,
  };
}
