import type { PaceMetric, TrackMetrics, TrackPoint } from '../types';
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
const METERS_PER_MILE = 1609.344;

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
  return (end.getTime() - start.getTime()) / 1000;
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
