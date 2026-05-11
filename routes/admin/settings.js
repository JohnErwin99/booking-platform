const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../config/database');
const upload = require('../../config/upload');
const requireRole = require('../../middleware/requireRole');
const gcal = require('../../services/googleCalendarService');
const router = express.Router();

// GET /admin/settings
router.get('/settings', requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const tenant = await db('tenants').where('id', tenantId).first();
    const locations = await db('locations').where('tenant_id', tenantId).orderBy('sort_order');

    // Load business hours for default location
    const defaultLocation = locations.find(l => l.is_default) || locations[0];
    let businessHours = [];
    if (defaultLocation) {
      businessHours = await db('business_hours')
        .where({ tenant_id: tenantId, location_id: defaultLocation.id, staff_id: null })
        .orderBy('weekday');
    }

    // Check Google Calendar connection
    const calendarSync = await gcal.isConnected(tenantId);

    res.render('admin/settings', {
      title: 'Settings',
      user: req.user,
      tenant,
      locations,
      businessHours,
      calendarSync,
      flash: {
        error: req.flash('error'),
        success: req.flash('success')
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/settings/branding
router.post('/settings/branding', requireRole('owner'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, primary_color, secondary_color, accent_color,
            font_heading, font_body, timezone, currency } = req.body;

    await db('tenants').where('id', tenantId).update({
      name, primary_color, secondary_color, accent_color,
      font_heading, font_body, timezone, currency
    });

    req.flash('success', 'Branding updated.');
    res.redirect('/admin/settings');
  } catch (err) {
    next(err);
  }
});

// POST /admin/settings/policies
router.post('/settings/policies', requireRole('owner'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { cancellation_hours, reschedule_hours, no_show_fee,
            deposit_type, deposit_value } = req.body;

    await db('tenants').where('id', tenantId).update({
      cancellation_hours: parseInt(cancellation_hours) || 24,
      reschedule_hours: parseInt(reschedule_hours) || 24,
      no_show_fee_cents: Math.round(parseFloat(no_show_fee || 0) * 100),
      deposit_type: deposit_type || 'none',
      deposit_value: parseFloat(deposit_value) || 0
    });

    req.flash('success', 'Policies updated.');
    res.redirect('/admin/settings');
  } catch (err) {
    next(err);
  }
});

// POST /admin/settings/hours
router.post('/settings/hours', requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { location_id, hours } = req.body;

    // hours is an object: { "0": { open_at, close_at, break_start, break_end, closed }, ... }
    const parsedHours = typeof hours === 'string' ? JSON.parse(hours) : hours;

    // Delete existing hours for this location (no staff override)
    await db('business_hours')
      .where({ tenant_id: tenantId, location_id: parseInt(location_id), staff_id: null })
      .del();

    // Insert new hours
    const rows = [];
    for (let day = 0; day < 7; day++) {
      const h = parsedHours[day.toString()];
      if (h && !h.closed) {
        rows.push({
          tenant_id: tenantId,
          location_id: parseInt(location_id),
          staff_id: null,
          weekday: day,
          open_at: h.open_at || null,
          close_at: h.close_at || null,
          break_start: h.break_start || null,
          break_end: h.break_end || null
        });
      }
    }

    if (rows.length) {
      await db('business_hours').insert(rows);
    }

    req.flash('success', 'Business hours updated.');
    res.redirect('/admin/settings');
  } catch (err) {
    next(err);
  }
});

// POST /admin/settings/password
router.post('/settings/password', async (req, res, next) => {
  try {
    const { current_password, new_password, confirm_password } = req.body;

    if (!current_password || !new_password || !confirm_password) {
      req.flash('error', 'All password fields are required.');
      return res.redirect('/admin/settings');
    }

    if (new_password !== confirm_password) {
      req.flash('error', 'New passwords do not match.');
      return res.redirect('/admin/settings');
    }

    if (new_password.length < 6) {
      req.flash('error', 'Password must be at least 6 characters.');
      return res.redirect('/admin/settings');
    }

    const user = await db('users').where('id', req.user.id).first();
    const valid = await bcrypt.compare(current_password, user.password_hash);

    if (!valid) {
      req.flash('error', 'Current password is incorrect.');
      return res.redirect('/admin/settings');
    }

    const hash = await bcrypt.hash(new_password, 12);
    await db('users').where('id', req.user.id).update({ password_hash: hash });

    req.flash('success', 'Password changed successfully.');
    res.redirect('/admin/settings');
  } catch (err) {
    next(err);
  }
});

// POST /admin/settings/billing-portal - Redirect to Stripe Customer Portal
router.post('/settings/billing-portal', requireRole('owner'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;

    // Find the Stripe customer ID from subscriptions
    const subscription = await db('subscriptions')
      .where('tenant_id', tenantId)
      .whereNotNull('stripe_customer_id')
      .orderBy('created_at', 'desc')
      .first();

    if (!subscription || !subscription.stripe_customer_id) {
      req.flash('error', 'No active subscription found. Please subscribe to a plan first.');
      return res.redirect('/admin/settings');
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${baseUrl}/admin/settings`,
    });

    res.redirect(portalSession.url);
  } catch (err) {
    console.error('Billing portal error:', err.message);
    req.flash('error', 'Could not open billing portal. Please try again.');
    res.redirect('/admin/settings');
  }
});

// POST /admin/settings/photo - Upload profile photo
router.post('/settings/photo', upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) {
      req.flash('error', 'Please select an image.');
      return res.redirect('/admin/settings');
    }
    const photoUrl = `/uploads/${req.file.filename}`;
    await db('users').where('id', req.user.id).update({ photo_url: photoUrl });
    req.flash('success', 'Profile photo updated.');
    res.redirect('/admin/settings');
  } catch (err) {
    next(err);
  }
});

// POST /admin/settings/logo - Upload business logo
router.post('/settings/logo', requireRole('owner'), upload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) {
      req.flash('error', 'Please select an image.');
      return res.redirect('/admin/settings');
    }
    const logoUrl = `/uploads/${req.file.filename}`;
    await db('tenants').where('id', req.user.tenant_id).update({ logo_url: logoUrl });
    req.flash('success', 'Business logo updated.');
    res.redirect('/admin/settings');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
