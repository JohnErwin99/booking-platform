/**
 * Requires authenticated user. Redirects to login if not authenticated.
 */
function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  req.flash('error', 'Please log in to continue.');
  res.redirect('/admin/login');
}

module.exports = requireAuth;
