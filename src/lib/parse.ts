import { gpx } from '@tmcw/togeojson';
import type { TrackPoint } from '../types';

export function parseGpx(xmlString: string): TrackPoint[] {
  const doc = new DOMParser().parseFromString(xmlString, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid XML: ' + (parseError.textContent?.trim() ?? 'parse error'));
  }

  if (doc.documentElement.tagName.toLowerCase() !== 'gpx') {
    throw new Error(`Expected a GPX file but got <${doc.documentElement.tagName}>`);
  }

  const geojson = gpx(doc);
  const points: TrackPoint[] = [];

  for (const feature of geojson.features) {
    if (!feature.geometry) continue;

    const coordProps = feature.properties?.coordinateProperties as
      | Record<string, unknown>
      | undefined;

    if (feature.geometry.type === 'LineString') {
      const times = (coordProps?.times ?? []) as string[];
      const coords = feature.geometry.coordinates;
      for (let i = 0; i < coords.length; i++) {
        const coord = coords[i];
        points.push({
          lon: coord[0],
          lat: coord[1],
          ele: coord.length > 2 ? coord[2] : undefined,
          time: times[i] ? new Date(times[i]) : undefined,
        });
      }
    } else if (feature.geometry.type === 'MultiLineString') {
      const allTimes = (coordProps?.times ?? []) as string[][];
      const segments = feature.geometry.coordinates;
      for (let si = 0; si < segments.length; si++) {
        const segment = segments[si];
        const times = allTimes[si] ?? [];
        for (let i = 0; i < segment.length; i++) {
          const coord = segment[i];
          points.push({
            lon: coord[0],
            lat: coord[1],
            ele: coord.length > 2 ? coord[2] : undefined,
            time: times[i] ? new Date(times[i]) : undefined,
          });
        }
      }
    }
  }

  return points;
}
