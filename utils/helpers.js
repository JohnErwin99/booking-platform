/**
 * Ported from barbershop-booking server.js and extended for multi-tenant use.
 */

/** Convert "HH:MM" or "HH:MM:SS" to total minutes since midnight */
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/** Convert total minutes to "HH:MM" (24h format) */
function minutesToHHMM(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** Format "HH:MM" as "9:00 AM" style label */
function formatTimeLabel(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

/** Format price in cents to display string (e.g., 4000 -> "$40.00") */
function formatPrice(cents, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(cents / 100);
}

/** Format date as "Mon, Jan 5, 2026" */
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
}

/** Generate a URL-safe slug from a string */
function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Generate a random hex token */
function generateToken(length = 32) {
  const crypto = require('crypto');
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Check if two time ranges overlap.
 * Each range is { start: minutes, end: minutes }
 */
function timesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

module.exports = {
  timeToMinutes,
  minutesToHHMM,
  formatTimeLabel,
  formatPrice,
  formatDate,
  slugify,
  generateToken,
  timesOverlap
};
