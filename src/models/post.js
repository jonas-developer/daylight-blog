const db = require('../db');

const isProduction = !!process.env.DATABASE_URL;

const Post = {
  createTable() {
    const sql = isProduction
      ? `CREATE TABLE IF NOT EXISTS posts (id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, content TEXT, excerpt TEXT, status TEXT DEFAULT 'draft', seo_meta TEXT, author_id INTEGER NOT NULL, images TEXT DEFAULT '[]', post_lang TEXT DEFAULT 'en', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
      : `CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, content TEXT, excerpt TEXT, status TEXT DEFAULT 'draft', seo_meta TEXT, author_id INTEGER NOT NULL, images TEXT DEFAULT '[]', post_lang TEXT DEFAULT 'en', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    db.exec(sql);
    // Add images column if it doesn't exist
    try {
      if (isProduction) {
        db.exec(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS images TEXT DEFAULT '[]'`);
        db.exec(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_lang TEXT DEFAULT 'en'`);
      } else {
        db.exec(`ALTER TABLE posts ADD COLUMN images TEXT DEFAULT '[]'`);
        db.exec(`ALTER TABLE posts ADD COLUMN post_lang TEXT DEFAULT 'en'`);
      }
    } catch (e) { /* Column may already exist */ }
  },

  findPublished(limit = 10, offset = 0, lang = 'en') {
    // Always try to get translations, regardless of language
    console.log('findPublished called with lang:', lang);
    
    // Get posts with translations for the specified language
    return db.all(`
      SELECT 
        COALESCE(t.title, p.title) as title,
        COALESCE(t.content, p.content) as content,
        COALESCE(t.excerpt, p.excerpt) as excerpt,
        COALESCE(t.seo_meta, p.seo_meta) as seo_meta,
        p.id, p.slug, p.status, p.images, p.post_lang, p.author_id, p.created_at, p.updated_at,
        u.username as author_name
      FROM posts p
      JOIN users u ON p.author_id = u.id
      LEFT JOIN post_translations t ON p.id = t.post_id AND t.lang = $3
      WHERE p.status = 'published' 
      ORDER BY p.created_at DESC 
      LIMIT $1 OFFSET $2
    `, limit, offset, lang);
  },

  findAll() {
    return db.all(`
      SELECT p.*, u.username as author_name 
      FROM posts p 
      JOIN users u ON p.author_id = u.id 
      ORDER BY p.created_at DESC
    `);
  },

  findById(id) {
    return db.get(`
      SELECT p.*, u.username as author_name 
      FROM posts p 
      JOIN users u ON p.author_id = u.id 
      WHERE p.id = $1
    `, id);
  },

  findBySlug(slug, lang = 'en') {
    // Always try to get translations
    return db.get(`
      SELECT 
        COALESCE(t.title, p.title) as title,
        COALESCE(t.content, p.content) as content,
        COALESCE(t.excerpt, p.excerpt) as excerpt,
        COALESCE(t.seo_meta, p.seo_meta) as seo_meta,
        p.id, p.slug, p.status, p.images, p.post_lang, p.author_id, p.created_at, p.updated_at,
        u.username as author_name
      FROM posts p
      JOIN users u ON p.author_id = u.id
      LEFT JOIN post_translations t ON p.id = t.post_id AND t.lang = $2
      WHERE p.slug = $1 AND p.status = 'published'
    `, slug, lang);
  },

  // Get translations for a post
  getTranslations(postId) {
    return db.all(`
      SELECT * FROM post_translations WHERE post_id = $1
    `, postId);
  },

  countPublished(lang = 'en') {
    if (lang === 'en') {
      return db.get("SELECT COUNT(*) as count FROM posts WHERE status = 'published'")
        .then(row => row.count);
    }
    // Count posts that have translations for the language
    return db.get(`
      SELECT COUNT(DISTINCT p.id) as count 
      FROM posts p
      LEFT JOIN post_translations t ON p.id = t.post_id AND t.lang = $1
      WHERE p.status = 'published'
    `, lang).then(row => row.count);
  },

  create(data) {
    // Use RETURNING for PostgreSQL to get the inserted ID
    const sql = isProduction
      ? `INSERT INTO posts (title, slug, content, excerpt, status, seo_meta, author_id, images, post_lang) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`
      : `INSERT INTO posts (title, slug, content, excerpt, status, seo_meta, author_id, images, post_lang) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;
    
    return db.run(sql,
      data.title,
      data.slug,
      data.content,
      data.excerpt,
      data.status || 'draft',
      data.seo_meta || '',
      data.author_id,
      JSON.stringify(data.images || []),
      data.post_lang || 'en'
    );
  },

  update(id, data) {
    return db.run(`
      UPDATE posts 
      SET title = $1, slug = $2, content = $3, excerpt = $4, status = $5, seo_meta = $6, images = $7, post_lang = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
    `,
      data.title,
      data.slug,
      data.content,
      data.excerpt,
      data.status,
      data.seo_meta || '',
      JSON.stringify(data.images || []),
      data.post_lang || 'en',
      id
    );
  },

  delete(id) {
    return db.run('DELETE FROM posts WHERE id = $1', id);
  },

  countPublished() {
    return db.get("SELECT COUNT(*) as count FROM posts WHERE status = 'published'")
      .then(row => row.count);
  },

  updateStatus(id, status) {
    return db.run('UPDATE posts SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', status, id);
  }
};

module.exports = Post;
