"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRussianAircraft = isRussianAircraft;
exports.isMilitary = isMilitary;
exports.cleanupOldData = cleanupOldData;
exports.fetchAndStoreRussianAircraft = fetchAndStoreRussianAircraft;
exports.getLiveAircraft = getLiveAircraft;
exports.getAircraftHistory = getAircraftHistory;
exports.getAllTracksLast24h = getAllTracksLast24h;
const db_1 = require("../db");
// Maximum gap in seconds before we consider it a "gap" in tracking
// If an aircraft doesn't report for more than this, we split the track
const MAX_POSITION_GAP_SECONDS = 300; // 5 minutes
// Russian ICAO 24-bit address ranges (hex prefixes 140-157)
// These correspond to aircraft registered in Russia
const RUSSIAN_ICAO_PREFIXES = [
    '140', '141', '142', '143', '144', '145', '146', '147',
    '148', '149', '14a', '14b', '14c', '14d', '14e', '14f',
    '150', '151', '152', '153', '154', '155', '156', '157'
];
// Military aircraft hex codes
const militaryHexCodes = new Set();
// Load military hex codes if available
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const militaryData = require('../../../assets/military_hex.json');
    if (Array.isArray(militaryData)) {
        militaryData.forEach((item) => {
            if (item.hex)
                militaryHexCodes.add(item.hex.toLowerCase());
        });
    }
    console.log(`📋 Loaded ${militaryHexCodes.size} military hex codes`);
}
catch {
    console.log('ℹ️ No military hex database found, continuing without military classification');
}
/**
 * Check if an ICAO24 address belongs to a Russian aircraft
 */
function isRussianAircraft(icao24) {
    if (!icao24)
        return false;
    const prefix = icao24.toLowerCase().substring(0, 3);
    return RUSSIAN_ICAO_PREFIXES.includes(prefix);
}
/**
 * Check if aircraft is military
 */
function isMilitary(icao24) {
    return militaryHexCodes.has(icao24?.toLowerCase() ?? '');
}
/**
 * Fetch aircraft data from OpenSky Network API
 * Free API with good MLAT coverage - https://opensky-network.org/apidoc/
 */
