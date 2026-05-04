const express = require('express');
const db = require('../../config/database');
const requireRole = require('../../middleware/requireRole');
const router = express.Router();

// GET /admin/staff
router.get('/staff', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;

    const staffList = await db('staff')
      .leftJoin('locations', 'staff.location_id', 'locations.id')
      .select('staff.*', 'locations.name as location_name')
      .where('staff.tenant_id', tenantId)
      .orderBy('staff.sort_order')
      .orderBy('staff.first_name');

    // Get service counts per staff
    const serviceCounts = await db('staff_services')
      .where('tenant_id', tenantId)
      .groupBy('staff_id')
      .select('staff_id')
      .count('* as count');

    const serviceCountMap = {};
    serviceCounts.forEach(s => { serviceCountMap[s.staff_id] = s.count; });

    res.render('admin/staff/index', {
      title: 'Staff',
      user: req.user,
      tenant: req.tenant,
      staffList,
      serviceCountMap,
      flash: {
        error: req.flash('error'),
        success: req.flash('success')
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/staff/new
router.get('/staff/new', requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const locations = await db('locations').where({ tenant_id: tenantId, is_active: true });
    const services = await db('services').where({ tenant_id: tenantId, is_active: true });

    res.render('admin/staff/form', {
      title: 'Add Staff',
      user: req.user,
      tenant: req.tenant,
      staffMember: null,
      locations,
      services,
      assignedServices: [],
      flash: { error: req.flash('error'), success: req.flash('success') }
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/staff
router.post('/staff', requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { first_name, last_name, display_name, email, phone, title, bio,
            location_id, commission_rate, slot_duration, buffer_before, buffer_after,
            services: serviceIds } = req.body;

    const [staffId] = await db('staff').insert({
      tenant_id: tenantId,
      location_id: location_id || null,
      first_name, last_name,
      display_name: display_name || `${first_name} ${last_name}`,
      email: email || null,
      phone: phone || null,
      title: title || null,
      bio: bio || null,
      commission_rate: commission_rate || null,
      slot_duration: slot_duration || 30,
      buffer_before: buffer_before || 0,
      buffer_after: buffer_after || 0
    });

    // Assign services
    if (serviceIds && serviceIds.length) {
      const ids = Array.isArray(serviceIds) ? serviceIds : [serviceIds];
      const rows = ids.map(sid => ({
        tenant_id: tenantId,
        staff_id: staffId,
        service_id: parseInt(sid)
      }));
      await db('staff_services').insert(rows);
    }

    req.flash('success', 'Staff member added successfully.');
    res.redirect('/admin/staff');
  } catch (err) {
    next(err);
  }
});

// GET /admin/staff/:id/edit
router.get('/staff/:id/edit', requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const staffMember = await db('staff')
      .where({ id: req.params.id, tenant_id: tenantId }).first();

    if (!staffMember) {
      req.flash('error', 'Staff member not found.');
      return res.redirect('/admin/staff');
    }

    const locations = await db('locations').where({ tenant_id: tenantId, is_active: true });
    const services = await db('services').where({ tenant_id: tenantId, is_active: true });
    const assignedServices = await db('staff_services')
      .where({ tenant_id: tenantId, staff_id: staffMember.id })
      .pluck('service_id');

    res.render('admin/staff/form', {
      title: 'Edit Staff',
      user: req.user,
      tenant: req.tenant,
      staffMember,
      locations,
      services,
      assignedServices,
      flash: { error: req.flash('error'), success: req.flash('success') }
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/staff/:id
router.post('/staff/:id', requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;
    const { first_name, last_name, display_name, email, phone, title, bio,
            location_id, commission_rate, slot_duration, buffer_before, buffer_after,
            is_active, services: serviceIds } = req.body;

    await db('staff').where({ id, tenant_id: tenantId }).update({
      location_id: location_id || null,
      first_name, last_name,
      display_name: display_name || `${first_name} ${last_name}`,
      email: email || null,
      phone: phone || null,
      title: title || null,
      bio: bio || null,
      commission_rate: commission_rate || null,
      slot_duration: slot_duration || 30,
      buffer_before: buffer_before || 0,
      buffer_after: buffer_after || 0,
      is_active: is_active === 'on' || is_active === '1' ? true : false
    });

    // Reassign services
    await db('staff_services').where({ staff_id: id, tenant_id: tenantId }).del();
    if (serviceIds && serviceIds.length) {
      const ids = Array.isArray(serviceIds) ? serviceIds : [serviceIds];
      const rows = ids.map(sid => ({
        tenant_id: tenantId,
        staff_id: parseInt(id),
        service_id: parseInt(sid)
      }));
      await db('staff_services').insert(rows);
    }

    req.flash('success', 'Staff member updated.');
    res.redirect('/admin/staff');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
