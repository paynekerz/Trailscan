import { getHrZone, timeInHrZones } from '../src/lib/hrZones';
import type { TrackPoint } from '../src/types';

describe('getHrZone', () => {
  const maxHr = 200;
  it('maps % of max HR to zones at the standard boundaries', () => {
    expect(getHrZone(180, maxHr)).toBe(5); // 90%
    expect(getHrZone(160, maxHr)).toBe(4); // 80%
    expect(getHrZone(140, maxHr)).toBe(3); // 70%
    expect(getHrZone(120, maxHr)).toBe(2); // 60%
    expect(getHrZone(100, maxHr)).toBe(1); // 50%
  });

  it('folds anything below 50% into Z1', () => {
    expect(getHrZone(80, maxHr)).toBe(1);
  });
});

describe('timeInHrZones', () => {
  const at = (hr: number, sec: number): TrackPoint => ({
    lat: 0,
    lon: 0,
    hr,
    time: new Date(sec * 1000),
  });

  it('credits each sample duration to the zone of its HR', () => {
    // maxHr 200: 100→Z1, 140→Z3, 180→Z5. Samples 60s apart.
    const points = [at(100, 0), at(140, 60), at(180, 120)];
    const totals = timeInHrZones(points, 200);
    expect(totals[3]).toBe(60); // Z3 from the 60→120s segment
    expect(totals[5]).toBe(60); // Z5 from the 120→180... only one 60s segment
    // first sample has no preceding segment → weighted 1 in Z1
    expect(totals[1]).toBe(1);
  });

  it('falls back to sample counts when timestamps are absent', () => {
    const points: TrackPoint[] = [
      { lat: 0, lon: 0, hr: 100 },
      { lat: 0, lon: 0, hr: 180 },
    ];
    const totals = timeInHrZones(points, 200);
    expect(totals[1]).toBe(1);
    expect(totals[5]).toBe(1);
  });

  it('ignores points with no HR', () => {
    const points: TrackPoint[] = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0 }];
    expect(timeInHrZones(points, 200).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
