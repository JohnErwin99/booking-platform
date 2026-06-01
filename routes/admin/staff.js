const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../config/database');
const upload = require('../../config/upload');
const { sendEmail } = require('../../services/emailService');
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

    // Get linked user accounts for each staff member
    const userAccounts = await db('users')
      .where('tenant_id', tenantId)
      .select('id', 'email', 'role', 'staff_id');
    const userMap = {};
    userAccounts.forEach(u => { if (u.staff_id) userMap[u.staff_id] = u; });

    res.render('admin/staff/index', {
      title: 'Staff',
      user: req.user,
      tenant: req.tenant,
      staffList,
      serviceCountMap,
      userMap
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/staff/new
router.get('/staff/new', requireRole('owner'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const locations = await db('locations').where({ tenant_id: tenantId, is_active: true });
    const services = await db('services').where({ tenant_id: tenantId, is_active: true });

    res.render('admin/staff/form', {
      title: 'Add Staff',
      user: req.user,
      tenant: req.tenant,
      staffMember: null,
      staffUser: null,
      locations,
      services,
      assignedServices: [],
      assignedServiceOverrides: []
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/staff
router.post('/staff', requireRole('owner'), upload.single('photo'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { first_name, last_name, display_name, email, phone, title, bio,
            location_id, commission_rate, slot_duration, buffer_before, buffer_after,
            role, password, services: serviceIds } = req.body;

    // Email is required for login
    if (!email) {
      req.flash('error', 'Email is required to create a login account.');
      return res.redirect('/admin/staff/new');
    }

    if (!password || password.length < 6) {
      req.flash('error', 'Password must be at least 6 characters.');
      return res.redirect('/admin/staff/new');
    }

    // Check if email already exists for this tenant
    const existingUser = await db('users')
      .where({ tenant_id: tenantId, email: email.toLowerCase().trim() }).first();
    if (existingUser) {
      req.flash('error', 'A user with this email already exists in your business.');
      return res.redirect('/admin/staff/new');
    }

    const { getUploadUrl } = require('../../config/upload');
    const photoUrl = req.file ? getUploadUrl(req.file) : null;

    const [staffId] = await db('staff').insert({
      tenant_id: tenantId,
      location_id: location_id || null,
      first_name, last_name,
      display_name: display_name || `${first_name} ${last_name}`,
      email: email || null,
      phone: phone || null,
      photo_url: photoUrl,
      title: title || null,
      bio: bio || null,
      commission_rate: commission_rate || null,
      slot_duration: slot_duration || 30,
      buffer_before: buffer_before || 0,
      buffer_after: buffer_after || 0
    });

    // Create user account for login
    const passwordHash = await bcrypt.hash(password, 12);
    await db('users').insert({
      tenant_id: tenantId,
      staff_id: staffId,
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      first_name,
      last_name,
      role: role || 'contributor'
    });

    // Assign services with optional price/duration overrides
    if (serviceIds && serviceIds.length) {
      const ids = Array.isArray(serviceIds) ? serviceIds : [serviceIds];
      const rows = ids.map(sid => {
        const priceVal = req.body[`price_override_${sid}`];
        const durationVal = req.body[`duration_override_${sid}`];
        return {
          tenant_id: tenantId,
          staff_id: staffId,
          service_id: parseInt(sid),
          price_override_cents: priceVal ? Math.round(parseFloat(priceVal) * 100) : null,
          duration_override: durationVal ? parseInt(durationVal) : null
        };
      });
      await db('staff_services').insert(rows);
    }

    // Send welcome email with login credentials
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const tenant = await db('tenants').where('id', tenantId).first();
    sendEmail({
      to: email,
      subject: `Your ${tenant.name} account is ready — Bookwize`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
          <h2 style="text-align:center;color:#F28C38">${tenant.name}</h2>
          <div style="background:#f8fafc;border-radius:12px;padding:24px;line-height:1.7">
            <p>Hi ${first_name},</p>
            <p>An account has been created for you on <strong>${tenant.name}</strong>.</p>
            <p><strong>Login:</strong> <a href="${baseUrl}/admin/login">${baseUrl}/admin/login</a></p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Password:</strong> ${password}</p>
            <p><strong>Role:</strong> ${role || 'contributor'}</p>
            <p>We recommend changing your password after your first login.</p>
          </div>
          <p style="text-align:center;margin-top:24px;font-size:13px;color:#94a3b8">Sent by ${tenant.name} via Bookwize</p>
        </div>`,
      text: `Hi ${first_name},\n\nAn account has been created for you on ${tenant.name}.\n\nLogin: ${baseUrl}/admin/login\nEmail: ${email}\nPassword: ${password}\nRole: ${role || 'contributor'}\n\nPlease change your password after first login.`
    }).catch(err => console.error('Staff welcome email failed:', err.message));

    req.flash('success', `Staff member added. A welcome email with login credentials has been sent to ${email}. Please ask them to check their inbox or spam folder.`);
    res.redirect('/admin/staff');
  } catch (err) {
    next(err);
  }
});

// GET /admin/staff/:id/edit
router.get('/staff/:id/edit', requireRole('owner'), async (req, res, next) => {
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
    const assignedServiceOverrides = await db('staff_services')
      .where({ tenant_id: tenantId, staff_id: staffMember.id });
    const assignedServices = assignedServiceOverrides.map(s => s.service_id);
    const staffUser = await db('users')
      .where({ tenant_id: tenantId, staff_id: staffMember.id })
      .first();

    res.render('admin/staff/form', {
      title: 'Edit Staff',
      user: req.user,
      tenant: req.tenant,
      staffMember,
      staffUser,
      locations,
      services,
      assignedServices,
      assignedServiceOverrides
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/staff/:id
router.post('/staff/:id', requireRole('owner'), upload.single('photo'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { id } = req.params;
    const { first_name, last_name, display_name, email, phone, title, bio,
            location_id, commission_rate, slot_duration, buffer_before, buffer_after,
            is_active, role, password, services: serviceIds } = req.body;

    const staffUpdate = {
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
    };
    const { getUploadUrl: getUrl } = require('../../config/upload');
    if (req.file) staffUpdate.photo_url = getUrl(req.file);
    await db('staff').where({ id, tenant_id: tenantId }).update(staffUpdate);

    // Reassign services with optional price/duration overrides
    await db('staff_services').where({ staff_id: id, tenant_id: tenantId }).del();
    if (serviceIds && serviceIds.length) {
      const ids = Array.isArray(serviceIds) ? serviceIds : [serviceIds];
      const rows = ids.map(sid => {
        const priceVal = req.body[`price_override_${sid}`];
        const durationVal = req.body[`duration_override_${sid}`];
        return {
          tenant_id: tenantId,
          staff_id: parseInt(id),
          service_id: parseInt(sid),
          price_override_cents: priceVal ? Math.round(parseFloat(priceVal) * 100) : null,
          duration_override: durationVal ? parseInt(durationVal) : null
        };
      });
      await db('staff_services').insert(rows);
    }

    // Update or create linked user account
    if (role && email) {
      const existingUser = await db('users')
        .where({ tenant_id: tenantId, staff_id: id })
        .first();

      if (existingUser) {
        // Update existing user
        const userUpdate = { role, first_name, last_name, email: email.toLowerCase().trim() };
        if (password && password.length >= 6) {
          userUpdate.password_hash = await bcrypt.hash(password, 12);
        }
        await db('users').where('id', existingUser.id).update(userUpdate);
      } else if (password && password.length >= 6) {
        // Create new user for staff that didn't have one
        await db('users').insert({
          tenant_id: tenantId,
          staff_id: parseInt(id),
          email: email.toLowerCase().trim(),
          password_hash: await bcrypt.hash(password, 12),
          first_name,
          last_name,
          role
        });
      }
    }

    req.flash('success', 'Staff member updated.');
    res.redirect('/admin/staff');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
