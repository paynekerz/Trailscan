import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { lonLatToEN, projectToENU } from '../lib/projection';
import { smooth } from '../lib/geo';
import { pickTileGrid, type TileGrid } from '../lib/tiles';
import type { TrackPoint } from '../types';

const ROUTE_COLOR = '#fa5c1c'; // route orange (= secondary-container)
const START_COLOR = '#22c55e';
const FINISH_COLOR = '#ef4444';
const BG_COLOR = '#121413'; // surface

// Esri World Imagery — keyless, CORS-enabled aerial tiles. Note {z}/{y}/{x}
// order (Esri swaps y/x vs the OSM convention).
const ESRI_TILE_URL = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const ESRI_ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics';
const TILE_PX = 256;

// Vertical exaggeration: real elevation is tiny next to a multi-km run, so the
// terrain would read as flat at true scale. Tunable trade-off — high enough to
// see climbs, low enough that a big-vert route doesn't look like a wall.
const ELEVATION_EXAGGERATION = 2.5;
// Light smoothing of the (already downsampled) elevation so the ribbon doesn't
// jitter on raw-GPS noise. Small radius — we're smoothing the render array.
const SMOOTH_RADIUS = 2;
// Cap tube subdivisions so an ultra-length track can't blow up geometry cost.
const TUBE_SEGMENTS_CAP = 1500;
const TUBE_RADIAL_SEGMENTS = 8;

const FLY_SECONDS = 30; // full traversal at 1× speed
const SPEEDS = [1, 2, 4, 8] as const;

// Map ENU (east, north, up) onto three's axes: x = east, y = up, z = -north
// (north points into the screen so a north-up bird's-eye reads naturally).
function toVector3(e: number, n: number, u: number): THREE.Vector3 {
  return new THREE.Vector3(e, u, -n);
}

interface FlythroughProps {
  renderPoints: TrackPoint[];
  onHover?: (index: number | null) => void;
}

export function Flythrough({ renderPoints, onHover }: FlythroughProps) {
  const { curve, vectors, scale, ground } = useMemo(() => {
    const enu = projectToENU(renderPoints, ELEVATION_EXAGGERATION);
    const ups = smooth(
      enu.map((p) => p.u),
      SMOOTH_RADIUS,
    );
    const vecs = enu.map((p, i) => toVector3(p.e, p.n, ups[i]));
    const c = new THREE.CatmullRomCurve3(vecs, false, 'catmullrom', 0.5);
    const box = new THREE.Box3().setFromPoints(vecs);
    const diag = box.getSize(new THREE.Vector3()).length() || 1;

    // Geographic bbox + origin for the satellite ground drape; floor at the
    // lowest route elevation so the ribbon sits on the imagery.
    let west = Infinity,
      east = -Infinity,
      south = Infinity,
      north = -Infinity;
    for (const p of renderPoints) {
      if (p.lon < west) west = p.lon;
      if (p.lon > east) east = p.lon;
      if (p.lat < south) south = p.lat;
      if (p.lat > north) north = p.lat;
    }

    return {
      curve: c,
      vectors: vecs,
      scale: diag,
      ground: {
        grid: pickTileGrid({ west, east, south, north }),
        originLat: renderPoints[0].lat,
        originLon: renderPoints[0].lon,
        y: box.min.y,
      },
    };
  }, [renderPoints]);

  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  const togglePlay = () => {
    if (!playing && progressRef.current >= 1) {
      progressRef.current = 0;
      setProgress(0);
    }
    setPlaying((p) => !p);
  };

  if (vectors.length < 2) {
    return (
      <div className="flex h-80 w-full items-center justify-center rounded-lg border border-outline-variant/30 bg-surface-container-low text-sm text-on-surface-variant md:h-[400px]">
        Not enough points for a 3D flythrough.
      </div>
    );
  }

  return (
    <div className="relative h-80 w-full overflow-hidden rounded-lg border border-outline-variant/30 md:h-[400px]">
      <Canvas
        camera={{ fov: 60, near: scale * 0.001, far: scale * 12 }}
        gl={{ antialias: true }}
        style={{ background: BG_COLOR }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[scale, scale, scale * 0.5]} intensity={1.1} />
        <directionalLight position={[-scale, scale * 0.5, -scale]} intensity={0.4} />
        {/* Reference grid sits just below the imagery — visible only while
            tiles load or if they fail (opaque map plane covers it otherwise). */}
        <gridHelper
          args={[scale * 2, 24, '#2a2d2b', '#1f2220']}
          position={[0, ground.y - Math.max(1, scale * 0.002), 0]}
        />
        <MapGround
          grid={ground.grid}
          originLat={ground.originLat}
          originLon={ground.originLon}
          groundY={ground.y}
        />

        <mesh>
          <tubeGeometry
            args={[
              curve,
              Math.min(TUBE_SEGMENTS_CAP, Math.max(2, vectors.length * 2)),
              Math.max(2, scale * 0.0035),
              TUBE_RADIAL_SEGMENTS,
              false,
            ]}
          />
          <meshStandardMaterial color={ROUTE_COLOR} roughness={0.5} metalness={0.1} />
        </mesh>

        <Marker position={vectors[0]} color={START_COLOR} scale={scale} />
        <Marker position={vectors[vectors.length - 1]} color={FINISH_COLOR} scale={scale} />

        <Flight
          curve={curve}
          scale={scale}
          playing={playing}
          speed={speed}
          progressRef={progressRef}
          pointCount={vectors.length}
          onProgress={setProgress}
          onHover={onHover}
        />
      </Canvas>

      <Controls
        playing={playing}
        speed={speed}
        progress={progress}
        onToggle={togglePlay}
        onSpeed={setSpeed}
        onSeek={(v) => {
          progressRef.current = v;
          setProgress(v);
        }}
      />

      <div className="absolute right-2 top-2 z-[1000] max-w-[60%] truncate rounded bg-surface/70 px-1.5 py-0.5 text-right text-[10px] leading-tight text-on-surface-variant/80">
        {ESRI_ATTRIBUTION}
      </div>
    </div>
  );
}

