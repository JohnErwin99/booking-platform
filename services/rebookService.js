const db = require('../config/database');
const { sendEmail } = require('./emailService');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Called after a booking is marked completed.
 * If the service has rebook_days configured, create a pending rebook_reminder.
 */
async function createRebookReminder(bookingId) {
  try {
    const booking = await db('bookings').where('id', bookingId).first();
    if (!booking) return;

    // Only proceed if the service has rebook_days configured
    const service = await db('services').where('id', booking.service_id).first();
    if (!service || !service.rebook_days) return;

    // Check we don't already have a reminder for this booking
    const existing = await db('rebook_reminders').where('booking_id', bookingId).first();
    if (existing) return;

    // Calculate the suggested_date = booking_date + rebook_days
    const bookingDateStr = booking.booking_date instanceof Date
      ? booking.booking_date.toISOString().slice(0, 10)
      : String(booking.booking_date);

    const suggestedDate = new Date(bookingDateStr + 'T00:00:00');
    suggestedDate.setDate(suggestedDate.getDate() + service.rebook_days);
    const suggestedDateStr = suggestedDate.toISOString().slice(0, 10);

    await db('rebook_reminders').insert({
      tenant_id: booking.tenant_id,
      booking_id: booking.id,
      customer_id: booking.customer_id,
      service_id: booking.service_id,
      staff_id: booking.staff_id,
      suggested_date: suggestedDateStr,
      status: 'pending'
    });

    console.log(`Rebook reminder created for booking ${bookingId} — suggested ${suggestedDateStr}`);
  } catch (err) {
    console.error('createRebookReminder error:', err.message);
  }
}

/**
 * Cron job: send rebook reminders where suggested_date is within 2 days from now.
 */
async function processRebookReminders() {
  try {
    if (!process.env.SMTP_USER) return;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Window: today through 2 days from now
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + 2);
    const windowEndStr = windowEnd.toISOString().slice(0, 10);

    const reminders = await db('rebook_reminders')
      .join('bookings', 'rebook_reminders.booking_id', 'bookings.id')
      .join('tenants', 'rebook_reminders.tenant_id', 'tenants.id')
      .join('customers', 'rebook_reminders.customer_id', 'customers.id')
      .join('services', 'rebook_reminders.service_id', 'services.id')
      .join('staff', 'rebook_reminders.staff_id', 'staff.id')
      .where('rebook_reminders.status', 'pending')
      .where('rebook_reminders.suggested_date', '>=', todayStr)
      .where('rebook_reminders.suggested_date', '<=', windowEndStr)
      .select(
        'rebook_reminders.id as reminder_id',
        'rebook_reminders.suggested_date',
        'rebook_reminders.service_id',
        'rebook_reminders.staff_id',
        'tenants.name as business_name',
        'tenants.slug',
        'tenants.primary_color',
        'customers.email as customer_email',
        'customers.first_name as customer_name',
        'services.name as service_name',
        'services.rebook_days',
        db.raw("CONCAT(staff.first_name, ' ', staff.last_name) as staff_name"),
        'bookings.booking_date'
      );

    for (const reminder of reminders) {
      try {
        const weeksAgo = Math.round(reminder.rebook_days / 7);
        const weekLabel = weeksAgo === 1 ? '1 week' : `${weeksAgo} weeks`;

        const bookingUrl = `${BASE_URL}/book/${reminder.slug}?staff=${reminder.staff_id}&service=${reminder.service_id}`;
        const color = reminder.primary_color || '#F28C38';

        const html = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
            <div style="text-align:center;margin-bottom:24px">
              <h2 style="margin:0;color:${color}">${reminder.business_name}</h2>
            </div>
            <div style="background:#f8fafc;border-radius:12px;padding:24px;line-height:1.8">
              <p style="margin:0 0 12px">Hi ${reminder.customer_name},</p>
              <p style="margin:0 0 16px">It's been ${weekLabel} since your <strong>${reminder.service_name}</strong> with <strong>${reminder.staff_name}</strong>. Time for a touch-up?</p>
              <div style="text-align:center;margin:24px 0">
                <a href="${bookingUrl}" style="display:inline-block;padding:14px 32px;background:${color};color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none">Book Now</a>
              </div>
              <p style="margin:0;font-size:13px;color:#64748b">Your preferred barber and service are already pre-selected — just pick a time!</p>
            </div>
            <p style="text-align:center;margin-top:24px;font-size:13px;color:#94a3b8">Sent by ${reminder.business_name} via Bookwize</p>
          </div>`;

        const text = `Hi ${reminder.customer_name},\n\nIt's been ${weekLabel} since your ${reminder.service_name} with ${reminder.staff_name}. Time for a touch-up?\n\nBook your next appointment: ${bookingUrl}\n\n${reminder.business_name}`;

        await sendEmail({
          to: reminder.customer_email,
          subject: `Time for your next ${reminder.service_name} at ${reminder.business_name}?`,
          html,
          text
        });

        await db('rebook_reminders').where('id', reminder.reminder_id).update({
          status: 'sent',
          sent_at: new Date()
        });

        console.log(`Rebook reminder sent: ${reminder.customer_email} -> ${reminder.service_name}`);
      } catch (err) {
        console.error(`Rebook reminder failed for reminder ${reminder.reminder_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('processRebookReminders error:', err.message);
  }
}

module.exports = { createRebookReminder, processRebookReminders };
