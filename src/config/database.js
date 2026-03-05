'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Database configuration
// SQLite for development, PostgreSQL for production
const config = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: path.join(__dirname, '../../data/blog.db')
    },
    useNullAsDefault: true
  },
  production: {
    client: 'pg',
    connection: (() => {
      // Support DATABASE_URL (Render provides this)
      if (process.env.DATABASE_URL) {
        return process.env.DATABASE_URL;
      }
      // Fall back to individual env vars
      return {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'daylight_blog',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD
      };
    })(),
    pool: {
      min: 2,
      max: 10
    }
  }
};

const env = process.env.NODE_ENV || 'development';
module.exports = config[env];
module.exports.env = env;
