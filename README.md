# GPX Analyzer

Drop in a `.gpx` file and get the full picture: route map, elevation profile,
distance, elevation gain/loss, pace and speed zones, splits, and heart-rate /
cadence if the file has them. Everything runs in the browser — the file never
leaves the device. No backend, no AI.

## What it does

- Parse a GPX track entirely client-side (privacy by default)
- Distance (haversine), elevation gain/loss, moving time, average pace
- Interactive route map with start/finish markers
- Elevation profile synced to the map on hover
- Per-km / per-mile splits and pace zones
- Heart-rate and cadence from `TrackPointExtension` when present
- Exportable summary card (PNG)

## Stack

| Package                     | Version             | Role                                |
| --------------------------- | ------------------- | ----------------------------------- |
| `astro`                     | `^6.3.1`            | Framework, routing, build           |
| `@astrojs/react`            | `^5.0.4`            | React island integration            |
| `react` / `react-dom`       | `^19.2.6`           | UI library                          |
| `tailwindcss`               | `^4.3.0`            | Utility CSS (v4, CSS-first)         |
| `@tailwindcss/vite`         | `^4.3.0`            | Vite plugin                         |
| `@astrojs/vercel`           | latest              | Vercel adapter (`output: 'static'`) |
| `@tmcw/togeojson`           | `^7.0.0`            | GPX/TCX -> GeoJSON parsing          |
| `react-leaflet` / `leaflet` | `^5.0.0` / `^1.9.0` | Route map                           |
| `uplot`                     | `^1.6.0`            | Elevation / pace charts             |
| Node.js                     | `>=22.12.0`         | Runtime                             |

> Matches the static baseline. All parsing and analysis happen in client islands;
> the deployed artifact is a static site. `togeojson` covers geometry; a small
> custom reader pulls the `gpxtpx` heart-rate/cadence extensions that GeoJSON
> conversion drops.

## Getting started

```bash
pnpm install
pnpm dev          # http://localhost:4321
pnpm build
pnpm preview
```

## Privacy

Files are parsed in your browser and never uploaded. There is no server.

## License

MIT
