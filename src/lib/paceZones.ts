import type { PaceZone } from '../types';

// Standard running pace zones defined in seconds per km.
// Zone 5 is fastest (<4:00/km), zone 1 is slowest (>7:30/km).
const ZONE_BOUNDS: [PaceZone, number][] = [
  [5, 240],     // < 4:00/km
  [4, 300],     // 4:00–5:00/km
  [3, 360],     // 5:00–6:00/km
  [2, 450],     // 6:00–7:30/km
  [1, Infinity], // > 7:30/km
];

export const PACE_ZONE_COLORS: Record<PaceZone, string> = {
  5: '#ef4444',
  4: '#f97316',
  3: '#eab308',
  2: '#22c55e',
  1: '#60a5fa',
};

export const PACE_ZONE_LABELS: Record<PaceZone, string> = {
  5: 'Z5 · VO₂Max (<4:00/km)',
  4: 'Z4 · Threshold (4–5:00/km)',
  3: 'Z3 · Moderate (5–6:00/km)',
  2: 'Z2 · Easy (6–7:30/km)',
  1: 'Z1 · Recovery (>7:30/km)',
};

export function getPaceZone(secondsPerKm: number): PaceZone {
  for (const [zone, upper] of ZONE_BOUNDS) {
    if (secondsPerKm < upper) return zone;
  }
  return 1;
}
