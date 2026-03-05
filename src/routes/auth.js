const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';

// Helper to get shell settings
async function getShell() {
  let shell = {
    en_blog_name: 'Daylight Blog', en_welcome_title: '', en_welcome_body: '',
    sv_blog_name: 'Daylight Blog', sv_welcome_title: '', sv_welcome_body: '',
    available_langs: ['en']
  };
  try {
    const row = await db.get('SELECT data FROM settings WHERE key = $1', 'shell');
    if (row && row.data) {
      shell = { ...shell, ...JSON.parse(row.data) };
    }
  } catch (e) {
    console.log('Shell load error:', e.message);
  }
  if (!shell.auto_translate_langs || shell.auto_translate_langs.length === 0) {
    shell.available_langs = ['en'];
  } else {
    shell.available_langs = shell.auto_translate_langs;
  }
  return shell;
}

// Rate limiter for login
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.'
});

// GET login page
router.get('/login', async (req, res) => {
  // Check for existing token
  const token = req.cookies?.auth_token;
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return res.redirect('/admin');
    } catch (e) {
      // Token invalid, show login
    }
  }
  
  const shell = await getShell();
  res.render('login', { 
    title: 'Admin Login - ' + (shell.en_blog_name || 'Daylight Blog'),
    error: null,
    shell
  });
});

// POST login
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  
  try {
    if (!username || !password) {
      return res.render('login', {
        title: 'Admin Login - Daylight Blog',
        error: 'Username and password are required'
      });
    }
    
    const user = await User.findByUsername(username);
    
    if (!user) {
      return res.render('login', {
        title: 'Admin Login - Daylight Blog',
        error: 'Invalid username or password'
      });
    }

    const isValid = User.verifyPassword(user, password);
    
    if (!isValid) {
      return res.render('login', {
        title: 'Admin Login - Daylight Blog',
        error: 'Invalid username or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Set cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    res.redirect('/admin');
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', {
      title: 'Admin Login - Daylight Blog',
      error: 'An error occurred: ' + err.message
    });
  }
});

// GET logout
router.get('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.redirect('/');
});

// Middleware to check auth
const requireAuth = (req, res, next) => {
  const token = req.cookies?.auth_token;
  if (!token) {
    return res.redirect('/login');
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.redirect('/login');
  }
};

module.exports = { router, requireAuth };