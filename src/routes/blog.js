const express = require('express');
const router = express.Router();
const Post = require('../models/post');
const db = require('../db');
const crypto = require('crypto');
const { sendSubscriptionConfirmation, BLOG_NAME } = require('../email');

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

// Get languages that have published posts (for language switcher)
async function getLanguagesWithContent() {
  try {
    const isPg = !!process.env.DATABASE_URL;
    let rows;
    if (isPg) {
      rows = await db.all(`
        SELECT DISTINCT post_lang as lang FROM posts WHERE status = 'published' AND post_lang IS NOT NULL
        UNION
        SELECT DISTINCT lang FROM post_translations pt
        JOIN posts p ON pt.post_id = p.id
        WHERE p.status = 'published'
      `);
    } else {
      rows = await db.all(`
        SELECT DISTINCT post_lang as lang FROM posts WHERE status = 'published' AND post_lang IS NOT NULL
        UNION
        SELECT DISTINCT lang FROM post_translations pt
        JOIN posts p ON pt.post_id = p.id
        WHERE p.status = 'published'
      `);
    }
    const langs = rows.map(r => r.lang).filter(l => l);
    console.log('Languages with content:', langs);
    return langs.length > 0 ? langs : ['en'];
  } catch (e) {
    console.log('Error getting languages with content:', e.message);
    return ['en'];
  }
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
    const availableContentLangs = await getLanguagesWithContent();
    
    res.render('index', {
      title: t(res, 'site.title') + ' - ' + t(res, 'site.description'),
      latestPosts,
      totalPosts,
      page: 'home',
      shell,
      availableContentLangs
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
    const availableContentLangs = await getLanguagesWithContent();
    
    res.render('posts', {
      title: t(res, 'blog.title') + ' - ' + t(res, 'site.title'),
      posts,
      page: 'posts',
      currentPage: page,
      totalPages,
      totalPosts,
      shell,
      availableContentLangs
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
    
    // Get all translations of this post for hreflang tags
    const baseUrl = process.env.BASE_URL || 'https://daylight.blog';
    let translations = [];
    try {
      const isPg = !!process.env.DATABASE_URL;
      let transRows;
      if (isPg) {
        transRows = await db.all('SELECT lang, slug FROM post_translations WHERE post_id = $1', post.id);
      } else {
        transRows = await db.all('SELECT lang, slug FROM post_translations WHERE post_id = ?', post.id);
      }
      translations = transRows.map(t => ({
        lang: t.lang,
        url: `${baseUrl}/posts/${t.slug}?lang=${t.lang}`
      }));
    } catch (e) {
      console.log('Could not fetch translations for hreflang:', e.message);
    }
    
    const shell = await getShell();
    const availableContentLangs = await getLanguagesWithContent();
    
    res.render('post', {
      title: post.title + ' - ' + t(res, 'site.title'),
      post,
      seoMeta,
      translations,
      availableContentLangs,
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
  try {
    const { email, not_robot, website } = req.body;
    
    // Honeypot check - if website field is filled, it's a bot
    if (website) {
      console.log('Bot detected: honeypot field filled');
      return res.json({ success: true, message: 'Thank you for subscribing!' });
    }
    
    // Validate email
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ 
        success: false, 
        message: res.locals.__ ? res.locals.__('subscribe.invalid_email') : 'Please enter a valid email address' 
      });
    }
    
    // Validate CAPTCHA - must be checked (true)
    if (!not_robot) {
      return res.status(400).json({ 
        success: false, 
        message: res.locals.__ ? res.locals.__('subscribe.robot_error') : 'Please confirm you are not a robot' 
      });
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // First try to create table (if it doesn't exist) - using simple SQL
    try {
      const isPg = !!process.env.DATABASE_URL;
      if (isPg) {
        await db.exec(`CREATE TABLE IF NOT EXISTS subscribers (id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, unsubscribed_at TIMESTAMP, is_active BOOLEAN DEFAULT TRUE)`);
      } else {
        await db.exec(`CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP, unsubscribed_at DATETIME, is_active INTEGER DEFAULT 1)`);
      }
    } catch (e) {
      // Table might already exist, continue
    }
    
    // Check if already subscribed
    let existing;
    try {
      existing = await db.get('SELECT * FROM subscribers WHERE email = $1', normalizedEmail);
    } catch (e) {
      // Table might not exist yet, ignore
      existing = null;
    }
    
    if (existing) {
      if (existing.is_active) {
        return res.status(400).json({ 
          success: false, 
          message: res.locals.__ ? res.locals.__('subscribe.already_subscribed') : 'This email is already subscribed' 
        });
      } else {
        // Reactivate subscription - use TRUE for PostgreSQL compatibility
        const isPg = !!process.env.DATABASE_URL;
        if (isPg) {
          await db.run('UPDATE subscribers SET is_active = $2, unsubscribed_at = NULL WHERE email = $1', normalizedEmail, true);
        } else {
          await db.run('UPDATE subscribers SET is_active = 1, unsubscribed_at = NULL WHERE email = $1', normalizedEmail);
        }
        return res.json({ 
          success: true, 
          message: res.locals.__ ? res.locals.__('subscribe.success_reactivated') : 'Welcome back! Your subscription has been reactivated.' 
        });
      }
    }
    
    // Insert new subscriber - use TRUE for PostgreSQL compatibility
    const isPg = !!process.env.DATABASE_URL;
    if (isPg) {
      await db.run('INSERT INTO subscribers (email, is_active) VALUES ($1, $2)', normalizedEmail, true);
    } else {
      await db.run('INSERT INTO subscribers (email, is_active) VALUES ($1, 1)', normalizedEmail);
    }
    
    // Send confirmation email
    const shell = await getShell();
    const blogName = shell.en_blog_name || BLOG_NAME;
    const baseUrl = process.env.BASE_URL || 'https://daylight.blog';
    sendSubscriptionConfirmation(normalizedEmail, blogName, baseUrl).catch(err => console.log('Confirmation email error:', err.message));
    
    return res.json({ 
      success: true, 
      message: res.locals.__ ? res.locals.__('subscribe.success') : 'Thank you for subscribing!' 
    });
  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ 
      success: false, 
      message: `Server error: ${err.message}` 
    });
  }
});

// Unsubscribe API endpoint
router.post('/api/unsubscribe', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email address' 
      });
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Update subscriber as unsubscribed
    const isPg = !!process.env.DATABASE_URL;
    if (isPg) {
      await db.run('UPDATE subscribers SET is_active = $2, unsubscribed_at = CURRENT_TIMESTAMP WHERE email = $1', normalizedEmail, false);
    } else {
      await db.run('UPDATE subscribers SET is_active = 0, unsubscribed_at = CURRENT_TIMESTAMP WHERE email = $1', normalizedEmail);
    }
    
    return res.json({ 
      success: true, 
      message: res.locals.__ ? res.locals.__('unsubscribe.success') : 'You have been unsubscribed' 
    });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return res.status(500).json({ 
      success: false, 
      message: `Server error: ${err.message}` 
    });
  }
});

