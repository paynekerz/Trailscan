import 'leaflet/dist/leaflet.css';
import { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMapEvents } from 'react-leaflet';
import type { PaceZone, TrackPoint } from '../types';
import { PACE_ZONE_COLORS } from '../lib/paceZones';

const PLAIN_COLOR = '#fa5c1c';

type ColorMode = 'speed' | 'zones';

interface RouteMapProps {
  renderPoints: TrackPoint[];
  bounds: [[number, number], [number, number]];
  selectedIndex: number | null;
  onHover: (index: number | null) => void;
  pointZones?: (PaceZone | null)[] | null;
  pointColors?: (string | null)[] | null;
}

// Group consecutive segments sharing a color into multi-point polylines.
// `colorAt(k)` returns the color of the segment ending at point k (segment
// k-1 → k), matching how pace data is indexed onto points.
function buildSegments(
  renderPoints: TrackPoint[],
  colorAt: (segEndIndex: number) => string | null,
  fallback: string,
): { color: string; positions: [number, number][] }[] {
  const lines: { color: string; positions: [number, number][] }[] = [];
  let i = 0;
  while (i < renderPoints.length - 1) {
    const color = colorAt(i + 1) ?? fallback;
    const pts: [number, number][] = [[renderPoints[i].lat, renderPoints[i].lon]];
    let j = i + 1;
    while (j < renderPoints.length - 1 && (colorAt(j + 1) ?? fallback) === color) {
      pts.push([renderPoints[j].lat, renderPoints[j].lon]);
      j++;
    }
    pts.push([renderPoints[j].lat, renderPoints[j].lon]);
    lines.push({ color, positions: pts });
    i = j; // overlap by one point for visual continuity
  }
  return lines;
}

function MapHoverListener({
  renderPoints,
  onHover,
}: {
  renderPoints: TrackPoint[];
  onHover: (index: number | null) => void;
}) {
  useMapEvents({
    mousemove(e) {
      const { lat, lng } = e.latlng;
      let minDist = Infinity;
      let minIdx = 0;
      for (let i = 0; i < renderPoints.length; i++) {
        const dlat = renderPoints[i].lat - lat;
        const dlon = renderPoints[i].lon - lng;
        const d2 = dlat * dlat + dlon * dlon;
        if (d2 < minDist) {
          minDist = d2;
          minIdx = i;
        }
      }
      onHover(minIdx);
    },
    mouseout() {
      onHover(null);
    },
  });
  return null;
}

export function RouteMap({ renderPoints, bounds, selectedIndex, onHover, pointZones, pointColors }: RouteMapProps) {
  const positions = useMemo<[number, number][]>(
    () => renderPoints.map((p) => [p.lat, p.lon]),
    [renderPoints],
  );

  const zonesValid =
    !!pointZones && renderPoints.length >= 2 && pointZones.length === renderPoints.length;
  const colorsValid =
    !!pointColors && renderPoints.length >= 2 && pointColors.length === renderPoints.length;

  // The pace arrays can be present in shape but hold only nulls when a file has
  // timestamps that never advance (all-equal times). In that case the toggle is
  // shown for affordance but disabled — switching modes would do nothing.
  const hasPaceData =
    (colorsValid && pointColors!.some((c) => c !== null)) ||
    (zonesValid && pointZones!.some((z) => z !== null));

  // Default to the continuous speed gradient when pace data exists; fall back to
  // discrete pace zones. Both derive from the same pace data, so the toggle only
  // shows when those arrays are present.
  const [colorMode, setColorMode] = useState<ColorMode>('speed');
  const showToggle = colorsValid && zonesValid;
  const effectiveMode: ColorMode = colorMode === 'speed' && colorsValid ? 'speed' : 'zones';

  const segments = useMemo(() => {
    if (effectiveMode === 'speed' && colorsValid) {
      return buildSegments(renderPoints, (k) => pointColors![k], PLAIN_COLOR);
    }
    if (zonesValid) {
      return buildSegments(
        renderPoints,
        (k) => (pointZones![k] ? PACE_ZONE_COLORS[pointZones![k] as PaceZone] : null),
        PLAIN_COLOR,
      );
    }
    return null;
  }, [renderPoints, pointColors, pointZones, effectiveMode, colorsValid, zonesValid]);

  const selectedPos = selectedIndex !== null ? renderPoints[selectedIndex] : null;

  return (
    <div className="relative h-80 w-full overflow-hidden rounded-lg border border-outline-variant/30 md:h-[400px]">
      {showToggle && (
        <div className="absolute right-2 top-2 z-[1000] flex items-center gap-1 rounded-lg border border-outline-variant/50 bg-surface-container-high/90 p-1 backdrop-blur-sm">
          {(['speed', 'zones'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setColorMode(m)}
              disabled={!hasPaceData}
              title={hasPaceData ? undefined : 'No pace data — needs per-point timestamps'}
              className={`label-caps rounded px-3 py-1 transition-colors ${
                !hasPaceData
                  ? 'cursor-not-allowed text-on-surface-variant/40'
                  : effectiveMode === m
                    ? 'bg-surface-variant text-on-surface shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]'
                    : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {m === 'speed' ? 'Speed' : 'Zones'}
            </button>
          ))}
        </div>
      )}
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [24, 24] }}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {segments ? (
          segments.map((seg, idx) => (
            <Polyline
              key={idx}
              positions={seg.positions}
              pathOptions={{ color: seg.color, weight: 3, opacity: 0.9 }}
            />
          ))
        ) : (
          <Polyline
            positions={positions}
            pathOptions={{ color: PLAIN_COLOR, weight: 3, opacity: 0.9 }}
          />
        )}
        <CircleMarker
          center={positions[0]}
          radius={7}
          pathOptions={{ color: '#16a34a', fillColor: '#22c55e', fillOpacity: 1, weight: 2 }}
        />
        <CircleMarker
          center={positions[positions.length - 1]}
          radius={7}
          pathOptions={{ color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }}
        />
        {selectedPos && (
          <CircleMarker
            center={[selectedPos.lat, selectedPos.lon]}
            radius={6}
            pathOptions={{ color: '#ca8a04', fillColor: '#facc15', fillOpacity: 1, weight: 2 }}
          />
        )}
        <MapHoverListener renderPoints={renderPoints} onHover={onHover} />
      </MapContainer>
    </div>
  );
}
