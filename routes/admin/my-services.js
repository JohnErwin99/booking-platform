const express = require('express');
const db = require('../../config/database');
const { formatPrice } = require('../../utils/helpers');
const router = express.Router();

// GET /admin/my-services — list staff member's own services
router.get('/my-services', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const staffId = req.user.staff_id;

    if (!staffId) {
      req.flash('error', 'No staff profile linked to your account.');
      return res.redirect('/admin/dashboard');
    }

    // Get assigned services with overrides
    const myServices = await db('staff_services')
      .join('services', 'staff_services.service_id', 'services.id')
      .where({ 'staff_services.tenant_id': tenantId, 'staff_services.staff_id': staffId })
      .select(
        'services.id', 'services.name', 'services.category', 'services.description',
        'services.duration_minutes', 'services.price_cents',
        'staff_services.price_override_cents', 'staff_services.duration_override',
        'staff_services.id as staff_service_id'
      )
      .orderBy('services.category')
      .orderBy('services.sort_order');

    // Get available services not yet assigned
    const assignedIds = myServices.map(s => s.id);
    const availableServices = await db('services')
      .where({ tenant_id: tenantId, is_active: true })
      .whereNotIn('id', assignedIds.length ? assignedIds : [0])
      .orderBy('category')
      .orderBy('name');

    res.render('admin/my-services/index', {
      title: 'My Services',
      user: req.user,
      tenant: req.tenant,
      myServices,
      availableServices,
      helpers: { formatPrice }
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/my-services/add — assign an existing service to self
router.post('/my-services/add', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const staffId = req.user.staff_id;
    const { service_id, price_override, duration_override } = req.body;

    if (!staffId) {
      req.flash('error', 'No staff profile linked to your account.');
      return res.redirect('/admin/dashboard');
    }

    // Verify service belongs to tenant
    const service = await db('services')
      .where({ id: service_id, tenant_id: tenantId }).first();
    if (!service) {
      req.flash('error', 'Service not found.');
      return res.redirect('/admin/my-services');
    }

    // Check not already assigned
    const existing = await db('staff_services')
      .where({ staff_id: staffId, service_id: parseInt(service_id) }).first();
    if (existing) {
      req.flash('error', 'Service already assigned.');
      return res.redirect('/admin/my-services');
    }

    await db('staff_services').insert({
      tenant_id: tenantId,
      staff_id: staffId,
      service_id: parseInt(service_id),
      price_override_cents: price_override ? Math.round(parseFloat(price_override) * 100) : null,
      duration_override: duration_override ? parseInt(duration_override) : null
    });

    req.flash('success', `"${service.name}" added to your services.`);
    res.redirect('/admin/my-services');
  } catch (err) {
    next(err);
  }
});

// POST /admin/my-services/create — create a brand new service and assign to self
router.post('/my-services/create', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const staffId = req.user.staff_id;
    const { name, category, description, duration_minutes, price } = req.body;

    if (!staffId) {
      req.flash('error', 'No staff profile linked to your account.');
      return res.redirect('/admin/dashboard');
    }

    if (!name || !duration_minutes || !price) {
      req.flash('error', 'Name, duration and price are required.');
      return res.redirect('/admin/my-services');
    }

    const priceCents = Math.round(parseFloat(price) * 100);

    // Create the service
    const [serviceId] = await db('services').insert({
      tenant_id: tenantId,
      name,
      category: category || null,
      description: description || null,
      duration_minutes: parseInt(duration_minutes),
      price_cents: priceCents,
      sort_order: 0
    });

    // Auto-assign to this staff member
    await db('staff_services').insert({
      tenant_id: tenantId,
      staff_id: staffId,
      service_id: serviceId
    });

    req.flash('success', `Service "${name}" created and assigned to you.`);
    res.redirect('/admin/my-services');
  } catch (err) {
    next(err);
  }
});

// POST /admin/my-services/:serviceId/update — update overrides for assigned service
router.post('/my-services/:serviceId/update', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const staffId = req.user.staff_id;
    const { serviceId } = req.params;
    const { price_override, duration_override } = req.body;

    if (!staffId) {
      req.flash('error', 'No staff profile linked to your account.');
      return res.redirect('/admin/dashboard');
    }

    await db('staff_services')
      .where({ tenant_id: tenantId, staff_id: staffId, service_id: parseInt(serviceId) })
      .update({
        price_override_cents: price_override ? Math.round(parseFloat(price_override) * 100) : null,
        duration_override: duration_override ? parseInt(duration_override) : null
      });

    req.flash('success', 'Service updated.');
    res.redirect('/admin/my-services');
  } catch (err) {
    next(err);
  }
});

// POST /admin/my-services/:serviceId/remove — unassign service from self
router.post('/my-services/:serviceId/remove', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const staffId = req.user.staff_id;
    const { serviceId } = req.params;

    if (!staffId) {
      req.flash('error', 'No staff profile linked to your account.');
      return res.redirect('/admin/dashboard');
    }

    await db('staff_services')
      .where({ tenant_id: tenantId, staff_id: staffId, service_id: parseInt(serviceId) })
      .del();

    req.flash('success', 'Service removed from your list.');
    res.redirect('/admin/my-services');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
