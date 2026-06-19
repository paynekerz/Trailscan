export interface TrackPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: Date;
  hr?: number;
  cad?: number;
}

export interface TrackSummary {
  name: string;
  pointCount: number;
  hasElevation: boolean;
  hasTime: boolean;
  hasHr: boolean;
  hasCad: boolean;
}
