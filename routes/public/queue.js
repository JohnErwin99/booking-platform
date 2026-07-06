const express = require('express');
const db = require('../../config/database');
const router = express.Router();

const DEFAULT_SERVICE_MINUTES = 30;

async function calcEstimatedWait(tenantId, position) {
  const result = await db('staff')
    .where({ tenant_id: tenantId, is_active: true, is_bookable: true })
    .avg('slot_duration as avg_duration')
    .first();
  const avgDuration = (result && result.avg_duration) ? Math.round(result.avg_duration) : DEFAULT_SERVICE_MINUTES;
  return position * avgDuration;
}

async function getTenant(slug) {
  return db('tenants')
    .where('slug', slug)
    .whereIn('status', ['active', 'trial'])
    .first();
}

// GET /queue/:slug — Public queue join page
router.get('/:slug', async (req, res, next) => {
  try {
    const tenant = await getTenant(req.params.slug);
    if (!tenant) {
      return res.status(404).render('errors/404', { message: 'Business not found.', user: null, tenant: null });
    }

    const waitingCount = await db('walkin_queue')
      .where({ tenant_id: tenant.id })
      .whereIn('status', ['waiting', 'serving'])
      .count('id as count')
      .first();

    const queueLength = waitingCount ? parseInt(waitingCount.count) : 0;
    const nextPosition = queueLength + 1;
    const estimatedWait = await calcEstimatedWait(tenant.id, nextPosition);

    const staffList = await db('staff')
      .where({ tenant_id: tenant.id, is_active: true, is_bookable: true })
      .orderBy('first_name');

    const services = await db('services')
      .where({ tenant_id: tenant.id, is_active: true })
      .orderBy('name');

    res.render('queue/public', {
      layout: false,
      title: `Walk-In Queue — ${tenant.name}`,
      tenant,
      queueLength,
      estimatedWait,
      staffList,
      services,
      joinedEntry: null
    });
  } catch (err) {
    next(err);
  }
});

// POST /queue/:slug/join — Client joins the queue
router.post('/:slug/join', async (req, res, next) => {
  try {
    const tenant = await getTenant(req.params.slug);
    if (!tenant) {
      return res.status(404).render('errors/404', { message: 'Business not found.', user: null, tenant: null });
    }

    const { customer_name, customer_phone, service_name, staff_id } = req.body;

    if (!customer_name || !customer_name.trim()) {
      return res.redirect(`/queue/${req.params.slug}?error=name_required`);
    }

    // Get next position
    const maxResult = await db('walkin_queue')
      .where({ tenant_id: tenant.id })
      .whereIn('status', ['waiting', 'serving'])
      .max('position as max_pos')
      .first();

    const position = (maxResult && maxResult.max_pos) ? maxResult.max_pos + 1 : 1;
    const estimated_wait_minutes = await calcEstimatedWait(tenant.id, position);

    const [entryId] = await db('walkin_queue').insert({
      tenant_id: tenant.id,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone ? customer_phone.trim() : null,
      service_name: service_name ? service_name.trim() : null,
      staff_id: staff_id ? parseInt(staff_id) : null,
      position,
      estimated_wait_minutes,
      status: 'waiting',
      checked_in_at: new Date()
    });

    res.redirect(`/queue/${req.params.slug}/status/${entryId}`);
  } catch (err) {
    next(err);
  }
});

// GET /queue/:slug/status/:id — Client status page
router.get('/:slug/status/:id', async (req, res, next) => {
  try {
    const tenant = await getTenant(req.params.slug);
    if (!tenant) {
      return res.status(404).render('errors/404', { message: 'Business not found.', user: null, tenant: null });
    }

    const entry = await db('walkin_queue')
      .leftJoin('staff', 'walkin_queue.staff_id', 'staff.id')
      .select(
        'walkin_queue.*',
        db.raw("CONCAT(COALESCE(staff.display_name, CONCAT(staff.first_name, ' ', staff.last_name)), '') as staff_name")
      )
      .where({ 'walkin_queue.id': req.params.id, 'walkin_queue.tenant_id': tenant.id })
      .first();

    if (!entry) {
      return res.status(404).render('errors/404', { message: 'Queue entry not found.', user: null, tenant: null });
    }

    // Count how many are ahead of this person
    let aheadCount = 0;
    if (entry.status === 'waiting') {
      const ahead = await db('walkin_queue')
        .where({ tenant_id: tenant.id, status: 'waiting' })
        .where('position', '<', entry.position)
        .count('id as count')
        .first();
      aheadCount = ahead ? parseInt(ahead.count) : 0;
    }

    // Recalculate wait based on current position
    const currentWait = entry.status === 'waiting'
      ? await calcEstimatedWait(tenant.id, aheadCount + 1)
      : 0;

    res.render('queue/status', {
      layout: false,
      title: `Your Queue Status — ${tenant.name}`,
      tenant,
      entry,
      aheadCount,
      currentWait
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
