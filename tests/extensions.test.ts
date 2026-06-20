import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractExtensions, mergeExtensions } from '../src/lib/extensions';
import type { TrackPoint } from '../src/types';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf-8');

describe('extractExtensions', () => {
  it('pulls HR and cadence from every trkpt in document order', () => {
    const ext = extractExtensions(fixture('flat-run.gpx'));
    expect(ext).toHaveLength(20);
    expect(ext[0]).toEqual({ hr: 142, cad: 87 });
    expect(ext.every((e) => typeof e.hr === 'number' && typeof e.cad === 'number')).toBe(true);
  });

  it('returns empty entries when no gpxtpx data is present', () => {
    const ext = extractExtensions(fixture('big-climb.gpx'));
    expect(ext.every((e) => e.hr === undefined && e.cad === undefined)).toBe(true);
  });

  it('matches gpxtpx by localName regardless of prefix', () => {
    const xml = `<?xml version="1.0"?>
      <gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
        <trk><trkseg>
          <trkpt lat="1" lon="2"><extensions><ns3:TrackPointExtension xmlns:ns3="x">
            <ns3:hr>150</ns3:hr><ns3:cad>90</ns3:cad>
          </ns3:TrackPointExtension></extensions></trkpt>
        </trkseg></trk>
      </gpx>`;
    expect(extractExtensions(xml)).toEqual([{ hr: 150, cad: 90 }]);
  });
});

describe('mergeExtensions', () => {
  it('copies hr/cad onto points by index', () => {
    const points: TrackPoint[] = Array.from({ length: 20 }, (_, i) => ({
      lat: 40 + i / 1000,
      lon: -105,
    }));
    mergeExtensions(points, fixture('flat-run.gpx'));
    expect(points[0].hr).toBe(142);
    expect(points[19].cad).toBeTypeOf('number');
  });

  it('leaves points untouched when extensions are absent', () => {
    const points: TrackPoint[] = [{ lat: 1, lon: 2 }];
    mergeExtensions(points, fixture('big-climb.gpx'));
    expect(points[0].hr).toBeUndefined();
    expect(points[0].cad).toBeUndefined();
  });
});
