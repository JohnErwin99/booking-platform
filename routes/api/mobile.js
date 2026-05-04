const express = require('express');
const db = require('../../config/database');
const requireApiAuth = require('../../middleware/requireApiAuth');

const router = express.Router();

// All routes require JWT auth
router.use(requireApiAuth);

// ===========================
// Dashboard
// ===========================

// GET /api/mobile/dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const today = new Date().toISOString().split('T')[0];

    // Get start of current week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const weekStart = monday.toISOString().split('T')[0];

    const [todayBookings, weekBookings, totalBookings, staffCount, customerCount, recentBookings] = await Promise.all([
      db('bookings')
        .where({ tenant_id: tenantId, booking_date: today })
        .whereNot('status', 'cancelled')
        .count('id as count').first(),
      db('bookings')
        .where('tenant_id', tenantId)
        .where('booking_date', '>=', weekStart)
        .whereNot('status', 'cancelled')
        .count('id as count').first(),
      db('bookings')
        .where('tenant_id', tenantId)
        .whereNot('status', 'cancelled')
        .count('id as count').first(),
      db('staff')
        .where({ tenant_id: tenantId, is_active: true })
        .count('id as count').first(),
      db('customers')
        .where('tenant_id', tenantId)
        .count('id as count').first(),
      db('bookings')
        .where('bookings.tenant_id', tenantId)
        .where('booking_date', '>=', today)
        .whereNot('status', 'cancelled')
        .orderBy('booking_date', 'asc')
        .orderBy('start_time', 'asc')
        .limit(10)
    ]);

    res.json({
      stats: {
        today: todayBookings.count,
        thisWeek: weekBookings.count,
        total: totalBookings.count,
        staffCount: staffCount.count,
        customerCount: customerCount.count
      },
      recentBookings
    });
  } catch (err) {
    next(err);
  }
});

// ===========================
// Bookings
// ===========================

// GET /api/mobile/bookings
router.get('/bookings', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { status, date, from, to, staff_id, page } = req.query;
    const perPage = 25;
    const currentPage = parseInt(page) || 1;

    let query = db('bookings').where('bookings.tenant_id', tenantId);

    if (status) query = query.where('bookings.status', status);
    if (date) query = query.where('bookings.booking_date', date);
    if (from) query = query.where('bookings.booking_date', '>=', from);
    if (to) query = query.where('bookings.booking_date', '<=', to);
    if (staff_id) query = query.where('bookings.staff_id', staff_id);

    const [{ count: total }] = await query.clone().count('bookings.id as count');

    const bookings = await query
      .orderBy('bookings.booking_date', 'desc')
      .orderBy('bookings.start_time', 'asc')
      .limit(perPage)
      .offset((currentPage - 1) * perPage);

    res.json({
      bookings,
      pagination: {
        current: currentPage,
        total: Math.ceil(total / perPage),
        count: total
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/mobile/bookings/:id
router.get('/bookings/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const booking = await db('bookings')
      .where({ id: req.params.id, tenant_id: tenantId })
      .first();

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

// POST /api/mobile/bookings/:id/cancel
router.post('/bookings/:id/cancel', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;
    const { reason } = req.body;

    const updated = await db('bookings')
      .where({ id, tenant_id: tenantId, status: 'confirmed' })
      .update({
        status: 'cancelled',
        cancellation_reason: reason || null,
        cancelled_at: db.fn.now(),
        cancelled_by: 'admin'
      });

    if (!updated) {
      return res.status(400).json({ error: 'Booking not found or already cancelled.' });
    }

    const booking = await db('bookings').where({ id, tenant_id: tenantId }).first();
    res.json({ message: 'Booking cancelled successfully.', booking });
  } catch (err) {
    next(err);
  }
});

// POST /api/mobile/bookings/:id/complete
router.post('/bookings/:id/complete', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    const updated = await db('bookings')
      .where({ id, tenant_id: tenantId, status: 'confirmed' })
      .update({ status: 'completed' });

    if (!updated) {
      return res.status(400).json({ error: 'Booking not found or not in confirmed status.' });
    }

    const booking = await db('bookings').where({ id, tenant_id: tenantId }).first();
    res.json({ message: 'Booking marked as completed.', booking });
  } catch (err) {
    next(err);
  }
});

// POST /api/mobile/bookings/:id/noshow
router.post('/bookings/:id/noshow', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    const updated = await db('bookings')
      .where({ id, tenant_id: tenantId, status: 'confirmed' })
      .update({ status: 'no_show' });

    if (!updated) {
      return res.status(400).json({ error: 'Booking not found or not in confirmed status.' });
    }

    // Update customer no-show count
    const booking = await db('bookings').where({ id, tenant_id: tenantId }).first();
    if (booking) {
      await db('customers')
        .where({ id: booking.customer_id, tenant_id: tenantId })
        .increment('total_no_shows', 1);
    }

    res.json({ message: 'Booking marked as no-show.', booking });
  } catch (err) {
    next(err);
  }
});

// ===========================
// Staff
// ===========================

