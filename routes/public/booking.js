const express = require('express');
const db = require('../../config/database');
const { formatPrice } = require('../../utils/helpers');
const router = express.Router();

// GET /book/:slug - Public booking page
router.get('/:slug', async (req, res, next) => {
  try {
    const tenant = await db('tenants')
      .where('slug', req.params.slug)
      .where('status', 'active')
      .first();

    if (!tenant) {
      return res.status(404).render('errors/404', {
        message: 'Business not found.',
        user: null,
        tenant: null
      });
    }

    const locations = await db('locations')
      .where({ tenant_id: tenant.id, is_active: true })
      .orderBy('sort_order');

    const staff = await db('staff')
      .where({ tenant_id: tenant.id, is_active: true, is_bookable: true })
      .orderBy('sort_order');

    const services = await db('services')
      .where({ tenant_id: tenant.id, is_active: true })
      .orderBy('category')
      .orderBy('sort_order');

    // Get staff-service assignments
    const staffServices = await db('staff_services')
      .where('tenant_id', tenant.id);

    res.render('booking/page', {
    layout: false,
      title: `Book with ${tenant.name}`,
      tenant,
      locations,
      staff,
      services,
      staffServices,
      user: null,
      helpers: { formatPrice },
      flash: { error: [], success: [] }
    });
  } catch (err) {
    next(err);
  }
});

// GET /book/:slug/embed - Embeddable widget version
router.get('/:slug/embed', async (req, res, next) => {
  try {
    const tenant = await db('tenants')
      .where('slug', req.params.slug)
      .where('status', 'active')
      .first();

    if (!tenant) return res.status(404).json({ error: 'Business not found' });

    const locations = await db('locations')
      .where({ tenant_id: tenant.id, is_active: true });
    const staff = await db('staff')
      .where({ tenant_id: tenant.id, is_active: true, is_bookable: true });
    const services = await db('services')
      .where({ tenant_id: tenant.id, is_active: true });
    const staffServices = await db('staff_services')
      .where('tenant_id', tenant.id);

    res.render('booking/embed', {
    layout: false,
      title: `Book with ${tenant.name}`,
      tenant, locations, staff, services, staffServices,
      user: null,
      helpers: { formatPrice },
      flash: { error: [], success: [] }
    });
  } catch (err) {
    next(err);
  }
});

// GET /book/:slug/confirm/:token - Booking confirmation page
router.get('/:slug/confirm/:token', async (req, res, next) => {
  try {
    const booking = await db('bookings')
      .where('manage_token', req.params.token)
      .first();

    if (!booking) {
      return res.status(404).render('errors/404', {
        message: 'Booking not found.',
        user: null,
        tenant: null
      });
    }

    const tenant = await db('tenants').where('id', booking.tenant_id).first();

    res.render('booking/confirm', {
    layout: false,
      title: 'Booking Confirmed',
      tenant,
      booking,
      user: null,
      helpers: { formatPrice },
      flash: { error: [], success: [] }
    });
  } catch (err) {
    next(err);
  }
});

// GET /book/:slug/manage/:token - Customer manage booking page
router.get('/:slug/manage/:token', async (req, res, next) => {
  try {
    const booking = await db('bookings')
      .where('manage_token', req.params.token)
      .first();

    if (!booking) {
      return res.status(404).render('errors/404', {
        layout: false, message: 'Booking not found.', user: null, tenant: null
      });
    }

    const tenant = await db('tenants').where('id', booking.tenant_id).first();

    res.render('booking/manage', {
      layout: false,
      title: 'Manage Booking',
      tenant,
      booking,
      user: null,
      helpers: { formatPrice },
      flash: { error: [], success: [] }
    });
  } catch (err) {
    next(err);
  }
});

// POST /book/:slug/cancel/:token - Customer cancel booking
router.post('/:slug/cancel/:token', async (req, res, next) => {
  try {
    const booking = await db('bookings')
      .where('manage_token', req.params.token)
      .first();

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    if (booking.status === 'cancelled') {
      return res.json({ success: false, message: 'Booking is already cancelled.' });
    }

    await db('bookings')
      .where('id', booking.id)
      .update({ status: 'cancelled', updated_at: new Date() });

    // Send cancellation email (fire-and-forget)
    const { sendBookingCancellation } = require('../../services/notificationService');
    sendBookingCancellation(booking.id).catch(err =>
      console.error('Cancellation email error:', err.message)
    );

    res.json({ success: true, message: 'Booking cancelled successfully.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
