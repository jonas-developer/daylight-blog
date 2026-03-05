const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const { sendPasswordResetEmail } = require('../email');


let sharp;
try { sharp = require('sharp'); } catch(e) { console.warn('sharp not available'); }
const Post = require('../models/post');
const Image = require('../models/image');
const { requireAuth } = require('./auth');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Upload to imgbb
async function uploadToImgbb(buffer, originalName) {
  let processedBuffer = buffer;

  // Resize/compress if sharp is available - max 1280x1280
  if (sharp) {
    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();
      // Resize to max 1280x1280, maintain aspect ratio
      if (metadata.width > 1280 || metadata.height > 1280) {
        processedBuffer = await image.resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      } else {
        processedBuffer = await image.jpeg({ quality: 85 }).toBuffer();
      }
    } catch(e) {
      console.warn('Image processing failed:', e.message);
    }
  }

  const apiKey = process.env.IMGBB_API_KEY || 'ebcade9f2ba85d95ebb59fdf66b8cedc';
  console.log('Imgbb API key present:', !!apiKey);

  try {
    const response = await axios.post(
      'https://api.imgbb.com/1/upload',
      new URLSearchParams({
        key: apiKey,
        image: processedBuffer.toString('base64'),
        name: originalName
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
    );
    console.log('Imgbb response:', response.data);
    if (response.data && response.data.data && response.data.data.url) {
      return response.data.data.url;
    }
    console.error('Imgbb error: no url in response', response.data);
    return null;
  } catch (err) {
    console.error('Imgbb upload error:', err.message, err.response?.data);
    return null;
  }
}

// GET admin dashboard
router.get('/', requireAuth, async (req, res) => {
  try {
    const posts = await Post.findAll();
    // Get visitor count
    let visitorCount = 0;
    try {
      const visitorRow = await db.get('SELECT data FROM settings WHERE key = $1', 'visitors');
      if (visitorRow && visitorRow.data) {
        visitorCount = JSON.parse(visitorRow.data).count || 0;
      }
    } catch(e) { console.log('Visitor count error:', e.message); }

    res.render('admin/index', {
      title: 'Admin Dashboard - Daylight Blog',
      username: req.user.username,
      posts,
      visitorCount
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.render('error', {
      title: 'Error',
      message: err.message
    });
  }
});

// GET new post page
router.get('/posts/new', requireAuth, async (req, res) => {
  let images = [];
  try {
    images = await Image.findAll(8);
  } catch (e) {
    console.error('Error loading images:', e.message);
  }

  // Get shell for available languages
  let shell = { auto_translate_langs: ['en'] };
  try {
    const row = await db.get('SELECT data FROM settings WHERE key = $1', 'shell');
    if (row && row.data) {
      shell = { ...shell, ...JSON.parse(row.data) };
    }
  } catch (e) { console.log('Shell load error:', e.message); }

  const availableLangs = shell.auto_translate_langs && shell.auto_translate_langs.length > 0 ? shell.auto_translate_langs : ['en'];

  res.render('admin/post-form', {
    title: 'New Post - Daylight Blog',
    post: null,
    images,
    availableLangs,
    action: '/admin/posts/new'
  });
});

// POST create post
router.post('/posts/new', requireAuth, async (req, res) => {
  try {
    const { title, slug, content, excerpt, status, seo_meta, selectedImages, post_lang } = req.body;
    console.log('POST body post_lang:', post_lang);
    const images = Array.isArray(selectedImages) ? selectedImages : selectedImages ? [selectedImages] : [];

    const result = await Post.create({
      title,
      slug,
      content,
      excerpt,
      status,
      seo_meta,
      author_id: req.user.id,
      images,
      post_lang: post_lang || 'en'
    });

    const postId = result.lastInsertRowid || result.id;
    console.log('Post created with ID:', postId, 'Title:', title ? title.substring(0, 30) : 'NO TITLE');

    // Get auto-translate languages from shell settings
    let shell = { auto_translate_langs: [] };
    try {
      const row = await db.get('SELECT data FROM settings WHERE key = $1', 'shell');
      if (row && row.data) {
        shell = JSON.parse(row.data);
      }
    } catch (e) { console.log('Shell load error:', e.message); }

    console.log('Shell settings:', JSON.stringify(shell));
    console.log('Post lang:', post_lang);

    const translateLangs = (shell.auto_translate_langs || []).filter(l => l !== (post_lang || 'en'));
    console.log('Translating to:', translateLangs);
    console.log('OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY);

    // Auto-translate to other languages
    if (translateLangs.length > 0 && process.env.OPENAI_API_KEY) {
      console.log('Auto-translating post to:', translateLangs);

      for (const targetLang of translateLangs) {
        try {
          const [transTitle, transContent, transExcerpt, transSeo] = await Promise.all([
            translateText(title, targetLang),
            translateText(content, targetLang),
            translateText(excerpt || '', targetLang),
            translateText(seo_meta || '', targetLang)
          ]);

          // Save translation
          await db.run(`
            INSERT INTO post_translations (post_id, lang, title, content, excerpt, seo_meta)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT(post_id, lang) DO UPDATE SET
              title = EXCLUDED.title, content = EXCLUDED.content,
              excerpt = EXCLUDED.excerpt, seo_meta = EXCLUDED.seo_meta
          `, postId, targetLang, transTitle, transContent, transExcerpt, transSeo);

          console.log(`Translated to ${targetLang}: "${transTitle ? transTitle.substring(0, 50) : 'empty'}..."`);
          console.log(`  Content length: ${transContent ? transContent.length : 0}`);
        } catch (transErr) {
          console.error(`Translation error for ${targetLang}:`, transErr.message);
        }
      }
    } else if (translateLangs.length > 0 && !process.env.OPENAI_API_KEY) {
      console.log('WARNING: OPENAI_API_KEY not set - skipping translations');
    }

    res.redirect('/admin');
  } catch (err) {
    console.error('Create post error:', err);
    res.render('error', {
      title: 'Error',
      message: err.message
    });
  }
});

// GET edit post page
router.get('/posts/:id/edit', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).render('error', {
        title: 'Page Not Found',
        message: 'Post not found'
      });
    }
    let images = [];
    try {
      images = await Image.findAll(8);
    } catch (e) {
      console.error('Error loading images:', e.message);
    }

    // Get shell for available languages
    let shell = { auto_translate_langs: ['en'] };
    try {
      const row = await db.get('SELECT data FROM settings WHERE key = $1', 'shell');
      if (row && row.data) {
        shell = { ...shell, ...JSON.parse(row.data) };
      }
    } catch (e) { console.log('Shell load error:', e.message); }
    
    const availableLangs = shell.auto_translate_langs && shell.auto_translate_langs.length > 0 ? shell.auto_translate_langs : ['en'];
    
    res.render('admin/post-form', {
      title: 'Edit Post - Daylight Blog',
      post,
      images,
      availableLangs,
      action: `/admin/posts/${post.id}/edit`
    });
  } catch (err) {
    console.error('Edit post error:', err);
    res.render('error', {
      title: 'Error',
      message: err.message
    });
  }
});

