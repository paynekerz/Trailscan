// Continuous speed→color scale for gradient route rendering. Anchor colors run
// slow → fast and mirror the discrete pace-zone palette (Z1 blue → Z5 red), so
// the gradient reads as a smooth version of the same semantic used elsewhere.
const DEFAULT_RAMP = ['#60a5fa', '#22c55e', '#eab308', '#f97316', '#ef4444'] as const;

// Quantization buckets. Snapping the normalized value to a fixed number of
// levels lets adjacent same-color points group into multi-point polylines —
// the difference is visually imperceptible but keeps the segment count (and
// therefore the Leaflet/React element count) bounded on long tracks.
const QUANT_LEVELS = 24;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function interpolateColor(a: string, b: string, t: number): string {
  const tc = Math.max(0, Math.min(1, t));
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * tc, ag + (bg - ag) * tc, ab + (bb - ab) * tc);
}

// Sample a multi-stop ramp at t∈[0,1]. t is clamped.
export function sampleRamp(t: number, ramp: readonly string[] = DEFAULT_RAMP): string {
  if (ramp.length === 1) return ramp[0];
  const tc = Math.max(0, Math.min(1, t));
  const scaled = tc * (ramp.length - 1);
  const i = Math.min(Math.floor(scaled), ramp.length - 2);
  return interpolateColor(ramp[i], ramp[i + 1], scaled - i);
}

// Linear-interpolated quantile of a pre-sorted ascending array.
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

// Map per-point pace (s/km; null for stopped/degenerate segments) to a color.
// Faster pace (lower s/km) → warm end of the ramp. The range is normalized to
// the track's own 5th–95th pace percentiles so a couple of GPS-spike outliers
// don't flatten the whole gradient. null paces stay null (no segment color).
export function paceColors(paces: (number | null)[]): (string | null)[] {
  const valid = paces.filter((p): p is number => p !== null).sort((a, b) => a - b);
  if (valid.length === 0) return paces.map(() => null);

  const lo = quantile(valid, 0.05);
  const hi = quantile(valid, 0.95);
  const span = hi - lo;

  return paces.map((p) => {
    if (p === null) return null;
    const tRaw = span > 0 ? (hi - p) / span : 0.5;
    const t = Math.round(Math.max(0, Math.min(1, tRaw)) * QUANT_LEVELS) / QUANT_LEVELS;
    return sampleRamp(t);
  });
}
