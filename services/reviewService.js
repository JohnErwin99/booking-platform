const crypto = require('crypto');
const db = require('../config/database');
const { sendEmail } = require('./emailService');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Cron job: send review request emails for completed bookings.
 * Runs after followup has already been sent (followup_sent = true).
 * Creates a review record (rating=0, pending) and emails the customer.
 */
async function processReviewRequests() {
  try {
    if (!process.env.SMTP_USER) return;

    // Find completed bookings where followup was sent but review request hasn't been sent yet
    const bookings = await db('bookings')
      .join('tenants', 'bookings.tenant_id', 'tenants.id')
      .where('bookings.status', 'completed')
      .where('bookings.followup_sent', true)
      .where('bookings.review_sent', false)
      .whereNotNull('bookings.customer_id')
      .whereNotNull('bookings.customer_email')
      .select(
        'bookings.id as booking_id',
        'bookings.tenant_id',
        'bookings.customer_id',
        'bookings.staff_id',
        'bookings.service_id',
        'bookings.customer_name',
        'bookings.customer_email',
        'bookings.service_name',
        'bookings.staff_name',
        'tenants.name as business_name',
        'tenants.slug',
        'tenants.primary_color'
      );

    for (const booking of bookings) {
      try {
        // Check a review doesn't already exist for this booking
        const existing = await db('reviews').where('booking_id', booking.booking_id).first();
        if (existing) {
          // Just mark review_sent to avoid reprocessing
          await db('bookings').where('id', booking.booking_id).update({ review_sent: true });
          continue;
        }

        const reviewToken = crypto.randomBytes(32).toString('hex');

        // Create the pending review record
        await db('reviews').insert({
          tenant_id: booking.tenant_id,
          booking_id: booking.booking_id,
          customer_id: booking.customer_id,
          staff_id: booking.staff_id,
          service_id: booking.service_id,
          rating: 0,
          review_token: reviewToken,
          is_public: false  // stays private until actually submitted
        });

        const reviewUrl = `${BASE_URL}/book/${booking.slug}/review/${reviewToken}`;
        const color = booking.primary_color || '#F28C38';

        const html = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
            <div style="text-align:center;margin-bottom:24px">
              <h2 style="margin:0;color:${color}">${booking.business_name}</h2>
            </div>
            <div style="background:#f8fafc;border-radius:12px;padding:24px;line-height:1.8">
              <p style="margin:0 0 12px">Hi ${booking.customer_name},</p>
              <p style="margin:0 0 16px">How was your <strong>${booking.service_name}</strong> with <strong>${booking.staff_name}</strong>? We'd love your feedback — and snap a photo of your new look!</p>
              <div style="text-align:center;margin:24px 0">
                <a href="${reviewUrl}" style="display:inline-block;padding:14px 32px;background:${color};color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none">Leave a Review</a>
              </div>
              <p style="margin:0;font-size:13px;color:#64748b">It only takes 30 seconds and really helps us out!</p>
            </div>
            <p style="text-align:center;margin-top:24px;font-size:13px;color:#94a3b8">Sent by ${booking.business_name} via Bookwize</p>
          </div>`;

        const text = `Hi ${booking.customer_name},\n\nHow was your ${booking.service_name} with ${booking.staff_name}? We'd love your feedback!\n\nLeave a review: ${reviewUrl}\n\n${booking.business_name}`;

        await sendEmail({
          to: booking.customer_email,
          subject: `How was your ${booking.service_name} at ${booking.business_name}?`,
          html,
          text
        });

        await db('bookings').where('id', booking.booking_id).update({ review_sent: true });

        console.log(`Review request sent: ${booking.customer_email} -> booking ${booking.booking_id}`);
      } catch (err) {
        console.error(`Review request failed for booking ${booking.booking_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('processReviewRequests error:', err.message);
  }
}

module.exports = { processReviewRequests };
