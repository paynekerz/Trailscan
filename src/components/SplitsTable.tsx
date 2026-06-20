import type { Split } from '../types';
import { getPaceZone, PACE_ZONE_COLORS } from '../lib/paceZones';

interface SplitsTableProps {
  splits: Split[];
  unit: 'km' | 'mi';
  onUnitChange: (unit: 'km' | 'mi') => void;
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

export function SplitsTable({ splits, unit, onUnitChange }: SplitsTableProps) {
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
    <div className="w-full overflow-hidden rounded-xl border border-border-subtle">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-medium text-on-surface">Splits</h2>
        <div className="flex overflow-hidden rounded-lg border border-border-subtle text-xs">
          <button
            onClick={() => onUnitChange('km')}
            className={`px-3 py-1 transition-colors ${
              unit === 'km'
                ? 'bg-surface-elevated text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            km
          </button>
          <button
            onClick={() => onUnitChange('mi')}
            className={`px-3 py-1 transition-colors ${
              unit === 'mi'
                ? 'bg-surface-elevated text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            mi
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-border-subtle text-left text-xs text-on-surface-variant">
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">Dist</th>
              {hasTime && <th className="px-4 py-2 font-medium">Time</th>}
              {hasPace && <th className="px-4 py-2 font-medium">Pace</th>}
              {hasElevation && <th className="px-4 py-2 font-medium">Elev</th>}
            </tr>
          </thead>
          <tbody>
            {splits.map((split) => {
              const isFastest = split === fastestSplit;
              const isSlowest = split === slowestSplit;
              const paceSeconds =
                split.pace
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
                  className="border-t border-border-subtle"
                  style={
                    isFastest
                      ? { backgroundColor: 'rgba(34,197,94,0.08)' }
                      : isSlowest
                        ? { backgroundColor: 'rgba(239,68,68,0.08)' }
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
                          {isFastest && (
                            <span className="ml-1 text-xs opacity-70">↑</span>
                          )}
                          {isSlowest && (
                            <span className="ml-1 text-xs opacity-70">↓</span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  {hasElevation && (
                    <td className="px-4 py-2 text-on-surface">
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
  );
}
