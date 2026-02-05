"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("./db");
const migrate_1 = require("./db/migrate");
const aircraft_1 = __importDefault(require("./routes/aircraft"));
const stats_1 = __importDefault(require("./routes/stats"));
const tracker_1 = require("./services/tracker");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express_1.default.json());
// Health check endpoint (required for Railway)
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// API Routes
app.use('/api/aircraft', aircraft_1.default);
app.use('/api/stats', stats_1.default);
// Root endpoint
app.get('/', (_req, res) => {
    res.json({
        name: 'Aircraft Tracker API',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            aircraft: '/api/aircraft',
            liveAircraft: '/api/aircraft/live',
            tracks: '/api/aircraft/tracks',
            aircraftHistory: '/api/aircraft/:icao24/history',
            stats: '/api/stats',
            dailyStats: '/api/stats/daily'
        }
    });
});
// Initialize database and start server
async function startServer() {
    try {
        // Test database connection
        await (0, db_1.query)('SELECT NOW()');
        console.log('✅ Database connected successfully');
        // Run migrations
        await (0, migrate_1.migrate)();
        // Start the server
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📡 Tracking Russian aircraft...`);
        });
        // Schedule aircraft tracking every 30 seconds
        node_cron_1.default.schedule('*/30 * * * * *', async () => {
            try {
                await (0, tracker_1.fetchAndStoreRussianAircraft)();
            }
            catch (error) {
                console.error('Error in scheduled fetch:', error.message);
            }
        });
        // Initial fetch on startup
        setTimeout(async () => {
            try {
                console.log('🔄 Running initial aircraft fetch...');
                await (0, tracker_1.fetchAndStoreRussianAircraft)();
            }
            catch (error) {
                console.error('Initial fetch error:', error.message);
            }
        }, 2000);
    }
    catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=index.js.map