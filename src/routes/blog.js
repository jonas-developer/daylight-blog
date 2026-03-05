const express = require('express');
const router = express.Router();
const Post = require('../models/post');
const db = require('../db');

// Posts per page
const POSTS_PER_PAGE = 5;

// Helper to get shell settings
async function getShell() {
  let shell = {
    en_blog_name: 'Gunnels Blogg', en_welcome_title: '', en_welcome_body: '',
    sv_blog_name: 'Gunnels Blogg', sv_welcome_title: '', sv_welcome_body: '',
    es_blog_name: 'Gunnels Blogg', es_welcome_title: '', es_welcome_body: '',
    fr_blog_name: 'Gunnels Blogg', fr_welcome_title: '', fr_welcome_body: '',
    de_blog_name: 'Gunnels Blogg', de_welcome_title: '', de_welcome_body: '',
    it_blog_name: 'Gunnels Blogg', it_welcome_title: '', it_welcome_body: '',
    pt_blog_name: 'Gunnels Blogg', pt_welcome_title: '', pt_welcome_body: '',
    nl_blog_name: 'Gunnels Blogg', nl_welcome_title: '', nl_welcome_body: '',
    pl_blog_name: 'Gunnels Blogg', pl_welcome_title: '', pl_welcome_body: '',
    ru_blog_name: 'Gunnels Blogg', ru_welcome_title: '', ru_welcome_body: '',
    zh_blog_name: 'Gunnels Blogg', zh_welcome_title: '', zh_welcome_body: '',
    ja_blog_name: 'Gunnels Blogg', ja_welcome_title: '', ja_welcome_body: '',
    ko_blog_name: 'Gunnels Blogg', ko_welcome_title: '', ko_welcome_body: '',
    ar_blog_name: 'Gunnels Blogg', ar_welcome_title: '', ar_welcome_body: '',
    hi_blog_name: 'Gunnels Blogg', hi_welcome_title: '', hi_welcome_body: '',
    tr_blog_name: 'Gunnels Blogg', tr_welcome_title: '', tr_welcome_body: '',
    no_blog_name: 'Gunnels Blogg', no_welcome_title: '', no_welcome_body: '',
    da_blog_name: 'Gunnels Blogg', da_welcome_title: '', da_welcome_body: '',
    fi_blog_name: 'Gunnels Blogg', fi_welcome_title: '', fi_welcome_body: '',
    fil_blog_name: 'Gunnels Blogg', fil_welcome_title: '', fil_welcome_body: '',
    id_blog_name: 'Gunnels Blogg', id_welcome_title: '', id_welcome_body: '',
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

module.exports = router;