const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.daylight.blog',
  port: process.env.SMTP_PORT || 465,
  secure: true, // SSL/TLS
  auth: {
    user: process.env.SMTP_USER || 'mail@daylight.blog',
    pass: process.env.SMTP_PASS || 'Movitz1337!'
  }
});

const FROM_EMAIL = process.env.SMTP_FROM || 'mail@daylight.blog';
const BLOG_NAME = process.env.BLOG_NAME || 'Daylight Blog';

async function sendPasswordResetEmail(newPassword) {
  const email = process.env.ADMIN_EMAIL;
  
  if (!email) {
    console.log('ADMIN_EMAIL not set, skipping password reset email');
    return false;
  }
  
  const mailOptions = {
    from: FROM_EMAIL,
    to: email,
    subject: `Password Reset - ${BLOG_NAME}`,
    text: `Your password has been reset.\n\nNew Password: ${newPassword}\n\nPlease login and change your password immediately.\n\n- ${BLOG_NAME}`,
    html: `
      <h2>Password Reset</h2>
      <p>Your password has been reset.</p>
      <p><strong>New Password:</strong> ${newPassword}</p>
      <p>Please login and change your password immediately.</p>
      <hr>
      <p>- ${BLOG_NAME}</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
}

// Send new post notification to all subscribers
async function sendNewPostNotification(post, postUrl) {
  const db = require('./db');
  
  try {
    // Get all active subscribers - use TRUE for PostgreSQL compatibility
    const isPg = !!process.env.DATABASE_URL;
    let subscribers;
    if (isPg) {
      subscribers = await db.all('SELECT email FROM subscribers WHERE is_active = $1', true);
    } else {
      subscribers = await db.all('SELECT email FROM subscribers WHERE is_active = 1');
    }
    
    if (!subscribers || subscribers.length === 0) {
      console.log('No active subscribers to notify');
      return { success: true, sent: 0 };
    }
    
    const postTitle = post.title || 'New Post';
    const postExcerpt = post.excerpt || '';
    const blogName = post.blog_name || BLOG_NAME;
    
    // Prepare email
    const subject = `New Post: ${postTitle}`;
    
    const textContent = `Hi there!\n\nA new post has been published on ${blogName}:\n\n${postTitle}\n\n${postExcerpt ? postExcerpt + '\n\n' : ''}Read more: ${postUrl}\n\n--\n${blogName}\nUnsubscribe: ${process.env.BASE_URL || 'https://daylight.blog'}/unsubscribe`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #4a9c3d 0%, #2d5a27 100%); padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">${blogName}</h1>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="color: #2d5a27; margin-top: 0;">${postTitle}</h2>
          ${postExcerpt ? `<p style="color: #666;">${postExcerpt}</p>` : ''}
          <a href="${postUrl}" style="display: inline-block; background: linear-gradient(135deg, #4a9c3d 0%, #2d5a27 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 10px;">Read Full Post</a>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
          You're receiving this because you subscribed to ${blogName}.<br>
          <a href="${process.env.BASE_URL || 'https://daylight.blog'}/unsubscribe" style="color: #999;">Unsubscribe</a>
        </p>
      </body>
      </html>
    `;
    
    // Send to all subscribers individually
    let sentCount = 0;
    
    for (const subscriber of subscribers) {
      const mailOptions = {
        from: FROM_EMAIL,
        to: subscriber.email,
        subject: subject,
        text: textContent,
        html: htmlContent
      };
      
      try {
        await transporter.sendMail(mailOptions);
        sentCount++;
        console.log(`Post notification sent to: ${subscriber.email}`);
      } catch (error) {
        console.error(`Post notification error for ${subscriber.email}:`, error.message);
      }
    }
    
    console.log(`New post notification sent to ${sentCount} subscribers`);
    return { success: true, sent: sentCount };
  } catch (error) {
    console.error('Send new post notification error:', error);
    return { success: false, error: error.message };
  }
}

