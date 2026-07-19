import { EARTH_RADIUS_M } from './geo';
import type { TrackPoint } from '../types';

export interface ENUPoint {
  e: number; // east, meters from origin
  n: number; // north, meters from origin
  u: number; // up, meters of elevation above origin (× exaggeration)
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

// Equirectangular East/North meters of an arbitrary lon/lat relative to an
// origin lat/lon. Shared by the track projection and the satellite ground drape
// so the route and the map plane sit in the same local frame.
export function lonLatToEN(
  lon: number,
  lat: number,
  originLat: number,
  originLon: number,
): { e: number; n: number } {
  const cosLat0 = Math.cos(toRad(originLat));
  return {
    e: EARTH_RADIUS_M * (toRad(lon) - toRad(originLon)) * cosLat0,
    n: EARTH_RADIUS_M * (toRad(lat) - toRad(originLat)),
  };
}

// Equirectangular ENU projection relative to the track origin (first point).
// Over the span of a single GPX track this is accurate to well under a percent,
// and it keeps the math pure and cheap. `up` is elevation relative to the
// origin scaled by `exaggeration` so terrain reads at the horizontal scale of a
// run. Points missing `<ele>` carry forward the last known elevation so a gap
// in the data doesn't punch a hole in the ribbon.
export function projectToENU(points: TrackPoint[], exaggeration = 1): ENUPoint[] {
  if (points.length === 0) return [];

  const { lat: lat0, lon: lon0 } = points[0];

  let ele = points.find((p) => p.ele !== undefined)?.ele ?? 0;
  const ele0 = ele;

  return points.map((p) => {
    if (p.ele !== undefined) ele = p.ele;
    const { e, n } = lonLatToEN(p.lon, p.lat, lat0, lon0);
    return { e, n, u: (ele - ele0) * exaggeration };
  });
}
