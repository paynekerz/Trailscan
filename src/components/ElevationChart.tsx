import { useEffect, useRef, useMemo } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { PaceZone, TrackPoint } from '../types';
import { cumulativeDistances } from '../lib/geo';
import { PACE_ZONE_COLORS } from '../lib/paceZones';

interface ElevationChartProps {
  renderPoints: TrackPoint[];
  selectedIndex: number | null;
  onHover: (index: number | null) => void;
  pointZones?: (PaceZone | null)[] | null;
  unit?: 'km' | 'mi';
}

export function ElevationChart({ renderPoints, selectedIndex, onHover, pointZones, unit = 'km' }: ElevationChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const selectedIndexRef = useRef<number | null>(selectedIndex);
  const onHoverRef = useRef(onHover);

  const hasElevation = renderPoints.some((p) => p.ele !== undefined);
  const imperial = unit === 'mi';

  const [xData, yData] = useMemo(() => {
    const dists = cumulativeDistances(renderPoints);
    return [
      imperial ? dists.map((d) => d / 1609.344) : dists.map((d) => d / 1000),
      renderPoints.map((p) => p.ele !== undefined ? (imperial ? p.ele * 3.28084 : p.ele) : 0),
    ];
  }, [renderPoints, imperial]);

  useEffect(() => { onHoverRef.current = onHover; }, [onHover]);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
    uplotRef.current?.redraw(false);
  }, [selectedIndex]);

  useEffect(() => {
    if (!containerRef.current || !hasElevation) return;

    const width = containerRef.current.clientWidth || 700;
    const zones = pointZones ?? null;

    const opts: uPlot.Options = {
      width,
      height: 180,
      scales: { x: { time: false } },
      series: [
        { label: '' },
        {
          label: imperial ? 'Elevation (ft)' : 'Elevation (m)',
          stroke: '#7c77f0',
          fill: 'rgba(124,119,240,0.12)',
          width: 2,
        },
      ],
      axes: [
        { label: imperial ? 'Distance (mi)' : 'Distance (km)' },
        { label: imperial ? 'ft' : 'm', size: 55 },
      ],
      cursor: { drag: { x: false, y: false } },
      hooks: {
        drawClear: [
          (u) => {
            if (!zones || zones.length === 0) return;
            const ctx = u.ctx;
            const { top, height } = u.bbox;
            const xArr = u.data[0] as number[];
            const len = Math.min(zones.length, xArr.length);
            let i = 0;
            while (i < len) {
              const zone = zones[i];
              if (zone === null) { i++; continue; }
              let j = i + 1;
              while (j < len && zones[j] === zone) j++;
              const x0 = u.valToPos(xArr[i], 'x', true);
              const x1 = u.valToPos(xArr[Math.min(j, xArr.length - 1)], 'x', true);
              ctx.save();
              ctx.fillStyle = PACE_ZONE_COLORS[zone] + '2a';
              ctx.fillRect(x0, top, x1 - x0, height);
              ctx.restore();
              i = j;
            }
          },
        ],
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
  }, [hasElevation, xData, yData, pointZones, imperial]);

  if (!hasElevation) return null;

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border-subtle">
      <div ref={containerRef} />
    </div>
  );
}
