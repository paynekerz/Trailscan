import { lazy, Suspense, useState } from 'react';
import { RouteMap } from './RouteMap';
import type { PaceZone, TrackPoint } from '../types';

// Three.js is heavy — keep it out of the (already deferred) RouteMap/Leaflet
// chunk and only fetch it when the user actually opens the 3D view.
const Flythrough = lazy(() => import('./Flythrough').then((m) => ({ default: m.Flythrough })));

type View = '2d' | '3d';

interface MapPanelProps {
  renderPoints: TrackPoint[];
  bounds: [[number, number], [number, number]];
  selectedIndex: number | null;
  onHover: (index: number | null) => void;
  pointZones?: (PaceZone | null)[] | null;
  pointColors?: (string | null)[] | null;
  hasElevation: boolean;
}

// Owns the 2D ⇄ 3D swap for the map panel. The toggle only appears when the
// track has elevation — a flythrough of a flat ribbon is meaningless. The
// Speed/Zones toggle lives inside RouteMap (top-right); this one sits top-left
// so the two never collide.
export function MapPanel({ hasElevation, ...routeProps }: MapPanelProps) {
  const [view, setView] = useState<View>('2d');
  const active: View = hasElevation ? view : '2d';

  return (
    <div className="relative">
      {hasElevation && (
        <div className="absolute left-2 top-2 z-[1000] flex items-center gap-1 rounded-lg border border-outline-variant/50 bg-surface-container-high/90 p-1 backdrop-blur-sm">
          {(['2d', '3d'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`label-caps rounded px-3 py-1 transition-colors ${
                active === v
                  ? 'bg-surface-variant text-on-surface shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {v === '2d' ? 'Map' : '3D'}
            </button>
          ))}
        </div>
      )}

      {active === '2d' ? (
        <RouteMap {...routeProps} />
      ) : (
        <Suspense
          fallback={
            <div className="h-80 w-full animate-pulse rounded-lg border border-outline-variant/30 bg-surface-container md:h-[400px]" />
          }
        >
          <Flythrough renderPoints={routeProps.renderPoints} onHover={routeProps.onHover} />
        </Suspense>
      )}
    </div>
  );
}
