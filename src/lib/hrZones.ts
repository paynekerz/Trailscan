import type { HrZone, TrackPoint } from '../types';

// No user profile exists in the app, so the max HR is user-editable and seeded
// with this default (≈ 220 − 30). Zones are derived as a % of it.
export const DEFAULT_MAX_HR = 190;

export const HR_ZONE_COLORS: Record<HrZone, string> = {
  1: '#9ca3af',
  2: '#3b82f6',
  3: '#22c55e',
  4: '#f97316',
  5: '#ef4444',
};

export const HR_ZONE_LABELS: Record<HrZone, string> = {
  1: 'Z1 · Recovery',
  2: 'Z2 · Easy',
  3: 'Z3 · Aerobic',
  4: 'Z4 · Threshold',
  5: 'Z5 · Maximum',
};

// Standard %-of-max-HR zone model. Lower bounds: Z1 50%, Z2 60%, Z3 70%,
// Z4 80%, Z5 90%. Anything below 50% folds into Z1.
export function getHrZone(hr: number, maxHr: number): HrZone {
  const pct = hr / maxHr;
  if (pct >= 0.9) return 5;
  if (pct >= 0.8) return 4;
  if (pct >= 0.7) return 3;
  if (pct >= 0.6) return 2;
  return 1;
}

// Seconds spent in each HR zone, indexed 1..5 (index 0 is unused padding).
// A sample's inter-point duration is credited to the zone of its own HR. When
// timestamps are absent, each sample contributes 1 (sample-count weighting) so
// the distribution still renders meaningfully.
export function timeInHrZones(points: TrackPoint[], maxHr: number): number[] {
  const totals = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const hr = points[i].hr;
    if (hr === undefined) continue;
    let weight = 1;
    const prev = points[i - 1];
    const cur = points[i].time;
    if (i > 0 && prev.time && cur) {
      const dt = (cur.getTime() - prev.time.getTime()) / 1000;
      if (dt > 0) weight = dt;
    }
    totals[getHrZone(hr, maxHr)] += weight;
  }
  return totals;
}