// Drapes Esri satellite tiles onto a flat ground plane georeferenced to the
// track's local ENU frame. Tiles load async into a single mosaic canvas →
// CanvasTexture; a failed tile is simply skipped (leaves a dark patch) rather
// than failing the whole drape. crossOrigin='anonymous' is required so the
// canvas stays untainted and usable as a WebGL texture.
function MapGround({
  grid,
  originLat,
  originLon,
  groundY,
}: {
  grid: TileGrid;
  originLat: number;
  originLon: number;
  groundY: number;
}) {
  const gl = useThree((s) => s.gl);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = document.createElement('canvas');
    canvas.width = grid.cols * TILE_PX;
    canvas.height = grid.rows * TILE_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loads: Promise<void>[] = [];
    for (let col = 0; col < grid.cols; col++) {
      for (let row = 0; row < grid.rows; row++) {
        loads.push(
          new Promise<void>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              ctx.drawImage(img, col * TILE_PX, row * TILE_PX);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = ESRI_TILE_URL(grid.z, grid.x0 + col, grid.y0 + row);
          }),
        );
      }
    }

    void Promise.all(loads).then(() => {
      if (cancelled) return;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = gl.capabilities.getMaxAnisotropy();
      tex.needsUpdate = true;
      setTexture(tex);
    });

    return () => {
      cancelled = true;
    };
  }, [grid, gl]);

  // Georeference the mosaic's outer edges into the ENU frame. `e` depends only
  // on lon, `n` only on lat, so the projected mosaic is an axis-aligned rect.
  const { width, depth, cx, cz } = useMemo(() => {
    const eW = lonLatToEN(grid.west, originLat, originLat, originLon).e;
    const eE = lonLatToEN(grid.east, originLat, originLat, originLon).e;
    const nN = lonLatToEN(originLon, grid.north, originLat, originLon).n;
    const nS = lonLatToEN(originLon, grid.south, originLat, originLon).n;
    return {
      width: eE - eW,
      depth: nN - nS,
      cx: (eW + eE) / 2,
      cz: -(nN + nS) / 2, // world z = -north
    };
  }, [grid, originLat, originLon]);

  useEffect(() => () => texture?.dispose(), [texture]);

  if (!texture) return null;

  return (
    <mesh position={[cx, groundY, cz]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Marker({
  position,
  color,
  scale,
}: {
  position: THREE.Vector3;
  color: string;
  scale: number;
}) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[Math.max(4, scale * 0.008), 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
    </mesh>
  );
}

interface FlightProps {
  curve: THREE.CatmullRomCurve3;
  scale: number;
  playing: boolean;
  speed: number;
  progressRef: React.MutableRefObject<number>;
  pointCount: number;
  onProgress: (t: number) => void;
  onHover?: (index: number | null) => void;
}

// Drives the camera (and the moving "runner" sphere) along the curve each
// frame. State for the scrubber lives in the parent; this only reads/writes the
// shared progress ref so the rAF loop never depends on a React render.
function Flight({
  curve,
  scale,
  playing,
  speed,
  progressRef,
  pointCount,
  onProgress,
  onHover,
}: FlightProps) {
  const runner = useRef<THREE.Mesh>(null);
  const lastEmitted = useRef(-1);
  const initialized = useRef(false);
  const smoothLook = useRef(new THREE.Vector3());
  // Scratch vectors reused each frame to avoid per-frame allocation.
  const posRef = useRef(new THREE.Vector3());
  const behindRef = useRef(new THREE.Vector3());
  const aheadRef = useRef(new THREE.Vector3());

  // getPointAt takes a normalized arc-length t, so convert the metric camera
  // offsets into t-deltas via the curve's total length.
  const total = useMemo(() => curve.getLength() || 1, [curve]);
  const camUp = scale * 0.045;
  const dtBack = (scale * 0.07) / total;
  const dtAhead = (scale * 0.04) / total;

  useFrame(({ camera }, delta) => {
    if (playing) {
      const next = progressRef.current + delta / (FLY_SECONDS / speed);
      progressRef.current = next >= 1 ? 1 : next;
      onProgress(progressRef.current);
    }
    const t = Math.min(Math.max(progressRef.current, 0), 1);

    // Anchor the camera at a point a fixed distance *behind* on the curve and
    // aim at one *ahead* — both move smoothly with t, unlike the raw tangent,
    // which wobbles on noisy GPS and made the follow-cam jitter.
    const pos = curve.getPointAt(t, posRef.current);
    const behind = curve.getPointAt(Math.max(t - dtBack, 0), behindRef.current);
    const ahead = curve.getPointAt(Math.min(t + dtAhead, 1), aheadRef.current);
    behind.y += camUp;

    if (!initialized.current) {
      camera.position.copy(behind);
      smoothLook.current.copy(ahead);
      initialized.current = true;
    } else {
      camera.position.lerp(behind, 0.08);
      smoothLook.current.lerp(ahead, 0.1);
    }
    camera.lookAt(smoothLook.current);

    if (runner.current) runner.current.position.copy(pos);

    if (onHover) {
      const idx = Math.round(t * (pointCount - 1));
      if (idx !== lastEmitted.current) {
        lastEmitted.current = idx;
        onHover(idx);
      }
    }
  });

  return (
    <mesh ref={runner}>
      <sphereGeometry args={[Math.max(5, scale * 0.01), 16, 16]} />
      <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.4} />
    </mesh>
  );
}

interface ControlsProps {
  playing: boolean;
  speed: number;
  progress: number;
  onToggle: () => void;
  onSpeed: (s: (typeof SPEEDS)[number]) => void;
  onSeek: (v: number) => void;
}

function Controls({ playing, speed, progress, onToggle, onSpeed, onSeek }: ControlsProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-[1000] flex items-center gap-3 bg-gradient-to-t from-surface/90 to-transparent px-3 pb-3 pt-8">
      <button
        onClick={onToggle}
        aria-label={playing ? 'Pause flythrough' : 'Play flythrough'}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container transition-transform active:scale-95"
      >
        {playing ? (
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" />
          </svg>
        )}
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={progress}
        aria-label="Flythrough position"
        onChange={(e) => onSeek(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-variant accent-secondary-container"
      />

      <div className="flex shrink-0 items-center gap-1 rounded-lg border border-outline-variant/50 bg-surface-container-high p-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeed(s)}
            className={`label-caps rounded px-2 py-1 transition-colors ${
              speed === s
                ? 'bg-surface-variant text-on-surface shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
