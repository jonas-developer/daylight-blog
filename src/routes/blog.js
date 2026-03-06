const express = require('express');
const router = express.Router();
const Post = require('../models/post');
const db = require('../db');
const crypto = require('crypto');

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Posts per page
const POSTS_PER_PAGE = 5;

// Helper to get shell settings
async function getShell() {
  let shell = {
    en_blog_name: 'Daylight Blog', en_welcome_title: '', en_welcome_body: '',
    sv_blog_name: 'Daylight Blog', sv_welcome_title: '', sv_welcome_body: '',
    es_blog_name: 'Daylight Blog', es_welcome_title: '', es_welcome_body: '',
    fr_blog_name: 'Daylight Blog', fr_welcome_title: '', fr_welcome_body: '',
    de_blog_name: 'Daylight Blog', de_welcome_title: '', de_welcome_body: '',
    it_blog_name: 'Daylight Blog', it_welcome_title: '', it_welcome_body: '',
    pt_blog_name: 'Daylight Blog', pt_welcome_title: '', pt_welcome_body: '',
    nl_blog_name: 'Daylight Blog', nl_welcome_title: '', nl_welcome_body: '',
    pl_blog_name: 'Daylight Blog', pl_welcome_title: '', pl_welcome_body: '',
    ru_blog_name: 'Daylight Blog', ru_welcome_title: '', ru_welcome_body: '',
    zh_blog_name: 'Daylight Blog', zh_welcome_title: '', zh_welcome_body: '',
    ja_blog_name: 'Daylight Blog', ja_welcome_title: '', ja_welcome_body: '',
    ko_blog_name: 'Daylight Blog', ko_welcome_title: '', ko_welcome_body: '',
    ar_blog_name: 'Daylight Blog', ar_welcome_title: '', ar_welcome_body: '',
    hi_blog_name: 'Daylight Blog', hi_welcome_title: '', hi_welcome_body: '',
    tr_blog_name: 'Daylight Blog', tr_welcome_title: '', tr_welcome_body: '',
    no_blog_name: 'Daylight Blog', no_welcome_title: '', no_welcome_body: '',
    da_blog_name: 'Daylight Blog', da_welcome_title: '', da_welcome_body: '',
    fi_blog_name: 'Daylight Blog', fi_welcome_title: '', fi_welcome_body: '',
    fil_blog_name: 'Daylight Blog', fil_welcome_title: '', fil_welcome_body: '',
    id_blog_name: 'Daylight Blog', id_welcome_title: '', id_welcome_body: '',
    hero_image: '', auto_translate_langs: []
  };
  try {
    const row = await db.get('SELECT data FROM settings WHERE key = $1', 'shell');
    if (row && row.data) {
      shell = { ...shell, ...JSON.parse(row.data) };
    }
  } catch (e) { console.log('Shell load error:', e.message); }
  // Ensure available languages include at least English
  if (!shell.auto_translate_langs || shell.auto_translate_langs.length === 0) {
    shell.available_langs = ['en'];
  } else {
    shell.available_langs = shell.auto_translate_langs;
  }
  return shell;
}

// Helper to get translations
function t(res, key) {
  return res.locals.__ ? res.locals.__.call(res, key) : key;
}

// Homepage - with latest posts preview
router.get('/', async (req, res) => {
  try {
    const lang = res.locals.locale || 'en';
    console.log('Homepage locale:', lang);
    const latestPosts = await Post.findPublished(3, 0, lang);
    console.log('Posts found:', latestPosts.length, latestPosts.map(p => p.title?.substring(0, 30)));
    const totalPosts = await Post.countPublished(lang);
    const shell = await getShell();
    
    res.render('index', {
      title: t(res, 'site.title') + ' - ' + t(res, 'site.description'),
      latestPosts,
      totalPosts,
      page: 'home',
      shell
    });
  } catch (err) {
    console.error('Homepage error:', err);
    res.status(500).send('Error loading homepage: ' + err.message);
  }
});

