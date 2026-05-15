const express = require('express');
const db = require('../../config/database');
const requireRole = require('../../middleware/requireRole');
const { formatPrice } = require('../../utils/helpers');
const router = express.Router();

// GET /admin/services
router.get('/services', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const services = await db('services')
      .where('tenant_id', tenantId)
      .orderBy('category')
      .orderBy('sort_order')
      .orderBy('name');

    // Group by category
    const categories = {};
    services.forEach(s => {
      const cat = s.category || 'Uncategorized';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(s);
    });

    res.render('admin/services/index', {
      title: 'Services',
      user: req.user,
      tenant: req.tenant,
      categories,
      serviceCount: services.length,
      helpers: { formatPrice }
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/services/new
router.get('/services/new', requireRole('owner', 'manager'), (req, res) => {
  res.render('admin/services/form', {
    title: 'Add Service',
    user: req.user,
    tenant: req.tenant,
    service: null
  });
});

// POST /admin/services
router.post('/services', requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, category, description, duration_minutes, price, sort_order } = req.body;

    await db('services').insert({
      tenant_id: tenantId,
      name,
      category: category || null,
      description: description || null,
      duration_minutes: parseInt(duration_minutes),
      price_cents: Math.round(parseFloat(price) * 100),
      sort_order: parseInt(sort_order) || 0
    });

    req.flash('success', 'Service added successfully.');
    res.redirect('/admin/services');
  } catch (err) {
    next(err);
  }
});

// GET /admin/services/:id/edit
router.get('/services/:id/edit', requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const service = await db('services')
      .where({ id: req.params.id, tenant_id: tenantId }).first();

    if (!service) {
      req.flash('error', 'Service not found.');
      return res.redirect('/admin/services');
    }

    res.render('admin/services/form', {
      title: 'Edit Service',
      user: req.user,
      tenant: req.tenant,
      service
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/services/:id
router.post('/services/:id', requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, category, description, duration_minutes, price, sort_order, is_active } = req.body;

    await db('services').where({ id: req.params.id, tenant_id: tenantId }).update({
      name,
      category: category || null,
      description: description || null,
      duration_minutes: parseInt(duration_minutes),
      price_cents: Math.round(parseFloat(price) * 100),
      sort_order: parseInt(sort_order) || 0,
      is_active: is_active === 'on' || is_active === '1' ? true : false
    });

    req.flash('success', 'Service updated.');
    res.redirect('/admin/services');
  } catch (err) {
    next(err);
  }
});

// POST /admin/services/:id/delete
router.post('/services/:id/delete', requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    await db('services').where({ id: req.params.id, tenant_id: tenantId }).del();
    req.flash('success', 'Service deleted.');
    res.redirect('/admin/services');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
