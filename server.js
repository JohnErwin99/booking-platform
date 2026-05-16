require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');
const passport = require('./config/passport');
const sessionConfig = require('./config/session');
const errorHandler = require('./middleware/errorHandler');
const requireAuth = require('./middleware/requireAuth');
const { tenantResolver } = require('./middleware/tenantResolver');
const cron = require('node-cron');
const { verifyConnection, processEmailQueue } = require('./services/emailService');
const { processReminders, processFollowups, autoCompleteConfirmed } = require('./services/notificationService');
const { t } = require('./locales');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (needed for secure cookies behind Render/Cloudflare)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ======================
// View Engine
// ======================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ======================
// Middleware
// ======================

// Static files with cache headers (1 day for CSS/JS, 7 days for images)
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.includes('/uploads/')) {
      // User-uploaded images — no cache so updates show immediately
      res.setHeader('Cache-Control', 'no-cache');
    } else if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') || filePath.endsWith('.svg') || filePath.endsWith('.webp')) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  }
}));

// Stripe webhook needs raw body — must be before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Static files already mounted above with cache headers

// Sessions
app.use(session(sessionConfig));
app.use(flash());

// Passport
app.use(passport.initialize());
app.use(passport.session());

// EJS Layouts (for admin pages)
app.use(expressLayouts);
app.set('layout', 'layouts/admin'); // default layout for all pages

// ======================
// Global template vars
// ======================
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.tenant = null;
  const lang = (req.user && req.user.language) || 'en';
  res.locals.lang = lang;
  res.locals.flash = {
    error: req.flash('error').map(msg => t(msg, lang)),
    success: req.flash('success').map(msg => t(msg, lang))
  };
  next();
});

// ======================
// Routes
// ======================

// Home page - always show landing (admins need access for pricing/upgrade)
app.get('/', (req, res) => {
  res.render('landing', { layout: false });
});

// Legal pages
app.get('/privacy', (req, res) => res.render('legal/privacy', { layout: false }));
app.get('/terms', (req, res) => res.render('legal/terms', { layout: false }));

// Comparison / alternatives pages (new SEO-friendly URLs)
app.get('/vs-booksy', (req, res) => res.render('alternatives/booksy', { layout: false }));
app.get('/vs-fresha', (req, res) => res.render('alternatives/fresha', { layout: false }));
app.get('/vs-vagaro', (req, res) => res.render('alternatives/vagaro', { layout: false }));
app.get('/booking-software-canada', (req, res) => res.render('alternatives/booking-software-canada', { layout: false }));
app.get('/salon-booking-montreal', (req, res) => res.render('alternatives/salon-booking-montreal', { layout: false }));

// City-specific landing pages
app.get('/salon-booking-toronto', (req, res) => res.render('alternatives/salon-booking-toronto', { layout: false }));
app.get('/salon-booking-vancouver', (req, res) => res.render('alternatives/salon-booking-vancouver', { layout: false }));
app.get('/salon-booking-calgary', (req, res) => res.render('alternatives/salon-booking-calgary', { layout: false }));
app.get('/salon-booking-ottawa', (req, res) => res.render('alternatives/salon-booking-ottawa', { layout: false }));

// 301 redirects from old comparison URLs
app.get('/alternative/booksy', (req, res) => res.redirect(301, '/vs-booksy'));
app.get('/alternative/fresha', (req, res) => res.redirect(301, '/vs-fresha'));
app.get('/alternative/vagaro', (req, res) => res.redirect(301, '/vs-vagaro'));

// Blog
app.get('/blog', (req, res) => res.render('blog/index', { layout: false }));
app.get('/blog/how-to-sign-up', (req, res) => res.render('blog/how-to-sign-up', { layout: false }));
app.get('/blog/setting-up-your-business', (req, res) => res.render('blog/setting-up-your-business', { layout: false }));
app.get('/blog/adding-services', (req, res) => res.render('blog/adding-services', { layout: false }));
app.get('/blog/managing-staff', (req, res) => res.render('blog/managing-staff', { layout: false }));
app.get('/blog/how-clients-book', (req, res) => res.render('blog/how-clients-book', { layout: false }));
app.get('/blog/reducing-no-shows', (req, res) => res.render('blog/reducing-no-shows', { layout: false }));
app.get('/blog/embedding-widget', (req, res) => res.render('blog/embedding-widget', { layout: false }));
app.get('/blog/dashboard-guide', (req, res) => res.render('blog/dashboard-guide', { layout: false }));
app.get('/blog/upgrading-your-plan', (req, res) => res.render('blog/upgrading-your-plan', { layout: false }));
app.get('/blog/commission-free-salon-booking', (req, res) => res.render('blog/commission-free-salon-booking', { layout: false }));
app.get('/blog/best-barber-booking-apps-canada', (req, res) => res.render('blog/best-barber-booking-apps-canada', { layout: false }));

