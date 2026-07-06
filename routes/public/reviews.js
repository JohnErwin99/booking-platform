const express = require('express');
const db = require('../../config/database');
const upload = require('../../config/upload');
const { getUploadUrl } = require('../../config/upload');
const router = express.Router();

// GET /book/:slug/reviews — Public reviews page for the business
router.get('/:slug/reviews', async (req, res, next) => {
  try {
    const tenant = await db('tenants')
      .where('slug', req.params.slug)
      .whereIn('status', ['active', 'trial'])
      .first();

    if (!tenant) {
      return res.status(404).render('errors/404', { message: 'Business not found.', user: null, tenant: null });
    }

    const reviews = await db('reviews')
      .join('services', 'reviews.service_id', 'services.id')
      .join('staff', 'reviews.staff_id', 'staff.id')
      .where('reviews.tenant_id', tenant.id)
      .where('reviews.is_public', true)
      .where('reviews.rating', '>', 0)
      .orderBy('reviews.created_at', 'desc')
      .select(
        'reviews.id',
        'reviews.rating',
        'reviews.comment',
        'reviews.photo_url',
        'reviews.created_at',
        'services.name as service_name',
        db.raw("CONCAT(staff.first_name, ' ', staff.last_name) as staff_name")
      );

    const totalReviews = reviews.length;
    const avgRating = totalReviews > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
      : null;

    res.render('reviews/public', {
      layout: false,
      title: `Reviews — ${tenant.name}`,
      tenant,
      reviews,
      totalReviews,
      avgRating
    });
  } catch (err) {
    next(err);
  }
});

// GET /book/:slug/review/:token — Show the review form
router.get('/:slug/review/:token', async (req, res, next) => {
  try {
    const tenant = await db('tenants')
      .where('slug', req.params.slug)
      .whereIn('status', ['active', 'trial'])
      .first();

    if (!tenant) {
      return res.status(404).render('errors/404', { message: 'Business not found.', user: null, tenant: null });
    }

    const review = await db('reviews')
      .join('bookings', 'reviews.booking_id', 'bookings.id')
      .join('services', 'reviews.service_id', 'services.id')
      .join('staff', 'reviews.staff_id', 'staff.id')
      .where('reviews.review_token', req.params.token)
      .where('reviews.tenant_id', tenant.id)
      .select(
        'reviews.id',
        'reviews.rating',
        'reviews.review_token',
        'bookings.customer_name',
        'bookings.booking_date',
        'services.name as service_name',
        db.raw("CONCAT(staff.first_name, ' ', staff.last_name) as staff_name")
      )
      .first();

    if (!review) {
      return res.status(404).render('errors/404', { message: 'Review link not found.', user: null, tenant: null });
    }

    // Already submitted
    if (review.rating > 0) {
      return res.render('reviews/thanks', {
        layout: false,
        title: 'Thanks for your review!',
        tenant,
        alreadySubmitted: true
      });
    }

    res.render('reviews/form', {
      layout: false,
      title: `Leave a Review — ${tenant.name}`,
      tenant,
      review,
      error: null
    });
  } catch (err) {
    next(err);
  }
});

// POST /book/:slug/review/:token — Submit the review
router.post('/:slug/review/:token', upload.single('photo'), async (req, res, next) => {
  try {
    const tenant = await db('tenants')
      .where('slug', req.params.slug)
      .whereIn('status', ['active', 'trial'])
      .first();

    if (!tenant) {
      return res.status(404).render('errors/404', { message: 'Business not found.', user: null, tenant: null });
    }

    const review = await db('reviews')
      .join('bookings', 'reviews.booking_id', 'bookings.id')
      .join('services', 'reviews.service_id', 'services.id')
      .join('staff', 'reviews.staff_id', 'staff.id')
      .where('reviews.review_token', req.params.token)
      .where('reviews.tenant_id', tenant.id)
      .select(
        'reviews.id',
        'reviews.rating',
        'reviews.review_token',
        'bookings.customer_name',
        'services.name as service_name',
        db.raw("CONCAT(staff.first_name, ' ', staff.last_name) as staff_name")
      )
      .first();

    if (!review) {
      return res.status(404).render('errors/404', { message: 'Review link not found.', user: null, tenant: null });
    }

    // Already submitted
    if (review.rating > 0) {
      return res.render('reviews/thanks', {
        layout: false,
        title: 'Thanks for your review!',
        tenant,
        alreadySubmitted: true
      });
    }

    const rating = parseInt(req.body.rating, 10);
    if (!rating || rating < 1 || rating > 5) {
      return res.render('reviews/form', {
        layout: false,
        title: `Leave a Review — ${tenant.name}`,
        tenant,
        review,
        error: 'Please select a star rating (1–5).'
      });
    }

    const comment = (req.body.comment || '').trim() || null;
    const photoUrl = req.file ? getUploadUrl(req.file) : null;

    await db('reviews').where('id', review.id).update({
      rating,
      comment,
      photo_url: photoUrl,
      is_public: true
    });

    res.render('reviews/thanks', {
      layout: false,
      title: 'Thanks for your review!',
      tenant,
      alreadySubmitted: false
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