// POST update post
router.post('/posts/:id/edit', requireAuth, async (req, res) => {
  try {
    const { title, slug, content, excerpt, status, seo_meta, selectedImages, post_lang } = req.body;
    const images = Array.isArray(selectedImages) ? selectedImages : selectedImages ? [selectedImages] : [];

    await Post.update(req.params.id, {
      title,
      slug,
      content,
      excerpt,
      status,
      seo_meta,
      images,
      post_lang: post_lang || 'en'
    });

    const postId = req.params.id;

    // Get auto-translate languages from shell settings
    let shell = { auto_translate_langs: [] };
    try {
      const row = await db.get('SELECT data FROM settings WHERE key = $1', 'shell');
      if (row && row.data) {
        shell = JSON.parse(row.data);
      }
    } catch (e) { console.log('Shell load error:', e.message); }

    const translateLangs = (shell.auto_translate_langs || []).filter(l => l !== (post_lang || 'en'));

    // Re-translate to other languages
    if (translateLangs.length > 0 && process.env.OPENAI_API_KEY) {
      console.log('Re-translating post to:', translateLangs);

      for (const targetLang of translateLangs) {
        try {
          const [transTitle, transContent, transExcerpt, transSeo] = await Promise.all([
            translateText(title, targetLang),
            translateText(content, targetLang),
            translateText(excerpt || '', targetLang),
            translateText(seo_meta || '', targetLang)
          ]);

          // Save/update translation
          await db.run(`
            INSERT INTO post_translations (post_id, lang, title, content, excerpt, seo_meta)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT(post_id, lang) DO UPDATE SET
              title = EXCLUDED.title, content = EXCLUDED.content,
              excerpt = EXCLUDED.excerpt, seo_meta = EXCLUDED.seo_meta
          `, postId, targetLang, transTitle, transContent, transExcerpt, transSeo);

          console.log(`Re-translated to ${targetLang}: "${transTitle ? transTitle.substring(0, 50) : 'empty'}..."`);
        } catch (transErr) {
          console.error(`Re-translation error for ${targetLang}:`, transErr.message);
        }
      }
    }

    res.redirect('/admin');
  } catch (err) {
    console.error('Update post error:', err);
    res.render('error', {
      title: 'Error',
      message: err.message
    });
  }
});

