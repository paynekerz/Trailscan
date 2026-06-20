import { useEffect, useRef, useMemo } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { TrackPoint } from '../types';
import { cumulativeDistances } from '../lib/geo';

interface ElevationChartProps {
  renderPoints: TrackPoint[];
  selectedIndex: number | null;
  onHover: (index: number | null) => void;
}

export function ElevationChart({ renderPoints, selectedIndex, onHover }: ElevationChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const selectedIndexRef = useRef<number | null>(selectedIndex);
  const onHoverRef = useRef(onHover);

  const hasElevation = renderPoints.some((p) => p.ele !== undefined);

  const [xData, yData] = useMemo(() => {
    const dists = cumulativeDistances(renderPoints);
    return [
      dists.map((d) => d / 1000),
      renderPoints.map((p) => p.ele ?? 0),
    ];
  }, [renderPoints]);

  useEffect(() => { onHoverRef.current = onHover; }, [onHover]);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
    uplotRef.current?.redraw(false);
  }, [selectedIndex]);

  useEffect(() => {
    if (!containerRef.current || !hasElevation) return;

    const width = containerRef.current.clientWidth || 700;

    const opts: uPlot.Options = {
      width,
      height: 180,
      scales: { x: { time: false } },
      series: [
        { label: '' },
        {
          label: 'Elevation (m)',
          stroke: '#7c77f0',
          fill: 'rgba(124,119,240,0.12)',
          width: 2,
        },
      ],
      axes: [
        { label: 'Distance (km)' },
        { label: 'm', size: 55 },
      ],
      cursor: { drag: { x: false, y: false } },
      hooks: {
        setCursor: [
          (u) => {
            const left = u.cursor.left ?? -1;
            onHoverRef.current(left >= 0 ? (u.cursor.idx ?? null) : null);
          },
        ],
        draw: [
          (u) => {
            const idx = selectedIndexRef.current;
            if (idx === null || idx < 0 || idx >= (u.data[0] as number[]).length) return;
            const xVal = (u.data[0] as number[])[idx];
            const x = u.valToPos(xVal, 'x', true);
            const { top, height } = u.bbox;
            const ctx = u.ctx;
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(250,204,21,0.85)';
            ctx.lineWidth = 2;
            ctx.moveTo(x, top);
            ctx.lineTo(x, top + height);
            ctx.stroke();
            ctx.restore();
          },
        ],
      },
    };

    const u = new uPlot(opts, [xData, yData], containerRef.current);
    uplotRef.current = u;

    const ro = new ResizeObserver(() => {
      if (containerRef.current && uplotRef.current) {
        uplotRef.current.setSize({ width: containerRef.current.clientWidth, height: 180 });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      u.destroy();
      uplotRef.current = null;
    };
  }, [hasElevation, xData, yData]);

  if (!hasElevation) return null;

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border-subtle">
      <div ref={containerRef} />
    </div>
  );
}
