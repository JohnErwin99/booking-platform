const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../config/database');
const upload = require('../../config/upload');
const { getUploadUrl } = require('../../config/upload');
const router = express.Router();

// GET /admin/profile — accessible to all roles
router.get('/profile', async (req, res, next) => {
  try {
    const user = req.user;
    const staffMember = user.staff_id
      ? await db('staff').where('id', user.staff_id).first()
      : null;

    res.render('admin/profile', {
      title: 'My Profile',
      user,
      tenant: req.tenant,
      staffMember
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/profile/info — update personal info on staff record
router.post('/profile/info', async (req, res, next) => {
  try {
    const user = req.user;
    const { display_name, phone, title, bio, slot_duration, buffer_before, buffer_after } = req.body;

    if (!user.staff_id) {
      req.flash('error', 'No staff profile linked to your account.');
      return res.redirect('/admin/profile');
    }

    await db('staff').where('id', user.staff_id).update({
      display_name: display_name || null,
      phone: phone || null,
      title: title || null,
      bio: bio || null,
      slot_duration: slot_duration ? parseInt(slot_duration) : 30,
      buffer_before: buffer_before ? parseInt(buffer_before) : 0,
      buffer_after: buffer_after ? parseInt(buffer_after) : 0
    });

    req.flash('success', 'Profile updated.');
    res.redirect('/admin/profile');
  } catch (err) {
    next(err);
  }
});

// POST /admin/profile/photo — upload profile photo
router.post('/profile/photo', upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) {
      req.flash('error', 'Please select an image.');
      return res.redirect('/admin/profile');
    }
    const photoUrl = getUploadUrl(req.file);
    await db('users').where('id', req.user.id).update({ photo_url: photoUrl });

    // Sync to staff record
    if (req.user.staff_id) {
      await db('staff').where('id', req.user.staff_id).update({ photo_url: photoUrl });
    }

    req.flash('success', 'Profile photo updated.');
    res.redirect('/admin/profile');
  } catch (err) {
    next(err);
  }
});

// POST /admin/profile/password — change own password
router.post('/profile/password', async (req, res, next) => {
  try {
    const { current_password, new_password, confirm_password } = req.body;

    if (!current_password || !new_password || !confirm_password) {
      req.flash('error', 'All password fields are required.');
      return res.redirect('/admin/profile');
    }

    if (new_password !== confirm_password) {
      req.flash('error', 'New passwords do not match.');
      return res.redirect('/admin/profile');
    }

    if (new_password.length < 6) {
      req.flash('error', 'Password must be at least 6 characters.');
      return res.redirect('/admin/profile');
    }

    const user = await db('users').where('id', req.user.id).first();
    const valid = await bcrypt.compare(current_password, user.password_hash);

    if (!valid) {
      req.flash('error', 'Current password is incorrect.');
      return res.redirect('/admin/profile');
    }

    const hash = await bcrypt.hash(new_password, 12);
    await db('users').where('id', req.user.id).update({ password_hash: hash });

    req.flash('success', 'Password changed successfully.');
    res.redirect('/admin/profile');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
