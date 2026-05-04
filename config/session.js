const session = require('express-session');
const { ConnectSessionKnexStore } = require('connect-session-knex');
const db = require('./database');

const store = new ConnectSessionKnexStore({
  knex: db,
  tablename: 'sessions',
  createtable: false
});

const sessionConfig = {
  store,
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
};

module.exports = sessionConfig;
