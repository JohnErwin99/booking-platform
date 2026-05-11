const { google } = require('googleapis');
const db = require('../config/database');

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

/**
 * Create an OAuth2 client with credentials from env.
 */
function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.BASE_URL}/admin/calendar/callback`
  );
}

/**
 * Generate the Google OAuth consent URL.
 * state = JSON string with tenant_id and user_id
 */
function getAuthUrl(state) {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

/**
 * Exchange authorization code for tokens and save to DB.
 */
async function handleCallback(code, tenantId, userId) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Get user's primary calendar email
  const calendar = google.calendar({ version: 'v3', auth: client });
  const calList = await calendar.calendarList.get({ calendarId: 'primary' });
  const calendarId = calList.data.id || 'primary';

  // Find the staff record for this user
  const user = await db('users').where('id', userId).first();
  const staff = await db('staff').where({
    tenant_id: tenantId,
    email: user.email,
  }).first();

  const staffId = staff ? staff.id : null;

  // Upsert calendar_sync record
  const existing = await db('calendar_sync').where({ tenant_id: tenantId, staff_id: staffId }).first();

  const syncData = {
    tenant_id: tenantId,
    staff_id: staffId,
    provider: 'google',
    calendar_id: calendarId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || (existing ? existing.refresh_token : null),
    token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    is_active: true,
    last_synced_at: new Date(),
  };

  if (existing) {
    await db('calendar_sync').where('id', existing.id).update(syncData);
  } else {
    await db('calendar_sync').insert(syncData);
  }

  return calendarId;
}

/**
 * Get an authenticated calendar client for a tenant/staff.
 * Refreshes token if expired.
 */
async function getCalendarClient(tenantId, staffId = null) {
  const query = db('calendar_sync').where({ tenant_id: tenantId, is_active: true });
  if (staffId) query.where('staff_id', staffId);
  else query.whereNull('staff_id');

  const sync = await query.first();
  if (!sync) return null;

  const client = getOAuth2Client();
  client.setCredentials({
    access_token: sync.access_token,
    refresh_token: sync.refresh_token,
    expiry_date: sync.token_expires_at ? new Date(sync.token_expires_at).getTime() : null,
  });

  // Refresh token if expired
  if (sync.token_expires_at && new Date(sync.token_expires_at) < new Date()) {
    try {
      const { credentials } = await client.refreshAccessToken();
      await db('calendar_sync').where('id', sync.id).update({
        access_token: credentials.access_token,
        token_expires_at: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      });
      client.setCredentials(credentials);
    } catch (err) {
      console.error('Google token refresh failed:', err.message);
      await db('calendar_sync').where('id', sync.id).update({ is_active: false });
      return null;
    }
  }

  return { client, sync };
}

/**
 * Create a Google Calendar event for a booking.
 */
async function createEvent(booking, tenant) {
  // Try staff-specific sync first, then tenant-level
  let result = await getCalendarClient(tenant.id, booking.staff_id);
  if (!result) result = await getCalendarClient(tenant.id, null);
  if (!result) return null;

  const { client, sync } = result;
  const calendar = google.calendar({ version: 'v3', auth: client });

  const dateStr = booking.booking_date instanceof Date
    ? booking.booking_date.toISOString().slice(0, 10)
    : String(booking.booking_date);

  const timezone = tenant.timezone || 'America/Montreal';

  const event = {
    summary: `${booking.service_name} — ${booking.customer_name}`,
    description: [
      `Customer: ${booking.customer_name}`,
      booking.customer_email ? `Email: ${booking.customer_email}` : '',
      booking.customer_phone ? `Phone: ${booking.customer_phone}` : '',
      `Staff: ${booking.staff_name}`,
      `Booked via Bookwize`,
    ].filter(Boolean).join('\n'),
    start: {
      dateTime: `${dateStr}T${booking.start_time}`,
      timeZone: timezone,
    },
    end: {
      dateTime: `${dateStr}T${booking.end_time}`,
      timeZone: timezone,
    },
    reminders: { useDefault: true },
  };

  try {
    const res = await calendar.events.insert({
      calendarId: sync.calendar_id || 'primary',
      resource: event,
    });

    // Store the Google event ID on the booking for future updates/deletes
    await db('bookings').where('id', booking.id).update({
      google_event_id: res.data.id,
    });

    return res.data;
  } catch (err) {
    console.error('Google Calendar create event failed:', err.message);
    return null;
  }
}

/**
 * Delete a Google Calendar event when a booking is cancelled.
 */
async function deleteEvent(booking, tenant) {
  if (!booking.google_event_id) return;

  let result = await getCalendarClient(tenant.id, booking.staff_id);
  if (!result) result = await getCalendarClient(tenant.id, null);
  if (!result) return;

  const { client, sync } = result;
  const calendar = google.calendar({ version: 'v3', auth: client });

  try {
    await calendar.events.delete({
      calendarId: sync.calendar_id || 'primary',
      eventId: booking.google_event_id,
    });
  } catch (err) {
    console.error('Google Calendar delete event failed:', err.message);
  }
}

/**
 * Disconnect Google Calendar for a tenant.
 */
async function disconnect(tenantId, staffId = null) {
  const query = db('calendar_sync').where({ tenant_id: tenantId, provider: 'google' });
  if (staffId) query.where('staff_id', staffId);
  else query.whereNull('staff_id');

  await query.update({ is_active: false, access_token: null, refresh_token: null });
}

/**
 * Check if Google Calendar is connected for a tenant.
 */
async function isConnected(tenantId, staffId = null) {
  const query = db('calendar_sync').where({ tenant_id: tenantId, provider: 'google', is_active: true });
  if (staffId) query.where('staff_id', staffId);
  else query.whereNull('staff_id');

  const sync = await query.first();
  return sync ? { connected: true, calendarId: sync.calendar_id, lastSynced: sync.last_synced_at } : { connected: false };
}

module.exports = {
  getAuthUrl,
  handleCallback,
  createEvent,
  deleteEvent,
  disconnect,
  isConnected,
};
