import 'leaflet/dist/leaflet.css';
import { useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMapEvents } from 'react-leaflet';
import type { PaceZone, TrackPoint } from '../types';
import { PACE_ZONE_COLORS } from '../lib/paceZones';

interface RouteMapProps {
  renderPoints: TrackPoint[];
  bounds: [[number, number], [number, number]];
  selectedIndex: number | null;
  onHover: (index: number | null) => void;
  pointZones?: (PaceZone | null)[] | null;
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

export function RouteMap({ renderPoints, bounds, selectedIndex, onHover, pointZones }: RouteMapProps) {
  const positions = useMemo<[number, number][]>(
    () => renderPoints.map((p) => [p.lat, p.lon]),
    [renderPoints],
  );

  // Group consecutive same-zone segments into multi-point polylines.
  // Zone at index i applies to the segment entering point i (i.e., segment i-1 → i).
  const zonedPolylines = useMemo(() => {
    if (!pointZones || renderPoints.length < 2 || pointZones.length !== renderPoints.length) {
      return null;
    }
    const lines: { color: string; positions: [number, number][] }[] = [];
    let i = 0;
    while (i < renderPoints.length - 1) {
      const zone = pointZones[i + 1];
      const color = zone ? PACE_ZONE_COLORS[zone] : '#7c77f0';
      const pts: [number, number][] = [[renderPoints[i].lat, renderPoints[i].lon]];
      let j = i + 1;
      while (j < renderPoints.length - 1 && pointZones[j + 1] === zone) {
        pts.push([renderPoints[j].lat, renderPoints[j].lon]);
        j++;
      }
      pts.push([renderPoints[j].lat, renderPoints[j].lon]);
      lines.push({ color, positions: pts });
      i = j; // overlap by one point for visual continuity
    }
    return lines;
  }, [renderPoints, pointZones]);

  const selectedPos = selectedIndex !== null ? renderPoints[selectedIndex] : null;

  return (
    <div className="h-96 w-full overflow-hidden rounded-xl border border-border-subtle">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [24, 24] }}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {zonedPolylines ? (
          zonedPolylines.map((seg, idx) => (
            <Polyline
              key={idx}
              positions={seg.positions}
              pathOptions={{ color: seg.color, weight: 3, opacity: 0.9 }}
            />
          ))
        ) : (
          <Polyline
            positions={positions}
            pathOptions={{ color: '#7c77f0', weight: 3, opacity: 0.9 }}
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
