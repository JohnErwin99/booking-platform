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
    const { from, to, status, location_id, view } = req.query;
    // Staff role: force filter to own staff_id; others: use query param
    const staff_id = req.user.role === 'staff' ? req.user.staff_id : req.query.staff_id;

    let query = db('bookings').where('bookings.tenant_id', tenantId);

    if (from) query = query.where('booking_date', '>=', from);
    if (to) query = query.where('booking_date', '<=', to);
    if (staff_id) query = query.where('staff_id', staff_id);
    if (status) query = query.where('status', status);
    if (location_id) query = query.where('location_id', location_id);

    const bookings = await query
      .orderBy('booking_date', 'desc')
      .orderBy('start_time', 'asc');

    const staffList = await db('staff')
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('first_name');

    const locations = await db('locations')
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('sort_order');

    const calendarSync = await gcal.isConnected(tenantId);

    res.render('admin/bookings', {
      title: 'Bookings',
      user: req.user,
      tenant: req.tenant,
      bookings,
      staffList,
      locations,
      calendarConnected: calendarSync.connected,
      filters: { from, to, staff_id, status, location_id },
      viewMode: view || 'calendar',
      helpers: { formatTimeLabel, formatPrice }
    });
  } catch (err) {
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
    const staff_id = req.user.role === 'staff' ? req.user.staff_id : req.query.staff_id;

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

module.exports = router;
