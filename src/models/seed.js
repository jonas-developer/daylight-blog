'use strict';

require('dotenv').config();
const User = require('./user');
const Post = require('./post');

console.log('Seeding database...');

// Create admin user
const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'admin123';

try {
  const existingAdmin = User.findByUsername('gbergman');
  if (!existingAdmin) {
    User.create('gbergman', adminPassword);
    console.log('✓ Admin user created (username: gbergman)');
  } else {
    console.log('✓ Admin user already exists (username: gbergman)');
  }
} catch (err) {
  console.error('Error creating admin:', err.message);
}

// Create sample posts
const admin = User.findByUsername('gbergman');
if (admin) {
  const samplePosts = [
    {
      title: 'Welcome to Daylight Blog',
      slug: 'welcome-to-daylight-blog',
      content: 'This is the first blog post on Daylight Blog, a platform dedicated to environmental advocacy and sustainability. Stay tuned for updates on climate action, green policies, and environmental news.',
      excerpt: 'Welcome to Daylight Blog - your source for environmental news and advocacy.',
      status: 'published',
      seo_meta: 'Welcome to Daylight Blog - Environmental advocacy and sustainability news.',
      author_id: admin.id
    },
    {
      title: 'The Future of Green Energy',
      slug: 'future-of-green-energy',
      content: 'Renewable energy is the key to a sustainable future. Solar, wind, and other clean energy sources are becoming increasingly affordable and efficient. We must continue to invest in green energy to combat climate change and create a better world for future generations.',
      excerpt: 'Exploring the potential of renewable energy sources.',
      status: 'published',
      seo_meta: 'Green energy future, renewable energy, solar power, wind energy.',
      author_id: admin.id
    },
    {
      title: 'Draft: Upcoming Climate Summit',
      slug: 'upcoming-climate-summit',
      content: 'Notes for the upcoming climate summit...',
      excerpt: 'Preparing for the international climate summit.',
      status: 'draft',
      seo_meta: '',
      author_id: admin.id
    }
  ];

  for (const post of samplePosts) {
    try {
      const existing = Post.findBySlug(post.slug);
      if (!existing) {
        Post.create(post);
        console.log(`✓ Created post: ${post.title}`);
      } else {
        console.log(`✓ Post already exists: ${post.title}`);
      }
    } catch (err) {
      console.error(`Error creating post ${post.title}:`, err.message);
    }
  }
  console.log('✓ Sample posts created');
}

console.log('\nSeeding completed!');
