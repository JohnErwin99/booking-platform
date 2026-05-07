const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../config/database');
const { slugify } = require('../../utils/helpers');
const { sendEmail } = require('../../services/emailService');
const router = express.Router();

// Superadmin auth check
function requireSuperadmin(req, res, next) {
  // Superadmin can be either a user with a special flag or env-based auth
  if (req.session.isSuperadmin) {
    return next();
  }
  res.redirect('/superadmin/login');
}

// GET /superadmin/login
router.get('/login', (req, res) => {
  if (req.session.isSuperadmin) {
    return res.redirect('/superadmin/tenants');
  }
  res.render('superadmin/login', {
    layout: false,
    title: 'Platform Admin Login',
    user: null,
    tenant: null,
    flash: {
      error: req.flash('error'),
      success: req.flash('success')
    }
  });
});

// POST /superadmin/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (email === process.env.SUPERADMIN_EMAIL && password === process.env.SUPERADMIN_PASSWORD) {
    req.session.isSuperadmin = true;
    return res.redirect('/superadmin/tenants');
  }
  req.flash('error', 'Invalid credentials.');
  res.redirect('/superadmin/login');
});

// GET /superadmin/logout
router.get('/logout', (req, res) => {
  req.session.isSuperadmin = false;
  res.redirect('/superadmin/login');
});

