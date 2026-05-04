const express = require('express');
const passport = require('passport');
const router = express.Router();

// GET /admin/login
router.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/admin/dashboard');
  }
  res.render('admin/login', {
    layout: false,
    title: 'Admin Login',
    user: null,
    tenant: null,
    flash: {
      error: req.flash('error'),
      success: req.flash('success')
    }
  });
});

// POST /admin/login
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.flash('error', info?.message || 'Invalid credentials.');
      return res.redirect('/admin/login');
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      const returnTo = req.session.returnTo || '/admin/dashboard';
      delete req.session.returnTo;
      res.redirect(returnTo);
    });
  })(req, res, next);
});

// GET /admin/logout
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.flash('success', 'You have been logged out.');
    res.redirect('/admin/login');
  });
});

module.exports = router;
