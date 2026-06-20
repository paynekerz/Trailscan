import { useState, useMemo } from 'react';
import { DropZone } from './DropZone';
import { RouteMap } from './RouteMap';
import { ElevationChart } from './ElevationChart';
import { parseGpx } from '../lib/parse';
import { downsample } from '../lib/geo';
import type { TrackPoint } from '../types';

const MAX_RENDER_POINTS = 2000;

export function Analyzer() {
  const [points, setPoints] = useState<TrackPoint[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

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

  const handleFile = (xml: string, name: string) => {
    setError(null);
    setSelectedIndex(null);
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
    }
  };

  const reset = () => {
    setPoints(null);
    setFileName('');
    setError(null);
    setSelectedIndex(null);
  };

  if (!points || !bounds) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DropZone onFile={handleFile} onError={setError} />
        {error && (
          <p role="alert" className="text-center text-sm text-red-400">
            {error}
          </p>
        )}
      </div>
    );
  }

  const hasElevation = points.some((p) => p.ele !== undefined);
  const hasTime = points.some((p) => p.time !== undefined);
  const hasHr = points.some((p) => p.hr !== undefined);

  const badges = [
    hasElevation && 'elevation',
    hasTime && 'timestamps',
    hasHr && 'heart-rate',
  ].filter(Boolean);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="w-full rounded-xl border border-border-subtle bg-surface-elevated px-6 py-4 text-left">
        <p className="font-medium text-on-surface">{fileName}</p>
        <p className="mt-1 text-sm text-on-surface-variant">
          {points.length.toLocaleString()} track points
          {badges.length > 0 && ' · ' + badges.join(' · ')}
        </p>
      </div>
      <RouteMap
        renderPoints={renderPoints}
        bounds={bounds}
        selectedIndex={selectedIndex}
        onHover={setSelectedIndex}
      />
      <ElevationChart
        renderPoints={renderPoints}
        selectedIndex={selectedIndex}
        onHover={setSelectedIndex}
      />
      <button
        onClick={reset}
        className="text-sm text-on-surface-variant underline hover:text-on-surface"
      >
        Load a different file
      </button>
    </div>
  );
}
