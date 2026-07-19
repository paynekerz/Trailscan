import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { DropZone } from './DropZone';
import { parseGpx } from '../lib/parse';
import { downsample } from '../lib/geo';
import { buildGhostTrack, positionAt, routesSimilar } from '../lib/ghost';
import type { TrackPoint } from '../types';

// Lazy so Leaflet never enters the statically-imported Analyzer chunk.
const GhostMap = lazy(() => import('./GhostMap').then((m) => ({ default: m.GhostMap })));

// Track A = the primary (already-loaded) run, orange to match the main route;
// Track B = the ghost, sage (brand primary). Both are palette tokens.
const COLOR_A = '#fa5c1c';
const COLOR_B = '#b8cbbc';

const MAX_RENDER_POINTS = 2000;
const TARGET_RACE_SECONDS = 30;
const SPEEDS = [1, 2, 4, 8] as const;
const METERS_PER_MILE = 1609.344;

function fmtClock(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtDist(meters: number, unit: 'km' | 'mi'): string {
  return unit === 'mi'
    ? `${(meters / METERS_PER_MILE).toFixed(2)} mi`
    : `${(meters / 1000).toFixed(2)} km`;
}

interface GhostRaceProps {
  primaryPoints: TrackPoint[];
  primaryName: string;
  unit: 'km' | 'mi';
}

export function GhostRace({ primaryPoints, primaryName, unit }: GhostRaceProps) {
  const [ghostPoints, setGhostPoints] = useState<TrackPoint[] | null>(null);
  const [ghostName, setGhostName] = useState('');
  const [ghostError, setGhostError] = useState<string | null>(null);
  const [showDrop, setShowDrop] = useState(false);

  const [raceDist, setRaceDist] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const raceDistRef = useRef(0);

  // Clear the ghost whenever the primary track changes (e.g. "Load a different
  // file" in-place) so a stale ghost never races against a new primary.
  useEffect(() => {
    setGhostPoints(null);
    setGhostName('');
    setGhostError(null);
    setShowDrop(false);
    setPlaying(false);
    setRaceDist(0);
    raceDistRef.current = 0;
  }, [primaryPoints]);

  const trackA = useMemo(() => buildGhostTrack(primaryPoints), [primaryPoints]);
  const trackB = useMemo(() => (ghostPoints ? buildGhostTrack(ghostPoints) : null), [ghostPoints]);

  const raceTotal = trackB ? Math.min(trackA.total, trackB.total) : 0;

  const positionsA = useMemo<[number, number][]>(
    () => downsample(primaryPoints, MAX_RENDER_POINTS).map((p) => [p.lat, p.lon]),
    [primaryPoints],
  );
  const positionsB = useMemo<[number, number][]>(
    () => (ghostPoints ? downsample(ghostPoints, MAX_RENDER_POINTS).map((p) => [p.lat, p.lon]) : []),
    [ghostPoints],
  );

  const bounds = useMemo<[[number, number], [number, number]] | null>(() => {
    if (!ghostPoints) return null;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of [...primaryPoints, ...ghostPoints]) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    return [[minLat, minLon], [maxLat, maxLon]];
  }, [primaryPoints, ghostPoints]);

  const sampleA = trackB ? positionAt(trackA, raceDist) : null;
  const sampleB = trackB ? positionAt(trackB, raceDist) : null;

  useEffect(() => {
    if (!playing || raceTotal <= 0) return;
    const rate = (raceTotal / TARGET_RACE_SECONDS) * speed; // meters per wall-second
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = raceDistRef.current + dt * rate;
      if (next >= raceTotal) {
        raceDistRef.current = raceTotal;
        setRaceDist(raceTotal);
        setPlaying(false);
        return;
      }
      raceDistRef.current = next;
      setRaceDist(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, raceTotal]);

  const handleGhostFile = (xml: string, name: string) => {
    setGhostError(null);
    try {
      const pts = parseGpx(xml);
      if (pts.length < 2) {
        setGhostError('No usable track found in this GPX file.');
        return;
      }
      if (!routesSimilar(primaryPoints, pts)) {
        setGhostError(
          'These two files don’t look like the same route. A ghost race compares two runs of the same course — load a second run of this route to race.',
        );
        return;
      }
      setGhostPoints(pts);
      setGhostName(name);
      setShowDrop(false);
      setRaceDist(0);
      raceDistRef.current = 0;
      setPlaying(false);
    } catch (e) {
      setGhostError(e instanceof Error ? e.message : 'Failed to parse GPX file.');
    }
  };

  const removeGhost = () => {
    setGhostPoints(null);
    setGhostName('');
    setPlaying(false);
    setRaceDist(0);
    raceDistRef.current = 0;
  };

  const togglePlay = () => {
    if (!playing && raceDistRef.current >= raceTotal) {
      raceDistRef.current = 0;
      setRaceDist(0);
    }
    setPlaying((p) => !p);
  };

  // Time delta at the current distance: negative diff means A reached it first.
  const elapsedA = sampleA?.elapsed ?? null;
  const elapsedB = sampleB?.elapsed ?? null;
  const haveTiming = elapsedA !== null && elapsedB !== null;
  const diff = haveTiming ? elapsedA! - elapsedB! : null;

  let leaderLine: string;
  if (diff === null) {
    leaderLine = 'Timing needs timestamps in both files';
  } else if (Math.abs(diff) < 1) {
    leaderLine = 'Dead even';
  } else if (diff < 0) {
    leaderLine = `${truncName(primaryName)} ahead by ${fmtClock(Math.abs(diff))}`;
  } else {
    leaderLine = `${truncName(ghostName)} ahead by ${fmtClock(Math.abs(diff))}`;
  }

  const header = (
    <div className="flex items-center gap-2">
      <svg aria-hidden="true" className="h-4 w-4 text-secondary-container" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 3v18M19 3v18" />
        <path d="M5 4h14M5 11h14" />
      </svg>
      <span className="label-caps text-on-surface">Ghost Race</span>
    </div>
  );

  // ---- No ghost loaded yet: intro / drop / soft-block ---------------------
  if (!trackB) {
    return (
      <section className="flex flex-col gap-4 rounded-lg border border-outline-variant/30 bg-surface-container p-4">
        {header}
        {ghostError ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-sm text-error">
              {ghostError}
            </p>
            <button
              onClick={() => {
                setGhostError(null);
                setShowDrop(false);
              }}
              className="label-caps self-start rounded-lg border border-outline-variant/50 px-4 py-2 text-on-surface-variant transition-colors hover:border-secondary-container hover:text-secondary-container"
            >
              Dismiss
            </button>
          </div>
        ) : showDrop ? (
          <div className="flex flex-col gap-3">
            <DropZone onFile={handleGhostFile} onError={setGhostError} />
            <button
              onClick={() => setShowDrop(false)}
              className="label-caps self-start rounded-lg border border-outline-variant/50 px-4 py-2 text-on-surface-variant transition-colors hover:border-secondary-container hover:text-secondary-container"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-on-surface-variant">
              Load a second run of this route to race them ghost-style — both replay together,
              aligned by distance, so you can see exactly where time was won or lost.
            </p>
            <button
              onClick={() => setShowDrop(true)}
              className="label-caps self-start rounded-lg bg-secondary-container px-4 py-2 text-on-secondary-container transition-transform active:scale-95"
            >
              Add a ghost run
            </button>
          </div>
        )}
      </section>
    );
  }

  // ---- Ghost loaded: the race --------------------------------------------
  const markerA = sampleA ? ([sampleA.lat, sampleA.lon] as [number, number]) : null;
  const markerB = sampleB ? ([sampleB.lat, sampleB.lon] as [number, number]) : null;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-outline-variant/30 bg-surface-container p-4">
      <div className="flex items-center justify-between">
        {header}
        <button
          onClick={removeGhost}
          className="label-caps rounded-lg border border-outline-variant/50 px-3 py-1.5 text-on-surface-variant transition-colors hover:border-secondary-container hover:text-secondary-container"
        >
          Remove ghost
        </button>
      </div>

      {/* Legend: each runner's color, name, and elapsed time at this distance */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <RunnerChip color={COLOR_A} name={truncName(primaryName)} time={elapsedA} />
        <RunnerChip color={COLOR_B} name={truncName(ghostName)} time={elapsedB} />
        <span className="data-sm text-on-surface-variant">{fmtDist(raceDist, unit)}</span>
        <span className="label-caps text-secondary-container">{leaderLine}</span>
      </div>

      {bounds && (
        <Suspense
          fallback={
            <div className="h-80 w-full animate-pulse rounded-lg border border-outline-variant/30 bg-surface-container md:h-[400px]" />
          }
        >
          <GhostMap
            positionsA={positionsA}
            positionsB={positionsB}
            bounds={bounds}
            markerA={markerA}
            markerB={markerB}
            colorA={COLOR_A}
            colorB={COLOR_B}
          />
        </Suspense>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container transition-transform active:scale-95"
        >
          {playing ? (
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" />
            </svg>
          )}
        </button>

        <input
          type="range"
          min={0}
          max={raceTotal}
          step={Math.max(1, raceTotal / 1000)}
          value={raceDist}
          aria-label="Race position"
          onChange={(e) => {
            const v = Number(e.target.value);
            raceDistRef.current = v;
            setRaceDist(v);
          }}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-variant accent-secondary-container"
        />

        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-outline-variant/50 bg-surface-container-high p-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`label-caps rounded px-2 py-1 transition-colors ${
                speed === s
                  ? 'bg-surface-variant text-on-surface shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function truncName(name: string): string {
  const base = name.replace(/\.gpx$/i, '');
  return base.length > 22 ? `${base.slice(0, 21)}…` : base;
}

function RunnerChip({ color, name, time }: { color: string; name: string; time: number | null }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-sm text-on-surface">{name}</span>
      <span className="data-sm text-on-surface-variant">{time !== null ? fmtClock(time) : '—'}</span>
    </span>
  );
}
