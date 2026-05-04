const express = require('express');
const db = require('../../config/database');
const router = express.Router();

// GET /admin/dashboard
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

    // Run stat queries in parallel
    const [todayBookings, weekBookings, totalBookings, recentBookings, staffCount, customerCount] = await Promise.all([
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
      db('bookings')
        .where('tenant_id', tenantId)
        .where('booking_date', '>=', today)
        .whereNot('status', 'cancelled')
        .orderBy('booking_date', 'asc')
        .orderBy('start_time', 'asc')
        .limit(10),
      db('staff')
        .where({ tenant_id: tenantId, is_active: true })
        .count('id as count').first(),
      db('customers')
        .where('tenant_id', tenantId)
        .count('id as count').first()
    ]);

    res.render('admin/dashboard', {
      title: 'Dashboard',
      user: req.user,
      tenant: req.tenant,
      stats: {
        today: todayBookings.count,
        thisWeek: weekBookings.count,
        total: totalBookings.count,
        staffCount: staffCount.count,
        customerCount: customerCount.count
      },
      recentBookings,
      flash: {
        error: req.flash('error'),
        success: req.flash('success')
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
