const express = require('express');
const db = require('../../config/database');
const requireRole = require('../../middleware/requireRole');
const router = express.Router();

// GET /admin/share
router.get('/share', requireRole('owner'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;

    const services = await db('services')
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('sort_order');

    const staffList = await db('staff')
      .where({ tenant_id: tenantId, is_active: true, is_bookable: true })
      .orderBy('first_name');

    const slug = req.tenant ? req.tenant.slug : '';

    res.render('admin/share', {
      title: 'Share',
      user: req.user,
      tenant: req.tenant,
      slug,
      services,
      staffList
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
