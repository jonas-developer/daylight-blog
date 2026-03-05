require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Import models (they'll create tables)
const User = require('./user');
const Post = require('./post');

console.log('Running migrations...');

// Create tables
User.createTable();
console.log('✓ Users table created');

Post.createTable();
console.log('✓ Posts table created');

console.log('\nMigrations completed successfully!');
