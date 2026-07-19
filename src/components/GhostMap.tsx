import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet';

interface GhostMapProps {
  positionsA: [number, number][];
  positionsB: [number, number][];
  bounds: [[number, number], [number, number]];
  markerA: [number, number] | null;
  markerB: [number, number] | null;
  colorA: string;
  colorB: string;
}

// Presentational only — the race animation state (current distance, marker
// positions) is owned by GhostRace. This component just draws both routes and
// the two moving ghosts at the positions it's handed. Lazy-loaded so Leaflet
// stays out of the initial Analyzer chunk (Core Web Vitals contract).
export function GhostMap({
  positionsA,
  positionsB,
  bounds,
  markerA,
  markerB,
  colorA,
  colorB,
}: GhostMapProps) {
  return (
    <div className="relative h-80 w-full overflow-hidden rounded-lg border border-outline-variant/30 md:h-[400px]">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [24, 24] }}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={positionsA} pathOptions={{ color: colorA, weight: 3, opacity: 0.85 }} />
        <Polyline positions={positionsB} pathOptions={{ color: colorB, weight: 3, opacity: 0.85 }} />
        {markerA && (
          <CircleMarker
            center={markerA}
            radius={7}
            pathOptions={{ color: '#000', fillColor: colorA, fillOpacity: 1, weight: 2 }}
          />
        )}
        {markerB && (
          <CircleMarker
            center={markerB}
            radius={7}
            pathOptions={{ color: '#000', fillColor: colorB, fillOpacity: 1, weight: 2 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
