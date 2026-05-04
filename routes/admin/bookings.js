const express = require('express');
const db = require('../../config/database');
const { formatTimeLabel, formatPrice } = require('../../utils/helpers');
const { sendBookingCancellation } = require('../../services/notificationService');
const router = express.Router();

// GET /admin/bookings
router.get('/bookings', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { from, to, staff_id, status, view } = req.query;

    let query = db('bookings').where('bookings.tenant_id', tenantId);

    if (from) query = query.where('booking_date', '>=', from);
    if (to) query = query.where('booking_date', '<=', to);
    if (staff_id) query = query.where('staff_id', staff_id);
    if (status) query = query.where('status', status);

    const bookings = await query
      .orderBy('booking_date', 'desc')
      .orderBy('start_time', 'asc');

    const staffList = await db('staff')
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('first_name');

    res.render('admin/bookings', {
      title: 'Bookings',
      user: req.user,
      tenant: req.tenant,
      bookings,
      staffList,
      filters: { from, to, staff_id, status },
      viewMode: view || 'list',
      helpers: { formatTimeLabel, formatPrice },
      flash: {
        error: req.flash('error'),
        success: req.flash('success')
      }
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
      req.flash('success', 'Booking cancelled successfully.');
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

    const bookings = await db('bookings')
      .where('tenant_id', tenantId)
      .where('booking_date', '>=', start)
      .where('booking_date', '<=', end)
      .whereNot('status', 'cancelled');

    // Format for FullCalendar
    const events = bookings.map(b => ({
      id: b.id,
      title: `${b.customer_name} - ${b.service_name}`,
      start: `${b.booking_date}T${b.start_time}`,
      end: `${b.booking_date}T${b.end_time}`,
      color: b.status === 'completed' ? '#4CAF50' :
             b.status === 'no_show' ? '#f44336' : '#2196F3',
      extendedProps: {
        staffName: b.staff_name,
        customerPhone: b.customer_phone,
        status: b.status,
        priceCents: b.price_cents
      }
    }));

    res.json(events);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
