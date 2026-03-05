const db = require('../db');

const isProduction = !!process.env.DATABASE_URL;

// Initialize images table
try {
  if (isProduction) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS images (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mimetype TEXT NOT NULL,
        size INTEGER NOT NULL,
        url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mimetype TEXT NOT NULL,
        size INTEGER NOT NULL,
        url TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
} catch (e) {
  console.log('Images table may already exist');
}

const Image = {
  findAll(limit = null) {
    const isPg = !!process.env.DATABASE_URL;
    const orderBy = isPg ? 'ORDER BY created_at DESC NULLS LAST' : 'ORDER BY created_at DESC';
    const limitStr = limit ? `LIMIT ${parseInt(limit)}` : '';
    const result = db.all(`SELECT * FROM images ${orderBy} ${limitStr}`);
    // Handle both sync (SQLite) and async (PostgreSQL)
    if (result && typeof result.then === 'function') {
      return result.then(rows => rows || []);
    }
    return result || [];
  },

  findById(id) {
    const result = db.get('SELECT * FROM images WHERE id = $1', id);
    if (result && typeof result.then === 'function') {
      return result.then(row => row || null);
    }
    return result;
  },

  create({ filename, original_name, mimetype, size, url }) {
    const result = db.run(
      'INSERT INTO images (filename, original_name, mimetype, size, url) VALUES ($1, $2, $3, $4, $5)',
      filename, original_name, mimetype, size, url
    );
    if (result && typeof result.then === 'function') {
      return result.then(r => r || { lastInsertRowid: null });
    }
    return result;
  },

  delete(id) {
    const result = db.run('DELETE FROM images WHERE id = $1', id);
    if (result && typeof result.then === 'function') {
      return result.then(r => r || { changes: 0 });
    }
    return result;
  }
};

module.exports = Image;
