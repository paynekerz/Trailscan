import { lon2tileX, lat2tileY, tile2lon, tile2lat, pickTileGrid } from '../src/lib/tiles';

describe('slippy tile math', () => {
  it('maps the antimeridian/equator origin at zoom 0', () => {
    expect(lon2tileX(-180, 0)).toBeCloseTo(0, 9);
    expect(lon2tileX(0, 0)).toBeCloseTo(0.5, 9);
    expect(lat2tileY(0, 0)).toBeCloseTo(0.5, 9);
  });

  it('round-trips tile ↔ lon/lat', () => {
    const z = 14;
    for (const [lon, lat] of [
      [-94.58, 39.1],
      [2.35, 48.85],
      [139.7, 35.68],
    ]) {
      const x = lon2tileX(lon, z);
      const y = lat2tileY(lat, z);
      expect(tile2lon(x, z)).toBeCloseTo(lon, 6);
      expect(tile2lat(y, z)).toBeCloseTo(lat, 6);
    }
  });

  it('clamps to the Web Mercator latitude limit at the poles of the grid', () => {
    expect(tile2lat(0, 0)).toBeCloseTo(85.0511, 3);
  });

  it('keeps the tile count within maxTiles and prefers higher zoom', () => {
    const bbox = { west: -94.6, east: -94.5, south: 39.0, north: 39.1 };
    const g = pickTileGrid(bbox, { maxTiles: 24 });
    expect(g.cols * g.rows).toBeLessThanOrEqual(24);
    // Mosaic must fully contain the requested bbox.
    expect(g.west).toBeLessThanOrEqual(bbox.west);
    expect(g.east).toBeGreaterThanOrEqual(bbox.east);
    expect(g.north).toBeGreaterThanOrEqual(bbox.north);
    expect(g.south).toBeLessThanOrEqual(bbox.south);
  });

  it('falls back to a coarser zoom for a very large bbox', () => {
    const bbox = { west: -120, east: -70, south: 25, north: 49 };
    const g = pickTileGrid(bbox, { maxTiles: 24 });
    expect(g.cols * g.rows).toBeLessThanOrEqual(24);
    expect(g.z).toBeLessThan(10);
  });
});
