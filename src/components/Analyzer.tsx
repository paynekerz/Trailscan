import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { DropZone } from './DropZone';
import { SplitsTable } from './SplitsTable';
import { HrZones } from './HrZones';
import { SummaryCard } from './SummaryCard';
import { Playback } from './Playback';

// Defer Leaflet + uPlot: these only render after a file is parsed, so their
// chunks must not load on initial paint (Core Web Vitals — keep LCP/JS lean).
const RouteMap = lazy(() => import('./RouteMap').then((m) => ({ default: m.RouteMap })));
const ElevationChart = lazy(() =>
  import('./ElevationChart').then((m) => ({ default: m.ElevationChart })),
);
import { parseGpx } from '../lib/parse';
import { downsample } from '../lib/geo';
import { computeSplits, computePointPaces, computeMetrics, METERS_PER_MILE } from '../lib/metrics';
import { getPaceZone } from '../lib/paceZones';
import { paceColors } from '../lib/colorScale';
import { DEFAULT_MAX_HR } from '../lib/hrZones';
import type { PaceMetric, PaceZone, TrackMetrics, TrackPoint } from '../types';

const MAX_RENDER_POINTS = 2000;
const METERS_PER_KM = 1000;
const FT_PER_METER = 3.28084;

// Intro fade-out duration before the analysis view mounts — keep in sync with
// the `duration-200` on the intro wrapper below.
const INTRO_FADE_MS = 200;

