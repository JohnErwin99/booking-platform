const express = require('express');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const db = require('../../config/database');
const { slugify } = require('../../utils/helpers');
const { normalizeEmail, scoreSignup } = require('../../utils/spamCheck');

const SIGNUP_HMAC_SECRET = process.env.SESSION_SECRET || 'change-this-secret';
const signSignupTs = (ts) =>
  crypto.createHmac('sha256', SIGNUP_HMAC_SECRET).update(String(ts)).digest('hex');

// Silent rejection: pretend success so bots can't tell they were filtered
function fakeSuccess(req, res, email, reason) {
  console.warn(`Signup blocked (${reason}):`, JSON.stringify({
    email, ip: req.ip, business_name: req.body.business_name,
  }));
  req.flash('success', `Welcome! A confirmation email has been sent to ${email}. Please check your inbox or spam folder.`);
  return res.redirect('/admin/signup');
}
const { sendEmail } = require('../../services/emailService');
const router = express.Router();

// Rate limiter: 5 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  handler: (req, res) => {
    req.flash('error', 'Too many login attempts. Please try again in 15 minutes.');
    res.redirect('/admin/login');
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter: 3 signup attempts per hour per IP
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many accounts created. Please try again later.',
  handler: (req, res) => {
    req.flash('error', 'Too many accounts created from this IP. Please try again later.');
    res.redirect('/admin/signup');
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /admin/login
router.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/admin/bookings');
  }
  res.render('admin/login', {
    layout: false,
    title: 'Admin Login',
    user: null,
    tenant: null,
    flash: {
      error: req.flash('error'),
      success: req.flash('success')
    }
  });
});

// POST /admin/login
router.post('/login', loginLimiter, (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.flash('error', info?.message || 'Invalid credentials.');
      return res.redirect('/admin/login');
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      const returnTo = req.session.returnTo || '/admin/bookings';
      delete req.session.returnTo;
      res.redirect(returnTo);
    });
  })(req, res, next);
});

// GET /admin/logout
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.flash('success', 'You have been logged out.');
    res.redirect('/admin/login');
  });
});

// GET /admin/signup
router.get('/signup', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/admin/bookings');
  const signupTs = Date.now();
  res.render('admin/signup', {
    layout: false,
    title: 'Start Free Trial — Bookwize',
    user: null,
    tenant: null,
    signupTs,
    signupSig: signSignupTs(signupTs),
    flash: { error: req.flash('error'), success: req.flash('success') }
  });
});

