const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('.render.com') 
    ? { rejectUnauthorized: false } 
    : false
});

// Debug: check environment
router.get('/debug-env', async (req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV,
    databaseUrlPresent: !!process.env.DATABASE_URL,
    databaseUrlPreview: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'NOT SET',
    isProduction: process.env.NODE_ENV === 'production'
  });
});

// Debug: test db.get directly
router.get('/debug-db-get', async (req, res) => {
  const db = require('../db');
  try {
    // Test querying the subscribers table
    const result = await db.get('SELECT 1 as test');
    res.json({ success: true, result });
  } catch (err) {
    res.json({ error: err.message, stack: err.stack });
  }
});

// Debug: check subscribers table
router.get('/debug-subscribers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM subscribers LIMIT 10');
    res.json({ count: result.rows.length, subscribers: result.rows });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Debug: create subscribers table explicitly
router.get('/debug-create-subscribers', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscribers (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        unsubscribed_at TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE
      )
    `);
    res.json({ success: true, message: 'Subscribers table created/verified' });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Debug: check user
router.get('/debug-check-user', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, length(password_hash) as pw_len FROM users WHERE username = $1', ['gbergman']);
    if (result.rows.length === 0) {
      res.send('User not found');
    } else {
      res.send('User found: ' + JSON.stringify(result.rows[0]));
    }
  } catch (err) {
    res.send('Error: ' + err.message);
  }
});

// Debug: test login directly
router.get('/debug-test-login', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const result = await pool.query('SELECT * FROM users WHERE username = $1', ['gbergman']);
    if (result.rows.length === 0) {
      res.send('User not found');
      return;
    }
    const user = result.rows[0];
    const testPass = bcrypt.compareSync('admin123', user.password_hash);
    res.send('Password test for admin123: ' + (testPass ? 'VALID' : 'INVALID'));
  } catch (err) {
    res.send('Error: ' + err.message);
  }
});

module.exports = router;