// Blog listing page
router.get('/posts', async (req, res) => {
  try {
    const lang = res.locals.locale || 'en';
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * POSTS_PER_PAGE;
    
    const posts = await Post.findPublished(POSTS_PER_PAGE, offset, lang);
    const totalPosts = await Post.countPublished(lang);
    const totalPages = Math.ceil(totalPosts / POSTS_PER_PAGE);
    const shell = await getShell();
    
    res.render('posts', {
      title: t(res, 'blog.title') + ' - ' + t(res, 'site.title'),
      posts,
      page: 'posts',
      currentPage: page,
      totalPages,
      totalPosts,
      shell
    });
  } catch (err) {
    console.error('Posts page error:', err);
    res.status(500).send('Error loading posts: ' + err.message);
  }
});

// Single post page
router.get('/posts/:slug', async (req, res) => {
  try {
    const lang = res.locals.locale || 'en';
    const post = await Post.findBySlug(req.params.slug, lang);
    
    if (!post) {
      return res.status(404).render('error', { 
        title: t(res, 'errors.404_title'),
        message: t(res, 'errors.404_message')
      });
    }
    
    // Parse SEO metadata if available
    let seoMeta = {};
    try {
      if (post.seo_meta) {
        seoMeta = JSON.parse(post.seo_meta);
      }
    } catch (e) {
      seoMeta.description = post.seo_meta;
    }
    
    if (!seoMeta.description && post.excerpt) {
      seoMeta.description = post.excerpt;
    }
    
    const shell = await getShell();
    
    res.render('post', {
      title: post.title + ' - ' + t(res, 'site.title'),
      post,
      seoMeta,
      page: 'posts',
      shell
    });
  } catch (err) {
    console.error('Post page error:', err);
    res.status(500).render('error', { 
      title: t(res, 'errors.500_title'),
      message: err.message 
    });
  }
});

// Subscribe API endpoint
router.post('/api/subscribe', async (req, res) => {
  console.log('=== Subscribe endpoint hit ===');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
  
  try {
    const { email } = req.body;
    console.log('Email received:', email);
    
    // Validate email
    if (!email || !EMAIL_REGEX.test(email)) {
      console.log('Invalid email format');
      return res.status(400).json({ 
        success: false, 
        message: res.locals.__ ? res.locals.__('subscribe.invalid_email') : 'Please enter a valid email address' 
      });
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    console.log('Normalized email:', normalizedEmail);
    
    // Check if already subscribed (including unsubscribed ones - reactivate them)
    console.log('Checking existing subscriber...');
    const existing = await db.get('SELECT * FROM subscribers WHERE email = $1', normalizedEmail);
    console.log('Existing subscriber:', existing);
    
    if (existing) {
      if (existing.is_active) {
        console.log('Already subscribed');
        return res.status(400).json({ 
          success: false, 
          message: res.locals.__ ? res.locals.__('subscribe.already_subscribed') : 'This email is already subscribed' 
        });
      } else {
        // Reactivate subscription
        console.log('Reactivating subscription...');
        await db.run('UPDATE subscribers SET is_active = 1, unsubscribed_at = NULL WHERE email = $1', normalizedEmail);
        return res.json({ 
          success: true, 
          message: res.locals.__ ? res.locals.__('subscribe.success_reactivated') : 'Welcome back! Your subscription has been reactivated.' 
        });
      }
    }
    
    // Insert new subscriber
    console.log('Inserting new subscriber...');
    await db.run('INSERT INTO subscribers (email, is_active) VALUES ($1, 1)', normalizedEmail);
    console.log('Subscriber inserted successfully');
    
    return res.json({ 
      success: true, 
      message: res.locals.__ ? res.locals.__('subscribe.success') : 'Thank you for subscribing!' 
    });
  } catch (err) {
    console.error('=== Subscribe ERROR ===');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    console.error('Full error:', err);
    return res.status(500).json({ 
      success: false, 
      message: res.locals.__ ? res.locals.__('subscribe.error') : 'An error occurred. Please try again.' 
    });
  }
});

module.exports = router;