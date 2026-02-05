import { query } from '../db';
import { ADSBoneAircraft, ADSBoneResponse, AircraftTrack, LiveAircraft, Position, TrackerResult } from '../types';

// Russian ICAO 24-bit address ranges (hex prefixes 140-157)
// These correspond to aircraft registered in Russia
const RUSSIAN_ICAO_PREFIXES: string[] = [
  '140', '141', '142', '143', '144', '145', '146', '147',
  '148', '149', '14a', '14b', '14c', '14d', '14e', '14f',
  '150', '151', '152', '153', '154', '155', '156', '157'
];

// Military aircraft hex codes
const militaryHexCodes: Set<string> = new Set();

// Load military hex codes if available
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const militaryData = require('../../../assets/military_hex.json');
  if (Array.isArray(militaryData)) {
    militaryData.forEach((item: { hex?: string }) => {
      if (item.hex) militaryHexCodes.add(item.hex.toLowerCase());
    });
  }
  console.log(`📋 Loaded ${militaryHexCodes.size} military hex codes`);
} catch {
  console.log('ℹ️ No military hex database found, continuing without military classification');
}

/**
 * Check if an ICAO24 address belongs to a Russian aircraft
 */
export function isRussianAircraft(icao24: string | null): boolean {
  if (!icao24) return false;
  const prefix = icao24.toLowerCase().substring(0, 3);
  return RUSSIAN_ICAO_PREFIXES.includes(prefix);
}

/**
 * Check if aircraft is military
 */
export function isMilitary(icao24: string | null | undefined): boolean {
  return militaryHexCodes.has(icao24?.toLowerCase() ?? '');
}

/**
 * Fetch aircraft data from ADSBone API using multiple coverage points
 * ADSB.one doesn't have a global endpoint, so we use strategic points
 */