// Unsubscribe page (GET)
router.get('/unsubscribe', async (req, res) => {
  try {
    const email = req.query.email || '';
    const shell = await getShell();
    
    res.render('unsubscribe', {
      title: t(res, 'unsubscribe.title') + ' - ' + t(res, 'site.title'),
      email,
      page: 'unsubscribe',
      shell
    });
  } catch (err) {
    console.error('Unsubscribe page error:', err);
    res.status(500).render('error', { 
      title: t(res, 'errors.500_title'),
      message: err.message 
    });
  }
});

// Privacy Policy page (GET)
router.get('/privacy', async (req, res) => {
  try {
    const shell = await getShell();
    
    res.render('privacy', {
      title: 'Privacy Policy - ' + t(res, 'site.title'),
      page: 'privacy',
      shell
    });
  } catch (err) {
    console.error('Privacy page error:', err);
    res.status(500).render('error', { 
      title: t(res, 'errors.500_title'),
      message: err.message 
    });
  }
});

// Sitemap XML endpoint
router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = process.env.BASE_URL || 'https://daylight.blog';
    const shell = await getShell();
    
    // Get activated languages (default to English if not set)
    const languages = shell.auto_translate_langs && shell.auto_translate_langs.length > 0 
      ? shell.auto_translate_langs 
      : ['en'];
    
    // Get all published posts (without pagination limit)
    const isPg = !!process.env.DATABASE_URL;
    let posts;
    if (isPg) {
      posts = await db.all(`
        SELECT p.id, p.slug, p.updated_at, p.created_at
        FROM posts p
        WHERE p.status = 'published'
        ORDER BY p.created_at DESC
      `);
    } else {
      posts = await db.all(`
        SELECT p.id, p.slug, p.updated_at, p.created_at
        FROM posts p
        WHERE p.status = 'published'
        ORDER BY p.created_at DESC
      `);
    }
    
    // Get all post translations for each language
    const postTranslations = {};
    for (const post of posts) {
      let transRows;
      if (isPg) {
        transRows = await db.all('SELECT lang, slug FROM post_translations WHERE post_id = $1', post.id);
      } else {
        transRows = await db.all('SELECT lang, slug FROM post_translations WHERE post_id = ?', post.id);
      }
      postTranslations[post.id] = transRows;
    }
    
    // Build sitemap XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    
    // Static pages - each language
    const staticPages = [
      { url: '/', priority: '1.0', changefreq: 'daily' },
      { url: '/posts', priority: '0.8', changefreq: 'daily' },
      { url: '/privacy', priority: '0.3', changefreq: 'monthly' },
      { url: '/unsubscribe', priority: '0.3', changefreq: 'monthly' }
    ];
    
    for (const lang of languages) {
      const langPrefix = lang === 'en' ? '' : `/${lang}`;
      
      // Static pages
      for (const page of staticPages) {
        const loc = `${baseUrl}${langPrefix}${page.url}`;
        const lastmod = new Date().toISOString().split('T')[0];
        xml += `  <url>\n`;
        xml += `    <loc>${loc}</loc>\n`;
        xml += `    <lastmod>${lastmod}</lastmod>\n`;
        xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
        xml += `    <priority>${page.priority}</priority>\n`;
        xml += `  </url>\n`;
      }
    }
    
    // Posts - each post in each language
    for (const post of posts) {
      for (const lang of languages) {
        const langPrefix = lang === 'en' ? '' : `/${lang}`;
        
        // Get the correct slug for this language
        let slug = post.slug;
        if (lang !== 'en' && postTranslations[post.id]) {
          const trans = postTranslations[post.id].find(t => t.lang === lang);
          if (trans) {
            slug = trans.slug;
          }
        }
        
        const loc = `${baseUrl}${langPrefix}/posts/${slug}`;
        const lastmod = post.updated_at 
          ? new Date(post.updated_at).toISOString().split('T')[0]
          : new Date(post.created_at).toISOString().split('T')[0];
        
        xml += `  <url>\n`;
        xml += `    <loc>${loc}</loc>\n`;
        xml += `    <lastmod>${lastmod}</lastmod>\n`;
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.7</priority>\n`;
        xml += `  </url>\n`;
      }
    }
    
    xml += '</urlset>';
    
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap error:', err);
    res.status(500).send('Error generating sitemap: ' + err.message);
  }
});

module.exports = router;