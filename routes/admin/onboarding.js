const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../config/database');
const upload = require('../../config/upload');
const router = express.Router();

// GET /admin/onboarding
router.get('/onboarding', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const tenant = await db('tenants').where('id', tenantId).first();
    const locations = await db('locations').where('tenant_id', tenantId);
    const staff = await db('staff').where('tenant_id', tenantId);
    const services = await db('services').where('tenant_id', tenantId);
    const businessHours = await db('business_hours')
      .where({ tenant_id: tenantId, staff_id: null })
      .orderBy('weekday');

    res.render('admin/onboarding', {
      layout: false,
      title: 'Setup Your Business',
      user: req.user,
      tenant,
      locations,
      staff,
      services,
      businessHours,
      flash: { error: req.flash('error'), success: req.flash('success') }
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/onboarding/business — Step 1: Business info
router.post('/onboarding/business', upload.single('logo'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, phone, timezone, currency } = req.body;

    const update = {
      name: name || 'My Business',
      phone: phone || null,
      timezone: timezone || 'America/Montreal',
      currency: currency || 'CAD',
    };
    const { getUploadUrl } = require('../../config/upload');
    if (req.file) update.logo_url = getUploadUrl(req.file);

    await db('tenants').where('id', tenantId).update(update);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/onboarding/staff — Step 3: Add a staff member
router.post('/onboarding/staff', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { first_name, last_name, email, title, role, password, service_ids } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'First and last name are required.' });
    }

    const [staffId] = await db('staff').insert({
      tenant_id: tenantId,
      first_name,
      last_name,
      display_name: first_name,
      email: email || null,
      title: title || null,
      slot_duration: 30,
      is_active: true,
      is_bookable: true,
    });

    // Assign selected services
    if (service_ids && service_ids.length) {
      const rows = service_ids.map(sid => ({
        tenant_id: tenantId,
        staff_id: staffId,
        service_id: parseInt(sid),
      }));
      await db('staff_services').insert(rows);
    }

    // Create user account if email and password provided
    if (email && password && password.length >= 6) {
      const existing = await db('users')
        .where({ tenant_id: tenantId, email: email.toLowerCase().trim() }).first();
      if (!existing) {
        const hash = await bcrypt.hash(password, 12);
        await db('users').insert({
          tenant_id: tenantId,
          staff_id: staffId,
          email: email.toLowerCase().trim(),
          password_hash: hash,
          first_name,
          last_name,
          role: role || 'staff',
        });
      }
    }

    const staff = await db('staff').where('tenant_id', tenantId);
    res.json({ success: true, staff });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/onboarding/service — Step 3: Add a service
router.post('/onboarding/service', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, duration_minutes, price, category } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required.' });
    }

    await db('services').insert({
      tenant_id: tenantId,
      name,
      duration_minutes: parseInt(duration_minutes) || 30,
      price_cents: Math.round(parseFloat(price) * 100),
      category: category || null,
      is_active: true,
    });

    // Auto-assign to all staff
    const staffIds = await db('staff').where('tenant_id', tenantId).pluck('id');
    const serviceId = (await db('services').where('tenant_id', tenantId).orderBy('id', 'desc').first()).id;
    if (staffIds.length) {
      await db('staff_services').insert(
        staffIds.map(sid => ({ tenant_id: tenantId, staff_id: sid, service_id: serviceId }))
      );
    }

    const services = await db('services').where('tenant_id', tenantId);
    res.json({ success: true, services });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/onboarding/hours — Step 4: Set business hours
router.post('/onboarding/hours', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { hours } = req.body;
    // hours: { "0": { open_at, close_at, closed }, "1": {...}, ... }

    const location = await db('locations').where({ tenant_id: tenantId, is_default: true }).first()
      || await db('locations').where('tenant_id', tenantId).first();

    if (!location) return res.status(400).json({ error: 'No location found.' });

    // Clear existing hours
    await db('business_hours')
      .where({ tenant_id: tenantId, location_id: location.id, staff_id: null })
      .del();

    const rows = [];
    for (let day = 0; day < 7; day++) {
      const h = hours[day.toString()];
      if (h && !h.closed) {
        rows.push({
          tenant_id: tenantId,
          location_id: location.id,
          staff_id: null,
          weekday: day,
          open_at: h.open_at || '09:00:00',
          close_at: h.close_at || '18:00:00',
        });
      }
    }

    if (rows.length) await db('business_hours').insert(rows);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/onboarding/complete — Mark onboarding done
router.post('/onboarding/complete', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    await db('tenants').where('id', tenantId).update({ onboarding_completed: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
