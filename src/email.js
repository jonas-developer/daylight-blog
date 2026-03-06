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
    
    // Send to all subscribers (in batches to avoid overwhelming the mail server)
    let sentCount = 0;
    const batchSize = 10;
    
    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize);
      const emailAddresses = batch.map(s => s.email).join(', ');
      
      const mailOptions = {
        from: FROM_EMAIL,
        to: emailAddresses,
        subject: subject,
        text: textContent,
        html: htmlContent
      };
      
      try {
        await transporter.sendMail(mailOptions);
        sentCount += batch.length;
        console.log(`Sent batch ${Math.floor(i/batchSize) + 1}: ${batch.length} emails`);
      } catch (error) {
        console.error(`Email batch ${Math.floor(i/batchSize) + 1} error:`, error.message);
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
  
  // Convert newlines to <br> for HTML
  const htmlContent = postContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  
  // Build images HTML
  const imagesHtml = images.map(img => {
    return `<img src="${img}" alt="" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0; display: block;">`;
  }).join('');
  
  const postUrl = `${baseUrl}/posts/${post.slug}`;
  const unsubscribeUrl = `${baseUrl}/unsubscribe`;
  
  const subject = `New Post: ${postTitle}`;
  
  // Simplified HTML email - less likely to be flagged as spam
  const htmlEmail = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Georgia, serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #2d5a27; font-size: 1.5rem;">Daylight Blog</h1>
  <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">
  <h2 style="color: #333;">${postTitle}</h2>
  <p style="color: #666; font-size: 0.9rem;">${postDate}</p>
  <div style="color: #333; margin: 20px 0;">
    ${htmlContent}
  </div>
  <p><a href="${postUrl}" style="color: #2d5a27;">Read more</a></p>
  <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">
  <p style="color: #999; font-size: 0.8rem;">
    You're receiving this because you subscribed to Daylight Blog.<br>
    <a href="${unsubscribeUrl}" style="color: #999;">Unsubscribe</a>
  </p>
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
  const batchSize = 10;

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const emailAddresses = batch.join(', ');

    const mailOptions = {
      from: FROM_EMAIL,
      to: emailAddresses,
      subject: subject,
      text: textEmail,
      html: htmlEmail
    };

    try {
      await transporter.sendMail(mailOptions);
      sentCount += batch.length;
      console.log(`Newsletter batch ${Math.floor(i / batchSize) + 1}: ${batch.length} emails sent`);
    } catch (error) {
      console.error(`Newsletter batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
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
