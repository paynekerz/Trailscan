import { useMemo, useCallback } from 'react';
import { downsample } from '../lib/geo';
import { METERS_PER_MILE } from '../lib/metrics';
import type { TrackMetrics, TrackPoint } from '../types';

interface SummaryCardProps {
  fileName: string;
  metrics: TrackMetrics;
  renderPoints: TrackPoint[];
  hasHr: boolean;
  hasCad: boolean;
  avgHr: number | null;
  avgCad: number | null;
  unit: 'km' | 'mi';
}

const METERS_PER_KM = 1000;
const FT_PER_METER = 3.28084;
const THUMB_MAX = 300;

// Canvas-safe colors. The PNG can't read CSS @theme tokens, so these mirror the
// "Rugged Utility" palette by hand — keep in sync with global.css if it changes.
const C = {
  bg: '#1e201f', // surface-container
  primary: '#b8cbbc', // primary (sage) — wordmark
  route: '#fa5c1c', // secondary-container (high-vis orange) — route line
  text: '#e2e3e0', // on-surface
  muted: '#c3c8c2', // on-surface-variant
  divider: '#434844', // outline-variant
};

const FONT_UI = '"Hanken Grotesk", ui-sans-serif, system-ui, sans-serif';
const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';

const CARD_W = 1200;
const CARD_H = 628;

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtPace(sPerUnit: number, unit: 'km' | 'mi'): string {
  const m = Math.floor(sPerUnit / 60);
  const s = Math.floor(sPerUnit % 60);
  return `${m}:${String(s).padStart(2, '0')} /${unit}`;
}

function fmtDist(meters: number, unit: 'km' | 'mi'): string {
  return unit === 'mi'
    ? `${(meters / METERS_PER_MILE).toFixed(2)} mi`
    : `${(meters / METERS_PER_KM).toFixed(2)} km`;
}

function fmtEle(meters: number, unit: 'km' | 'mi'): string {
  return unit === 'mi' ? `${Math.round(meters * FT_PER_METER)} ft` : `${Math.round(meters)} m`;
}

function buildStats(
  metrics: TrackMetrics,
  hasHr: boolean,
  hasCad: boolean,
  avgHr: number | null,
  avgCad: number | null,
  unit: 'km' | 'mi',
): { label: string; value: string }[] {
  const cells: { label: string; value: string }[] = [
    { label: 'Distance', value: fmtDist(metrics.distance, unit) },
  ];
  if (metrics.elapsedTime !== null)
    cells.push({ label: 'Time', value: fmtDuration(metrics.elapsedTime) });
  if (metrics.movingTime !== null)
    cells.push({ label: 'Moving Time', value: fmtDuration(metrics.movingTime) });
  if (metrics.elevationGain !== null)
    cells.push({ label: 'Elevation Gain', value: fmtEle(metrics.elevationGain, unit) });
  if (metrics.elevationLoss !== null)
    cells.push({ label: 'Elevation Loss', value: fmtEle(metrics.elevationLoss, unit) });
  if (metrics.avgPace !== null)
    cells.push({
      label: 'Avg Pace',
      value: fmtPace(
        unit === 'mi' ? metrics.avgPace.secondsPerMile : metrics.avgPace.secondsPerKm,
        unit,
      ),
    });
  if (metrics.avgMovingPace !== null)
    cells.push({
      label: 'Moving Pace',
      value: fmtPace(
        unit === 'mi'
          ? metrics.avgMovingPace.secondsPerMile
          : metrics.avgMovingPace.secondsPerKm,
        unit,
      ),
    });
  if (hasHr && avgHr !== null)
    cells.push({ label: 'Avg HR', value: `${Math.round(avgHr)} bpm` });
  if (hasCad && avgCad !== null)
    cells.push({ label: 'Avg Cadence', value: `${Math.round(avgCad)} spm` });
  return cells;
}

// Projects lat/lon to a coordinate space of (width × height) with uniform
// scaling and centering so the route shape is undistorted.
function project(
  points: TrackPoint[],
  width: number,
  height: number,
  padding: number,
): { x: number; y: number }[] {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  const latRange = maxLat - minLat || 0.001;
  const lonRange = maxLon - minLon || 0.001;

  const w = width - padding * 2;
  const h = height - padding * 2;
  const scale = Math.min(w / lonRange, h / latRange);
  const ox = padding + (w - lonRange * scale) / 2;
  const oy = padding + (h - latRange * scale) / 2;

  return points.map((p) => ({
    x: ox + (p.lon - minLon) * scale,
    y: oy + (maxLat - p.lat) * scale,
  }));
}

