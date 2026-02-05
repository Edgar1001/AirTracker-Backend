"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const router = (0, express_1.Router)();
/**
 * GET /api/stats
 * Get overall tracking statistics
 */
router.get('/', async (_req, res) => {
    try {
        const aircraftResult = await (0, db_1.query)('SELECT COUNT(*) as total_aircraft FROM aircraft');
        const positionsResult = await (0, db_1.query)('SELECT COUNT(*) as total_positions FROM positions');
        const recentResult = await (0, db_1.query)(`SELECT COUNT(DISTINCT icao24) as recent_aircraft
       FROM positions
       WHERE timestamp > NOW() - INTERVAL '1 hour'`);
        const dailyResult = await (0, db_1.query)(`SELECT COUNT(DISTINCT icao24) as daily_aircraft
       FROM positions
       WHERE timestamp > NOW() - INTERVAL '24 hours'`);
        const topAircraftResult = await (0, db_1.query)(`SELECT 
         a.icao24,
         a.callsign,
         a.total_sightings,
         a.first_seen,
         a.last_seen
       FROM aircraft a
       ORDER BY a.total_sightings DESC
       LIMIT 10`);
        const dbSizeResult = await (0, db_1.query)('SELECT pg_size_pretty(pg_database_size(current_database())) as database_size');
        res.json({
            timestamp: new Date().toISOString(),
            total_unique_aircraft: parseInt(aircraftResult.rows[0].total_aircraft),
            total_positions_recorded: parseInt(positionsResult.rows[0].total_positions),
            aircraft_last_hour: parseInt(recentResult.rows[0].recent_aircraft),
            aircraft_last_24h: parseInt(dailyResult.rows[0].daily_aircraft),
            top_aircraft: topAircraftResult.rows,
            database_size: dbSizeResult.rows[0].database_size
        });
    }
    catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});
/**
 * GET /api/stats/daily
 * Get daily statistics history
 */
router.get('/daily', async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const result = await (0, db_1.query)(`SELECT 
         date,
         unique_aircraft,
         total_positions,
         military_count,
         civilian_count
       FROM daily_stats
       WHERE date > CURRENT_DATE - INTERVAL '${parseInt(days)} days'
       ORDER BY date DESC`);
        res.json({
            days: parseInt(days),
            stats: result.rows
        });
    }
    catch (error) {
        console.error('Error fetching daily stats:', error);
        res.status(500).json({ error: 'Failed to fetch daily statistics' });
    }
});
/**
 * GET /api/stats/hourly
 * Get hourly activity for today
 */
router.get('/hourly', async (_req, res) => {
    try {
        const result = await (0, db_1.query)(`SELECT 
         DATE_TRUNC('hour', timestamp) as hour,
         COUNT(DISTINCT icao24) as unique_aircraft,
         COUNT(*) as positions
       FROM positions
       WHERE timestamp > CURRENT_DATE
       GROUP BY DATE_TRUNC('hour', timestamp)
       ORDER BY hour ASC`);
        res.json({
            date: new Date().toISOString().split('T')[0],
            hours: result.rows
        });
    }
    catch (error) {
        console.error('Error fetching hourly stats:', error);
        res.status(500).json({ error: 'Failed to fetch hourly statistics' });
    }
});
/**
 * GET /api/stats/heatmap
 * Get position data for heatmap visualization
 */
router.get('/heatmap', async (req, res) => {
    try {
        const { hours = 24 } = req.query;
        const result = await (0, db_1.query)(`SELECT 
         ROUND(latitude::numeric, 1) as lat,
         ROUND(longitude::numeric, 1) as lng,
         COUNT(*) as intensity
       FROM positions
       WHERE timestamp > NOW() - INTERVAL '${parseInt(hours)} hours'
         AND latitude IS NOT NULL
         AND longitude IS NOT NULL
       GROUP BY ROUND(latitude::numeric, 1), ROUND(longitude::numeric, 1)
       ORDER BY intensity DESC
       LIMIT 500`);
        res.json({
            hours: parseInt(hours),
            points: result.rows.map((row) => ({
                lat: parseFloat(row.lat),
                lng: parseFloat(row.lng),
                intensity: parseInt(row.intensity)
            }))
        });
    }
    catch (error) {
        console.error('Error fetching heatmap data:', error);
        res.status(500).json({ error: 'Failed to fetch heatmap data' });
    }
});
exports.default = router;
//# sourceMappingURL=stats.js.map