// Resource pages
app.get('/resources/community', (req, res) => res.render('resources/community', { layout: false }));

// Superadmin routes (no tenant needed, no layout)
app.use('/superadmin', require('./routes/superadmin/tenants'));

// Admin auth routes (no auth required, no layout)
app.use('/admin', require('./routes/admin/auth'));

// Admin protected routes (auth required, use admin layout)
app.use('/admin', requireAuth, (req, res, next) => {
  // Always set admin layout for authenticated admin routes
  res.locals.layout = 'layouts/admin';

  // Resolve tenant from authenticated user
  if (req.user && req.user.tenant_id) {
    const db = require('./config/database');
    db('tenants').where('id', req.user.tenant_id).first()
      .then(tenant => {
        req.tenant = tenant;
        res.locals.tenant = tenant;
        next();
      })
      .catch(next);
  } else {
    next();
  }
});

app.use('/admin', requireAuth, require('./routes/admin/onboarding'));

// Redirect to onboarding if not completed + trial enforcement
app.use('/admin', requireAuth, async (req, res, next) => {
  if (req.path.startsWith('/onboarding') || req.path === '/login' || req.path === '/logout' || req.path === '/signup') return next();
  try {
    const tenant = req.tenant || await require('./config/database')('tenants').where('id', req.user.tenant_id).first();
    if (!tenant) return next();

    // Redirect to onboarding if not completed
    if (!tenant.onboarding_completed) {
      return res.redirect('/admin/onboarding');
    }

    // Trial info for views
    if (tenant.plan === 'trial' && tenant.trial_ends_at) {
      const trialEnd = new Date(tenant.trial_ends_at);
      const now = new Date();
      const daysLeft = Math.max(0, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)));
      res.locals.trialDaysLeft = daysLeft;
      res.locals.trialExpired = daysLeft === 0;
    }
  } catch (e) {}
  next();
});

app.use('/admin', requireAuth, require('./routes/admin/dashboard'));
app.use('/admin', requireAuth, require('./routes/admin/bookings'));
app.use('/admin', requireAuth, require('./routes/admin/staff'));
app.use('/admin', requireAuth, require('./routes/admin/services'));
app.use('/admin', requireAuth, require('./routes/admin/customers'));
app.use('/admin', requireAuth, require('./routes/admin/settings'));
app.use('/admin', requireAuth, require('./routes/admin/locations'));
app.use('/admin', requireAuth, require('./routes/admin/calendar'));

// Mobile API routes (JWT auth)
app.use('/api/auth', require('./routes/api/auth'));
app.use('/api/mobile', require('./routes/api/mobile'));

// Public booking routes (no auth, tenant from slug)
app.use('/book', require('./routes/public/booking'));

// Stripe checkout & webhook routes (must be before slug-based /api/:slug routes)
app.use('/api', require('./routes/public/checkout'));

// Public API routes (no auth, tenant from slug)
app.use('/api', require('./routes/public/api'));

// Checkout result pages
app.get('/checkout/success', (req, res) => {
  const sessionId = req.query.session_id || null;
  // Optionally look up session to get plan info
  let plan = null;
  if (sessionId && process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('REPLACE_ME')) {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    stripe.checkout.sessions.retrieve(sessionId)
      .then(session => {
        plan = session.metadata?.plan || null;
        res.render('checkout/success', { layout: false, plan });
      })
      .catch(() => res.render('checkout/success', { layout: false, plan: null }));
  } else {
    res.render('checkout/success', { layout: false, plan });
  }
});

app.get('/checkout/cancel', (req, res) => {
  res.render('checkout/cancel', { layout: false });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('errors/404', {
    layout: false,
    message: 'Page not found.',
    user: null,
    tenant: null
  });
});

// Error handler
app.use(errorHandler);

// ======================
// Start Server
// ======================
app.listen(PORT, async () => {
  console.log(`\n  Bookwize running on http://localhost:${PORT}`);
  console.log(`  Admin login:     http://localhost:${PORT}/admin/login`);
  console.log(`  Platform admin:  http://localhost:${PORT}/superadmin/login`);
  console.log(`  Booking page:    http://localhost:${PORT}/book/{slug}`);

  // Verify email on startup
  await verifyConnection();

  // Cron: check for reminders every 15 minutes
  cron.schedule('*/15 * * * *', processReminders);
  // Cron: check for follow-ups every hour
  cron.schedule('0 * * * *', processFollowups);
  cron.schedule('*/10 * * * *', autoCompleteConfirmed);
  cron.schedule('*/15 * * * *', processEmailQueue);
  console.log('  Cron jobs:       reminders (15min), follow-ups (1hr)\n');
});

module.exports = app;