type Stage = 'intro' | 'leaving' | 'analysis';

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtPaceVal(pace: PaceMetric, unit: 'km' | 'mi'): string {
  const sp = unit === 'mi' ? pace.secondsPerMile : pace.secondsPerKm;
  const m = Math.floor(sp / 60);
  const s = Math.floor(sp % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface QuickStat {
  label: string;
  value: string;
  suffix?: string;
  accent?: boolean;
}

const PLACEHOLDER = '—';

// Always returns the same four tiles so the 2×2 grid is stable; unavailable
// metrics render a "—" placeholder rather than disappearing.
function buildQuickStats(metrics: TrackMetrics, unit: 'km' | 'mi'): QuickStat[] {
  const time = metrics.movingTime ?? metrics.elapsedTime;
  const pace = metrics.avgMovingPace ?? metrics.avgPace;
  return [
    {
      label: 'Distance',
      value:
        unit === 'mi'
          ? (metrics.distance / METERS_PER_MILE).toFixed(2)
          : (metrics.distance / METERS_PER_KM).toFixed(2),
      suffix: unit,
      accent: true,
    },
    {
      label: metrics.movingTime !== null ? 'Moving Time' : 'Time',
      value: time !== null ? fmtDuration(time) : PLACEHOLDER,
    },
    {
      label: 'Elev Gain',
      value:
        metrics.elevationGain !== null
          ? String(
              unit === 'mi'
                ? Math.round(metrics.elevationGain * FT_PER_METER)
                : Math.round(metrics.elevationGain),
            )
          : PLACEHOLDER,
      suffix: metrics.elevationGain !== null ? (unit === 'mi' ? 'ft' : 'm') : undefined,
    },
    {
      label: 'Avg Pace',
      value: pace ? fmtPaceVal(pace, unit) : PLACEHOLDER,
      suffix: pace ? `/${unit}` : undefined,
    },
  ];
}

export function Analyzer() {
  const [points, setPoints] = useState<TrackPoint[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [splitUnit, setSplitUnit] = useState<'km' | 'mi'>('mi');
  const [maxHr, setMaxHr] = useState(DEFAULT_MAX_HR);
  const [stage, setStage] = useState<Stage>('intro');

  const renderPoints = useMemo(
    () => (points ? downsample(points, MAX_RENDER_POINTS) : []),
    [points],
  );

  const bounds = useMemo<[[number, number], [number, number]] | null>(() => {
    if (!points) return null;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of points) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    return [[minLat, minLon], [maxLat, maxLon]];
  }, [points]);

  // Derive feature flags as memos so they're available before the early return
  const hasElevation = useMemo(() => points?.some((p) => p.ele !== undefined) ?? false, [points]);
  const hasTime = useMemo(() => points?.some((p) => p.time !== undefined) ?? false, [points]);
  const hasHr = useMemo(() => points?.some((p) => p.hr !== undefined) ?? false, [points]);
  const hasCad = useMemo(() => points?.some((p) => p.cad !== undefined) ?? false, [points]);

  const metrics = useMemo(
    () => (points && points.length >= 2 ? computeMetrics(points) : null),
    [points],
  );

  const avgHr = useMemo<number | null>(() => {
    if (!hasHr || !points) return null;
    let sum = 0, count = 0;
    for (const p of points) {
      if (p.hr !== undefined) { sum += p.hr; count++; }
    }
    return count > 0 ? sum / count : null;
  }, [points, hasHr]);

  const avgCad = useMemo<number | null>(() => {
    if (!hasCad || !points) return null;
    let sum = 0, count = 0;
    for (const p of points) {
      if (p.cad !== undefined) { sum += p.cad; count++; }
    }
    return count > 0 ? sum / count : null;
  }, [points, hasCad]);

  // Per-point pace (s/km) for renderPoints — null when time data is absent
  const pointPaces = useMemo<(number | null)[] | null>(
    () => (hasTime && renderPoints.length > 0 ? computePointPaces(renderPoints) : null),
    [renderPoints, hasTime],
  );

  // Map each renderPoint to its pace zone; null when pace is unavailable
  const pointZones = useMemo<(PaceZone | null)[] | null>(
    () =>
      pointPaces
        ? pointPaces.map((p) => (p !== null ? getPaceZone(p) : null))
        : null,
    [pointPaces],
  );

  // Continuous speed gradient color per renderPoint; null when pace is absent
  const pointColors = useMemo<(string | null)[] | null>(
    () => (pointPaces ? paceColors(pointPaces) : null),
    [pointPaces],
  );

  // Per-split metrics over the full-resolution points array
  const splits = useMemo(
    () =>
      points && points.length >= 2
        ? computeSplits(points, splitUnit === 'km' ? 1000 : METERS_PER_MILE)
        : [],
    [points, splitUnit],
  );

  // Drive the sequential view swap: once parsed data exists, fade the intro
  // out, then mount the analysis view (which fades in on its own). Reset back
  // to the intro when the data is cleared ("Load a different file").
  useEffect(() => {
    if (points && bounds && stage === 'intro') {
      setStage('leaving');
    }
    if ((!points || !bounds) && stage !== 'intro') {
      setStage('intro');
    }
  }, [points, bounds, stage]);

  // Schedule the leaving -> analysis swap separately so the timeout isn't
  // cleared by the intro -> leaving state change that started it.
  useEffect(() => {
    if (stage !== 'leaving') return;
    const t = setTimeout(() => setStage('analysis'), INTRO_FADE_MS);
    return () => clearTimeout(t);
  }, [stage]);

  const handleFile = (xml: string, name: string) => {
    setError(null);
    setPoints(null);
    setSelectedIndex(null);
    setLoading(true);
    setTimeout(() => {
      try {
        const pts = parseGpx(xml);
        if (pts.length === 0) {
          setError('No track points found in this GPX file.');
          return;
        }
        setPoints(pts);
        setFileName(name);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to parse GPX file.');
      } finally {
        setLoading(false);
      }
    }, 0);
  };

  const reset = () => {
    setPoints(null);
    setFileName('');
    setError(null);
    setSelectedIndex(null);
    setLoading(false);
  };

  if (stage !== 'analysis' || !points || !bounds) {
    // Keep the spinner (not the DropZone) on screen while the intro fades out.
    const showSpinner = loading || stage === 'leaving';
    return (
      <div
        className={`mx-auto flex w-full max-w-3xl flex-col gap-4 transition-opacity duration-200 ${
          stage === 'leaving' ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {showSpinner ? (
          <div
            role="status"
            aria-label="Parsing file"
            className="flex items-center justify-center gap-3 rounded-lg border border-outline-variant/40 bg-surface-container-low px-12 py-16 text-on-surface-variant"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5 animate-spin text-secondary-container"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span className="label-caps">Parsing file…</span>
          </div>
        ) : (
          <DropZone onFile={handleFile} onError={setError} />
        )}
        {error && (
          <p role="alert" className="text-center text-sm text-error">
            {error}
          </p>
        )}
      </div>
    );
  }

  const badges = [
    hasElevation && 'elevation',
    hasTime && 'timestamps',
    hasHr && 'heart-rate',
    hasCad && 'cadence',
  ].filter(Boolean) as string[];

  const quickStats = metrics ? buildQuickStats(metrics, splitUnit) : [];

  return (
    <div className="animate-fade-in flex w-full flex-col gap-6 border-t border-outline-variant/30 pt-8">
      {/* File header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-xl font-semibold text-on-surface">{fileName}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="data-sm text-on-surface-variant">
              {points.length.toLocaleString()} pts
            </span>
            {badges.map((b) => (
              <span
                key={b}
                className="label-caps border border-outline-variant/50 bg-surface-container-high px-2 py-1 text-on-surface-variant"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-outline-variant/50 bg-surface-container-high p-1">
          {(['km', 'mi'] as const).map((u) => (
            <button
              key={u}
              onClick={() => setSplitUnit(u)}
              className={`label-caps rounded px-4 py-2 transition-colors ${
                splitUnit === u
                  ? 'bg-surface-variant text-on-surface shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* Dashboard grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Suspense
            fallback={
              <div className="h-[360px] w-full animate-pulse rounded-lg border border-outline-variant/30 bg-surface-container" />
            }
          >
            <RouteMap
              renderPoints={renderPoints}
              bounds={bounds}
              selectedIndex={selectedIndex}
              onHover={setSelectedIndex}
              pointZones={pointZones}
              pointColors={pointColors}
            />
            <ElevationChart
              renderPoints={renderPoints}
              selectedIndex={selectedIndex}
              onHover={setSelectedIndex}
              pointZones={pointZones}
              unit={splitUnit}
            />
          </Suspense>
          <Playback
            length={renderPoints.length}
            value={selectedIndex}
            onSeek={setSelectedIndex}
            renderPoints={renderPoints}
            unit={splitUnit}
          />
        </div>

        {/* On lg the sidebar is absolutely positioned into its grid cell so it
            doesn't drive the row height — the row matches the map column, and
            SplitsTable scrolls to fill exactly that height. */}
        <div className="relative">
        <div className="flex flex-col gap-6 lg:absolute lg:inset-0 lg:min-h-0">
          {quickStats.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {quickStats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex h-24 flex-col justify-between rounded-lg border border-outline-variant/30 bg-surface-container p-4"
                >
                  <span className="label-caps text-on-surface-variant">{stat.label}</span>
                  <span
                    className={`data-lg ${stat.accent ? 'text-secondary-container' : 'text-on-surface'}`}
                  >
                    {stat.value}
                    {stat.suffix && (
                      <span className="ml-1 text-base text-on-surface-variant">{stat.suffix}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          <SplitsTable splits={splits} unit={splitUnit} />
        </div>
        </div>
      </div>

      {hasHr && <HrZones points={points} maxHr={maxHr} onMaxHrChange={setMaxHr} />}
      {metrics && (
        <SummaryCard
          fileName={fileName}
          metrics={metrics}
          renderPoints={renderPoints}
          hasHr={hasHr}
          hasCad={hasCad}
          avgHr={avgHr}
          avgCad={avgCad}
          unit={splitUnit}
        />
      )}

      <button
        onClick={reset}
        className="label-caps mx-auto flex items-center gap-2 rounded-lg border border-outline-variant/50 px-4 py-2 text-on-surface-variant transition-colors hover:border-secondary-container hover:text-secondary-container"
      >
        Load a different file
      </button>
    </div>
  );
}
