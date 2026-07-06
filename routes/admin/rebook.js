const express = require('express');
const db = require('../../config/database');
const requireRole = require('../../middleware/requireRole');
const router = express.Router();

// GET /admin/rebook — Rebook settings: list all services with their rebook_days
router.get('/rebook', requireRole('owner'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;

    const services = await db('services')
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('category')
      .orderBy('name')
      .select('id', 'name', 'category', 'rebook_days');

    res.render('admin/rebook', {
      title: 'Auto-Rebook Settings',
      user: req.user,
      tenant: req.tenant,
      services,
      reminders: null
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/rebook — Save rebook_days for each service
router.post('/rebook', requireRole('owner'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    // Expect req.body.rebook = { [service_id]: days_value, ... }
    const rebookMap = req.body.rebook || {};

    for (const [serviceId, days] of Object.entries(rebookMap)) {
      const parsedDays = days === '' || days === null ? null : parseInt(days, 10);
      const validDays = (!isNaN(parsedDays) && parsedDays > 0) ? parsedDays : null;

      await db('services')
        .where({ id: serviceId, tenant_id: tenantId })
        .update({ rebook_days: validDays });
    }

    req.flash('success', 'Rebook settings saved.');
    res.redirect('/admin/rebook');
  } catch (err) {
    next(err);
  }
});

// GET /admin/rebook/reminders — View rebook reminders log
router.get('/rebook/reminders', requireRole('owner'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;

    const reminders = await db('rebook_reminders')
      .join('customers', 'rebook_reminders.customer_id', 'customers.id')
      .join('services', 'rebook_reminders.service_id', 'services.id')
      .join('staff', 'rebook_reminders.staff_id', 'staff.id')
      .where('rebook_reminders.tenant_id', tenantId)
      .orderBy('rebook_reminders.created_at', 'desc')
      .limit(100)
      .select(
        'rebook_reminders.id',
        'rebook_reminders.suggested_date',
        'rebook_reminders.status',
        'rebook_reminders.sent_at',
        'rebook_reminders.created_at',
        'customers.first_name as customer_name',
        'customers.email as customer_email',
        'services.name as service_name',
        db.raw("CONCAT(staff.first_name, ' ', staff.last_name) as staff_name")
      );

    const services = await db('services')
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('category')
      .orderBy('name')
      .select('id', 'name', 'category', 'rebook_days');

    res.render('admin/rebook', {
      title: 'Auto-Rebook Settings',
      user: req.user,
      tenant: req.tenant,
      services,
      reminders
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
