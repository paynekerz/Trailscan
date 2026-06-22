import { interpolateColor, sampleRamp, paceColors } from '../src/lib/colorScale';

describe('interpolateColor', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    expect(interpolateColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(interpolateColor('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('returns the midpoint at t=0.5', () => {
    expect(interpolateColor('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('clamps t outside [0,1]', () => {
    expect(interpolateColor('#000000', '#ffffff', -1)).toBe('#000000');
    expect(interpolateColor('#000000', '#ffffff', 2)).toBe('#ffffff');
  });
});

describe('sampleRamp', () => {
  const ramp = ['#000000', '#ff0000', '#ffffff'];

  it('returns the first stop at t=0 and last at t=1', () => {
    expect(sampleRamp(0, ramp)).toBe('#000000');
    expect(sampleRamp(1, ramp)).toBe('#ffffff');
  });

  it('lands exactly on an interior stop', () => {
    expect(sampleRamp(0.5, ramp)).toBe('#ff0000');
  });

  it('clamps out-of-range t', () => {
    expect(sampleRamp(-5, ramp)).toBe('#000000');
    expect(sampleRamp(5, ramp)).toBe('#ffffff');
  });

  it('handles a single-stop ramp', () => {
    expect(sampleRamp(0.7, ['#123456'])).toBe('#123456');
  });
});

describe('paceColors', () => {
  it('returns all null when no pace data exists', () => {
    expect(paceColors([null, null, null])).toEqual([null, null, null]);
  });

  it('preserves null entries (stopped/degenerate segments)', () => {
    const out = paceColors([null, 300, null, 400]);
    expect(out[0]).toBeNull();
    expect(out[2]).toBeNull();
    expect(out[1]).not.toBeNull();
    expect(out[3]).not.toBeNull();
  });

  it('maps the fastest pace warmer than the slowest', () => {
    // Lower s/km = faster = warmer (more red). Compare red channels.
    const out = paceColors([240, 300, 360, 420, 480]);
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
    const fastest = out[0] as string;
    const slowest = out[4] as string;
    expect(red(fastest)).toBeGreaterThan(red(slowest));
  });

  it('returns a mid color when every pace is identical', () => {
    const out = paceColors([300, 300, 300]);
    expect(out.every((c) => c === out[0])).toBe(true);
  });
});
