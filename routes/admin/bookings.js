const express = require('express');
const db = require('../../config/database');
const { formatTimeLabel, formatPrice } = require('../../utils/helpers');
const { sendBookingCancellation } = require('../../services/notificationService');
const gcal = require('../../services/googleCalendarService');
const router = express.Router();

// GET /admin/bookings
router.get('/bookings', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    // Staff role: force filter to own staff_id; others: use query param
    const staff_id = req.user.role === 'contributor' ? req.user.staff_id : req.query.staff_id;

    const staffList = await db('staff')
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('first_name');

    // Get today's appointment count for the staff header
    const today = new Date().toISOString().slice(0, 10);
    let countQuery = db('bookings')
      .where({ tenant_id: tenantId, booking_date: today })
      .whereNot('status', 'cancelled');
    if (staff_id) countQuery = countQuery.where('staff_id', staff_id);
    const [{ count: todayCount }] = await countQuery.count('* as count');

    // Resolve display name for staff header
    let staffDisplayName = null;
    if (staff_id) {
      const staffRec = staffList.find(s => String(s.id) === String(staff_id));
      if (staffRec) staffDisplayName = staffRec.first_name + ' ' + staffRec.last_name;
    }

    res.render('admin/bookings', {
      title: 'Bookings',
      user: req.user,
      tenant: req.tenant,
      staffList,
      filters: { staff_id },
      todayCount: parseInt(todayCount) || 0,
      staffDisplayName,
      helpers: { formatTimeLabel, formatPrice }
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/bookings - Create new appointment
router.post('/bookings', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { customer_id, staff_id, service_id, booking_date, start_time, notes } = req.body;

    if (!customer_id || !staff_id || !service_id || !booking_date || !start_time) {
      return res.json({ success: false, error: 'All fields are required' });
    }

    // Fetch related records
    const [customer, staff, service] = await Promise.all([
      db('customers').where({ id: customer_id, tenant_id: tenantId }).first(),
      db('staff').where({ id: staff_id, tenant_id: tenantId }).first(),
      db('services').where({ id: service_id, tenant_id: tenantId }).first()
    ]);

    if (!customer || !staff || !service) {
      return res.json({ success: false, error: 'Invalid customer, staff, or service' });
    }

    // Check for staff-specific duration/price override
    const staffService = await db('staff_services')
      .where({ staff_id, service_id })
      .first();
    const duration = (staffService && staffService.duration_override) || service.duration_minutes;
    const price = (staffService && staffService.price_override_cents != null) ? staffService.price_override_cents : service.price_cents;

    // Calculate end time
    const [h, m] = start_time.split(':').map(Number);
    const startMin = h * 60 + m;
    const endMin = startMin + duration;
    const end_time = String(Math.floor(endMin / 60)).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0');

    // Get default location
    const location = await db('locations').where({ tenant_id: tenantId, is_default: true }).first()
      || await db('locations').where({ tenant_id: tenantId, is_active: true }).first();

    const crypto = require('crypto');
    const manage_token = crypto.randomBytes(32).toString('hex');

    const [id] = await db('bookings').insert({
      tenant_id: tenantId,
      location_id: location ? location.id : null,
      staff_id,
      customer_id,
      service_id,
      staff_name: staff.first_name + ' ' + staff.last_name,
      customer_name: customer.first_name + ' ' + customer.last_name,
      customer_email: customer.email,
      customer_phone: customer.phone || null,
      service_name: service.name,
      booking_date,
      start_time,
      end_time,
      duration_minutes: duration,
      price_cents: price || 0,
      status: 'confirmed',
      source: 'admin',
      notes: notes || null,
      manage_token
    });

    res.json({ success: true, id });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT' || (err.message && err.message.includes('UNIQUE'))) {
      return res.json({ success: false, error: 'This time slot is already booked for this staff member' });
    }
    next(err);
  }
});

// PATCH /admin/bookings/:id/cancel
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
      req.flash('error', 'Booking not found or already cancelled.');
    } else {
      // Send cancellation email (fire-and-forget)
      sendBookingCancellation(id).catch(err =>
        console.error('Cancellation email error:', err.message)
      );
      req.flash('success', 'Booking cancelled. A cancellation email has been sent to the customer and staff. Ask them to check their inbox or spam folder.');
    }
    res.redirect('/admin/bookings');
  } catch (err) {
    next(err);
  }
});

// POST /admin/bookings/:id/complete
router.post('/bookings/:id/complete', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    await db('bookings')
      .where({ id, tenant_id: tenantId, status: 'confirmed' })
      .update({ status: 'completed' });

    req.flash('success', 'Booking marked as completed.');
    res.redirect('/admin/bookings');
  } catch (err) {
    next(err);
  }
});

// POST /admin/bookings/:id/no-show
router.post('/bookings/:id/no-show', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    await db('bookings')
      .where({ id, tenant_id: tenantId, status: 'confirmed' })
      .update({ status: 'no_show' });

    // Update customer no-show count
    const booking = await db('bookings').where({ id, tenant_id: tenantId }).first();
    if (booking) {
      await db('customers')
        .where({ id: booking.customer_id, tenant_id: tenantId })
        .increment('total_no_shows', 1);
    }

    req.flash('success', 'Booking marked as no-show.');
    res.redirect('/admin/bookings');
  } catch (err) {
    next(err);
  }
});

