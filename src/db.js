// Database abstraction layer - supports both SQLite (dev) and PostgreSQL (prod)
require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Use DATABASE_URL presence as the primary determinant for PostgreSQL
// This is more reliable than NODE_ENV which might not be set correctly
const hasDatabaseUrl = !!process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === 'production' || hasDatabaseUrl;

console.log('DB Init:', { 
  isProduction, 
  hasDatabaseUrl, 
  nodeEnv: process.env.NODE_ENV,
  databaseUrlPresent: hasDatabaseUrl
});

let db;

if (isProduction || hasDatabaseUrl) {
  // Use PostgreSQL (pg)
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('.render.com') 
      ? { rejectUnauthorized: false } 
      : false
  });
  
  // Promisified PostgreSQL
  db = {
    exec: (sql) => pool.query(sql.replace(/AUTOINCREMENT/gi, 'SERIAL')),
    get: (sql, ...params) => pool.query(sql, params).then(r => r.rows[0]),
    all: (sql, ...params) => pool.query(sql, params).then(r => r.rows),
    run: (sql, ...params) => {
      // For INSERT with RETURNING
      const returningMatch = sql.match(/INSERT.*RETURNING\s+(\w+)/i);
      if (returningMatch) {
        return pool.query(sql, params).then(r => ({ 
          lastInsertRowid: r.rows[0]?.[returningMatch[1]], 
          changes: r.rowCount,
          id: r.rows[0]?.[returningMatch[1]]
        }));
      }
      return pool.query(sql, params).then(r => ({ 
        lastInsertRowid: r.rows[0]?.id, 
        changes: r.rowCount 
      }));
    }
  };
} else {
  // Use SQLite (better-sqlite3) - synchronous
  const Database = require('better-sqlite3');
  const dataDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const sqlite = new Database(path.join(dataDir, 'blog.db'));
  
  // Convert PostgreSQL $1, $2 style to SQLite ? style
  const convertPlaceholders = (sql) => {
    return sql.replace(/\$(\d+)/g, '?');
  };
  
  db = {
    exec: (sql) => sqlite.exec(sql),
    get: (sql, ...params) => sqlite.prepare(convertPlaceholders(sql)).get(...params),
    all: (sql, ...params) => sqlite.prepare(convertPlaceholders(sql)).all(...params),
    run: (sql, ...params) => sqlite.prepare(convertPlaceholders(sql)).run(...params)
  };
}

// Create settings table if not exists
try {
  const isPg = !!process.env.DATABASE_URL;
  if (isPg) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
} catch (e) {
  console.log('Settings table init:', e.message);
}

// Create post_translations table if not exists
try {
  const isPg = !!process.env.DATABASE_URL;
  if (isPg) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS post_translations (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL,
        lang TEXT NOT NULL,
        title TEXT,
        content TEXT,
        excerpt TEXT,
        seo_meta TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(post_id, lang)
      )
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS post_translations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        lang TEXT NOT NULL,
        title TEXT,
        content TEXT,
        excerpt TEXT,
        seo_meta TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(post_id, lang)
      )
    `);
  }
} catch (e) {
  console.log('Post translations table init:', e.message);
}

// Create subscribers table if not exists
// Note: For PostgreSQL, db.exec returns a Promise, so we handle it properly
const createSubscribersTable = async () => {
  try {
    const isPg = hasDatabaseUrl;
    if (isPg) {
      console.log('Creating subscribers table (PostgreSQL)...');
      await db.exec(`
        CREATE TABLE IF NOT EXISTS subscribers (
          id SERIAL PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          unsubscribed_at TIMESTAMP,
          is_active BOOLEAN DEFAULT TRUE
        )
      `);
      console.log('✓ Subscribers table ready (PostgreSQL)');
    } else {
      db.exec(`
        CREATE TABLE IF NOT EXISTS subscribers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          unsubscribed_at DATETIME,
          is_active INTEGER DEFAULT 1
        )
      `);
      console.log('✓ Subscribers table ready (SQLite)');
    }
  } catch (e) {
    console.error('✗ Subscribers table init error:', e.message);
  }
};

createSubscribersTable();

module.exports = db;
