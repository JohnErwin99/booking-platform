/**
 * Requires the authenticated user to have one of the specified roles.
 * Usage: requireRole('owner', 'manager')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      req.flash('error', 'Please log in to continue.');
      return res.redirect('/admin/login');
    }
    if (!roles.includes(req.user.role)) {
      req.flash('error', 'You do not have permission to access this page.');
      return res.redirect('/admin/dashboard');
    }
    next();
  };
}

module.exports = requireRole;