// GET /admin/bookings/api - JSON endpoint for calendar view
router.get('/bookings/api', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { start, end } = req.query;

    // Staff role: force filter to own staff_id; others: use query param
    const staff_id = req.user.role === 'contributor' ? req.user.staff_id : req.query.staff_id;

    let query = db('bookings')
      .where('tenant_id', tenantId)
      .where('booking_date', '>=', start)
      .where('booking_date', '<=', end)
      .whereNot('status', 'cancelled');

    if (staff_id) query = query.where('staff_id', staff_id);

    const bookings = await query;

    // Format for FullCalendar
    const events = bookings.map(b => {
      let dateStr;
      if (b.booking_date instanceof Date) {
        dateStr = b.booking_date.getFullYear() + '-' +
          String(b.booking_date.getMonth() + 1).padStart(2, '0') + '-' +
          String(b.booking_date.getDate()).padStart(2, '0');
      } else {
        dateStr = String(b.booking_date).slice(0, 10);
      }
      const startTime = String(b.start_time).slice(0, 5);
      const endTime = String(b.end_time).slice(0, 5);
      return {
      id: b.id,
      title: `${b.customer_name} - ${b.service_name}`,
      start: `${dateStr}T${startTime}`,
      end: `${dateStr}T${endTime}`,
      color: b.status === 'completed' ? '#22C55E' :
             b.status === 'no_show' ? '#EF4444' : '#F28C38',
      extendedProps: {
        staffName: b.staff_name,
        customerPhone: b.customer_phone,
        status: b.status,
        priceCents: b.price_cents
      }
    };
    });

    res.json(events);
  } catch (err) {
    next(err);
  }
});

// GET /admin/bookings/staff-services - Services for a specific staff member
router.get('/bookings/staff-services', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { staff_id } = req.query;

    const services = await db('staff_services')
      .join('services', 'staff_services.service_id', 'services.id')
      .where('services.tenant_id', tenantId)
      .where('services.is_active', true)
      .where('staff_services.staff_id', staff_id)
      .select('services.id', 'services.name', 'services.duration_minutes', 'services.price_cents',
        'staff_services.duration_override', 'staff_services.price_override_cents')
      .orderBy('services.sort_order');

    const result = services.map(s => ({
      id: s.id,
      name: s.name,
      duration_minutes: s.duration_override || s.duration_minutes,
      price_cents: s.price_override_cents != null ? s.price_override_cents : s.price_cents
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /admin/bookings/block-time - Create a blocked time
router.post('/bookings/block-time', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { blocked_date, all_day, start_time, end_time, reason } = req.body;
    // Staff can only block their own time
    const staff_id = req.user.role === 'contributor' ? req.user.staff_id : (req.body.staff_id || null);

    if (!blocked_date) return res.json({ success: false, error: 'Date is required' });

    await db('blocked_dates').insert({
      tenant_id: tenantId,
      staff_id: staff_id || null,
      blocked_date,
      all_day: all_day !== false,
      start_time: all_day ? null : (start_time || null),
      end_time: all_day ? null : (end_time || null),
      reason: reason || null
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /admin/bookings/blocked-times - JSON for calendar background events
router.get('/bookings/blocked-times', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { start, end } = req.query;
    const staff_id = req.user.role === 'contributor' ? req.user.staff_id : req.query.staff_id;

    let query = db('blocked_dates')
      .where('tenant_id', tenantId)
      .where('blocked_date', '>=', start)
      .where('blocked_date', '<=', end);

    if (staff_id) {
      query = query.where(function() {
        this.where('staff_id', staff_id).orWhereNull('staff_id');
      });
    }

    const blocks = await query;

    const events = blocks.map(b => {
      const dateStr = typeof b.blocked_date === 'string' ? b.blocked_date.slice(0, 10) :
        b.blocked_date.getFullYear() + '-' + String(b.blocked_date.getMonth() + 1).padStart(2, '0') + '-' + String(b.blocked_date.getDate()).padStart(2, '0');

      if (b.all_day) {
        return {
          id: 'block-' + b.id,
          title: b.reason || 'Blocked',
          start: dateStr,
          end: dateStr,
          allDay: true,
          display: 'background',
          color: '#E5E7EB',
          extendedProps: { type: 'blocked', blockId: b.id }
        };
      }
      return {
        id: 'block-' + b.id,
        title: b.reason || 'Blocked',
        start: dateStr + 'T' + String(b.start_time).slice(0, 5),
        end: dateStr + 'T' + String(b.end_time).slice(0, 5),
        display: 'background',
        color: '#E5E7EB',
        extendedProps: { type: 'blocked', blockId: b.id }
      };
    });

    res.json(events);
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/bookings/block-time/:id
router.delete('/bookings/block-time/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    let query = db('blocked_dates').where({ id: req.params.id, tenant_id: tenantId });
    // Staff can only delete their own blocks
    if (req.user.role === 'contributor') query = query.where('staff_id', req.user.staff_id);
    await query.delete();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