async function fetchFromOpenSky() {
    // Bounding box for Baltic region and Russia (lamin, lomin, lamax, lomax)
    const boundingBoxes = [
        { lamin: 53, lomin: 14, lamax: 70, lomax: 32 }, // Baltic Sea, Scandinavia, Kaliningrad
        { lamin: 50, lomin: 30, lamax: 70, lomax: 60 }, // Western Russia
    ];
    const headers = {
        'User-Agent': 'AircraftTracker/1.0',
        'Accept': 'application/json'
    };
    const allAircraft = [];
    const seenHex = new Set();
    for (const bbox of boundingBoxes) {
        try {
            const url = `https://opensky-network.org/api/states/all?lamin=${bbox.lamin}&lomin=${bbox.lomin}&lamax=${bbox.lamax}&lomax=${bbox.lomax}`;
            const response = await fetch(url, { headers });
            if (response.ok) {
                const data = await response.json();
                if (data.states) {
                    for (const state of data.states) {
                        // OpenSky state vector format: [icao24, callsign, origin_country, time_position, last_contact, lon, lat, baro_altitude, on_ground, velocity, true_track, vertical_rate, sensors, geo_altitude, squawk, spi, position_source, category]
                        const hex = state[0];
                        if (hex && !seenHex.has(hex)) {
                            seenHex.add(hex);
                            allAircraft.push({
                                hex: hex,
                                flight: state[1]?.trim() || undefined,
                                lat: state[6],
                                lon: state[5],
                                alt_baro: state[7],
                                alt_geom: state[13],
                                gs: state[9],
                                track: state[10],
                                baro_rate: state[11],
                                squawk: state[14],
                                category: state[17],
                                // Mark source for debugging
                                _source: 'opensky'
                            });
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error(`Error fetching from OpenSky:`, error.message);
        }
    }
    console.log(`🌐 Fetched ${allAircraft.length} aircraft from OpenSky Network`);
    return allAircraft;
}
/**
 * Fetch aircraft data from ADSBone API using multiple coverage points
 * ADSB.one doesn't have a global endpoint, so we use strategic points
 */
async function fetchFromADSBone() {
    // Strategic points to cover areas where Russian aircraft are commonly seen
    // Each point covers up to 250 nautical miles radius (~463 km)
    // Optimized for tracking Russia → Gulf of Finland → Kaliningrad corridor
    const coveragePoints = [
        // Gulf of Finland & Baltic corridor (key area for Kaliningrad flights)
        { lat: 60.17, lon: 24.94, radius: 250 }, // Helsinki/Gulf of Finland
        { lat: 59.45, lon: 24.75, radius: 250 }, // Tallinn/Northern Estonia
        { lat: 57.50, lon: 21.00, radius: 250 }, // Baltic Sea (Latvia coast)
        { lat: 54.70, lon: 20.50, radius: 250 }, // Kaliningrad Oblast
        { lat: 55.20, lon: 23.50, radius: 250 }, // Lithuania (covers Kaliningrad corridor)
        { lat: 54.35, lon: 18.65, radius: 250 }, // Gdansk/Polish coast (Kaliningrad approach)
        // Russia mainland
        { lat: 59.93, lon: 30.31, radius: 250 }, // St. Petersburg (departure point)
        { lat: 55.75, lon: 37.62, radius: 250 }, // Moscow area
        { lat: 56.0, lon: 44.0, radius: 250 }, // Nizhny Novgorod
        { lat: 64.0, lon: 40.0, radius: 250 }, // Northern Russia (Arkhangelsk)
        { lat: 68.0, lon: 33.0, radius: 250 }, // Murmansk/Arctic
        // Extended coverage
        { lat: 55.0, lon: 82.0, radius: 250 }, // Novosibirsk/Siberia
        { lat: 48.0, lon: 135.0, radius: 250 }, // Far East Russia
    ];
    const headers = {
        'User-Agent': 'AircraftTracker/1.0',
        'Accept': 'application/json'
    };
    const allAircraft = [];
    const seenHex = new Set();
    for (const point of coveragePoints) {
        try {
            const url = `https://api.adsb.one/v2/point/${point.lat}/${point.lon}/${point.radius}`;
            const response = await fetch(url, { headers });
            if (response.ok) {
                const data = await response.json();
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
        }
        catch (error) {
            console.error(`Error fetching from point ${point.lat},${point.lon}:`, error.message);
        }
    }
    console.log(`📡 Fetched ${allAircraft.length} total aircraft from ${coveragePoints.length} coverage points`);
    return { ac: allAircraft, total: allAircraft.length, ctime: Date.now(), ptime: 0 };
}
/**
 * Cleanup old position data (older than 24 hours)
 */
async function cleanupOldData() {
    try {
        const result = await (0, db_1.query)(`DELETE FROM positions WHERE timestamp < NOW() - INTERVAL '24 hours' RETURNING id`);
        const deletedCount = result.rowCount ?? 0;
        if (deletedCount > 0) {
            console.log(`🧹 Cleaned up ${deletedCount} old position records`);
        }
        return deletedCount;
    }
    catch (error) {
        console.error('Error cleaning up old data:', error.message);
        return 0;
    }
}
/**
 * Fetch and store Russian aircraft positions from multiple sources (ADSB.one + OpenSky)
 */
async function fetchAndStoreRussianAircraft() {
    try {
        // First, cleanup old data (older than 24 hours)
        await cleanupOldData();
        // Fetch from multiple sources in parallel
        const [adsbData, openSkyAircraft] = await Promise.all([
            fetchFromADSBone(),
            fetchFromOpenSky()
        ]);
        // Merge aircraft from both sources, preferring ADSB.one data but filling gaps with OpenSky
        const mergedAircraft = [];
        const seenHex = new Set();
        // Add ADSB.one aircraft first (usually more detailed)
        if (adsbData?.ac) {
            for (const ac of adsbData.ac) {
                if (ac.hex) {
                    seenHex.add(ac.hex.toLowerCase());
                    mergedAircraft.push(ac);
                }
            }
        }
        // Add OpenSky aircraft that weren't in ADSB.one
        for (const ac of openSkyAircraft) {
            if (ac.hex && !seenHex.has(ac.hex.toLowerCase())) {
                seenHex.add(ac.hex.toLowerCase());
                mergedAircraft.push(ac);
            }
        }
        console.log(`🔄 Merged ${mergedAircraft.length} aircraft (ADSB.one: ${adsbData?.ac?.length ?? 0}, OpenSky unique adds: ${mergedAircraft.length - (adsbData?.ac?.length ?? 0)})`);
        if (mergedAircraft.length === 0) {
            console.log('⚠️ No aircraft data received from any source');
            return { tracked: 0, stored: 0 };
        }
        // Filter for Russian aircraft only
        const russianAircraft = mergedAircraft.filter((ac) => isRussianAircraft(ac.hex));
        console.log(`📡 Found ${russianAircraft.length} Russian aircraft out of ${mergedAircraft.length} total`);
        let storedCount = 0;
        for (const ac of russianAircraft) {
            try {
                const icao24 = ac.hex?.toLowerCase();
                if (!icao24)
                    continue;
                const callsign = ac.flight?.trim() || null;
                const latitude = ac.lat;
                const longitude = ac.lon;
                const altitude = ac.alt_baro ?? ac.alt_geom ?? null;
                const velocity = ac.gs ?? null;
                const heading = ac.track ?? null;
                const verticalRate = ac.baro_rate ?? ac.geom_rate ?? null;
                const onGround = ac.alt_baro === 'ground' || altitude === 0;
                // Upsert aircraft record
                await (0, db_1.query)(`INSERT INTO aircraft (icao24, callsign, origin_country, aircraft_type, last_seen, total_sightings)
           VALUES ($1, $2, 'Russia', $3, CURRENT_TIMESTAMP, 1)
           ON CONFLICT (icao24) DO UPDATE SET
             callsign = COALESCE(EXCLUDED.callsign, aircraft.callsign),
             aircraft_type = COALESCE(EXCLUDED.aircraft_type, aircraft.aircraft_type),
             last_seen = CURRENT_TIMESTAMP,
             total_sightings = aircraft.total_sightings + 1`, [icao24, callsign, ac.t || ac.desc || null]);
                // Store position if we have coordinates
                if (latitude != null && longitude != null) {
                    await (0, db_1.query)(`INSERT INTO positions (icao24, callsign, latitude, longitude, altitude, velocity, heading, vertical_rate, on_ground)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
                        icao24,
                        callsign,
                        latitude,
                        longitude,
                        typeof altitude === 'number' ? altitude : null,
                        velocity,
                        heading,
                        verticalRate,
                        onGround
                    ]);
                    storedCount++;
                }
            }
            catch (error) {
                console.error(`Error storing aircraft ${ac.hex}:`, error.message);
            }
        }
        // Update daily stats
        await updateDailyStats();
        console.log(`✅ Stored ${storedCount} positions from ${russianAircraft.length} Russian aircraft`);
        return { tracked: russianAircraft.length, stored: storedCount };
    }
    catch (error) {
        console.error('❌ Error fetching aircraft:', error.message);
        throw error;
    }
}
/**
 * Update daily statistics
 */
async function updateDailyStats() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const statsResult = await (0, db_1.query)(`SELECT 
         COUNT(DISTINCT icao24) as unique_aircraft,
         COUNT(*) as total_positions
       FROM positions
       WHERE DATE(timestamp) = $1`, [today]);
        const { unique_aircraft, total_positions } = statsResult.rows[0];
        await (0, db_1.query)(`INSERT INTO daily_stats (date, unique_aircraft, total_positions)
       VALUES ($1, $2, $3)
       ON CONFLICT (date) DO UPDATE SET
         unique_aircraft = EXCLUDED.unique_aircraft,
         total_positions = EXCLUDED.total_positions`, [today, parseInt(unique_aircraft), parseInt(total_positions)]);
    }
    catch (error) {
        console.error('Error updating daily stats:', error.message);
    }
}
/**
 * Get current tracked aircraft from database
 */
async function getLiveAircraft() {
    const result = await (0, db_1.query)(`SELECT DISTINCT ON (p.icao24)
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
     ORDER BY p.icao24, p.timestamp DESC`);
    return result.rows.map((row) => ({
        ...row,
        is_military: isMilitary(row.icao24)
    }));
}
/**
 * Get aircraft history
 */
async function getAircraftHistory(icao24, hours = 24) {
    const result = await (0, db_1.query)(`SELECT 
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
     ORDER BY timestamp ASC`, [icao24.toLowerCase()]);
    return result.rows;
}
/**
 * Calculate distance between two points using Haversine formula
 * @returns distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
/**
 * Split positions into segments based on time gaps
 * If there's a gap larger than MAX_POSITION_GAP_SECONDS between positions,
 * we start a new segment and mark it as having a gap before it
 */
function splitIntoSegments(positions) {
    if (positions.length === 0)
        return [];
    const segments = [];
    let currentSegment = [positions[0]];
    for (let i = 1; i < positions.length; i++) {
        const prevTime = new Date(positions[i - 1].timestamp).getTime();
        const currTime = new Date(positions[i].timestamp).getTime();
        const gapSeconds = (currTime - prevTime) / 1000;
        if (gapSeconds > MAX_POSITION_GAP_SECONDS) {
            // Save current segment and start a new one
            if (currentSegment.length >= 1) {
                segments.push({
                    positions: currentSegment,
                    hasGapBefore: segments.length > 0 ? false : false, // first segment has no gap before
                    gapDurationSeconds: undefined
                });
            }
            // Start new segment with gap marker
            currentSegment = [positions[i]];
            // Mark this as having a gap before it (we'll update the NEXT segment's hasGapBefore)
            // Actually, we need to track the gap for the segment we're about to create
            segments.push({
                positions: [],
                hasGapBefore: true,
                gapDurationSeconds: gapSeconds
            });
            // The empty segment is just a marker, we'll merge it next
        }
        else {
            currentSegment.push(positions[i]);
        }
    }
    // Add final segment
    if (currentSegment.length >= 1) {
        // Check if last segment in array is empty (gap marker)
        if (segments.length > 0 && segments[segments.length - 1].positions.length === 0) {
            const gapMarker = segments.pop();
            segments.push({
                positions: currentSegment,
                hasGapBefore: true,
                gapDurationSeconds: gapMarker.gapDurationSeconds
            });
        }
        else {
            segments.push({
                positions: currentSegment,
                hasGapBefore: false,
                gapDurationSeconds: undefined
            });
        }
    }
    // Filter out any empty segments and ensure each has at least 2 positions for drawing
    return segments.filter(s => s.positions.length >= 1);
}
/**
 * Get all aircraft tracks from the last 24 hours
 * Returns tracks grouped by aircraft with their position history
 * Optionally filters by center point and radius
 */
async function getAllTracksLast24h(centerLat, centerLon, radiusKm) {
    // Get all unique aircraft with positions in last 24 hours
    const aircraftResult = await (0, db_1.query)(`SELECT DISTINCT ON (p.icao24)
       p.icao24,
       p.callsign,
       a.aircraft_type
     FROM positions p
     LEFT JOIN aircraft a ON p.icao24 = a.icao24
     WHERE p.timestamp > NOW() - INTERVAL '24 hours'
     ORDER BY p.icao24, p.timestamp DESC`);
    const tracks = [];
    const shouldFilter = centerLat !== undefined && centerLon !== undefined && radiusKm !== undefined;
    for (const ac of aircraftResult.rows) {
        const positionsResult = await (0, db_1.query)(`SELECT 
         latitude,
         longitude,
         altitude,
         velocity,
         heading,
         timestamp
       FROM positions
       WHERE icao24 = $1 AND timestamp > NOW() - INTERVAL '24 hours'
       ORDER BY timestamp ASC`, [ac.icao24]);
        // Filter positions by radius if center is provided
        let positions = positionsResult.rows;
        if (shouldFilter) {
            positions = positions.filter(pos => {
                if (pos.latitude === null || pos.longitude === null)
                    return false;
                const distance = haversineDistance(centerLat, centerLon, pos.latitude, pos.longitude);
                return distance <= radiusKm;
            });
        }
        // Split positions into segments based on time gaps
        const segments = splitIntoSegments(positions);
        // Only include aircraft with at least 2 positions (to draw a line)
        if (positions.length >= 2) {
            tracks.push({
                icao24: ac.icao24,
                callsign: ac.callsign,
                aircraft_type: ac.aircraft_type,
                positions,
                segments,
                is_military: isMilitary(ac.icao24)
            });
        }
    }
    return tracks;
}
//# sourceMappingURL=tracker.js.map