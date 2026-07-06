const express = require('express');
const db = require('../../config/database');
const router = express.Router();

// GET /api/:slug/portfolio
// Returns active portfolio photos for a tenant, with staff and service info
router.get('/:slug/portfolio', async (req, res, next) => {
  try {
    const tenant = await db('tenants')
      .where('slug', req.params.slug)
      .whereIn('status', ['active', 'trial'])
      .first();

    if (!tenant) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const photos = await db('portfolio_photos')
      .leftJoin('staff', 'portfolio_photos.staff_id', 'staff.id')
      .leftJoin('services', 'portfolio_photos.service_id', 'services.id')
      .where('portfolio_photos.tenant_id', tenant.id)
      .where('portfolio_photos.is_active', true)
      .where('staff.is_active', true)
      .orderBy('portfolio_photos.sort_order')
      .orderBy('portfolio_photos.created_at', 'desc')
      .select(
        'portfolio_photos.id',
        'portfolio_photos.staff_id',
        'portfolio_photos.service_id',
        'portfolio_photos.photo_url',
        'portfolio_photos.caption',
        'staff.display_name as staff_name',
        'staff.first_name as staff_first_name',
        'staff.last_name as staff_last_name',
        'services.name as service_name'
      );

    res.json(photos);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
