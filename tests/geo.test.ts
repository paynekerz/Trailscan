import { haversine, smooth } from '../src/lib/geo';

describe('haversine', () => {
  it('is zero for identical points', () => {
    expect(haversine({ lat: 40, lon: -105 }, { lat: 40, lon: -105 })).toBe(0);
  });

  it('measures ~111.2m for a 0.001° latitude step', () => {
    expect(haversine({ lat: 40, lon: -105 }, { lat: 40.001, lon: -105 })).toBeCloseTo(
      111.2,
      1,
    );
  });

  it('is symmetric', () => {
    const a = { lat: 37.8, lon: -119.5 };
    const b = { lat: 37.81, lon: -119.49 };
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 9);
  });
});

describe('smooth', () => {
  it('returns linear data unchanged (symmetric shrinking window)', () => {
    const linear = [1000, 1050, 1100, 1150, 1200];
    const out = smooth(linear, 2);
    out.forEach((v, i) => expect(v).toBeCloseTo(linear[i], 9));
  });

  it('returns constant data unchanged', () => {
    expect(smooth([5, 5, 5, 5], 2)).toEqual([5, 5, 5, 5]);
  });

  it('attenuates a single spike', () => {
    const out = smooth([0, 0, 30, 0, 0], 1);
    expect(out[2]).toBeCloseTo(10, 9);
    expect(out[2]).toBeLessThan(30);
  });

  it('preserves the endpoints exactly (radius 0 at the edges)', () => {
    const out = smooth([0, 100, 0], 5);
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(0);
  });
});
