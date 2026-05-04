const db = require('../config/database');

/**
 * Resolves tenant from:
 * 1. Custom domain (Host header)
 * 2. URL slug (/book/:slug, /api/:slug/*)
 * 3. Authenticated user session
 */
async function tenantResolver(req, res, next) {
  try {
    let tenant = null;

    // 1. Check custom domain
    const host = req.hostname;
    if (host && host !== 'localhost' && !host.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      tenant = await db('tenants')
        .where('custom_domain', host)
        .where('status', 'active')
        .first();
    }

    // 2. Check URL slug (for /book/:slug and /api/:slug routes)
    if (!tenant && req.params.slug) {
      tenant = await db('tenants')
        .where('slug', req.params.slug)
        .first();
    }

    // 3. Check session (for admin routes)
    if (!tenant && req.user && req.user.tenant_id) {
      tenant = await db('tenants')
        .where('id', req.user.tenant_id)
        .first();
    }

    if (tenant) {
      req.tenant = tenant;
      req.tenantId = tenant.id;
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Requires a resolved tenant. Returns 404 if no tenant found.
 */
function requireTenant(req, res, next) {
  if (!req.tenant) {
    return res.status(404).render('errors/404', {
      message: 'Business not found.'
    });
  }
  if (req.tenant.status === 'suspended') {
    return res.status(403).render('errors/suspended', {
      message: 'This business account has been suspended.'
    });
  }
  next();
}

module.exports = { tenantResolver, requireTenant };
