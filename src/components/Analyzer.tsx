import { useState } from 'react';
import { DropZone } from './DropZone';
import { parseGpx } from '../lib/parse';
import type { TrackPoint } from '../types';

export function Analyzer() {
  const [points, setPoints] = useState<TrackPoint[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleFile = (xml: string, name: string) => {
    setError(null);
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
  };

  if (!points) {
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
      <button
        onClick={reset}
        className="text-sm text-on-surface-variant underline hover:text-on-surface"
      >
        Load a different file
      </button>
    </div>
  );
}
