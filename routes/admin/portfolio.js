const express = require('express');
const db = require('../../config/database');
const upload = require('../../config/upload');
const { getUploadUrl } = require('../../config/upload');
const router = express.Router();

// GET /admin/portfolio
router.get('/portfolio', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const isOwner = req.user.role === 'owner';

    // Owners see all staff; contributors see only their own
    let staffQuery = db('staff')
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('sort_order')
      .orderBy('first_name');

    if (!isOwner) {
      // Find the staff record linked to this user
      const linkedStaff = await db('users')
        .where('id', req.user.id)
        .select('staff_id')
        .first();
      if (linkedStaff && linkedStaff.staff_id) {
        staffQuery = staffQuery.where('staff.id', linkedStaff.staff_id);
      } else {
        staffQuery = staffQuery.where(db.raw('1 = 0')); // no staff
      }
    }

    const staffList = await staffQuery;

    const services = await db('services')
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('name');

    // Load photos grouped by staff
    const staffIds = staffList.map(s => s.id);
    const photos = staffIds.length
      ? await db('portfolio_photos')
          .leftJoin('services', 'portfolio_photos.service_id', 'services.id')
          .whereIn('portfolio_photos.staff_id', staffIds)
          .where('portfolio_photos.tenant_id', tenantId)
          .where('portfolio_photos.is_active', true)
          .orderBy('portfolio_photos.sort_order')
          .orderBy('portfolio_photos.created_at', 'desc')
          .select(
            'portfolio_photos.*',
            'services.name as service_name'
          )
      : [];

    // Group photos by staff_id
    const photosByStaff = {};
    photos.forEach(p => {
      if (!photosByStaff[p.staff_id]) photosByStaff[p.staff_id] = [];
      photosByStaff[p.staff_id].push(p);
    });

    // For contributor: pre-select their own staff_id in the upload form
    let myStaffId = null;
    if (!isOwner && staffList.length === 1) {
      myStaffId = staffList[0].id;
    }

    res.render('admin/portfolio', {
      title: 'Portfolio',
      user: req.user,
      tenant: req.tenant,
      staffList,
      services,
      photosByStaff,
      myStaffId,
      isOwner
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/portfolio/upload
router.post('/portfolio/upload', upload.single('photo'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const isOwner = req.user.role === 'owner';
    let { staff_id, service_id, caption } = req.body;

    if (!req.file) {
      req.flash('error', 'Please select a photo to upload.');
      return res.redirect('/admin/portfolio');
    }

    // Contributors can only upload for their own staff profile
    if (!isOwner) {
      const linkedStaff = await db('users')
        .where('id', req.user.id)
        .select('staff_id')
        .first();
      if (!linkedStaff || !linkedStaff.staff_id) {
        req.flash('error', 'No staff profile linked to your account.');
        return res.redirect('/admin/portfolio');
      }
      staff_id = linkedStaff.staff_id;
    }

    if (!staff_id) {
      req.flash('error', 'Please select a staff member.');
      return res.redirect('/admin/portfolio');
    }

    // Verify the staff member belongs to this tenant
    const staffMember = await db('staff')
      .where({ id: staff_id, tenant_id: tenantId })
      .first();
    if (!staffMember) {
      req.flash('error', 'Staff member not found.');
      return res.redirect('/admin/portfolio');
    }

    const photoUrl = getUploadUrl(req.file);

    await db('portfolio_photos').insert({
      tenant_id: tenantId,
      staff_id: parseInt(staff_id),
      service_id: service_id ? parseInt(service_id) : null,
      photo_url: photoUrl,
      caption: caption ? caption.trim() : null,
      is_active: true,
      sort_order: 0
    });

    req.flash('success', 'Photo uploaded successfully.');
    res.redirect('/admin/portfolio');
  } catch (err) {
    next(err);
  }
});

// POST /admin/portfolio/:id/delete
router.post('/portfolio/:id/delete', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const isOwner = req.user.role === 'owner';

    const photo = await db('portfolio_photos')
      .where({ id: req.params.id, tenant_id: tenantId })
      .first();

    if (!photo) {
      req.flash('error', 'Photo not found.');
      return res.redirect('/admin/portfolio');
    }

    // Contributors can only delete their own photos
    if (!isOwner) {
      const linkedStaff = await db('users')
        .where('id', req.user.id)
        .select('staff_id')
        .first();
      if (!linkedStaff || linkedStaff.staff_id !== photo.staff_id) {
        req.flash('error', 'Permission denied.');
        return res.redirect('/admin/portfolio');
      }
    }

    await db('portfolio_photos')
      .where({ id: req.params.id, tenant_id: tenantId })
      .update({ is_active: false });

    req.flash('success', 'Photo removed.');
    res.redirect('/admin/portfolio');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
