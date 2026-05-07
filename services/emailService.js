const nodemailer = require('nodemailer');

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Send an email.
 * @param {object} opts - { to, subject, html, text, icalEvent }
 * @returns {Promise<object>} nodemailer info
 */
async function sendEmail({ to, subject, html, text, icalEvent }, retries = 3) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const mailOptions = {
    from,
    to,
    subject,
    text,
    html
  };

  // Attach .ics calendar invite if provided
  if (icalEvent) {
    mailOptions.alternatives = [{
      contentType: 'text/calendar; method=REQUEST',
      content: icalEvent
    }];
    mailOptions.attachments = [{
      filename: 'invite.ics',
      content: icalEvent,
      contentType: 'text/calendar'
    }];
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await transporter.sendMail(mailOptions);
    } catch (err) {
      console.error(`Email attempt ${attempt}/${retries} failed (${to}):`, err.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Verify SMTP connection on startup.
 */
async function verifyConnection() {
  try {
    await transporter.verify();
    console.log('  Email service:   SMTP connection verified');
    return true;
  } catch (err) {
    console.log('  Email service:   SMTP not configured —', err.message);
    return false;
  }
}

module.exports = { sendEmail, verifyConnection };