// POST delete post
router.post('/posts/:id/delete', requireAuth, async (req, res) => {
  try {
    await Post.delete(req.params.id);
    res.redirect('/admin');
  } catch (err) {
    console.error('Delete post error:', err);
    res.render('error', {
      title: 'Error',
      message: err.message
    });
  }
});

// POST toggle post status
router.post('/posts/:id/toggle', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.redirect('/admin');
    }

    const newStatus = post.status === 'published' ? 'draft' : 'published';
    await Post.updateStatus(req.params.id, newStatus);
    res.redirect('/admin');
  } catch (err) {
    console.error('Toggle post error:', err);
    res.redirect('/admin');
  }
});

// GET upload page
router.get('/upload', requireAuth, async (req, res) => {
  let images = [];
  let loadError = '';
  try {
    console.log('Loading images...');
    images = await Image.findAll();
    console.log('Images loaded:', images.length);
  } catch (e) {
    console.error('Error loading images:', e.message, e.stack);
    loadError = e.message;
  }
  res.render('admin/upload', {
    title: 'Upload Image - Daylight Blog',
    images,
    loadError,
    csrfToken: req.csrfToken ? req.csrfToken() : ''
  });
});

// POST upload handle
router.post('/upload', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.render('admin/upload', {
        title: 'Upload Image - Daylight Blog',
        images: Image.findAll(),
        uploadError: 'Please select an image file',
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    }

    // Upload to imgbb
    const imgbbUrl = await uploadToImgbb(req.file.buffer, req.file.originalname);

    if (!imgbbUrl) {
      return res.render('admin/upload', {
        title: 'Upload Image - Daylight Blog',
        images: Image.findAll(),
        uploadError: 'Failed to upload image. Please try again.',
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    }

    await Image.create({
      filename: req.file.originalname,
      original_name: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      url: imgbbUrl
    });

    res.redirect('/admin/upload');
  } catch (err) {
    console.error('Upload error:', err);
    res.render('admin/upload', {
      title: 'Upload Image - Daylight Blog',
      images: Image.findAll(),
      uploadError: 'Upload failed: ' + err.message,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  }
});

// DELETE image
router.post('/upload/delete', requireAuth, async (req, res) => {
  try {
    const imageId = req.body.image_id;
    if (!imageId) {
      return res.status(400).json({ error: 'Image ID required' });
    }
    
    // Get the image URL first
    let image = Image.findById(imageId);
    if (image && typeof image.then === 'function') {
      image = await image;
    }
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const imageUrl = image.url;
    
    // Check if image is used as hero
    const shellRow = await db.get('SELECT data FROM settings WHERE key = $1', 'shell');
    console.log('Delete image check - imageUrl:', imageUrl);
    console.log('Delete image check - shellRow:', shellRow);
    if (shellRow && shellRow.data) {
      const shell = JSON.parse(shellRow.data);
      console.log('Delete image check - shell.hero_image:', shell.hero_image);
      if (shell.hero_image === imageUrl) {
        return res.status(400).json({ error: 'The image is actively used as Hero Image. You must remove usage before it can be deleted.' });
      }
    }
    
    // Check if image is used in any post
    const posts = await db.all('SELECT id, images FROM posts WHERE images LIKE $1', `%${imageUrl}%`);
    if (posts && posts.length > 0) {
      return res.status(400).json({ error: 'The image is actively used in a Post. You must remove usage before it can be deleted.' });
    }
    
    await Image.delete(imageId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete image error:', err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// AI Refine - Generate blog content using OpenAI
const { OpenAI } = require('openai');

// Helper to translate text using OpenAI
async function translateText(text, targetLang) {
  if (!text || !text.trim()) return '';

  const langNames = {
    en: 'English', sv: 'Swedish', es: 'Spanish', fr: 'French', de: 'German',
    it: 'Italian', pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', ru: 'Russian',
    zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic', hi: 'Hindi',
    tr: 'Turkish', no: 'Norwegian', da: 'Danish', fi: 'Finnish', fil: 'Filipino', id: 'Indonesian'
  };

  const targetLangName = langNames[targetLang] || targetLang;

  try {
    console.log(`Translating to ${targetLangName}:`, text.substring(0, 50));
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `You are a professional translator. Translate ONLY the text provided to ${targetLangName}. Return ONLY the translation with no comments, explanations, or additional text. No quotes, no brackets, no prefixes like "Translation:". Just the raw translated text.` },
        { role: 'user', content: text }
      ],
      max_tokens: 4000,
      temperature: 0.2
    });
    let result = completion.choices[0]?.message?.content || '';
    console.log(`Raw translation result:`, result.substring(0, 100));
    // Clean up any remaining unwanted text
    result = result.replace(/^[\["']*Translation:[\s]*/i, '').replace(/[\]"']*$/g, '').trim();
    result = result.replace(/^The (?:text|translation).*?would be:?\s*/i, '').trim();
    console.log(`Cleaned result:`, result.substring(0, 100));
    return result;
  } catch (err) {
    console.error('Translation error:', err.message);
    return '';
  }
}

router.post('/ai-refine', requireAuth, async (req, res) => {
  try {
    const { content, length } = req.body;

    if (!content || content.trim().length < 3) {
      return res.json({ error: 'Content field is empty. Please add keywords or a brief description of what you want to write about.' });
    }

    const wordCount = parseInt(length) || 100;
    const prompt = `Write a friendly, personal blog post (approximately ${wordCount} words) based on the following keywords/notes:\n\n${content}\n\nMake it sound like a real person sharing their everyday life experiences. Keep it authentic, warm, and personal. Don't use bullet points - write as flowing prose.`;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that writes personal blog posts.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: wordCount * 2,
      temperature: 0.8
    });

    const generatedText = completion.choices[0]?.message?.content || '';
    res.json({ result: generatedText });
  } catch (err) {
    console.error('AI refine error:', err.message);
    res.json({ error: 'Failed: ' + err.message });
  }
});

// AI Generate Excerpt
router.post('/ai-excerpt', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || content.trim().length < 10) {
      return res.json({ error: 'Content field is empty. Please add some content to generate an excerpt from.' });
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `Create a short, engaging excerpt (max 50 words) from the following blog post:\n\n${content}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100
    });
    res.json({ result: completion.choices[0]?.message?.content || '' });
  } catch (err) {
    res.json({ error: 'Failed to generate excerpt.' });
  }
});

// AI Generate Slug
router.post('/ai-slug', requireAuth, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || title.trim().length < 2) {
      return res.json({ error: 'Please add a title to generate a slug.' });
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `Convert ONLY the title below into a short URL-friendly slug (lowercase, hyphens only, max 60 characters, no explanations, no comments). Just return the slug.\n\nTitle: ${title}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
      temperature: 0.2
    });
    let slug = completion.choices[0]?.message?.content?.trim() || '';
    // Clean up any extra text
    slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    // Limit length
    if (slug.length > 60) slug = slug.substring(0, 60);
    res.json({ result: slug });
  } catch (err) {
    res.json({ error: 'Failed to generate slug.' });
  }
});

