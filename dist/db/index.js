"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = exports.query = void 0;
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
exports.pool = pool;
pool.on('connect', () => {
    console.log('📦 New client connected to PostgreSQL');
});
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});
const query = (text, params) => {
    return pool.query(text, params);
};
exports.query = query;
//# sourceMappingURL=index.js.map