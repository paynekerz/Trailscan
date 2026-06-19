import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGpx } from '../src/lib/parse';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf-8');

describe('parseGpx — flat-run.gpx', () => {
  let points: ReturnType<typeof parseGpx>;
  beforeAll(() => {
    points = parseGpx(fixture('flat-run.gpx'));
  });

  it('returns 20 points', () => {
    expect(points).toHaveLength(20);
  });

  it('first point has correct lat/lon', () => {
    expect(points[0].lat).toBeCloseTo(40.0, 5);
    expect(points[0].lon).toBeCloseTo(-105.0, 5);
  });

  it('all points have elevation 1650m', () => {
    expect(points.every((p) => p.ele === 1650)).toBe(true);
  });

  it('all points have timestamps', () => {
    expect(points.every((p) => p.time instanceof Date)).toBe(true);
  });

  it('first timestamp is correct', () => {
    expect(points[0].time?.toISOString()).toBe('2024-01-15T08:00:00.000Z');
  });
});

describe('parseGpx — big-climb.gpx', () => {
  let points: ReturnType<typeof parseGpx>;
  beforeAll(() => {
    points = parseGpx(fixture('big-climb.gpx'));
  });

  it('returns 21 points', () => {
    expect(points).toHaveLength(21);
  });

  it('elevation runs 1000 → 2000m', () => {
    expect(points[0].ele).toBe(1000);
    expect(points[20].ele).toBe(2000);
  });

  it('has no hr or cad (togeojson drops gpxtpx extensions)', () => {
    expect(points.every((p) => p.hr === undefined)).toBe(true);
    expect(points.every((p) => p.cad === undefined)).toBe(true);
  });
});

describe('parseGpx — no-elevation.gpx', () => {
  let points: ReturnType<typeof parseGpx>;
  beforeAll(() => {
    points = parseGpx(fixture('no-elevation.gpx'));
  });

  it('returns 10 points', () => {
    expect(points).toHaveLength(10);
  });

  it('no point has elevation', () => {
    expect(points.every((p) => p.ele === undefined)).toBe(true);
  });

  it('all points have timestamps', () => {
    expect(points.every((p) => p.time instanceof Date)).toBe(true);
  });
});

describe('parseGpx — error handling', () => {
  it('throws on malformed XML', () => {
    expect(() => parseGpx('<not valid xml')).toThrow();
  });

  it('throws on non-GPX XML', () => {
    expect(() => parseGpx('<root><child/></root>')).toThrow(/GPX/i);
  });

  it('returns empty array for GPX with no tracks', () => {
    const xml =
      '<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1"></gpx>';
    expect(parseGpx(xml)).toHaveLength(0);
  });
});