export function SummaryCard({
  fileName,
  metrics,
  renderPoints,
  hasHr,
  hasCad,
  avgHr,
  avgCad,
  unit,
}: SummaryCardProps) {
  const thumbPoints = useMemo(
    () => (renderPoints.length > THUMB_MAX ? downsample(renderPoints, THUMB_MAX) : renderPoints),
    [renderPoints],
  );

  const svgPath = useMemo(() => {
    if (thumbPoints.length < 2) return '';
    const pts = project(thumbPoints, 200, 200, 12);
    return 'M ' + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ');
  }, [thumbPoints]);

  const statCells = useMemo(
    () => buildStats(metrics, hasHr, hasCad, avgHr, avgCad, unit),
    [metrics, hasHr, hasCad, avgHr, avgCad, unit],
  );

  const downloadPng = useCallback(() => {
    const stats = buildStats(metrics, hasHr, hasCad, avgHr, avgCad, unit);
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    const splitX = Math.round(CARD_W * 0.56);

    // Vertical divider between stats and thumbnail
    ctx.strokeStyle = C.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(splitX, 60);
    ctx.lineTo(splitX, CARD_H - 60);
    ctx.stroke();

    // Activity title (left-aligned, clamped to left panel width)
    ctx.fillStyle = C.text;
    ctx.font = `bold 34px ${FONT_UI}`;
    ctx.fillText(fileName || 'GPX Activity', 60, 80, splitX - 120);

    // TrailScan branding (right-aligned)
    ctx.fillStyle = C.primary;
    ctx.font = `800 22px ${FONT_UI}`;
    ctx.textAlign = 'right';
    ctx.fillText('TRAILSCAN', CARD_W - 60, 80);
    ctx.textAlign = 'left';

    // Stats in a 2-column grid
    const cellW = (splitX - 80) / 2;
    const cellH = 88;
    const startY = 130;

    stats.forEach((stat, i) => {
      const x = 60 + (i % 2) * cellW;
      const y = startY + Math.floor(i / 2) * cellH;

      ctx.fillStyle = C.muted;
      ctx.font = `800 13px ${FONT_UI}`;
      ctx.fillText(stat.label.toUpperCase(), x, y);

      ctx.fillStyle = C.text;
      ctx.font = `600 30px ${FONT_MONO}`;
      ctx.fillText(stat.value, x, y + 36);
    });

    // Route thumbnail in the right panel
    if (thumbPoints.length >= 2) {
      const pad = 50;
      const tx = splitX + pad;
      const tw = CARD_W - splitX - pad * 2;
      const th = CARD_H - 140;
      const ty = 70;

      const pts = project(thumbPoints, tw, th, 20).map((p) => ({
        x: tx + p.x,
        y: ty + p.y,
      }));

      ctx.strokeStyle = C.route;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();

      // Start marker
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 8, 0, Math.PI * 2);
      ctx.fill();

      // Finish marker
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    const link = document.createElement('a');
    link.download = `${(fileName || 'activity').replace(/[^a-z0-9]/gi, '_')}-summary.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [fileName, metrics, thumbPoints, hasHr, hasCad, avgHr, avgCad, unit]);

  return (
    <div className="w-full rounded-lg border border-outline-variant/30 bg-surface-container p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-on-surface">{fileName}</h2>
          <p className="label-caps text-on-surface-variant">Activity Summary</p>
        </div>
        <button
          onClick={downloadPng}
          className="label-caps shrink-0 rounded bg-secondary-container px-4 py-2.5 text-on-secondary-container transition-opacity hover:opacity-90"
        >
          Download PNG
        </button>
      </div>

      <div className="flex gap-6">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          {statCells.map((cell) => (
            <div key={cell.label}>
              <p className="label-caps text-on-surface-variant">{cell.label}</p>
              <p className="data-lg mt-1 text-on-surface">{cell.value}</p>
            </div>
          ))}
        </div>

        {svgPath && (
          <div className="hidden h-36 w-36 shrink-0 sm:block">
            <svg
              viewBox="0 0 200 200"
              className="h-full w-full"
              role="img"
              aria-label="Route thumbnail"
            >
              <path
                d={svgPath}
                fill="none"
                stroke="#fa5c1c"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