// GET /superadmin/tenants
router.get('/tenants', requireSuperadmin, async (req, res, next) => {
  try {
    const tenants = await db('tenants').orderBy('created_at', 'desc');

    // Get booking counts per tenant
    const counts = await db('bookings')
      .groupBy('tenant_id')
      .select('tenant_id')
      .count('* as booking_count');
    const countMap = {};
    counts.forEach(c => { countMap[c.tenant_id] = c.booking_count; });

    res.render('superadmin/tenants', {
    layout: false,
      title: 'Manage Tenants',
      user: null,
      tenant: null,
      tenants,
      countMap,
      flash: {
        error: req.flash('error'),
        success: req.flash('success')
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /superadmin/tenants/new
router.get('/tenants/new', requireSuperadmin, (req, res) => {
  res.render('superadmin/tenant-form', {
    layout: false,
    title: 'New Tenant',
    user: null,
    tenant: null,
    editTenant: null,
    flash: {
      error: req.flash('error'),
      success: req.flash('success')
    }
  });
});

// POST /superadmin/tenants
router.post('/tenants', requireSuperadmin, async (req, res, next) => {
  try {
    const { business_name, owner_email, owner_password, owner_first_name, owner_last_name,
            phone, timezone, currency } = req.body;

    const slug = slugify(business_name);

    // Check slug uniqueness
    const existing = await db('tenants').where('slug', slug).first();
    if (existing) {
      req.flash('error', `Slug "${slug}" already taken. Choose a different business name.`);
      return res.redirect('/superadmin/tenants/new');
    }

    // Create tenant
    const [tenantId] = await db('tenants').insert({
      name: business_name,
      slug,
      email: owner_email,
      phone: phone || null,
      timezone: timezone || 'America/New_York',
      currency: currency || 'USD',
      status: 'active'
    });

    // Create default location
    const [locationId] = await db('locations').insert({
      tenant_id: tenantId,
      name: 'Main Location',
      is_default: true
    });

    // Create owner user
    const passwordHash = await bcrypt.hash(owner_password, 12);
    await db('users').insert({
      tenant_id: tenantId,
      email: owner_email.toLowerCase().trim(),
      password_hash: passwordHash,
      first_name: owner_first_name || 'Owner',
      last_name: owner_last_name || '',
      role: 'owner'
    });

    // Seed default business hours (Mon-Sat 9:00-18:00)
    const defaultHours = [];
    for (let day = 0; day < 7; day++) {
      if (day === 0) continue; // Skip Sunday
      defaultHours.push({
        tenant_id: tenantId,
        location_id: locationId,
        staff_id: null,
        weekday: day,
        open_at: '09:00:00',
        close_at: '18:00:00'
      });
    }
    await db('business_hours').insert(defaultHours);

    // Seed default notification templates
    await db('notification_templates').insert([
      {
        tenant_id: tenantId,
        type: 'booking_confirmation',
        channel: 'email',
        subject: 'Booking Confirmed - {{business_name}}',
        body_template: 'Hi {{customer_name}},\n\nYour appointment has been confirmed!\n\nService: {{service_name}}\nDate: {{booking_date}}\nTime: {{booking_time}}\nWith: {{staff_name}}\n\nIf you need to make changes, click here: {{manage_link}}\n\nSee you soon!\n{{business_name}}'
      },
      {
        tenant_id: tenantId,
        type: 'reminder_email',
        channel: 'email',
        subject: 'Reminder: Your appointment tomorrow - {{business_name}}',
        body_template: 'Hi {{customer_name}},\n\nThis is a friendly reminder about your appointment tomorrow.\n\nService: {{service_name}}\nDate: {{booking_date}}\nTime: {{booking_time}}\nWith: {{staff_name}}\n\nNeed to reschedule? {{manage_link}}\n\nSee you soon!\n{{business_name}}'
      },
      {
        tenant_id: tenantId,
        type: 'booking_cancellation',
        channel: 'email',
        subject: 'Booking Cancelled - {{business_name}}',
        body_template: 'Hi {{customer_name}},\n\nYour appointment on {{booking_date}} at {{booking_time}} has been cancelled.\n\nTo book a new appointment, visit: {{booking_link}}\n\n{{business_name}}'
      }
    ]);

    // Send welcome email to the new business owner
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    sendEmail({
      to: owner_email,
      subject: `Welcome to Bookwize — Your account is ready!`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1e293b;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="margin: 0; color: #F28C38;">Bookwize</h2>
          </div>
          <div style="background: #f8fafc; border-radius: 12px; padding: 24px; line-height: 1.7;">
            <p style="margin: 0 0 12px;">Hi ${owner_first_name || 'there'},</p>
            <p style="margin: 0 0 12px;">Your business <strong>${business_name}</strong> has been set up on Bookwize!</p>
            <p style="margin: 0 0 12px;">Here are your login details:</p>
            <p style="margin: 0 0 6px;"><strong>Admin Dashboard:</strong> <a href="${baseUrl}/admin/login">${baseUrl}/admin/login</a></p>
            <p style="margin: 0 0 6px;"><strong>Email:</strong> ${owner_email}</p>
            <p style="margin: 0 0 6px;"><strong>Password:</strong> ${owner_password}</p>
            <p style="margin: 0 0 12px;"><strong>Booking Page:</strong> <a href="${baseUrl}/book/${slug}">${baseUrl}/book/${slug}</a></p>
            <p style="margin: 0 0 12px;">We recommend changing your password after your first login.</p>
            <p style="margin: 0;">Welcome aboard!<br>The Bookwize Team</p>
          </div>
          <p style="text-align: center; margin-top: 24px; font-size: 13px; color: #94a3b8;">
            Sent by Bookwize
          </p>
        </div>`,
      text: `Hi ${owner_first_name || 'there'},\n\nYour business "${business_name}" has been set up on Bookwize!\n\nAdmin Dashboard: ${baseUrl}/admin/login\nEmail: ${owner_email}\nPassword: ${owner_password}\nBooking Page: ${baseUrl}/book/${slug}\n\nWe recommend changing your password after your first login.\n\nWelcome aboard!\nThe Bookwize Team`
    }).catch(err => console.error('Welcome email failed:', err.message));

    req.flash('success', `Tenant "${business_name}" created. A welcome email with login credentials has been sent to ${owner_email}. Ask them to check their inbox or spam folder.`);
    res.redirect('/superadmin/tenants');
  } catch (err) {
    next(err);
  }
});

// GET /superadmin/tenants/:id/edit
router.get('/tenants/:id/edit', requireSuperadmin, async (req, res, next) => {
  try {
    const editTenant = await db('tenants').where('id', req.params.id).first();
    if (!editTenant) {
      req.flash('error', 'Tenant not found.');
      return res.redirect('/superadmin/tenants');
    }
    res.render('superadmin/tenant-form', {
    layout: false,
      title: 'Edit Tenant',
      user: null,
      tenant: null,
      editTenant,
      flash: {
        error: req.flash('error'),
        success: req.flash('success')
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /superadmin/tenants/:id
router.post('/tenants/:id', requireSuperadmin, async (req, res, next) => {
  try {
    const { business_name, status, phone, timezone, currency } = req.body;

    await db('tenants').where('id', req.params.id).update({
      name: business_name,
      status,
      phone: phone || null,
      timezone: timezone || 'America/New_York',
      currency: currency || 'USD'
    });

    req.flash('success', 'Tenant updated.');
    res.redirect('/superadmin/tenants');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
