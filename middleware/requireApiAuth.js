const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'bookwize-jwt-secret-change-me';

/**
 * Verifies JWT Bearer token from Authorization header.
 * Attaches req.user (from users table) and req.tenant (from tenants table).
 */
async function requireApiAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired.' });
      }
      return res.status(401).json({ error: 'Invalid token.' });
    }

    // Load user from DB to ensure they still exist and are active
    const user = await db('users')
      .where({ id: decoded.id, is_active: true })
      .first();

    if (!user) {
      return res.status(401).json({ error: 'User not found or deactivated.' });
    }

    // Load tenant
    const tenant = await db('tenants')
      .where('id', user.tenant_id)
      .first();

    if (!tenant) {
      return res.status(401).json({ error: 'Tenant not found.' });
    }

    // Attach to request
    req.user = user;
    req.tenant = tenant;

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireApiAuth;
