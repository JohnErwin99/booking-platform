const db = require('../config/database');
const { sendEmail } = require('./emailService');
const { formatTimeLabel } = require('../utils/helpers');

/**
 * Replace {{placeholders}} in a template string.
 */
function renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

/**
 * Format a date string (YYYY-MM-DD) into a readable label.
 */
function formatDateLabel(dateInput) {
  const str = dateInput instanceof Date
    ? dateInput.toISOString().slice(0, 10)
    : String(dateInput);
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

/**
 * Generate an .ics calendar event string.
 */
function generateICS(booking, tenant) {
  const dateStr = booking.booking_date instanceof Date
    ? booking.booking_date.toISOString().slice(0, 10)
    : String(booking.booking_date);
  const dateClean = dateStr.replace(/-/g, '');
  const [sh, sm] = booking.start_time.split(':');
  const [eh, em] = booking.end_time.split(':');
  const dtStart = `${dateClean}T${sh}${sm}00`;
  const dtEnd = `${dateClean}T${eh}${em}00`;
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `booking-${booking.id}@${tenant.slug}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bookwize//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${booking.service_name} with ${booking.staff_name}`,
    `DESCRIPTION:Booked at ${tenant.name}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

/**
 * Build the template variables from a booking record + tenant.
 */
function buildVars(booking, tenant) {
  return {
    business_name: tenant.name,
    customer_name: booking.customer_name,
    service_name: booking.service_name,
    booking_date: formatDateLabel(booking.booking_date),
    booking_time: formatTimeLabel(booking.start_time),
    staff_name: booking.staff_name,
    manage_link: `${process.env.BASE_URL || 'http://localhost:3000'}/book/${tenant.slug}/manage/${booking.manage_token}`,
    confirm_link: `${process.env.BASE_URL || 'http://localhost:3000'}/book/${tenant.slug}/confirm-attendance/${booking.manage_token}`,
    cancel_link: `${process.env.BASE_URL || 'http://localhost:3000'}/book/${tenant.slug}/cancel/${booking.manage_token}`,
    booking_link: `${process.env.BASE_URL || 'http://localhost:3000'}/book/${tenant.slug}`
  };
}

/**
 * Log a notification attempt to the notification_log table.
 */
async function logNotification({ tenantId, bookingId, customerId, channel, type, recipient, subject, status, error }) {
  try {
    await db('notification_log').insert({
      tenant_id: tenantId,
      booking_id: bookingId,
      customer_id: customerId,
      channel,
      type,
      recipient,
      subject: subject || null,
      status,
      error_message: error || null
    });
  } catch (err) {
    console.error('Failed to log notification:', err.message);
  }
}

/**
 * Send a notification email for a given type (booking_confirmation, booking_cancellation, etc.)
 * Uses the tenant's notification_templates from the DB.
 */
async function sendNotification(booking, tenant, type) {
  if (!process.env.SMTP_USER) return; // skip if email not configured

  try {
    // Fetch the template
    const template = await db('notification_templates')
      .where({ tenant_id: tenant.id, type, channel: 'email', is_active: true })
      .first();

    if (!template) {
      console.log(`No active email template for "${type}" (tenant ${tenant.id})`);
      return;
    }

    const vars = buildVars(booking, tenant);
    const subject = renderTemplate(template.subject, vars);
    const textBody = renderTemplate(template.body_template, vars);

    // Convert plain text to simple HTML
    let bodyHtml = textBody.split('\n').map(line => line.trim() ? `<p style="margin: 0 0 12px;">${line}</p>` : '').join('\n');

    // Convert confirm/cancel links into styled buttons
    if (vars.confirm_link) {
      bodyHtml = bodyHtml.replace(
        new RegExp(`(✅[^:]*:\\s*)${vars.confirm_link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
        `<div style="margin:16px 0;text-align:center"><a href="${vars.confirm_link}" style="display:inline-block;padding:14px 32px;background:#22C55E;color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none">✅ I'll be there</a></div>`
      );
      bodyHtml = bodyHtml.replace(
        new RegExp(`(❌[^:]*:\\s*)${vars.cancel_link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
        `<div style="margin:8px 0 16px;text-align:center"><a href="${vars.cancel_link}" style="display:inline-block;padding:14px 32px;background:#fff;color:#EF4444;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none;border:2px solid #EF4444">❌ I need to cancel</a></div>`
      );
    }

    // Also linkify any remaining URLs in the body
    bodyHtml = bodyHtml.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
      if (url.includes('confirm-attendance') || url.includes('cancel')) return url;
      return `<a href="${url}" style="color:#F28C38">${url}</a>`;
    });

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1e293b;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="margin: 0; color: ${tenant.primary_color || '#F28C38'};">${tenant.name}</h2>
        </div>
        <div style="background: #f8fafc; border-radius: 12px; padding: 24px; line-height: 1.7;">
          ${bodyHtml}
        </div>
        <p style="text-align: center; margin-top: 24px; font-size: 13px; color: #94a3b8;">
          Sent by ${tenant.name} via Bookwize
        </p>
      </div>`;

    // Build .ics for confirmation emails
    let icalEvent = null;
    if (type === 'booking_confirmation') {
      icalEvent = generateICS(booking, tenant);
    }

    await sendEmail({
      to: booking.customer_email,
      subject,
      html: htmlBody,
      text: textBody,
      icalEvent
    });

    // Log success and update booking flag
    await logNotification({
      tenantId: tenant.id,
      bookingId: booking.id,
      customerId: booking.customer_id,
      channel: 'email',
      type,
      recipient: booking.customer_email,
      subject,
      status: 'sent'
    });

    // Update the booking's sent flag
    const flagMap = {
      booking_confirmation: 'confirmation_sent',
      reminder_email: 'reminder_sent',
      followup: 'followup_sent'
    };
    if (flagMap[type]) {
      await db('bookings').where('id', booking.id).update({ [flagMap[type]]: true });
    }

    console.log(`Email sent: ${type} -> ${booking.customer_email}`);

    // Also notify the staff member if they have an email
    if (booking.staff_id) {
      try {
        const staff = await db('staff').where('id', booking.staff_id).first();
        if (staff && staff.email) {
          const staffSubject = type === 'booking_confirmation'
            ? `New Booking: ${booking.customer_name} — ${booking.service_name}`
            : type === 'booking_cancellation'
            ? `Cancelled: ${booking.customer_name} — ${booking.service_name}`
            : `Booking Update: ${booking.customer_name} — ${booking.service_name}`;

          const dateLabel = formatDateLabel(booking.booking_date);
          const timeLabel = formatTimeLabel(booking.start_time);

          const staffHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1e293b;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="margin: 0; color: ${tenant.primary_color || '#4F46E5'};">${tenant.name}</h2>
              </div>
              <div style="background: #f8fafc; border-radius: 12px; padding: 24px; line-height: 1.7;">
                <p style="margin: 0 0 12px;"><strong>${staffSubject}</strong></p>
                <p style="margin: 0 0 8px;">Client: ${booking.customer_name}</p>
                <p style="margin: 0 0 8px;">Service: ${booking.service_name}</p>
                <p style="margin: 0 0 8px;">Date: ${dateLabel}</p>
                <p style="margin: 0 0 8px;">Time: ${timeLabel}</p>
              </div>
              <p style="text-align: center; margin-top: 24px; font-size: 13px; color: #94a3b8;">
                Sent by ${tenant.name} via Bookwize
              </p>
            </div>`;

          await sendEmail({ to: staff.email, subject: staffSubject, html: staffHtml, text: `${staffSubject}\nClient: ${booking.customer_name}\nService: ${booking.service_name}\nDate: ${dateLabel}\nTime: ${timeLabel}` });
          console.log(`Staff email sent: ${type} -> ${staff.email}`);
        }
      } catch (staffErr) {
        console.error(`Staff email failed: ${staffErr.message}`);
      }
    }

    // Also notify the business owner
    try {
      const ownerEmail = tenant.email;
      if (ownerEmail && ownerEmail !== booking.customer_email) {
        const dateLabel = formatDateLabel(booking.booking_date);
        const timeLabel = formatTimeLabel(booking.start_time);

        const ownerSubject = type === 'booking_confirmation'
          ? `New Booking: ${booking.customer_name} — ${booking.service_name}`
          : type === 'booking_cancellation'
          ? `Cancelled: ${booking.customer_name} — ${booking.service_name}`
          : `Booking Update: ${booking.customer_name}`;

        const ownerHtml = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
            <h2 style="text-align:center;color:${tenant.primary_color || '#F28C38'}">${tenant.name}</h2>
            <div style="background:#f8fafc;border-radius:12px;padding:24px;line-height:1.7">
              <p style="margin:0 0 12px"><strong>${ownerSubject}</strong></p>
              <p style="margin:0 0 8px">Client: ${booking.customer_name} (${booking.customer_email})</p>
              <p style="margin:0 0 8px">Service: ${booking.service_name}</p>
              <p style="margin:0 0 8px">Staff: ${booking.staff_name}</p>
              <p style="margin:0 0 8px">Date: ${dateLabel}</p>
              <p style="margin:0 0 8px">Time: ${timeLabel}</p>
            </div>
            <p style="text-align:center;margin-top:24px;font-size:13px;color:#94a3b8">Sent by ${tenant.name} via Bookwize</p>
          </div>`;

        await sendEmail({
          to: ownerEmail,
          subject: ownerSubject,
          html: ownerHtml,
          text: `${ownerSubject}\nClient: ${booking.customer_name}\nService: ${booking.service_name}\nStaff: ${booking.staff_name}\nDate: ${dateLabel}\nTime: ${timeLabel}`
        });
        console.log(`Owner email sent: ${type} -> ${ownerEmail}`);
      }
    } catch (ownerErr) {
      console.error(`Owner email failed: ${ownerErr.message}`);
    }

  } catch (err) {
    console.error(`Email failed: ${type} -> ${booking.customer_email}:`, err.message);

    await logNotification({
      tenantId: tenant.id,
      bookingId: booking.id,
      customerId: booking.customer_id,
      channel: 'email',
      type,
      recipient: booking.customer_email,
      status: 'failed',
      error: err.message
    });
  }
}

/**
 * Send booking confirmation email.
 */
async function sendBookingConfirmation(bookingId) {
  const booking = await db('bookings').where('id', bookingId).first();
  if (!booking) return;
  const tenant = await db('tenants').where('id', booking.tenant_id).first();
  if (!tenant) return;
  await sendNotification(booking, tenant, 'booking_confirmation');
}

/**
 * Send booking cancellation email.
 */
async function sendBookingCancellation(bookingId) {
  const booking = await db('bookings').where('id', bookingId).first();
  if (!booking) return;
  const tenant = await db('tenants').where('id', booking.tenant_id).first();
  if (!tenant) return;
  await sendNotification(booking, tenant, 'booking_cancellation');
}

/**
 * Cron job: send reminders for upcoming bookings.
 * Checks all confirmed bookings where reminder_sent = false
 * and the appointment is within the tenant's reminder window.
 */
async function processReminders() {
  try {
    const now = new Date();

    // Get all tenants with reminder config
    const tenants = await db('tenants').select('id', 'name', 'slug', 'primary_color', 'reminder_email_hours');

    for (const tenant of tenants) {
      const reminderHours = tenant.reminder_email_hours || 24;

      // Calculate the window: appointments between now and now + reminderHours
      const windowEnd = new Date(now.getTime() + reminderHours * 60 * 60 * 1000);
      const todayStr = now.toISOString().split('T')[0];
      const windowEndStr = windowEnd.toISOString().split('T')[0];

      const bookings = await db('bookings')
        .where({ tenant_id: tenant.id, status: 'confirmed', reminder_sent: false })
        .where('booking_date', '>=', todayStr)
        .where('booking_date', '<=', windowEndStr);

      for (const booking of bookings) {
        // Calculate exact appointment datetime
        const [h, m] = booking.start_time.split(':');
        const apptTime = new Date(`${booking.booking_date}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`);
        const hoursUntil = (apptTime - now) / (1000 * 60 * 60);

        // Send if within the reminder window (and at least 1 hour away)
        if (hoursUntil > 0 && hoursUntil <= reminderHours) {
          await sendNotification(booking, tenant, 'reminder_email');
        }
      }
    }
  } catch (err) {
    console.error('Reminder cron error:', err.message);
  }
}

/**
 * Cron job: send follow-ups for completed bookings.
 */
async function processFollowups() {
  try {
    const now = new Date();

    const tenants = await db('tenants').select('id', 'name', 'slug', 'primary_color', 'followup_email_hours');

    for (const tenant of tenants) {
      const followupHours = tenant.followup_email_hours || 48;

      const bookings = await db('bookings')
        .where({ tenant_id: tenant.id, status: 'completed', followup_sent: false });

      for (const booking of bookings) {
        // Check if enough time has passed since the appointment
        const [h, m] = booking.end_time.split(':');
        const endTime = new Date(`${booking.booking_date}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`);
        const hoursSince = (now - endTime) / (1000 * 60 * 60);

        if (hoursSince >= followupHours) {
          await sendNotification(booking, tenant, 'followup');
        }
      }
    }
  } catch (err) {
    console.error('Follow-up cron error:', err.message);
  }
}

/**
 * Cron job: auto-complete bookings that were confirmed by the customer
 * once their appointment end time has passed.
 */
async function autoCompleteConfirmed() {
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const bookings = await db('bookings')
      .where({ status: 'confirmed', customer_confirmed: true })
      .where('booking_date', '<=', todayStr);

    for (const booking of bookings) {
      const [h, m] = booking.end_time.split(':');
      const endTime = new Date(`${booking.booking_date}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`);

      if (now > endTime) {
        await db('bookings').where('id', booking.id).update({ status: 'completed' });
        console.log(`Auto-completed booking ${booking.id} (customer confirmed)`);

        // Create rebook reminder if service has rebook_days configured
        try {
          const { createRebookReminder } = require('./rebookService');
          createRebookReminder(booking.id).catch(() => {});
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error('Auto-complete cron error:', err.message);
  }
}

module.exports = {
  sendBookingConfirmation,
  sendBookingCancellation,
  processReminders,
  processFollowups,
  autoCompleteConfirmed
};
