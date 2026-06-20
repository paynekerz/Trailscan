import type { TrackPoint } from '../types';

export interface PointExtension {
  hr?: number;
  cad?: number;
}

// @tmcw/togeojson parses GPX geometry but discards the Garmin gpxtpx
// TrackPointExtension (heart rate, cadence). We re-extract those here with a
// raw XML pass and merge them back onto the points by array index.
//
// INVARIANT: entry i of extractExtensions() corresponds to the i-th <trkpt> in
// document order — exactly the order togeojson emits track points
// (trk → trkseg → trkpt). mergeExtensions() therefore aligns extension i with
// TrackPoint i. This holds only because the points array is built from track
// points alone (see parse.ts); routes/waypoints carry no gpxtpx data and never
// enter the array. If parse.ts ever sources points from anything but <trkpt>,
// this index alignment breaks.

const toNum = (el: Element | null): number | undefined => {
  if (!el) return undefined;
  const n = Number(el.textContent);
  return Number.isFinite(n) ? n : undefined;
};

// gpxtpx's vendor prefix varies between exporters (gpxtpx, ns3, gpxdata, …),
// so match by localName rather than the qualified tag name.
function firstByLocalName(parent: Element, localName: string): Element | null {
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName.toLowerCase() === localName) return all[i];
  }
  return null;
}

function readExtension(trkpt: Element): PointExtension {
  const ext: PointExtension = {};
  const hr = toNum(firstByLocalName(trkpt, 'hr'));
  const cad = toNum(firstByLocalName(trkpt, 'cad'));
  if (hr !== undefined) ext.hr = hr;
  if (cad !== undefined) ext.cad = cad;
  return ext;
}

export function extractExtensions(xmlString: string): PointExtension[] {
  const doc = new DOMParser().parseFromString(xmlString, 'application/xml');
  const trkpts = doc.getElementsByTagName('trkpt');
  const out: PointExtension[] = [];
  for (let i = 0; i < trkpts.length; i++) out.push(readExtension(trkpts[i]));
  return out;
}

// Mutates points in place: copies hr/cad onto each point by index. See the
// INVARIANT above for why a positional merge is correct.
export function mergeExtensions(points: TrackPoint[], xmlString: string): void {
  const ext = extractExtensions(xmlString);
  const len = Math.min(points.length, ext.length);
  for (let i = 0; i < len; i++) {
    if (ext[i].hr !== undefined) points[i].hr = ext[i].hr;
    if (ext[i].cad !== undefined) points[i].cad = ext[i].cad;
  }
}
