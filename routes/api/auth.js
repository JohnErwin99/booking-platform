const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/database');
const requireApiAuth = require('../../middleware/requireApiAuth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'bookwize-jwt-secret-change-me';
const JWT_EXPIRES_IN = '7d';

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await db('users')
      .where('email', email.toLowerCase().trim())
      .where('is_active', true)
      .first();

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Update last login
    await db('users').where('id', user.id).update({ last_login_at: db.fn.now() });

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireApiAuth, async (req, res, next) => {
  try {
    const user = req.user;
    const tenant = req.tenant;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        timezone: tenant.timezone,
        currency: tenant.currency
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
