// Slippy-map (Web Mercator) tile math for draping raster tiles under the 3D
// route. Pure — no DOM, no fetch — so it's unit-testable. The component layer
// turns a TileGrid into image URLs + a textured ground plane.

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function lon2tileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

export function lat2tileY(lat: number, z: number): number {
  const r = toRad(lat);
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

export function tile2lon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

export function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return toDeg(Math.atan(Math.sinh(n)));
}

export interface BBox {
  west: number;
  east: number;
  south: number;
  north: number;
}

export interface TileGrid {
  z: number;
  x0: number; // west-most tile x (inclusive)
  x1: number; // east-most tile x (inclusive)
  y0: number; // north-most tile y (inclusive; smaller y = further north)
  y1: number; // south-most tile y (inclusive)
  cols: number;
  rows: number;
  // Geographic extent of the *mosaic* (outer tile edges), for georeferencing.
  west: number;
  east: number;
  north: number;
  south: number;
}

function gridAtZoom(b: BBox, z: number): TileGrid {
  const x0 = Math.floor(lon2tileX(b.west, z));
  const x1 = Math.floor(lon2tileX(b.east, z));
  const y0 = Math.floor(lat2tileY(b.north, z));
  const y1 = Math.floor(lat2tileY(b.south, z));
  return {
    z,
    x0,
    x1,
    y0,
    y1,
    cols: x1 - x0 + 1,
    rows: y1 - y0 + 1,
    west: tile2lon(x0, z),
    east: tile2lon(x1 + 1, z),
    north: tile2lat(y0, z),
    south: tile2lat(y1 + 1, z),
  };
}

// Pick the highest zoom whose tile count over the bbox stays within `maxTiles`,
// so detail is maximized without an unbounded number of requests on long routes.
export function pickTileGrid(
  bbox: BBox,
  opts: { maxTiles?: number; maxZoom?: number; minZoom?: number } = {},
): TileGrid {
  const maxTiles = opts.maxTiles ?? 24;
  const maxZoom = opts.maxZoom ?? 17;
  const minZoom = opts.minZoom ?? 3;
  for (let z = maxZoom; z > minZoom; z--) {
    const g = gridAtZoom(bbox, z);
    if (g.cols * g.rows <= maxTiles) return g;
  }
  return gridAtZoom(bbox, minZoom);
}