// POST /admin/signup
router.post('/signup', signupLimiter, async (req, res, next) => {
  try {
    const { business_name, first_name, last_name, email, password } = req.body;

    if (!business_name || !first_name || !last_name || !email || !password) {
      req.flash('error', 'All fields are required.');
      return res.redirect('/admin/signup');
    }

    // Honeypot: real users never see or fill this field
    if (req.body.website) {
      return fakeSuccess(req, res, email, 'honeypot');
    }

    // Timing check: a signed timestamp proves the form was rendered by us,
    // and humans take more than 3 seconds to fill 5 fields
    const ts = parseInt(req.body.signup_ts, 10);
    const sig = req.body.signup_sig || '';
    const elapsed = Date.now() - ts;
    if (!ts || sig !== signSignupTs(ts) || elapsed < 3000 || elapsed > 2 * 60 * 60 * 1000) {
      req.flash('error', 'Something went wrong. Please try again.');
      return res.redirect('/admin/signup');
    }

    if (password.length < 6) {
      req.flash('error', 'Password must be at least 6 characters.');
      return res.redirect('/admin/signup');
    }

    // Heuristic spam scoring (gibberish names, disposable domains, etc.)
    const { score, reasons } = scoreSignup({ business_name, first_name, last_name, email });
    if (score >= 3) {
      return fakeSuccess(req, res, email, `spam score ${score}: ${reasons.join(', ')}`);
    }
    if (score > 0) {
      console.warn(`Signup flagged (score ${score}: ${reasons.join(', ')}):`, email);
    }

    // Check if email already exists (normalized: catches gmail dot/+ variants)
    const emailNorm = normalizeEmail(email);
    const existingUser = await db('users')
      .where('email', email.toLowerCase().trim())
      .orWhere('email_normalized', emailNorm)
      .first();
    if (existingUser) {
      req.flash('error', 'An account with this email already exists.');
      return res.redirect('/admin/signup');
    }

    const slug = slugify(business_name);

    // Check slug uniqueness
    const existingTenant = await db('tenants').where('slug', slug).first();
    if (existingTenant) {
      req.flash('error', 'A business with a similar name already exists. Try a different name.');
      return res.redirect('/admin/signup');
    }

    // Create tenant with trial
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 14);

    const [tenantId] = await db('tenants').insert({
      name: business_name,
      slug,
      email: email.toLowerCase().trim(),
      status: 'trial',
      plan: 'trial',
      trial_ends_at: trialEnds,
      onboarding_completed: false,
      timezone: 'America/Montreal',
      currency: 'CAD',
    });

    // Create default location
    const [locationId] = await db('locations').insert({
      tenant_id: tenantId,
      name: 'Main Location',
      is_default: true,
    });

    // Create owner user
    const passwordHash = await bcrypt.hash(password, 12);
    await db('users').insert({
      tenant_id: tenantId,
      email: email.toLowerCase().trim(),
      email_normalized: emailNorm,
      password_hash: passwordHash,
      first_name,
      last_name,
      role: 'owner',
    });

    // Seed default business hours (Mon-Sat 9-18)
    const defaultHours = [];
    for (let day = 1; day <= 6; day++) {
      defaultHours.push({
        tenant_id: tenantId,
        location_id: locationId,
        staff_id: null,
        weekday: day,
        open_at: '09:00:00',
        close_at: '18:00:00',
      });
    }
    await db('business_hours').insert(defaultHours);

    // Seed notification templates
    await db('notification_templates').insert([
      {
        tenant_id: tenantId,
        type: 'booking_confirmation',
        channel: 'email',
        subject: 'Booking Confirmed - {{business_name}}',
        body_template: 'Hi {{customer_name}},\n\nYour appointment has been confirmed!\n\nService: {{service_name}}\nDate: {{booking_date}}\nTime: {{booking_time}}\nWith: {{staff_name}}\n\nIf you need to make changes: {{manage_link}}\n\nSee you soon!\n{{business_name}}'
      },
      {
        tenant_id: tenantId,
        type: 'reminder_email',
        channel: 'email',
        subject: 'Reminder: Your appointment tomorrow - {{business_name}}',
        body_template: 'Hi {{customer_name}},\n\nFriendly reminder about your appointment tomorrow.\n\nService: {{service_name}}\nDate: {{booking_date}}\nTime: {{booking_time}}\nWith: {{staff_name}}\n\nNeed to reschedule? {{manage_link}}\n\nSee you soon!\n{{business_name}}'
      },
      {
        tenant_id: tenantId,
        type: 'booking_cancellation',
        channel: 'email',
        subject: 'Booking Cancelled - {{business_name}}',
        body_template: 'Hi {{customer_name}},\n\nYour appointment on {{booking_date}} at {{booking_time}} has been cancelled.\n\nTo book a new appointment: {{booking_link}}\n\n{{business_name}}'
      }
    ]);

    // Send welcome email
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    sendEmail({
      to: email,
      subject: 'Welcome to Bookwize — Your free trial is active!',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
          <h2 style="text-align:center;color:#F28C38;margin-bottom:24px">Welcome to Bookwize!</h2>
          <div style="background:#f8fafc;border-radius:16px;padding:24px;line-height:1.7">
            <p>Hi there,</p>
            <p>Your 14-day free trial is now active!</p>
            <p><strong>Dashboard:</strong> <a href="${baseUrl}/admin/login">${baseUrl}/admin/login</a></p>
            <p><strong>Booking Page:</strong> <a href="${baseUrl}/book/${slug}">${baseUrl}/book/${slug}</a></p>
            <p>Log in to complete your setup and start accepting bookings.</p>
            <p>Welcome aboard!<br>The Bookwize Team</p>
          </div>
        </div>`,
      text: `Hi there,\n\nYour 14-day free trial is active!\n\nDashboard: ${baseUrl}/admin/login\nBooking Page: ${baseUrl}/book/${slug}\n\nWelcome aboard!\nThe Bookwize Team`
    }).catch(err => console.error('Welcome email failed:', err.message));

    // Auto-login the new user
    const user = await db('users').where({ email: email.toLowerCase().trim() }).first();
    req.logIn(user, (err) => {
      if (err) return next(err);
      req.flash('success', `Welcome! A confirmation email has been sent to ${email}. Please check your inbox or spam folder.`);
      res.redirect('/admin/onboarding');
    });
  } catch (err) {
    console.error('Signup error:', err);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/admin/signup');
  }
});

module.exports = router;
