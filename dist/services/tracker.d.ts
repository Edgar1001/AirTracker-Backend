import { AircraftTrack, LiveAircraft, Position, TrackerResult } from '../types';
/**
 * Check if an ICAO24 address belongs to a Russian aircraft
 */
export declare function isRussianAircraft(icao24: string | null): boolean;
/**
 * Check if aircraft is military
 */
export declare function isMilitary(icao24: string | null | undefined): boolean;
/**
 * Cleanup old position data (older than 24 hours)
 */
export declare function cleanupOldData(): Promise<number>;
/**
 * Fetch and store Russian aircraft positions from multiple sources (ADSB.one + OpenSky)
 */
export declare function fetchAndStoreRussianAircraft(): Promise<TrackerResult>;
/**
 * Get current tracked aircraft from database
 */
export declare function getLiveAircraft(): Promise<LiveAircraft[]>;
/**
 * Get aircraft history
 */
export declare function getAircraftHistory(icao24: string, hours?: number): Promise<Position[]>;
/**
 * Get all aircraft tracks from the last 24 hours
 * Returns tracks grouped by aircraft with their position history
 * Optionally filters by center point and radius
 */
export declare function getAllTracksLast24h(centerLat?: number, centerLon?: number, radiusKm?: number): Promise<AircraftTrack[]>;
//# sourceMappingURL=tracker.d.ts.map