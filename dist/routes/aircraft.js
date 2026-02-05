"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const tracker_1 = require("../services/tracker");
const router = (0, express_1.Router)();
/**
 * GET /api/aircraft
 * Get all tracked aircraft with optional filtering
 */
router.get('/', async (req, res) => {
    try {
        const { limit = 100, offset = 0, military } = req.query;
        const result = await (0, db_1.query)(`SELECT 
         icao24,
         callsign,
         origin_country,
         registration,
         aircraft_type,
         first_seen,
         last_seen,
         total_sightings
       FROM aircraft
       ORDER BY last_seen DESC
       LIMIT $1 OFFSET $2`, [parseInt(limit), parseInt(offset)]);
        // Add military flag
        const aircraft = result.rows.map((row) => ({
            ...row,
            is_military: (0, tracker_1.isMilitary)(row.icao24)
        }));
        // Filter by military if requested
        const filtered = military !== undefined
            ? aircraft.filter((a) => a.is_military === (military === 'true'))
            : aircraft;
        res.json({
            count: filtered.length,
            aircraft: filtered
        });
    }
    catch (error) {
        console.error('Error fetching aircraft:', error);
        res.status(500).json({ error: 'Failed to fetch aircraft' });
    }
});
/**
 * GET /api/aircraft/live
 * Get currently active tracked aircraft
 */
router.get('/live', async (_req, res) => {
    try {
        const aircraft = await (0, tracker_1.getLiveAircraft)();
        res.json({
            timestamp: new Date().toISOString(),
            count: aircraft.length,
            aircraft
        });
    }
    catch (error) {
        console.error('Error fetching live aircraft:', error);
        res.status(500).json({ error: 'Failed to fetch live aircraft' });
    }
});
/**
 * GET /api/aircraft/tracks
 * Get all aircraft tracks from the last 24 hours (for frontend polyline display)
 * Optional query params: lat, lon, radius (km) to filter by center point
 */
router.get('/tracks', async (req, res) => {
    try {
        const { lat, lon, radius } = req.query;
        // Parse optional center point and radius for filtering
        const centerLat = lat ? parseFloat(lat) : undefined;
        const centerLon = lon ? parseFloat(lon) : undefined;
        const radiusKm = radius ? parseFloat(radius) : undefined;
        const tracks = await (0, tracker_1.getAllTracksLast24h)(centerLat, centerLon, radiusKm);
        res.json({
            timestamp: new Date().toISOString(),
            count: tracks.length,
            center: centerLat && centerLon ? { lat: centerLat, lon: centerLon } : null,
            radiusKm: radiusKm || null,
            tracks
        });
    }
    catch (error) {
        console.error('Error fetching tracks:', error);
        res.status(500).json({ error: 'Failed to fetch tracks' });
    }
});
/**
 * GET /api/aircraft/:icao24
 * Get details for a specific aircraft
 */
router.get('/:icao24', async (req, res) => {
    try {
        const { icao24 } = req.params;
        const result = await (0, db_1.query)(`SELECT 
         icao24,
         callsign,
         origin_country,
         registration,
         aircraft_type,
         first_seen,
         last_seen,
         total_sightings
       FROM aircraft
       WHERE icao24 = $1`, [icao24.toLowerCase()]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Aircraft not found' });
        }
        const aircraft = result.rows[0];
        res.json({
            ...aircraft,
            is_military: (0, tracker_1.isMilitary)(aircraft.icao24)
        });
    }
    catch (error) {
        console.error('Error fetching aircraft:', error);
        res.status(500).json({ error: 'Failed to fetch aircraft' });
    }
});
/**
 * GET /api/aircraft/:icao24/history
 * Get position history for an aircraft
 */
router.get('/:icao24/history', async (req, res) => {
    try {
        const { icao24 } = req.params;
        const { hours = 24 } = req.query;
        const history = await (0, tracker_1.getAircraftHistory)(icao24, parseInt(hours));
        res.json({
            icao24,
            hours: parseInt(hours),
            positions: history.length,
            history
        });
    }
    catch (error) {
        console.error('Error fetching aircraft history:', error);
        res.status(500).json({ error: 'Failed to fetch aircraft history' });
    }
});
/**
 * GET /api/aircraft/:icao24/track
 * Get position track as GeoJSON LineString
 */
router.get('/:icao24/track', async (req, res) => {
    try {
        const { icao24 } = req.params;
        const { hours = 24 } = req.query;
        const history = await (0, tracker_1.getAircraftHistory)(icao24, parseInt(hours));
        const geojson = {
            type: 'Feature',
            properties: {
                icao24,
                callsign: history[0]?.callsign || null,
                positions: history.length
            },
            geometry: {
                type: 'LineString',
                coordinates: history
                    .filter((p) => p.latitude && p.longitude)
                    .map((p) => [
                    parseFloat(String(p.longitude)),
                    parseFloat(String(p.latitude)),
                    parseFloat(String(p.altitude)) || 0
                ])
            }
        };
        res.json(geojson);
    }
    catch (error) {
        console.error('Error fetching aircraft track:', error);
        res.status(500).json({ error: 'Failed to fetch aircraft track' });
    }
});
/**
 * DELETE /api/aircraft/tracks
 * Delete all Russian aircraft tracking data (positions and aircraft records)
 */
router.delete('/tracks', async (_req, res) => {
    try {
        // Delete all positions first (due to foreign key constraint)
        const positionsResult = await (0, db_1.query)('DELETE FROM positions RETURNING id');
        const positionsDeleted = positionsResult.rowCount ?? 0;
        // Delete all aircraft records
        const aircraftResult = await (0, db_1.query)('DELETE FROM aircraft RETURNING icao24');
        const aircraftDeleted = aircraftResult.rowCount ?? 0;
        console.log(`🗑️ Cleared tracking data: ${positionsDeleted} positions, ${aircraftDeleted} aircraft`);
        res.json({
            success: true,
            message: 'All tracking data cleared',
            deleted: {
                positions: positionsDeleted,
                aircraft: aircraftDeleted
            }
        });
    }
    catch (error) {
        console.error('Error clearing tracking data:', error);
        res.status(500).json({ error: 'Failed to clear tracking data' });
    }
});
exports.default = router;
//# sourceMappingURL=aircraft.js.map