# Aircraft Tracker Backend

A TypeScript/Express backend that tracks aircraft using the OpenSky Network API and stores data in PostgreSQL.

## Features

- 🛩️ **Real-time tracking** of aircraft by configurable ICAO24 prefixes
- 📊 **Historical data storage** with position history
- 📈 **Statistics API** with daily/hourly aggregations
- 🗺️ **GeoJSON export** for flight tracks
- 🚀 **Railway-ready** deployment configuration
- 📝 **TypeScript** for type safety

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Data Source**: [OpenSky Network API](https://opensky-network.org/apidoc/)
- **Scheduling**: node-cron (fetches every 30 seconds)

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Aircraft
- `GET /api/aircraft` - List all tracked aircraft
- `GET /api/aircraft/live` - Currently active aircraft (last 5 minutes)
- `GET /api/aircraft/:icao24` - Get specific aircraft details
- `GET /api/aircraft/:icao24/history` - Position history
- `GET /api/aircraft/:icao24/track` - GeoJSON track

### Statistics
- `GET /api/stats` - Overall tracking statistics
- `GET /api/stats/daily` - Daily aggregated stats
- `GET /api/stats/hourly` - Today's hourly breakdown
- `GET /api/stats/heatmap` - Position heatmap data

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Setup

1. Clone the repository:
```bash
git clone <your-repo-url>
cd AirTracker-Backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```bash
cp .env.example .env
```

4. Configure your database URL in `.env`:
```
DATABASE_URL=postgresql://username:password@localhost:5432/aircraft_tracker
```

5. Create the database:
```bash
createdb aircraft_tracker
```

6. Run in development mode:
```bash
npm run dev
```

The server will start on `http://localhost:3000` and begin tracking aircraft.

## Build for Production

```bash
npm run build
npm start
```

## Deploy to Railway

### Via Railway Dashboard

1. Push your code to GitHub
2. Go to [Railway](https://railway.app)
3. Create a new project
4. Select "Deploy from GitHub repo"
5. Add a PostgreSQL database:
   - Click "New" → "Database" → "Add PostgreSQL"
6. Railway will automatically set `DATABASE_URL`
7. Deploy!

## Project Structure

```
AirTracker-Backend/
├── src/
│   ├── index.ts           # Express server entry point
│   ├── db/
│   │   ├── index.ts       # PostgreSQL connection pool
│   │   └── migrate.ts     # Database migrations
│   ├── routes/
│   │   ├── aircraft.ts    # Aircraft endpoints
│   │   └── stats.ts       # Statistics endpoints
│   ├── services/
│   │   └── tracker.ts     # OpenSky API fetching
│   └── types/
│       └── index.ts       # TypeScript interfaces
├── package.json
├── tsconfig.json
├── railway.json
└── .env.example
```

## Database Schema

### aircraft
| Column | Type | Description |
|--------|------|-------------|
| icao24 | VARCHAR(6) | ICAO 24-bit transponder address |
| callsign | VARCHAR(20) | Aircraft callsign |
| origin_country | VARCHAR(100) | Country of origin |
| first_seen | TIMESTAMP | First time aircraft was tracked |
| last_seen | TIMESTAMP | Most recent sighting |
| total_sightings | INTEGER | Number of times tracked |

### positions
| Column | Type | Description |
|--------|------|-------------|
| icao24 | VARCHAR(6) | Aircraft identifier |
| latitude | DECIMAL | Position latitude |
| longitude | DECIMAL | Position longitude |
| altitude | DECIMAL | Altitude in meters |
| velocity | DECIMAL | Ground speed in m/s |
| heading | DECIMAL | True track heading |
| on_ground | BOOLEAN | Whether aircraft is on ground |
| timestamp | TIMESTAMP | When position was recorded |

## License

MIT
