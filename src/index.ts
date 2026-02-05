import cors from 'cors';
import 'dotenv/config';
import express, { Request, Response } from 'express';
import cron from 'node-cron';

import { query } from './db';
import { migrate } from './db/migrate';
import aircraftRoutes from './routes/aircraft';
import statsRoutes from './routes/stats';
import { fetchAndStoreRussianAircraft } from './services/tracker';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*'
  })
);
app.use(express.json());

// Health check endpoint (required for Railway)
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/aircraft', aircraftRoutes);
app.use('/api/stats', statsRoutes);

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
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
async function startServer(): Promise<void> {
  try {
    // Test database connection
    await query('SELECT NOW()');
    console.log('✅ Database connected successfully');

    // Run migrations
    await migrate();

    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Tracking Russian aircraft...`);
    });

    // Schedule aircraft tracking every 30 seconds
    cron.schedule('*/30 * * * * *', async () => {
      try {
        await fetchAndStoreRussianAircraft();
      } catch (error) {
        console.error('Error in scheduled fetch:', (error as Error).message);
      }
    });

    // Initial fetch on startup
    setTimeout(async () => {
      try {
        console.log('🔄 Running initial aircraft fetch...');
        await fetchAndStoreRussianAircraft();
      } catch (error) {
        console.error('Initial fetch error:', (error as Error).message);
      }
    }, 2000);
  } catch (error) {
    console.error('❌ Failed to start server:', (error as Error).message);
    process.exit(1);
  }
}

startServer();
