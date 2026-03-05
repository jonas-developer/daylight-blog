const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('.render.com') 
    ? { rejectUnauthorized: false } 
    : false
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
