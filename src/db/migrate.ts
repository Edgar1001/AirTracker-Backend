import { query } from './index';

export async function migrate(): Promise<void> {
  console.log('🔄 Running database migrations...');

  try {
    // Create aircraft table
    await query(`
      CREATE TABLE IF NOT EXISTS aircraft (
        id SERIAL PRIMARY KEY,
        icao24 VARCHAR(6) UNIQUE NOT NULL,
        callsign VARCHAR(20),
        origin_country VARCHAR(100),
        registration VARCHAR(20),
        aircraft_type VARCHAR(50),
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_sightings INTEGER DEFAULT 1
      );
    `);
    console.log('✅ Created aircraft table');

    // Create positions table
    await query(`
      CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        icao24 VARCHAR(6) NOT NULL,
        callsign VARCHAR(20),
        latitude DECIMAL(10, 6),
        longitude DECIMAL(10, 6),
        altitude DECIMAL(10, 2),
        velocity DECIMAL(10, 2),
        heading DECIMAL(10, 2),
        vertical_rate DECIMAL(10, 2),
        on_ground BOOLEAN DEFAULT FALSE,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (icao24) REFERENCES aircraft(icao24) ON DELETE CASCADE
      );
    `);
    console.log('✅ Created positions table');

    // Create daily_stats table
    await query(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        id SERIAL PRIMARY KEY,
        date DATE UNIQUE NOT NULL,
        unique_aircraft INTEGER DEFAULT 0,
        total_positions INTEGER DEFAULT 0,
        military_count INTEGER DEFAULT 0,
        civilian_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created daily_stats table');

    // Create indexes
    await query(`
      CREATE INDEX IF NOT EXISTS idx_positions_icao24 ON positions(icao24);
      CREATE INDEX IF NOT EXISTS idx_positions_timestamp ON positions(timestamp);
      CREATE INDEX IF NOT EXISTS idx_aircraft_last_seen ON aircraft(last_seen);
    `);
    console.log('✅ Created indexes');

    console.log('✅ All migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration error:', (error as Error).message);
    throw error;
  }
}

// Run migrations if called directly
if (require.main === module) {
  require('dotenv').config({ path: '../.env' });
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
