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

export interface PaceMetric {
  secondsPerKm: number;
  secondsPerMile: number;
}

export interface TrackMetrics {
  distance: number; // meters
  elapsedTime: number | null; // seconds; null when timestamps are absent
  movingTime: number | null; // seconds; null when timestamps are absent
  elevationGain: number | null; // meters; null when elevation is absent
  elevationLoss: number | null; // meters; null when elevation is absent
  avgPace: PaceMetric | null; // over elapsed time
  avgMovingPace: PaceMetric | null; // over moving time
}