async function fetchFromADSBone(): Promise<ADSBoneResponse> {
  // Strategic points to cover areas where Russian aircraft are commonly seen
  // Each point covers up to 250 nautical miles radius (~463 km)
  // Optimized for tracking Russia → Gulf of Finland → Kaliningrad corridor
  const coveragePoints = [
    // Gulf of Finland & Baltic corridor (key area for Kaliningrad flights)
    { lat: 60.17, lon: 24.94, radius: 250 },   // Helsinki/Gulf of Finland
    { lat: 59.45, lon: 24.75, radius: 250 },   // Tallinn/Northern Estonia
    { lat: 57.50, lon: 21.00, radius: 250 },   // Baltic Sea (Latvia coast)
    { lat: 54.70, lon: 20.50, radius: 250 },   // Kaliningrad Oblast
    { lat: 55.20, lon: 23.50, radius: 250 },   // Lithuania (covers Kaliningrad corridor)
    { lat: 54.35, lon: 18.65, radius: 250 },   // Gdansk/Polish coast (Kaliningrad approach)
    
    // Russia mainland
    { lat: 59.93, lon: 30.31, radius: 250 },   // St. Petersburg (departure point)
    { lat: 55.75, lon: 37.62, radius: 250 },   // Moscow area
    { lat: 56.0, lon: 44.0, radius: 250 },     // Nizhny Novgorod
    { lat: 64.0, lon: 40.0, radius: 250 },     // Northern Russia (Arkhangelsk)
    { lat: 68.0, lon: 33.0, radius: 250 },     // Murmansk/Arctic
    
    // Extended coverage
    { lat: 55.0, lon: 82.0, radius: 250 },     // Novosibirsk/Siberia
    { lat: 48.0, lon: 135.0, radius: 250 },    // Far East Russia
  ];

  const headers: Record<string, string> = {
    'User-Agent': 'AircraftTracker/1.0',
    'Accept': 'application/json'
  };

  const allAircraft: ADSBoneAircraft[] = [];
  const seenHex = new Set<string>();

  for (const point of coveragePoints) {
    try {
      const url = `https://api.adsb.one/v2/point/${point.lat}/${point.lon}/${point.radius}`;
      const response = await fetch(url, { headers });

      if (response.ok) {
        const data = await response.json() as ADSBoneResponse;
        if (data.ac) {
          for (const ac of data.ac) {
            // Avoid duplicates
            if (ac.hex && !seenHex.has(ac.hex)) {
              seenHex.add(ac.hex);
              allAircraft.push(ac);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching from point ${point.lat},${point.lon}:`, (error as Error).message);
    }
  }

  console.log(`📡 Fetched ${allAircraft.length} total aircraft from ${coveragePoints.length} coverage points`);
  return { ac: allAircraft, total: allAircraft.length, ctime: Date.now(), ptime: 0 };
}

/**
 * Cleanup old position data (older than 24 hours)
 */
export async function cleanupOldData(): Promise<number> {
  try {
    const result = await query(
      `DELETE FROM positions WHERE timestamp < NOW() - INTERVAL '24 hours' RETURNING id`
    );
    const deletedCount = result.rowCount ?? 0;
    if (deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} old position records`);
    }
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up old data:', (error as Error).message);
    return 0;
  }
}

/**
 * Fetch and store Russian aircraft positions from ADSBone
 */
export async function fetchAndStoreRussianAircraft(): Promise<TrackerResult> {
  try {
    // First, cleanup old data (older than 24 hours)
    await cleanupOldData();

    const data = await fetchFromADSBone();

    if (!data || !data.ac || data.ac.length === 0) {
      console.log('⚠️ No aircraft data received from ADSBone');
      return { tracked: 0, stored: 0 };
    }

    // Filter for Russian aircraft only
    const russianAircraft = data.ac.filter((ac: ADSBoneAircraft) => 
      isRussianAircraft(ac.hex)
    );

    console.log(`📡 Found ${russianAircraft.length} Russian aircraft out of ${data.ac.length} total`);

    let storedCount = 0;

    for (const ac of russianAircraft) {
      try {
        const icao24 = ac.hex?.toLowerCase();
        if (!icao24) continue;

        const callsign = ac.flight?.trim() || null;
        const latitude = ac.lat;
        const longitude = ac.lon;
        const altitude = ac.alt_baro ?? ac.alt_geom ?? null;
        const velocity = ac.gs ?? null;
        const heading = ac.track ?? null;
        const verticalRate = ac.baro_rate ?? ac.geom_rate ?? null;
        const onGround = ac.alt_baro === 'ground' || altitude === 0;

        // Upsert aircraft record
        await query(
          `INSERT INTO aircraft (icao24, callsign, origin_country, aircraft_type, last_seen, total_sightings)
           VALUES ($1, $2, 'Russia', $3, CURRENT_TIMESTAMP, 1)
           ON CONFLICT (icao24) DO UPDATE SET
             callsign = COALESCE(EXCLUDED.callsign, aircraft.callsign),
             aircraft_type = COALESCE(EXCLUDED.aircraft_type, aircraft.aircraft_type),
             last_seen = CURRENT_TIMESTAMP,
             total_sightings = aircraft.total_sightings + 1`,
          [icao24, callsign, ac.t || ac.desc || null]
        );

        // Store position if we have coordinates
        if (latitude != null && longitude != null) {
          await query(
            `INSERT INTO positions (icao24, callsign, latitude, longitude, altitude, velocity, heading, vertical_rate, on_ground)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              icao24,
              callsign,
              latitude,
              longitude,
              typeof altitude === 'number' ? altitude : null,
              velocity,
              heading,
              verticalRate,
              onGround
            ]
          );
          storedCount++;
        }
      } catch (error) {
        console.error(`Error storing aircraft ${ac.hex}:`, (error as Error).message);
      }
    }

    // Update daily stats
    await updateDailyStats();

    console.log(`✅ Stored ${storedCount} positions from ${russianAircraft.length} Russian aircraft`);
    return { tracked: russianAircraft.length, stored: storedCount };
  } catch (error) {
    console.error('❌ Error fetching aircraft:', (error as Error).message);
    throw error;
  }
}

/**
 * Update daily statistics
 */
async function updateDailyStats(): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const statsResult = await query<{ unique_aircraft: string; total_positions: string }>(
      `SELECT 
         COUNT(DISTINCT icao24) as unique_aircraft,
         COUNT(*) as total_positions
       FROM positions
       WHERE DATE(timestamp) = $1`,
      [today]
    );

    const { unique_aircraft, total_positions } = statsResult.rows[0];

    await query(
      `INSERT INTO daily_stats (date, unique_aircraft, total_positions)
       VALUES ($1, $2, $3)
       ON CONFLICT (date) DO UPDATE SET
         unique_aircraft = EXCLUDED.unique_aircraft,
         total_positions = EXCLUDED.total_positions`,
      [today, parseInt(unique_aircraft), parseInt(total_positions)]
    );
  } catch (error) {
    console.error('Error updating daily stats:', (error as Error).message);
  }
}

/**
 * Get current tracked aircraft from database
 */
export async function getLiveAircraft(): Promise<LiveAircraft[]> {
  const result = await query<LiveAircraft>(
    `SELECT DISTINCT ON (p.icao24)
       p.icao24,
       p.callsign,
       a.origin_country,
       p.latitude,
       p.longitude,
       p.altitude,
       p.velocity,
       p.heading,
       p.vertical_rate,
       p.on_ground,
       p.timestamp,
       a.total_sightings,
       a.first_seen,
       a.last_seen
     FROM positions p
     JOIN aircraft a ON p.icao24 = a.icao24
     WHERE p.timestamp > NOW() - INTERVAL '5 minutes'
     ORDER BY p.icao24, p.timestamp DESC`
  );

  return result.rows.map((row: LiveAircraft) => ({
    ...row,
    is_military: isMilitary(row.icao24)
  }));
}

/**
 * Get aircraft history
 */
export async function getAircraftHistory(icao24: string, hours: number = 24): Promise<Position[]> {
  const result = await query<Position>(
    `SELECT 
       icao24,
       callsign,
       latitude,
       longitude,
       altitude,
       velocity,
       heading,
       vertical_rate,
       on_ground,
       timestamp
     FROM positions
     WHERE icao24 = $1 AND timestamp > NOW() - INTERVAL '${hours} hours'
     ORDER BY timestamp ASC`,
    [icao24.toLowerCase()]
  );

  return result.rows;
}

/**
 * Calculate distance between two points using Haversine formula
 * @returns distance in kilometers
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get all aircraft tracks from the last 24 hours
 * Returns tracks grouped by aircraft with their position history
 * Optionally filters by center point and radius
 */
export async function getAllTracksLast24h(
  centerLat?: number,
  centerLon?: number,
  radiusKm?: number
): Promise<AircraftTrack[]> {
  // Get all unique aircraft with positions in last 24 hours
  const aircraftResult = await query<{ icao24: string; callsign: string | null; aircraft_type: string | null }>(
    `SELECT DISTINCT ON (p.icao24)
       p.icao24,
       p.callsign,
       a.aircraft_type
     FROM positions p
     LEFT JOIN aircraft a ON p.icao24 = a.icao24
     WHERE p.timestamp > NOW() - INTERVAL '24 hours'
     ORDER BY p.icao24, p.timestamp DESC`
  );

  const tracks: AircraftTrack[] = [];
  const shouldFilter = centerLat !== undefined && centerLon !== undefined && radiusKm !== undefined;

  for (const ac of aircraftResult.rows) {
    const positionsResult = await query<Position>(
      `SELECT 
         latitude,
         longitude,
         altitude,
         velocity,
         heading,
         timestamp
       FROM positions
       WHERE icao24 = $1 AND timestamp > NOW() - INTERVAL '24 hours'
       ORDER BY timestamp ASC`,
      [ac.icao24]
    );

    // Filter positions by radius if center is provided
    let positions = positionsResult.rows;
    if (shouldFilter) {
      positions = positions.filter(pos => {
        if (pos.latitude === null || pos.longitude === null) return false;
        const distance = haversineDistance(centerLat!, centerLon!, pos.latitude, pos.longitude);
        return distance <= radiusKm!;
      });
    }

    // Only include aircraft with at least 2 positions (to draw a line)
    if (positions.length >= 2) {
      tracks.push({
        icao24: ac.icao24,
        callsign: ac.callsign,
        aircraft_type: ac.aircraft_type,
        positions,
        is_military: isMilitary(ac.icao24)
      });
    }
  }

  return tracks;
}