// Send subscription confirmation email
async function sendSubscriptionConfirmation(email, blogName = BLOG_NAME, baseUrl = null) {
  const base = baseUrl || process.env.BASE_URL || 'https://daylight.blog';
  const unsubscribeUrl = `${base}/unsubscribe?email=${encodeURIComponent(email)}`;
  
  const mailOptions = {
    from: FROM_EMAIL,
    to: email,
    subject: `Welcome to ${blogName}!`,
    text: `Thank you for subscribing to ${blogName}!\n\nYou're now on the list to receive the latest posts.\n\nIf you ever want to unsubscribe, click here: ${unsubscribeUrl}\n\n- ${blogName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #4a9c3d 0%, #2d5a27 100%); padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">${blogName}</h1>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="color: #2d5a27; margin-top: 0;">Thank You for Subscribing!</h2>
          <p style="color: #666;">You're now on the list to receive the latest posts from ${blogName}.</p>
          <p style="color: #666;">We respect your privacy and will never spam you.</p>
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;">
          <p style="text-align: center;">
            <a href="${unsubscribeUrl}" style="color: #999; text-decoration: underline; font-size: 14px;">Unsubscribe</a>
          </p>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Subscription confirmation email error:', error);
    return false;
  }
}

// Send newsletter with full post content
async function sendNewsletter(post, recipients) {
  const db = require('./db');
  const baseUrl = process.env.BASE_URL || 'https://daylight.blog';
  
  const postTitle = post.title || 'New Post';
  const postContent = post.content || '';
  const postDate = post.created_at ? new Date(post.created_at).toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  }) : '';
  
  // Parse images from post
  let images = [];
  try {
    if (post.images) {
      images = typeof post.images === 'string' ? JSON.parse(post.images) : post.images;
    }
  } catch (e) {
    console.log('Error parsing post images:', e.message);
  }
  
  // Convert newlines to <br> for HTML - use triple <br> for three linebreaks
  const htmlContent = postContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n\n/g, '<br><br><br>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
  
  // Build images HTML
  const imagesHtml = images.map(img => {
    return `<img src="${img}" alt="" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0; display: block; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">`;
  }).join('');
  
  const postUrl = `${baseUrl}/posts/${post.slug}`;
  const unsubscribeUrl = `${baseUrl}/unsubscribe`;
  
  const subject = `New Post: ${postTitle}`;
  
  // Beautiful HTML email with professional styling
  const htmlEmail = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap" rel="stylesheet">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%); min-height: 100vh;">
  <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05); overflow: hidden;">
    <!-- Header with green gradient -->
    <div style="background: linear-gradient(135deg, #4a9c3d 0%, #2d5a27 100%); padding: 40px 30px; text-align: center;">
      <h1 style="font-family: 'Great Vibes', 'Brush Script MT', cursive; font-size: 3rem; color: white; margin: 0; font-weight: 400; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">
        Daylight Blog
      </h1>
    </div>
    
    <!-- Content area -->
    <div style="padding: 40px 30px;">
      <h2 style="color: #2d5a27; margin-top: 0; font-size: 1.8rem; border-bottom: 2px solid #e8f5e9; padding-bottom: 15px; margin-bottom: 20px;">${postTitle}</h2>
      <p style="color: #888; font-size: 0.9rem; margin-bottom: 25px;">${postDate}</p>
      
      ${imagesHtml}
      
      <div style="color: #444; line-height: 1.9; margin: 30px 0; font-size: 1rem;">
        ${htmlContent}
      </div>
      
      <div style="text-align: center; margin: 35px 0;">
        <a href="${postUrl}" style="display: inline-block; background: linear-gradient(135deg, #4a9c3d 0%, #2d5a27 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 1rem; box-shadow: 0 4px 12px rgba(46, 125, 50, 0.3);">
          Read More
        </a>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background: #f8faf8; padding: 25px 30px; text-align: center; border-top: 1px solid #e8f5e9;">
      <p style="color: #888; font-size: 0.8rem; margin: 0 0 10px 0;">
        You're receiving this because you subscribed to Daylight Blog.
      </p>
      <p style="margin: 0;">
        <a href="${unsubscribeUrl}" style="color: #4a9c3d; text-decoration: underline; font-size: 0.85rem;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  // Plain text version
  const textEmail = `Hi there!

A new post has been published on Daylight Blog:

${postTitle}

${postDate}

${postContent}

Read more: ${postUrl}

--
Daylight Blog
Unsubscribe: ${unsubscribeUrl}`;

  // Send to recipients
  if (!recipients || recipients.length === 0) {
    console.log('No recipients to send newsletter to');
    return { success: true, sent: 0 };
  }

  let sentCount = 0;

  // Send individually to each recipient
  for (const recipient of recipients) {
    const mailOptions = {
      from: FROM_EMAIL,
      to: recipient,
      subject: subject,
      text: textEmail,
      html: htmlEmail
    };

    try {
      await transporter.sendMail(mailOptions);
      sentCount++;
      console.log(`Newsletter sent to: ${recipient}`);
    } catch (error) {
      console.error(`Newsletter error for ${recipient}:`, error.message);
    }
  }

  console.log(`Newsletter sent to ${sentCount} recipients`);
  return { success: true, sent: sentCount };
}

module.exports = {
  transporter,
  sendPasswordResetEmail,
  sendNewPostNotification,
  sendSubscriptionConfirmation,
  sendNewsletter,
  FROM_EMAIL,
  BLOG_NAME
};
