const express = require('express');
const db = require('../../config/database');
const requireRole = require('../../middleware/requireRole');
const router = express.Router();

// GET /admin/locations
router.get('/locations', requireRole('owner'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;

    const locations = await db('locations')
      .where('tenant_id', tenantId)
      .orderBy('sort_order')
      .orderBy('name');

    // Get staff count per location
    const staffCounts = await db('staff')
      .where('tenant_id', tenantId)
      .groupBy('location_id')
      .select('location_id')
      .count('* as count');

    const staffCountMap = {};
    staffCounts.forEach(s => { staffCountMap[s.location_id] = s.count; });

    res.render('admin/locations/index', {
      title: 'Locations',
      user: req.user,
      tenant: req.tenant,
      locations,
      staffCountMap
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/locations/new
router.get('/locations/new', requireRole('owner'), (req, res) => {
  res.render('admin/locations/form', {
    title: 'Add Location',
    user: req.user,
    tenant: req.tenant,
    location: null
  });
});

// GET /admin/locations/:id/edit
router.get('/locations/:id/edit', requireRole('owner'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const location = await db('locations')
      .where({ id: req.params.id, tenant_id: tenantId })
      .first();

    if (!location) {
      req.flash('error', 'Location not found.');
      return res.redirect('/admin/locations');
    }

    res.render('admin/locations/form', {
      title: 'Edit Location',
      user: req.user,
      tenant: req.tenant,
      location
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/locations
router.post('/locations', requireRole('owner'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, address_line1, address_line2, city, state_province, postal_code, country, phone, timezone, is_default } = req.body;

    if (!name || !name.trim()) {
      req.flash('error', 'Location name is required.');
      return res.redirect('/admin/locations/new');
    }

    // If marking as default, unset other defaults
    if (is_default) {
      await db('locations').where({ tenant_id: tenantId }).update({ is_default: false });
    }

    // Get max sort_order
    const maxSort = await db('locations').where('tenant_id', tenantId).max('sort_order as max').first();

    await db('locations').insert({
      tenant_id: tenantId,
      name: name.trim(),
      address_line1: address_line1 || null,
      address_line2: address_line2 || null,
      city: city || null,
      state_province: state_province || null,
      postal_code: postal_code || null,
      country: country || 'CA',
      phone: phone || null,
      timezone: timezone || 'America/Toronto',
      is_default: is_default ? true : false,
      is_active: true,
      sort_order: (maxSort?.max || 0) + 1
    });

    req.flash('success', 'Location added successfully.');
    res.redirect('/admin/locations');
  } catch (err) {
    next(err);
  }
});

// POST /admin/locations/:id
router.post('/locations/:id', requireRole('owner'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;
    const { name, address_line1, address_line2, city, state_province, postal_code, country, phone, timezone, is_default, is_active } = req.body;

    const location = await db('locations').where({ id, tenant_id: tenantId }).first();
    if (!location) {
      req.flash('error', 'Location not found.');
      return res.redirect('/admin/locations');
    }

    if (!name || !name.trim()) {
      req.flash('error', 'Location name is required.');
      return res.redirect(`/admin/locations/${id}/edit`);
    }

    // If marking as default, unset other defaults
    if (is_default) {
      await db('locations').where({ tenant_id: tenantId }).update({ is_default: false });
    }

    await db('locations').where({ id, tenant_id: tenantId }).update({
      name: name.trim(),
      address_line1: address_line1 || null,
      address_line2: address_line2 || null,
      city: city || null,
      state_province: state_province || null,
      postal_code: postal_code || null,
      country: country || 'CA',
      phone: phone || null,
      timezone: timezone || 'America/Toronto',
      is_default: is_default ? true : false,
      is_active: is_active !== undefined ? (is_active ? true : false) : location.is_active
    });

    req.flash('success', 'Location updated successfully.');
    res.redirect('/admin/locations');
  } catch (err) {
    next(err);
  }
});

// POST /admin/locations/:id/delete
router.post('/locations/:id/delete', requireRole('owner'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    const location = await db('locations').where({ id, tenant_id: tenantId }).first();
    if (!location) {
      req.flash('error', 'Location not found.');
      return res.redirect('/admin/locations');
    }

    // Don't allow deleting the only location
    const locationCount = await db('locations').where('tenant_id', tenantId).count('id as count').first();
    if (locationCount.count <= 1) {
      req.flash('error', 'Cannot delete your only location. You must have at least one.');
      return res.redirect('/admin/locations');
    }

    // Don't allow deleting if staff are assigned
    const assignedStaff = await db('staff').where({ tenant_id: tenantId, location_id: id }).count('id as count').first();
    if (assignedStaff.count > 0) {
      req.flash('error', 'Cannot delete location with assigned staff. Reassign staff first.');
      return res.redirect('/admin/locations');
    }

    await db('locations').where({ id, tenant_id: tenantId }).delete();

    // If deleted location was default, set another as default
    if (location.is_default) {
      const first = await db('locations').where('tenant_id', tenantId).first();
      if (first) {
        await db('locations').where('id', first.id).update({ is_default: true });
      }
    }

    req.flash('success', 'Location deleted.');
    res.redirect('/admin/locations');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
