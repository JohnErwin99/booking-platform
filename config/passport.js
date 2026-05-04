const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const db = require('./database');

// Admin/staff login strategy
passport.use('local', new LocalStrategy(
  { usernameField: 'email', passwordField: 'password' },
  async (email, password, done) => {
    try {
      const user = await db('users')
        .where('email', email.toLowerCase().trim())
        .where('is_active', true)
        .first();

      if (!user) {
        return done(null, false, { message: 'Invalid email or password.' });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return done(null, false, { message: 'Invalid email or password.' });
      }

      // Update last login
      await db('users').where('id', user.id).update({ last_login_at: db.fn.now() });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Serialize: store user id in session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize: fetch full user from DB
passport.deserializeUser(async (id, done) => {
  try {
    const user = await db('users')
      .join('tenants', 'users.tenant_id', 'tenants.id')
      .select(
        'users.*',
        'tenants.name as tenant_name',
        'tenants.slug as tenant_slug',
        'tenants.status as tenant_status'
      )
      .where('users.id', id)
      .first();

    done(null, user || false);
  } catch (err) {
    done(err);
  }
});

module.exports = passport;
