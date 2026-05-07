const express = require('express');
const db = require('../../config/database');
const { timeToMinutes, minutesToHHMM, formatTimeLabel, generateToken, timesOverlap } = require('../../utils/helpers');
const { sendBookingConfirmation } = require('../../services/notificationService');
const router = express.Router();

/**
 * GET /api/:slug/availability?date=YYYY-MM-DD&staff_id=X&service_id=Y
 * Returns available time slots for a given date, staff, and service.
 */
router.get('/:slug/availability', async (req, res, next) => {
  try {
    const { date, staff_id, service_id } = req.query;
    if (!date || !staff_id || !service_id) {
      return res.status(400).json({ error: 'date, staff_id, and service_id are required.' });
    }

    // Resolve tenant
    const tenant = await db('tenants').where('slug', req.params.slug).first();
    if (!tenant) return res.status(404).json({ error: 'Business not found.' });

    const tenantId = tenant.id;
    const staffId = parseInt(staff_id);
    const serviceId = parseInt(service_id);

    // Get service details
    const service = await db('services').where({ id: serviceId, tenant_id: tenantId }).first();
    if (!service) return res.status(404).json({ error: 'Service not found.' });

    // Get staff details
    const staffMember = await db('staff').where({ id: staffId, tenant_id: tenantId }).first();
    if (!staffMember) return res.status(404).json({ error: 'Staff not found.' });

    // Check if date is blocked
    const blocked = await db('blocked_dates')
      .where('tenant_id', tenantId)
      .where('blocked_date', date)
      .where(function () {
        this.whereNull('staff_id').orWhere('staff_id', staffId);
      })
      .where('all_day', true)
      .first();

    if (blocked) {
      return res.json({
        date,
        closed: true,
        reason: blocked.reason || 'Closed',
        slots: []
      });
    }

    // Get the weekday (0=Sun..6=Sat)
    const dayOfWeek = new Date(date + 'T00:00:00').getDay();

    // Get business hours (staff override > location default)
    let hours = await db('business_hours')
      .where({ tenant_id: tenantId, staff_id: staffId, weekday: dayOfWeek })
      .first();

    if (!hours) {
      // Try staff's assigned location, or fall back to default location
      const locationId = staffMember.location_id
        || (await db('locations').where({ tenant_id: tenantId, is_default: true }).first())?.id
        || (await db('locations').where('tenant_id', tenantId).first())?.id;

      hours = await db('business_hours')
        .where({ tenant_id: tenantId, location_id: locationId, staff_id: null, weekday: dayOfWeek })
        .first();
    }

    if (!hours || !hours.open_at || !hours.close_at) {
      return res.json({ date, closed: true, reason: 'Closed', slots: [] });
    }

    const openMin = timeToMinutes(hours.open_at);
    const closeMin = timeToMinutes(hours.close_at);
    const breakStartMin = hours.break_start ? timeToMinutes(hours.break_start) : null;
    const breakEndMin = hours.break_end ? timeToMinutes(hours.break_end) : null;

    // Get existing bookings for this staff on this date
    const existingBookings = await db('bookings')
      .where({ tenant_id: tenantId, staff_id: staffId, booking_date: date })
      .whereIn('status', ['confirmed'])
      .select('start_time', 'end_time', 'duration_minutes');

    const bookedRanges = existingBookings.map(b => ({
      start: timeToMinutes(b.start_time) - (staffMember.buffer_before || 0),
      end: timeToMinutes(b.end_time) + (staffMember.buffer_after || 0)
    }));

    // Check staff_services for duration/price override
    const staffService = await db('staff_services')
      .where({ staff_id: staffId, service_id: serviceId })
      .first();

    const duration = staffService?.duration_override || service.duration_minutes;
    const slotStep = staffMember.slot_duration || 30;

    // Generate slots
    const slots = [];
    const nowMinutes = isToday(date) ? getCurrentMinutes() : 0;

    for (let m = openMin; m + duration <= closeMin; m += slotStep) {
      // Skip if in break time
      if (breakStartMin !== null && breakEndMin !== null) {
        if (m < breakEndMin && m + duration > breakStartMin) continue;
      }

      // Skip past times
      if (m < nowMinutes) continue;

      // Check overlap with existing bookings
      const slotRange = { start: m, end: m + duration };
      const hasConflict = bookedRanges.some(b => timesOverlap(slotRange, b));
      if (hasConflict) continue;

      const timeStr = minutesToHHMM(m);
      slots.push({
        time: timeStr,
        label: formatTimeLabel(timeStr),
        available: true
      });
    }

    res.json({
      date,
      closed: false,
      slots,
      duration,
      price_cents: staffService?.price_override_cents || service.price_cents
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/:slug/book
 * Creates a booking.
 */
router.post('/:slug/book', async (req, res, next) => {
  try {
    const tenant = await db('tenants').where('slug', req.params.slug).first();
    if (!tenant) return res.status(404).json({ error: 'Business not found.' });

    // Trial limits check
    if (tenant.plan === 'trial') {
      // Check if trial expired
      if (tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date()) {
        return res.status(403).json({ error: 'This business\'s free trial has expired. Please contact them to upgrade.' });
      }
      // Check 10 bookings/month limit
      const monthStart = new Date();
      monthStart.setDate(1);
      const monthStr = monthStart.toISOString().slice(0, 10);
      const [{ count: monthlyCount }] = await db('bookings')
        .where('tenant_id', tenant.id)
        .where('created_at', '>=', monthStr)
        .count('id as count');
      if (monthlyCount >= 10) {
        return res.status(403).json({ error: 'This business has reached their monthly booking limit. Please contact them.' });
      }
    }

    const tenantId = tenant.id;
    const { staff_id, service_id, location_id, date, time, first_name, last_name, email, phone, notes } = req.body;

    // Validate required fields
    if (!staff_id || !service_id || !date || !time || !first_name || !last_name || !email) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    // Get service and staff
    const service = await db('services').where({ id: service_id, tenant_id: tenantId }).first();
    const staffMember = await db('staff').where({ id: staff_id, tenant_id: tenantId }).first();
    if (!service || !staffMember) {
      return res.status(400).json({ error: 'Invalid service or staff selection.' });
    }

    const staffService = await db('staff_services')
      .where({ staff_id: parseInt(staff_id), service_id: parseInt(service_id) }).first();
    const duration = staffService?.duration_override || service.duration_minutes;
    const priceCents = staffService?.price_override_cents || service.price_cents;

    // Calculate end time
    const startMin = timeToMinutes(time);
    const endTime = minutesToHHMM(startMin + duration);

    // Upsert customer
    const customerEmail = email.toLowerCase().trim();
    let customer = await db('customers')
      .where({ tenant_id: tenantId, email: customerEmail }).first();

    if (customer) {
      await db('customers').where('id', customer.id).update({
        first_name, last_name,
        phone: phone || customer.phone,
        total_bookings: customer.total_bookings + 1,
        last_visit_date: date
      });
    } else {
      const [customerId] = await db('customers').insert({
        tenant_id: tenantId,
        first_name, last_name,
        email: customerEmail,
        phone: phone || null,
        total_bookings: 1,
        last_visit_date: date
      });
      customer = { id: customerId };
    }

    // Resolve location
    const locId = location_id || staffMember.location_id ||
      (await db('locations').where({ tenant_id: tenantId, is_default: true }).first())?.id;

    const manageToken = generateToken();
    const staffName = staffMember.display_name || `${staffMember.first_name} ${staffMember.last_name}`;

    // Insert booking
    try {
      const [bookingId] = await db('bookings').insert({
        tenant_id: tenantId,
        location_id: locId,
        staff_id: parseInt(staff_id),
        customer_id: customer.id,
        service_id: parseInt(service_id),
        staff_name: staffName,
        customer_name: `${first_name} ${last_name}`,
        customer_email: customerEmail,
        customer_phone: phone || null,
        service_name: service.name,
        booking_date: date,
        start_time: time,
        end_time: endTime,
        duration_minutes: duration,
        price_cents: priceCents,
        notes: notes || null,
        source: 'online',
        manage_token: manageToken
      });

      // Send confirmation email (fire-and-forget, don't block the response)
      sendBookingConfirmation(bookingId).catch(err =>
        console.error('Confirmation email error:', err.message)
      );

      res.status(201).json({
        success: true,
        booking_id: bookingId,
        manage_token: manageToken,
        message: `Booking confirmed! A confirmation will be sent to ${customerEmail}.`
      });
    } catch (err) {
      // Handle duplicate entry (double-booking prevention)
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          error: 'This time slot was just booked. Please choose another time.'
        });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/** Check if a date string is today */
function isToday(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}

/** Get current time in minutes since midnight */
function getCurrentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

module.exports = router;
