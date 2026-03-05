const db = require('../db');
const bcrypt = require('bcrypt');

const isProduction = !!process.env.DATABASE_URL;

const User = {
  createTable() {
    // Use SERIAL for PostgreSQL, AUTOINCREMENT for SQLite
    const sql = isProduction
      ? `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
      : `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    return db.exec(sql);
  },

  findByUsername(username) {
    return db.get('SELECT * FROM users WHERE username = $1', username);
  },

  findById(id) {
    return db.get('SELECT id, username, created_at FROM users WHERE id = $1', id);
  },

  create(username, password) {
    const password_hash = bcrypt.hashSync(password, 10);
    return db.run('INSERT INTO users (username, password_hash) VALUES ($1, $2)', username, password_hash);
  },

  updatePassword(id, newPassword) {
    const password_hash = bcrypt.hashSync(newPassword, 10);
    return db.run('UPDATE users SET password_hash = $1 WHERE id = $2', password_hash, id);
  },

  verifyPassword(user, password) {
    return bcrypt.compareSync(password, user.password_hash);
  }
};

module.exports = User;
