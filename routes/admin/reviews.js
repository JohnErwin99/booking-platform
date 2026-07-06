const express = require('express');
const db = require('../../config/database');
const requireRole = require('../../middleware/requireRole');
const router = express.Router();

// GET /admin/reviews — List all reviews for the tenant
router.get('/reviews', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;

    const reviews = await db('reviews')
      .join('customers', 'reviews.customer_id', 'customers.id')
      .join('services', 'reviews.service_id', 'services.id')
      .join('staff', 'reviews.staff_id', 'staff.id')
      .where('reviews.tenant_id', tenantId)
      .where('reviews.rating', '>', 0)  // only submitted reviews
      .orderBy('reviews.created_at', 'desc')
      .select(
        'reviews.id',
        'reviews.rating',
        'reviews.comment',
        'reviews.photo_url',
        'reviews.is_public',
        'reviews.created_at',
        'customers.first_name as customer_name',
        'customers.email as customer_email',
        'services.name as service_name',
        db.raw("CONCAT(staff.first_name, ' ', staff.last_name) as staff_name")
      );

    // Summary stats
    const totalReviews = reviews.length;
    const avgRating = totalReviews > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
      : null;

    res.render('admin/reviews', {
      title: 'Customer Reviews',
      user: req.user,
      tenant: req.tenant,
      reviews,
      totalReviews,
      avgRating
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/reviews/:id/toggle — Toggle is_public flag
router.post('/reviews/:id/toggle', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;

    const review = await db('reviews')
      .where({ id: req.params.id, tenant_id: tenantId })
      .first();

    if (!review) {
      req.flash('error', 'Review not found.');
      return res.redirect('/admin/reviews');
    }

    await db('reviews')
      .where({ id: req.params.id, tenant_id: tenantId })
      .update({ is_public: !review.is_public });

    req.flash('success', review.is_public ? 'Review hidden from public.' : 'Review is now public.');
    res.redirect('/admin/reviews');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
