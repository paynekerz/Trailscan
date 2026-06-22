import { useState } from 'react';
import type { Split } from '../types';
import { getPaceZone, PACE_ZONE_COLORS } from '../lib/paceZones';

interface SplitsTableProps {
  splits: Split[];
  unit: 'km' | 'mi';
}

function formatPace(secondsPerUnit: number, unit: 'km' | 'mi'): string {
  const m = Math.floor(secondsPerUnit / 60);
  const s = Math.round(secondsPerUnit % 60);
  return `${m}:${s.toString().padStart(2, '0')}/${unit}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatElevChange(meters: number, unit: 'km' | 'mi'): string {
  const val = unit === 'mi' ? meters * 3.28084 : meters;
  const suffix = unit === 'mi' ? 'ft' : 'm';
  const r = Math.round(val);
  if (r === 0) return `±0${suffix}`;
  return `${r > 0 ? '+' : ''}${r}${suffix}`;
}

export function SplitsTable({ splits, unit }: SplitsTableProps) {
  const [open, setOpen] = useState(false);

  if (splits.length === 0) return null;

  const hasPace = splits.some((s) => s.pace !== null);
  const hasTime = splits.some((s) => s.durationSeconds !== null);
  const hasElevation = splits.some((s) => s.elevationChangeMeters !== null);

  const pacedSplits = splits.filter((s) => s.pace !== null);
  const fastestSplit =
    pacedSplits.length >= 2
      ? pacedSplits.reduce((a, b) =>
          a.pace!.secondsPerKm < b.pace!.secondsPerKm ? a : b,
        )
      : null;
  const slowestSplit =
    pacedSplits.length >= 2
      ? pacedSplits.reduce((a, b) =>
          a.pace!.secondsPerKm > b.pace!.secondsPerKm ? a : b,
        )
      : null;

  return (
    <div className="flex min-h-0 flex-grow flex-col overflow-hidden rounded-lg border border-outline-variant/30 bg-surface-container">
      <div className="flex items-center justify-between border-b border-outline-variant/30 bg-surface-container-high px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="label-caps text-on-surface">Splits</span>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="splits-table-content"
            className="flex items-center text-on-surface-variant sm:hidden"
          >
            <svg
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <span className="sr-only">{open ? 'Collapse splits' : 'Expand splits'}</span>
          </button>
        </div>
        <svg
          aria-hidden="true"
          className="h-4 w-4 text-on-surface-variant"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="10" y1="6" x2="21" y2="6" />
          <line x1="10" y1="12" x2="21" y2="12" />
          <line x1="10" y1="18" x2="21" y2="18" />
          <path d="M4 6h1v4" />
          <path d="M4 10h2" />
          <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
        </svg>
      </div>

      <div
        id="splits-table-content"
        className={
          open
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
            : 'hidden sm:flex sm:min-h-0 sm:flex-1 sm:flex-col sm:overflow-hidden'
        }
      >
        <div className="min-h-0 flex-1 overflow-auto max-h-[420px] lg:max-h-none">
          <table className="w-full text-left">
            <thead className="label-caps sticky top-0 border-b border-outline-variant/30 bg-surface-container text-on-surface-variant">
              <tr>
                <th className="px-4 py-2 font-normal">#</th>
                <th className="px-4 py-2 font-normal">Dist</th>
                {hasTime && <th className="px-4 py-2 font-normal">Time</th>}
                {hasPace && <th className="px-4 py-2 font-normal">Pace</th>}
                {hasElevation && <th className="px-4 py-2 text-right font-normal">Elev</th>}
              </tr>
            </thead>
            <tbody className="data-sm text-on-surface">
              {splits.map((split) => {
                const isFastest = split === fastestSplit;
                const isSlowest = split === slowestSplit;
                const paceSeconds = split.pace
                  ? unit === 'km'
                    ? split.pace.secondsPerKm
                    : split.pace.secondsPerMile
                  : null;
                const zone = split.pace ? getPaceZone(split.pace.secondsPerKm) : null;
                const zoneColor = zone ? PACE_ZONE_COLORS[zone] : undefined;

                const distLabel =
                  unit === 'km'
                    ? `${(split.distanceMeters / 1000).toFixed(2)} km`
                    : `${(split.distanceMeters / 1609.344).toFixed(2)} mi`;

                return (
                  <tr
                    key={split.index}
                    className="border-t border-outline-variant/10 transition-colors hover:bg-surface-variant/50"
                    style={
                      isFastest
                        ? { backgroundColor: 'rgba(34,197,94,0.10)' }
                        : isSlowest
                          ? { backgroundColor: 'rgba(239,68,68,0.10)' }
                          : undefined
                    }
                  >
                    <td className="px-4 py-2 text-on-surface-variant">{split.index}</td>
                    <td className="px-4 py-2 text-on-surface">{distLabel}</td>
                    {hasTime && (
                      <td className="px-4 py-2 text-on-surface">
                        {split.durationSeconds !== null
                          ? formatDuration(split.durationSeconds)
                          : '—'}
                      </td>
                    )}
                    {hasPace && (
                      <td className="px-4 py-2">
                        {paceSeconds !== null ? (
                          <span style={{ color: zoneColor }}>
                            {formatPace(paceSeconds, unit)}
                            {isFastest && <span className="ml-1 text-xs opacity-70">↑</span>}
                            {isSlowest && <span className="ml-1 text-xs opacity-70">↓</span>}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    {hasElevation && (
                      <td className="px-4 py-2 text-right text-on-surface-variant">
                        {split.elevationChangeMeters !== null
                          ? formatElevChange(split.elevationChangeMeters, unit)
                          : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
