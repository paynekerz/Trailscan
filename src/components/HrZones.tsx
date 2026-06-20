import { useMemo } from 'react';
import type { HrZone, TrackPoint } from '../types';
import { HR_ZONE_COLORS, HR_ZONE_LABELS, timeInHrZones } from '../lib/hrZones';

interface HrZonesProps {
  points: TrackPoint[];
  maxHr: number;
  onMaxHrChange: (value: number) => void;
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

const ZONES_HIGH_TO_LOW: HrZone[] = [5, 4, 3, 2, 1];

export function HrZones({ points, maxHr, onMaxHrChange }: HrZonesProps) {
  const totals = useMemo(() => timeInHrZones(points, maxHr), [points, maxHr]);
  const total = totals.reduce((a, b) => a + b, 0);

  if (total <= 0) return null;

  return (
    <div className="w-full rounded-xl border border-border-subtle bg-surface-elevated p-6 text-left">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-on-surface">Heart-rate zones</h2>
        <label className="flex items-center gap-2 text-sm text-on-surface-variant">
          Max HR
          <input
            type="number"
            min={100}
            max={230}
            value={maxHr}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next) && next > 0) onMaxHrChange(next);
            }}
            className="w-16 rounded-md border border-border-subtle bg-surface px-2 py-1 text-right text-on-surface"
            aria-label="Maximum heart rate in beats per minute"
          />
        </label>
      </div>

      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {([1, 2, 3, 4, 5] as HrZone[]).map((zone) => {
          const pct = (totals[zone] / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={zone}
              style={{ width: `${pct}%`, backgroundColor: HR_ZONE_COLORS[zone] }}
              title={`${HR_ZONE_LABELS[zone]} — ${pct.toFixed(0)}%`}
            />
          );
        })}
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {ZONES_HIGH_TO_LOW.map((zone) => {
          const pct = (totals[zone] / total) * 100;
          return (
            <li key={zone} className="flex items-center gap-3 text-sm">
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: HR_ZONE_COLORS[zone] }}
              />
              <span className="text-on-surface">{HR_ZONE_LABELS[zone]}</span>
              <span className="ml-auto tabular-nums text-on-surface-variant">
                {formatDuration(totals[zone])}
              </span>
              <span className="w-10 text-right tabular-nums text-on-surface-variant">
                {pct.toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
