// IUGG mean Earth radius. Pace/distance work is insensitive to the few-ppm
// difference between this and the equatorial radius.
export const EARTH_RADIUS_M = 6_371_008.8;

interface LatLon {
  lat: number;
  lon: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversine(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// Centered moving average. The window shrinks symmetrically at the edges
// (radius = min(radius, i, n-1-i)) so a perfectly linear input is returned
// unchanged. A naive edge-clamped average would pull the first/last samples
// toward their neighbours and deflate elevation gain at the ends of a climb.
export function smooth(values: number[], radius: number): number[] {
  const n = values.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const r = Math.min(radius, i, n - 1 - i);
    let sum = 0;
    for (let j = i - r; j <= i + r; j++) sum += values[j];
    out[i] = sum / (2 * r + 1);
  }
  return out;
}
