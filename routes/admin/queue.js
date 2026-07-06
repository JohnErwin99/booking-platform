const express = require('express');
const db = require('../../config/database');
const router = express.Router();

const DEFAULT_SERVICE_MINUTES = 30;

async function calcEstimatedWait(tenantId, position) {
  // Use average slot_duration of active bookable staff, fallback to default
  const result = await db('staff')
    .where({ tenant_id: tenantId, is_active: true, is_bookable: true })
    .avg('slot_duration as avg_duration')
    .first();
  const avgDuration = (result && result.avg_duration) ? Math.round(result.avg_duration) : DEFAULT_SERVICE_MINUTES;
  return position * avgDuration;
}

// GET /admin/queue
router.get('/queue', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;

    const activeEntries = await db('walkin_queue')
      .leftJoin('staff', 'walkin_queue.staff_id', 'staff.id')
      .select(
        'walkin_queue.*',
        db.raw("CONCAT(COALESCE(staff.display_name, CONCAT(staff.first_name, ' ', staff.last_name)), '') as staff_name")
      )
      .where('walkin_queue.tenant_id', tenantId)
      .whereIn('walkin_queue.status', ['waiting', 'serving'])
      .orderBy('walkin_queue.position');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const completedToday = await db('walkin_queue')
      .where({ tenant_id: tenantId, status: 'completed' })
      .where('completed_at', '>=', todayStart)
      .count('id as count')
      .first();

    const staffList = await db('staff')
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('first_name');

    const services = await db('services')
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('name');

    const today = new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    res.render('admin/queue', {
      title: 'Walk-In Queue',
      user: req.user,
      tenant: req.tenant,
      activeEntries,
      completedCount: completedToday ? completedToday.count : 0,
      staffList,
      services,
      today
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/queue/add
router.post('/queue/add', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { customer_name, customer_phone, service_name, staff_id } = req.body;

    if (!customer_name || !customer_name.trim()) {
      req.flash('error', 'Customer name is required.');
      return res.redirect('/admin/queue');
    }

    // Get next position (max of waiting/serving + 1)
    const maxResult = await db('walkin_queue')
      .where({ tenant_id: tenantId })
      .whereIn('status', ['waiting', 'serving'])
      .max('position as max_pos')
      .first();

    const position = (maxResult && maxResult.max_pos) ? maxResult.max_pos + 1 : 1;
    const estimated_wait_minutes = await calcEstimatedWait(tenantId, position);

    await db('walkin_queue').insert({
      tenant_id: tenantId,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone ? customer_phone.trim() : null,
      service_name: service_name ? service_name.trim() : null,
      staff_id: staff_id ? parseInt(staff_id) : null,
      position,
      estimated_wait_minutes,
      status: 'waiting',
      checked_in_at: new Date()
    });

    req.flash('success', `${customer_name.trim()} added to the queue at position ${position}.`);
    res.redirect('/admin/queue');
  } catch (err) {
    next(err);
  }
});

// POST /admin/queue/:id/serve
router.post('/queue/:id/serve', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    const entry = await db('walkin_queue')
      .where({ id, tenant_id: tenantId }).first();

    if (!entry) {
      req.flash('error', 'Queue entry not found.');
      return res.redirect('/admin/queue');
    }

    await db('walkin_queue')
      .where({ id, tenant_id: tenantId })
      .update({ status: 'serving', serving_at: new Date() });

    req.flash('success', `Now serving ${entry.customer_name}.`);
    res.redirect('/admin/queue');
  } catch (err) {
    next(err);
  }
});

// POST /admin/queue/:id/complete
router.post('/queue/:id/complete', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    const entry = await db('walkin_queue')
      .where({ id, tenant_id: tenantId }).first();

    if (!entry) {
      req.flash('error', 'Queue entry not found.');
      return res.redirect('/admin/queue');
    }

    await db('walkin_queue')
      .where({ id, tenant_id: tenantId })
      .update({ status: 'completed', completed_at: new Date() });

    // Shift positions of remaining waiting entries
    await db('walkin_queue')
      .where({ tenant_id: tenantId, status: 'waiting' })
      .where('position', '>', entry.position)
      .decrement('position', 1);

    req.flash('success', `${entry.customer_name} marked as completed.`);
    res.redirect('/admin/queue');
  } catch (err) {
    next(err);
  }
});

// POST /admin/queue/:id/cancel
router.post('/queue/:id/cancel', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;

    const entry = await db('walkin_queue')
      .where({ id, tenant_id: tenantId }).first();

    if (!entry) {
      req.flash('error', 'Queue entry not found.');
      return res.redirect('/admin/queue');
    }

    await db('walkin_queue')
      .where({ id, tenant_id: tenantId })
      .update({ status: 'cancelled' });

    // Shift positions of remaining waiting entries
    await db('walkin_queue')
      .where({ tenant_id: tenantId, status: 'waiting' })
      .where('position', '>', entry.position)
      .decrement('position', 1);

    req.flash('success', `${entry.customer_name} removed from the queue.`);
    res.redirect('/admin/queue');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