// AI Generate SEO
router.post('/ai-seo', requireAuth, async (req, res) => {
  try {
    const { title, content } = req.body;
    if ((!content || content.trim().length < 10) && (!title || title.trim().length < 2)) {
      return res.json({ error: 'Please add a title and some content.' });
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `Create an SEO-friendly meta description (150-160 chars) for:\nTitle: ${title || 'Untitled'}\nContent: ${content || ''}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200
    });
    res.json({ result: completion.choices[0]?.message?.content || '' });
  } catch (err) {
    res.json({ error: 'Failed to generate SEO meta.' });
  }
});

// Shell settings page
const db = require('../db');

router.get('/shell', requireAuth, async (req, res) => {
  // Default shell with all supported languages
  let shell = {
    author_name: 'Daylight',
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
    hero_image: '', auto_translate_langs: [], admin_username: 'daylight', author_name: 'Daylight'
  };
  try {
    const row = await db.get('SELECT data FROM settings WHERE key = $1', 'shell');
    if (row && row.data) {
      shell = { ...shell, ...JSON.parse(row.data) };
    }
  } catch (e) { console.log('Shell load error:', e.message); }

  let images = [];
  try {
    images = await Image.findAll();
  } catch (e) { console.log('Image load error:', e.message); }

  console.log('Loading shell:', shell);
  const shellError = req.query.error || null;
  res.render('admin/shell', { title: 'Edit Shell', shell, images, error: shellError });
});

router.post('/shell', requireAuth, async (req, res) => {
  const { hero_image, auto_translate_langs, author_name, admin_username, admin_password, admin_password_confirm, ...langFields } = req.body;

  // Get existing shell to preserve hero_image if not provided
  let existingHero = '';
  let existingShell = {};
  try {
    const row = await db.get('SELECT data FROM settings WHERE key = $1', 'shell');
    if (row && row.data) {
      existingShell = JSON.parse(row.data);
      existingHero = existingShell.hero_image || '';
    }
  } catch(e) { console.log('Shell load error:', e.message); }

  // Handle auto_translate_langs (checkbox array)
  const translateLangs = Array.isArray(auto_translate_langs) ? auto_translate_langs : auto_translate_langs ? [auto_translate_langs] : (existingShell.auto_translate_langs || []);

  // Handle admin username/password update
  let pwError = null;
  if (admin_username || admin_password) {
    // Get the current admin user
    const currentUser = await db.get('SELECT * FROM users ORDER BY id ASC LIMIT 1');
    if (currentUser) {
      // Update username if provided
      if (admin_username && admin_username !== currentUser.username) {
        await User.updateUsername(currentUser.id, admin_username);
      }
      // Update password if provided
      if (admin_password) {
        if (admin_password.length < 6) {
          pwError = 'Password must be at least 6 characters';
        } else if (admin_password !== admin_password_confirm) {
          pwError = 'Passwords do not match';
        } else {
          await User.updatePassword(currentUser.id, admin_password);
          // Send email with new password
          await sendPasswordResetEmail(admin_password);
        }
      }
    }
  }

  // Build shell with all language fields
  const shell = {
    hero_image: hero_image || existingHero,
    auto_translate_langs: translateLangs,
    admin_username: admin_username || existingShell.admin_username || 'daylight',
    author_name: author_name || existingShell.author_name || 'Daylight',
    
  };

  // Add all language fields from form (e.g., en_blog_name, sv_welcome_title, etc.)
  Object.keys(langFields).forEach(key => {
    shell[key] = langFields[key] || '';
  });

  // Save to database
  try {
    await db.run('INSERT INTO settings (key, data) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET data = EXCLUDED.data', 'shell', JSON.stringify(shell));
  } catch(e) { console.log('Shell save error:', e.message); }

  if (pwError) {
    return res.redirect('/admin/shell?error=' + encodeURIComponent(pwError));
  }
  res.redirect('/admin');
});

// Crop and set hero image
router.post('/shell/hero-crop', requireAuth, async (req, res) => {
  try {
    const { imageUrl, cropData } = req.body;
    if (!imageUrl || !cropData) {
      return res.json({ error: 'Missing image URL or crop data' });
    }

    // First check if source image is large enough
    const sourceResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const sourceBuffer = Buffer.from(sourceResponse.data);
    const metadata = await sharp(sourceBuffer).metadata();

    if (metadata.width < 1280 || metadata.height < 571) {
      return res.json({ error: `Image too small! Minimum 1280×571 required, but this image is ${metadata.width}×${metadata.height}. Please upload a larger image.` });
    }

    const { x, y, width, height } = cropData;

    // Crop with Sharp
    const croppedBuffer = await sharp(sourceBuffer)
      .extract({ left: Math.round(x), top: Math.round(y), width: Math.round(width), height: Math.round(height) })
      .resize(1280, 571)
      .jpeg({ quality: 90 })
      .toBuffer();

    // Upload to imgbb
    const imgbbUrl = await uploadToImgbb(croppedBuffer, 'hero-' + Date.now() + '.jpg');

    if (!imgbbUrl) {
      return res.json({ error: 'Failed to upload cropped image' });
    }

    // Get existing shell
    let existingShell = { en_blog_name: 'Daylight Blog', en_welcome_title: '', en_welcome_body: '', sv_blog_name: 'Daylight Blog', sv_welcome_title: '', sv_welcome_body: '', hero_image: '' };
    try {
      const row = await db.get('SELECT data FROM settings WHERE key = $1', 'shell');
      if (row && row.data) {
        existingShell = { ...existingShell, ...JSON.parse(row.data) };
      }
    } catch(e) { console.log('Shell load error:', e.message); }

    // Update hero_image
    existingShell.hero_image = imgbbUrl;

    // Save to database
    await db.run('INSERT INTO settings (key, data) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET data = EXCLUDED.data', 'shell', JSON.stringify(existingShell));

    res.json({ success: true, heroImage: imgbbUrl });
  } catch (err) {
    console.error('Hero crop error:', err.message);
    res.json({ error: 'Failed to crop image: ' + err.message });
  }
});

// Set hero image directly (no crop - already correct size)
router.post('/shell/hero-set', requireAuth, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.json({ error: 'Missing image URL' });
    }

    // Get existing shell
    let existingShell = { en_blog_name: 'Daylight Blog', en_welcome_title: '', en_welcome_body: '', sv_blog_name: 'Daylight Blog', sv_welcome_title: '', sv_welcome_body: '', hero_image: '' };
    try {
      const row = await db.get('SELECT data FROM settings WHERE key = $1', 'shell');
      if (row && row.data) {
        existingShell = { ...existingShell, ...JSON.parse(row.data) };
      }
    } catch(e) { console.log('Shell load error:', e.message); }

    // Update hero_image
    existingShell.hero_image = imageUrl;

    // Save to database
    await db.run('INSERT INTO settings (key, data) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET data = EXCLUDED.data', 'shell', JSON.stringify(existingShell));

    res.json({ success: true, heroImage: imageUrl });
  } catch (err) {
    console.error('Hero set error:', err.message);
    res.json({ error: 'Failed to set hero image: ' + err.message });
  }
});

module.exports = router;