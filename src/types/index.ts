export interface Aircraft {
  icao24: string;
  callsign: string | null;
  origin_country: string | null;
  registration?: string | null;
  aircraft_type?: string | null;
  first_seen: Date;
  last_seen: Date;
  total_sightings: number;
  is_military?: boolean;
}

export interface Position {
  id?: number;
  icao24: string;
  callsign: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  velocity: number | null;
  heading: number | null;
  vertical_rate: number | null;
  on_ground: boolean;
  timestamp: Date;
}

export interface DailyStats {
  id?: number;
  date: string;
  unique_aircraft: number;
  total_positions: number;
  military_count: number;
  civilian_count: number;
}

// ADSBone API response types (same as frontend)
export interface ADSBoneAircraft {
  hex: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | 'ground';
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  category?: string;
  t?: string;  // aircraft type
  r?: string;  // registration
  desc?: string;
  squawk?: string;
  emergency?: string;
  [key: string]: unknown;
}

export interface ADSBoneResponse {
  ac: ADSBoneAircraft[];
  total: number;
  ctime: number;
  ptime: number;
}

export interface TrackerResult {
  tracked: number;
  stored: number;
}

export interface LiveAircraft extends Aircraft {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  velocity: number | null;
  heading: number | null;
  vertical_rate: number | null;
  on_ground: boolean;
  timestamp: Date;
}

export interface TrackSegment {
  positions: Position[];
  hasGapBefore: boolean;  // true if there was a large time gap before this segment
  gapDurationSeconds?: number;  // duration of gap before this segment
}

export interface AircraftTrack {
  icao24: string;
  callsign: string | null;
  aircraft_type: string | null;
  positions: Position[];
  segments: TrackSegment[];  // positions split by time gaps
  is_military: boolean;
}
