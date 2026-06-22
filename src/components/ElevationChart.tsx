import { useEffect, useRef, useMemo } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { PaceZone, TrackPoint } from '../types';
import { cumulativeDistances } from '../lib/geo';
import { PACE_ZONE_COLORS } from '../lib/paceZones';

const HR_COLOR = '#ef4444';
const CAD_COLOR = '#14b8a6';

// uPlot canvas axes default to black; match the Rugged Utility palette + fonts.
const AXIS_STROKE = '#c3c8c2'; // on-surface-variant
const GRID_STROKE = 'rgba(141,146,141,0.15)';
const TICK_STROKE = 'rgba(141,146,141,0.3)';
const AXIS_VALUE_FONT = '11px "JetBrains Mono", ui-monospace, monospace';
const AXIS_LABEL_FONT = '600 12px "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif';

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
  const hasHr = renderPoints.some((p) => p.hr !== undefined);
  const hasCad = renderPoints.some((p) => p.cad !== undefined);
  const imperial = unit === 'mi';

  const data = useMemo<uPlot.AlignedData>(() => {
    const dists = cumulativeDistances(renderPoints);
    const x = imperial ? dists.map((d) => d / 1609.344) : dists.map((d) => d / 1000);
    const ele = renderPoints.map((p) =>
      p.ele !== undefined ? (imperial ? p.ele * 3.28084 : p.ele) : 0,
    );
    const series: (number | null)[][] = [x, ele];
    if (hasHr) series.push(renderPoints.map((p) => p.hr ?? null));
    if (hasCad) series.push(renderPoints.map((p) => p.cad ?? null));
    return series as uPlot.AlignedData;
  }, [renderPoints, imperial, hasHr, hasCad]);

  useEffect(() => { onHoverRef.current = onHover; }, [onHover]);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
    uplotRef.current?.redraw(false);
  }, [selectedIndex]);

  useEffect(() => {
    if (!containerRef.current || !hasElevation) return;

    const width = containerRef.current.clientWidth || 700;
    const zones = pointZones ?? null;

    const series: uPlot.Series[] = [
      { label: '' },
      {
        label: imperial ? 'Elevation (ft)' : 'Elevation (m)',
        stroke: '#fa5c1c',
        fill: 'rgba(250,92,28,0.15)',
        width: 2,
      },
    ];
    // Overlay scales auto-fit to their own data; HR gets a right axis, cadence
    // shares the chart without its own axis to keep the right edge uncluttered.
    if (hasHr) series.push({ label: 'HR (bpm)', stroke: HR_COLOR, width: 1.5, scale: 'hr' });
    if (hasCad) series.push({ label: 'Cadence (spm)', stroke: CAD_COLOR, width: 1, scale: 'cad', dash: [4, 3] });

    const axisBase: Partial<uPlot.Axis> = {
      stroke: AXIS_STROKE,
      grid: { stroke: GRID_STROKE, width: 1 },
      ticks: { stroke: TICK_STROKE, width: 1 },
      font: AXIS_VALUE_FONT,
      labelFont: AXIS_LABEL_FONT,
    };

    const axes: uPlot.Axis[] = [
      { ...axisBase, label: imperial ? 'Distance (mi)' : 'Distance (km)' },
      { ...axisBase, label: imperial ? 'ft' : 'm', size: 55 },
    ];
    if (hasHr) {
      axes.push({ ...axisBase, scale: 'hr', side: 1, label: 'bpm', size: 50, stroke: HR_COLOR, grid: { show: false } });
    }

    const opts: uPlot.Options = {
      width,
      height: 180,
      scales: { x: { time: false } },
      series,
      axes,
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

    const u = new uPlot(opts, data, containerRef.current);
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
  }, [hasElevation, hasHr, hasCad, data, pointZones, imperial]);

  if (!hasElevation) return null;

  return (
    <div className="w-full overflow-hidden rounded-lg border border-outline-variant/30 bg-surface-container-low p-4">
      <div className="mb-3">
        <span className="label-caps text-on-surface-variant">Elevation Profile</span>
      </div>
      <div ref={containerRef} />
    </div>
  );
}