// GET /api/mobile/staff
router.get('/staff', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;

    const staffList = await db('staff')
      .leftJoin('locations', 'staff.location_id', 'locations.id')
      .select('staff.*', 'locations.name as location_name')
      .where('staff.tenant_id', tenantId)
      .orderBy('staff.sort_order')
      .orderBy('staff.first_name');

    res.json({ staff: staffList });
  } catch (err) {
    next(err);
  }
});

// POST /api/mobile/staff
router.post('/staff', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { first_name, last_name, display_name, email, phone, title, bio,
            location_id, commission_rate, slot_duration, buffer_before, buffer_after,
            services: serviceIds } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'first_name and last_name are required.' });
    }

    const [staffId] = await db('staff').insert({
      tenant_id: tenantId,
      location_id: location_id || null,
      first_name, last_name,
      display_name: display_name || `${first_name} ${last_name}`,
      email: email || null,
      phone: phone || null,
      title: title || null,
      bio: bio || null,
      commission_rate: commission_rate || null,
      slot_duration: slot_duration || 30,
      buffer_before: buffer_before || 0,
      buffer_after: buffer_after || 0
    });

    // Assign services if provided
    if (serviceIds && serviceIds.length) {
      const ids = Array.isArray(serviceIds) ? serviceIds : [serviceIds];
      const rows = ids.map(sid => ({
        tenant_id: tenantId,
        staff_id: staffId,
        service_id: parseInt(sid)
      }));
      await db('staff_services').insert(rows);
    }

    const staffMember = await db('staff').where({ id: staffId, tenant_id: tenantId }).first();
    res.status(201).json({ message: 'Staff member created.', staff: staffMember });
  } catch (err) {
    next(err);
  }
});

// PUT /api/mobile/staff/:id
router.put('/staff/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;
    const { first_name, last_name, display_name, email, phone, title, bio,
            location_id, commission_rate, slot_duration, buffer_before, buffer_after,
            is_active, services: serviceIds } = req.body;

    const existing = await db('staff').where({ id, tenant_id: tenantId }).first();
    if (!existing) {
      return res.status(404).json({ error: 'Staff member not found.' });
    }

    await db('staff').where({ id, tenant_id: tenantId }).update({
      location_id: location_id !== undefined ? (location_id || null) : existing.location_id,
      first_name: first_name || existing.first_name,
      last_name: last_name || existing.last_name,
      display_name: display_name || (first_name && last_name ? `${first_name} ${last_name}` : existing.display_name),
      email: email !== undefined ? (email || null) : existing.email,
      phone: phone !== undefined ? (phone || null) : existing.phone,
      title: title !== undefined ? (title || null) : existing.title,
      bio: bio !== undefined ? (bio || null) : existing.bio,
      commission_rate: commission_rate !== undefined ? (commission_rate || null) : existing.commission_rate,
      slot_duration: slot_duration || existing.slot_duration,
      buffer_before: buffer_before !== undefined ? buffer_before : existing.buffer_before,
      buffer_after: buffer_after !== undefined ? buffer_after : existing.buffer_after,
      is_active: is_active !== undefined ? !!is_active : existing.is_active
    });

    // Reassign services if provided
    if (serviceIds !== undefined) {
      await db('staff_services').where({ staff_id: id, tenant_id: tenantId }).del();
      if (serviceIds && serviceIds.length) {
        const ids = Array.isArray(serviceIds) ? serviceIds : [serviceIds];
        const rows = ids.map(sid => ({
          tenant_id: tenantId,
          staff_id: parseInt(id),
          service_id: parseInt(sid)
        }));
        await db('staff_services').insert(rows);
      }
    }

    const staffMember = await db('staff').where({ id, tenant_id: tenantId }).first();
    res.json({ message: 'Staff member updated.', staff: staffMember });
  } catch (err) {
    next(err);
  }
});

// ===========================
// Services
// ===========================

// GET /api/mobile/services
router.get('/services', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;

    const services = await db('services')
      .where('tenant_id', tenantId)
      .orderBy('category')
      .orderBy('sort_order')
      .orderBy('name');

    res.json({ services });
  } catch (err) {
    next(err);
  }
});

// POST /api/mobile/services
router.post('/services', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, category, description, duration_minutes, price, sort_order } = req.body;

    if (!name || !duration_minutes || price === undefined) {
      return res.status(400).json({ error: 'name, duration_minutes, and price are required.' });
    }

    const [serviceId] = await db('services').insert({
      tenant_id: tenantId,
      name,
      category: category || null,
      description: description || null,
      duration_minutes: parseInt(duration_minutes),
      price_cents: Math.round(parseFloat(price) * 100),
      sort_order: parseInt(sort_order) || 0
    });

    const service = await db('services').where({ id: serviceId, tenant_id: tenantId }).first();
    res.status(201).json({ message: 'Service created.', service });
  } catch (err) {
    next(err);
  }
});

