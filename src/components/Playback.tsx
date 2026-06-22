import { useEffect, useMemo, useRef, useState } from 'react';
import type { TrackPoint } from '../types';
import { cumulativeDistances } from '../lib/geo';
import { instantPaceAt } from '../lib/metrics';

const SPEEDS = [1, 2, 4, 8] as const;
// A full track plays in this many wall-clock seconds at 1×, then scaled by the
// speed multiplier. Playback advances along a progress axis (real time when the
// file has timestamps, otherwise cumulative distance), never raw point index —
// so the marker reflects true pacing and never fake-speeds where render points
// happen to bunch up.
const TARGET_PLAYBACK_SECONDS = 30;

function fmtPace(secondsPerUnit: number, unit: 'km' | 'mi'): string {
  const m = Math.floor(secondsPerUnit / 60);
  const s = Math.round(secondsPerUnit % 60);
  return `${m}:${String(s).padStart(2, '0')}/${unit}`;
}

interface PlaybackProps {
  length: number;
  value: number | null;
  onSeek: (index: number | null) => void;
  renderPoints: TrackPoint[];
  unit: 'km' | 'mi';
}

function fmtClock(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function Playback({ length, value, onSeek, renderPoints, unit }: PlaybackProps) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const posRef = useRef(0);
  const onSeekRef = useRef(onSeek);
  useEffect(() => { onSeekRef.current = onSeek; }, [onSeek]);

  // While paused, follow externally-driven selection (map/chart hover) so
  // resuming continues from where the user last pointed.
  useEffect(() => {
    if (!playing && value !== null) posRef.current = value;
  }, [value, playing]);

  const dists = useMemo(() => cumulativeDistances(renderPoints), [renderPoints]);

  // Seconds-from-start per render point. null when the file has no start time;
  // missing intermediate timestamps carry the previous value forward to stay
  // monotonic for the progress<->index mapping below.
  const times = useMemo<number[] | null>(() => {
    const t0 = renderPoints[0]?.time?.getTime();
    if (t0 == null) return null;
    const arr = new Array<number>(renderPoints.length);
    for (let i = 0; i < renderPoints.length; i++) {
      const ti = renderPoints[i].time?.getTime();
      arr[i] = ti == null ? (i > 0 ? arr[i - 1] : 0) : (ti - t0) / 1000;
    }
    return arr;
  }, [renderPoints]);

  useEffect(() => {
    if (!playing) return;
    const n = length;
    // Real elapsed time when usable, otherwise cumulative distance. Either way a
    // monotonic axis the marker advances along at a steady real-world rate.
    const timeUsable = times !== null && times[n - 1] > 0;
    const prog = timeUsable ? times! : dists;
    const total = prog[n - 1];
    const rate = total / TARGET_PLAYBACK_SECONDS; // progress units per wall-second at 1×

    const progAt = (idx: number): number => {
      const i0 = Math.floor(idx);
      if (i0 >= n - 1) return prog[n - 1];
      return prog[i0] + (idx - i0) * (prog[i0 + 1] - prog[i0]);
    };
    const indexAtProg = (p: number): number => {
      if (p <= prog[0]) return 0;
      if (p >= prog[n - 1]) return n - 1;
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (prog[mid] <= p) lo = mid;
        else hi = mid;
      }
      const seg = prog[hi] - prog[lo];
      return seg > 0 ? lo + (p - prog[lo]) / seg : lo;
    };

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = progAt(posRef.current) + dt * rate * speed;
      if (total <= 0 || next >= total) {
        posRef.current = n - 1;
        onSeekRef.current(n - 1);
        setPlaying(false);
        return;
      }
      posRef.current = indexAtProg(next);
      onSeekRef.current(Math.round(posRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, length, times, dists]);

  if (length < 2) return null;

  const idx = value ?? 0;
  const dist = dists[idx] ?? 0;
  const distStr =
    unit === 'mi' ? `${(dist / 1609.344).toFixed(2)} mi` : `${(dist / 1000).toFixed(2)} km`;

  const startTime = renderPoints[0]?.time;
  const endTime = renderPoints[length - 1]?.time;
  const curTime = renderPoints[idx]?.time;
  // Usable only when the track actually progresses in time; a file with all
  // timestamps equal (or none) has no elapsed clock to show.
  const hasUsableTime = !!startTime && !!endTime && endTime.getTime() > startTime.getTime();
  const elapsedStr =
    hasUsableTime && curTime ? fmtClock((curTime.getTime() - startTime!.getTime()) / 1000) : '—';

  const pace = hasUsableTime ? instantPaceAt(renderPoints, dists, idx) : null;
  const paceStr = pace
    ? fmtPace(unit === 'mi' ? pace.secondsPerMile : pace.secondsPerKm, unit)
    : hasUsableTime
      ? 'stopped'
      : '—';

  const togglePlay = () => {
    if (!playing && posRef.current >= length - 1) posRef.current = 0;
    setPlaying((p) => !p);
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-outline-variant/30 bg-surface-container p-4">
      <div className="flex items-center justify-between">
        <span className="label-caps text-on-surface-variant">Playback</span>
        <span className="data-sm text-on-surface-variant">
          {distStr}
          <span className="ml-3">{elapsedStr}</span>
          <span className="ml-3">{paceStr}</span>
        </span>
      </div>

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
          max={length - 1}
          value={idx}
          aria-label="Playback position"
          onChange={(e) => {
            const v = Number(e.target.value);
            posRef.current = v;
            onSeek(v);
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
    </div>
  );
}
