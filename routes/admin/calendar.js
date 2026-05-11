const express = require('express');
const requireRole = require('../../middleware/requireRole');
const gcal = require('../../services/googleCalendarService');
const router = express.Router();

// GET /admin/calendar/connect — Redirect to Google OAuth
router.get('/calendar/connect', requireRole('owner', 'manager'), (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    req.flash('error', 'Google Calendar integration is not configured.');
    return res.redirect('/admin/settings#integrations');
  }

  const state = JSON.stringify({
    tenant_id: req.user.tenant_id,
    user_id: req.user.id,
  });

  const url = gcal.getAuthUrl(state);
  res.redirect(url);
});

// GET /admin/calendar/callback — Google OAuth callback
router.get('/calendar/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      req.flash('error', 'Google Calendar connection failed. Please try again.');
      return res.redirect('/admin/settings#integrations');
    }

    const { tenant_id, user_id } = JSON.parse(state);

    // Verify the user is authenticated
    if (!req.user) {
      req.flash('error', 'Session expired. Please log in and try again.');
      return res.redirect('/admin/login');
    }

    // Use the authenticated user's info (more reliable than state)
    const calendarId = await gcal.handleCallback(code, req.user.tenant_id, req.user.id);

    req.flash('success', `Google Calendar connected (${calendarId}). New bookings will sync automatically.`);
    res.redirect('/admin/settings#integrations');
  } catch (err) {
    console.error('Google Calendar callback error:', err);
    req.flash('error', 'Failed to connect Google Calendar. Please try again.');
    res.redirect('/admin/settings#integrations');
  }
});

// POST /admin/calendar/disconnect — Disconnect Google Calendar
router.post('/calendar/disconnect', requireRole('owner', 'manager'), async (req, res) => {
  try {
    await gcal.disconnect(req.user.tenant_id);
    req.flash('success', 'Google Calendar disconnected.');
    res.redirect('/admin/settings#integrations');
  } catch (err) {
    console.error('Google Calendar disconnect error:', err);
    req.flash('error', 'Failed to disconnect. Please try again.');
    res.redirect('/admin/settings#integrations');
  }
});

module.exports = router;
