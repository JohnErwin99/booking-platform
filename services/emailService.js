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
 * Send an email with retry. If all retries fail, queue it for later.
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
        // All retries failed — queue for later
        await queueEmail({ to, subject, html, text, error: err.message });
        throw err;
      }
    }
  }
}

/**
 * Queue a failed email for retry by cron.
 */
async function queueEmail({ to, subject, html, text, error }) {
  try {
    const db = require('../config/database');
    await db('email_queue').insert({
      to,
      subject,
      html,
      text: text || '',
      status: 'pending',
      attempts: 1,
      last_error: error || null,
    });
    console.log(`Email queued for retry: ${to} — ${subject}`);
  } catch (queueErr) {
    console.error('Failed to queue email:', queueErr.message);
  }
}

/**
 * Process the email queue — called by cron every 15 min.
 * Retries pending emails up to max_attempts.
 */
async function processEmailQueue() {
  try {
    const db = require('../config/database');
    const pending = await db('email_queue')
      .where('status', 'pending')
      .where('attempts', '<', 5)
      .orderBy('id', 'asc')
      .limit(20);

    if (!pending.length) return;

    console.log(`Processing ${pending.length} queued email(s)...`);

    for (const email of pending) {
      try {
        const from = process.env.SMTP_FROM || process.env.SMTP_USER;
        await transporter.sendMail({
          from,
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });

        await db('email_queue').where('id', email.id).update({
          status: 'sent',
          attempts: email.attempts + 1,
        });
        console.log(`Queued email sent: ${email.to} — ${email.subject}`);
      } catch (err) {
        const newAttempts = email.attempts + 1;
        await db('email_queue').where('id', email.id).update({
          attempts: newAttempts,
          last_error: err.message,
          status: newAttempts >= 5 ? 'failed' : 'pending',
        });
        console.error(`Queued email retry failed (${newAttempts}/5): ${email.to} — ${err.message}`);
      }
    }
  } catch (err) {
    console.error('Email queue processing error:', err.message);
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

module.exports = { sendEmail, verifyConnection, processEmailQueue };
