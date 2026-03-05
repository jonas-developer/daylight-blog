const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'wind.eucloud.host',
  port: process.env.SMTP_PORT || 465,
  secure: true, // SSL/TLS
  auth: {
    user: process.env.SMTP_USER || 'mail@daylight.blog',
    pass: process.env.SMTP_PASS || 'Movitz1337!'
  }
});

async function sendPasswordResetEmail(email, newPassword) {
  const blogName = process.env.BLOG_NAME || 'Daylight Blog';
  
  const mailOptions = {
    from: process.env.SMTP_FROM || 'mail@daylight.blog',
    to: email,
    subject: `Password Reset - ${blogName}`,
    text: `Your password has been reset.\n\nNew Password: ${newPassword}\n\nPlease login and change your password immediately.\n\n- ${blogName}`,
    html: `
      <h2>Password Reset</h2>
      <p>Your password has been reset.</p>
      <p><strong>New Password:</strong> ${newPassword}</p>
      <p>Please login and change your password immediately.</p>
      <hr>
      <p>- ${blogName}</p>
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

module.exports = {
  transporter,
  sendPasswordResetEmail
};