// PUT /api/mobile/services/:id
router.put('/services/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;
    const { name, category, description, duration_minutes, price, sort_order, is_active } = req.body;

    const existing = await db('services').where({ id, tenant_id: tenantId }).first();
    if (!existing) {
      return res.status(404).json({ error: 'Service not found.' });
    }

    await db('services').where({ id, tenant_id: tenantId }).update({
      name: name || existing.name,
      category: category !== undefined ? (category || null) : existing.category,
      description: description !== undefined ? (description || null) : existing.description,
      duration_minutes: duration_minutes ? parseInt(duration_minutes) : existing.duration_minutes,
      price_cents: price !== undefined ? Math.round(parseFloat(price) * 100) : existing.price_cents,
      sort_order: sort_order !== undefined ? (parseInt(sort_order) || 0) : existing.sort_order,
      is_active: is_active !== undefined ? !!is_active : existing.is_active
    });

    const service = await db('services').where({ id, tenant_id: tenantId }).first();
    res.json({ message: 'Service updated.', service });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/mobile/services/:id
router.delete('/services/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    const existing = await db('services').where({ id, tenant_id: tenantId }).first();
    if (!existing) {
      return res.status(404).json({ error: 'Service not found.' });
    }

    await db('services').where({ id, tenant_id: tenantId }).del();
    res.json({ message: 'Service deleted.' });
  } catch (err) {
    next(err);
  }
});

// ===========================
// Customers
// ===========================

// GET /api/mobile/customers/export  (must be before /:id)
router.get('/customers/export', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const customers = await db('customers')
      .where('tenant_id', tenantId)
      .select('first_name', 'last_name', 'email', 'phone')
      .orderBy('last_name')
      .orderBy('first_name');

    const header = 'First Name,Last Name,Email,Phone';
    const rows = customers.map(c => {
      const escape = (v) => '"' + (v || '').replace(/"/g, '""') + '"';
      return [escape(c.first_name), escape(c.last_name), escape(c.email), escape(c.phone)].join(',');
    });

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// GET /api/mobile/customers
router.get('/customers', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { search, page } = req.query;
    const perPage = 25;
    const currentPage = parseInt(page) || 1;

    let query = db('customers').where('tenant_id', tenantId);

    if (search) {
      query = query.where(function () {
        this.where('first_name', 'like', `%${search}%`)
          .orWhere('last_name', 'like', `%${search}%`)
          .orWhere('email', 'like', `%${search}%`)
          .orWhere('phone', 'like', `%${search}%`);
      });
    }

    const [{ count: total }] = await query.clone().count('id as count');

    const customers = await query
      .orderBy('last_visit_date', 'desc')
      .limit(perPage)
      .offset((currentPage - 1) * perPage);

    res.json({
      customers,
      pagination: {
        current: currentPage,
        total: Math.ceil(total / perPage),
        count: total
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/mobile/customers/:id
router.get('/customers/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const customer = await db('customers')
      .where({ id: req.params.id, tenant_id: tenantId }).first();

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const [bookings, notes] = await Promise.all([
      db('bookings')
        .where({ customer_id: customer.id, tenant_id: tenantId })
        .orderBy('booking_date', 'desc')
        .orderBy('start_time', 'desc')
        .limit(50),
      db('customer_notes')
        .leftJoin('staff', 'customer_notes.staff_id', 'staff.id')
        .select('customer_notes.*', 'staff.first_name as staff_first', 'staff.last_name as staff_last')
        .where('customer_notes.customer_id', customer.id)
        .where('customer_notes.tenant_id', tenantId)
        .orderBy('customer_notes.created_at', 'desc')
    ]);

    res.json({ customer, bookings, notes });
  } catch (err) {
    next(err);
  }
});

// POST /api/mobile/customers/:id/notes
router.post('/customers/:id/notes', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { note } = req.body;

    if (!note) {
      return res.status(400).json({ error: 'note is required.' });
    }

    const customer = await db('customers')
      .where({ id: req.params.id, tenant_id: tenantId }).first();

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const [noteId] = await db('customer_notes').insert({
      tenant_id: tenantId,
      customer_id: parseInt(req.params.id),
      staff_id: req.user.staff_id || null,
      note
    });

    const created = await db('customer_notes').where('id', noteId).first();
    res.status(201).json({ message: 'Note added.', note: created });
  } catch (err) {
    next(err);
  }
});

// ===========================
// Settings
// ===========================

// GET /api/mobile/settings
router.get('/settings', async (req, res, next) => {
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

    res.json({ tenant, locations, businessHours });
  } catch (err) {
    next(err);
  }
});

// PUT /api/mobile/settings/branding
router.put('/settings/branding', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, primary_color, secondary_color, accent_color,
            font_heading, font_body, timezone, currency } = req.body;

    await db('tenants').where('id', tenantId).update({
      name, primary_color, secondary_color, accent_color,
      font_heading, font_body, timezone, currency
    });

    const tenant = await db('tenants').where('id', tenantId).first();
    res.json({ message: 'Branding updated.', tenant });
  } catch (err) {
    next(err);
  }
});

// PUT /api/mobile/settings/policies
router.put('/settings/policies', async (req, res, next) => {
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

    const tenant = await db('tenants').where('id', tenantId).first();
    res.json({ message: 'Policies updated.', tenant });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
