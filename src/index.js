require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const path = require('path');
const cookieParser = require('cookie-parser');
const { i18n } = require('./i18n');
const db = require('./db');

// Import routes
const { router: authRoutes } = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const blogRoutes = require('./routes/blog');
const debugRoutes = require('./routes/debug');

// Run migrations on startup
async function initDb() {
  const User = require('./models/user');
  const Post = require('./models/post');
  require('./models/image');

  try {
    await User.createTable();
    console.log('✓ Users table ready');
    await Post.createTable();
    console.log('✓ Posts table ready');
    
    // Create settings table for shell
    await db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, data TEXT)`);
    console.log('✓ Settings table ready');
    
    // Create subscribers table (with PostgreSQL-specific SQL)
    const isPg = !!process.env.DATABASE_URL;
    if (isPg) {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS subscribers (
          id SERIAL PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          unsubscribed_at TIMESTAMP,
          is_active BOOLEAN DEFAULT TRUE
        )
      `);
    } else {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS subscribers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          unsubscribed_at DATETIME,
          is_active INTEGER DEFAULT 1
        )
      `);
    }
    console.log('✓ Subscribers table ready');
    
    // Create admin user if not exists
    const adminUsername = process.env.ADMIN_USERNAME || 'daylight';
    const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'admin123';
    const existingAdmin = await User.findByUsername(adminUsername);
    if (!existingAdmin) {
      await User.create(adminUsername, adminPassword);
      console.log('✓ Admin user created: ' + adminUsername);
    } else {
      console.log('✓ Admin user exists: ' + adminUsername);
    }
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

initDb();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Cookie parser (for JWT token and language)
app.use(cookieParser());

// i18n middleware (must be before routes)
app.use(i18n);

const crypto = require('crypto');

// Shell settings middleware - load from database on each request
app.use(async (req, res, next) => {
  try {
    const row = await db.get('SELECT data FROM settings WHERE key = $1', 'shell');
    if (row && row.data) {
      res.locals.shell = JSON.parse(row.data);
    } else {
      res.locals.shell = { en_blog_name: 'Daylight Blog', en_welcome_title: '', en_welcome_body: '', sv_blog_name: 'Daylight Blog', sv_welcome_title: '', sv_welcome_body: '' };
    }
  } catch(e) {
    console.log('Shell load error:', e.message);
    res.locals.shell = {};
  }
  
  // Unique visitor tracking - only on non-admin/public pages
  if (!req.path.startsWith('/admin') && !req.path.startsWith('/login') && !req.path.startsWith('/logout') && !req.path.startsWith('/debug') && !req.path.startsWith('/api')) {
    try {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      
      // Create a hash from IP + User Agent for unique identification
      const visitorHash = crypto.createHash('sha256').update(ip + userAgent).digest('hex');
      
      // Check if this visitor exists
      const isPg = !!process.env.DATABASE_URL;
      let existingVisitor;
      if (isPg) {
        existingVisitor = await db.get('SELECT * FROM visitors WHERE visitor_hash = $1', visitorHash);
      } else {
        existingVisitor = await db.get('SELECT * FROM visitors WHERE visitor_hash = ?', visitorHash);
      }
      
      if (existingVisitor) {
        // Update existing visitor - increment count and update last_visited
        if (isPg) {
          await db.run('UPDATE visitors SET visit_count = visit_count + 1, last_visited = CURRENT_TIMESTAMP WHERE visitor_hash = $1', visitorHash);
        } else {
          await db.run('UPDATE visitors SET visit_count = visit_count + 1, last_visited = CURRENT_TIMESTAMP WHERE visitor_hash = ?', visitorHash);
        }
      } else {
        // New unique visitor - insert
        if (isPg) {
          await db.run('INSERT INTO visitors (visitor_hash, ip_address, user_agent, visit_count) VALUES ($1, $2, $3, 1)', visitorHash, ip, userAgent);
        } else {
          await db.run('INSERT INTO visitors (visitor_hash, ip_address, user_agent, visit_count) VALUES (?, ?, ?, 1)', visitorHash, ip, userAgent);
        }
      }
      
      // Get total unique visitors count
      let uniqueVisitorCount = 0;
      const countRow = await db.get('SELECT COUNT(*) as count FROM visitors');
      if (countRow) {
        uniqueVisitorCount = countRow.count || 0;
      }
      res.locals.uniqueVisitorCount = uniqueVisitorCount;
    } catch(e) {
      console.log('Unique visitor count error:', e.message);
    }
  }
  
  next();
});

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Debug routes FIRST (before blog to avoid slug conflict)
app.use('/debug', debugRoutes);

// Public blog routes
app.use('/', blogRoutes);

// Auth routes
app.use('/', authRoutes);

// Admin routes
app.use('/admin', adminRoutes);

// 404 handler
app.use((req, res, next) => {
  res.status(404).render('error', { 
    title: 'Page Not Found', 
    message: 'The page you are looking for does not exist' 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).render('error', { 
    title: 'Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred' 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Daylight Blog server running on http://localhost:${PORT}`);
});