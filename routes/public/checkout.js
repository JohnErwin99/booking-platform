const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../../config/database');
const { sendEmail } = require('../../services/emailService');
const { slugify } = require('../../utils/helpers');
const { createCheckoutSession, constructWebhookEvent, PLANS } = require('../../services/stripeService');
const router = express.Router();

/**
 * POST /api/checkout
 * Creates a Stripe Checkout Session and returns the URL
 */
router.post('/checkout', async (req, res) => {
  try {
    const { plan } = req.body;

    if (!plan || !PLANS[plan]) {
      return res.status(400).json({ error: true, message: 'Invalid plan selected.' });
    }

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    // Pass tenant_id if user is logged in
    const extra = {};
    if (req.user && req.user.tenant_id) extra.tenant_id = req.user.tenant_id;
    if (req.user && req.user.email) extra.email = req.user.email;

    const session = await createCheckoutSession(
      plan,
      `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      `${baseUrl}/checkout/cancel`,
      extra
    );

    return res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err.message);
    return res.status(500).json({ error: true, message: 'Could not create checkout session.' });
  }
});

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events (payment success, subscription updates, etc.)
 * Note: This route needs raw body — configured in server.js
 */
router.post('/stripe/webhook', async (req, res) => {
  let event;
  try {
    event = constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { plan, billing, plan_key } = session.metadata;
        const config = PLANS[plan_key];

        // Step 1: Resolve or create the tenant
        let resolvedTenantId = session.metadata.tenant_id ? parseInt(session.metadata.tenant_id) : null;
        const customerEmail = session.customer_email || session.customer_details?.email || session.metadata.email;

        if (resolvedTenantId) {
          // Logged-in user — upgrade existing tenant
          await db('tenants').where('id', resolvedTenantId).update({ plan, status: 'active', trial_ends_at: null });
          console.log(`Tenant ${resolvedTenantId} upgraded to ${plan} plan`);
        } else if (customerEmail) {
          // Check if tenant exists by email
          const existingTenant = await db('tenants').where('email', customerEmail.toLowerCase().trim()).first();

          if (existingTenant) {
            resolvedTenantId = existingTenant.id;
            await db('tenants').where('id', resolvedTenantId).update({ plan, status: 'active', trial_ends_at: null });
            console.log(`Tenant ${resolvedTenantId} (by email) upgraded to ${plan} plan`);
          } else {
            // Create new tenant + user
            const tempPassword = crypto.randomBytes(6).toString('hex');
            const slug = slugify(customerEmail.split('@')[0] + '-' + Date.now().toString(36));

            const [newTenantId] = await db('tenants').insert({
              name: customerEmail.split('@')[0] + '\'s Business',
              slug,
              email: customerEmail.toLowerCase().trim(),
              status: 'active',
              plan,
              trial_ends_at: null,
              onboarding_completed: false,
              timezone: 'America/Montreal',
              currency: 'CAD',
            });
            resolvedTenantId = newTenantId;

            const [locationId] = await db('locations').insert({
              tenant_id: newTenantId, name: 'Main Location', is_default: true,
            });

            const passwordHash = await bcrypt.hash(tempPassword, 12);
            await db('users').insert({
              tenant_id: newTenantId,
              email: customerEmail.toLowerCase().trim(),
              password_hash: passwordHash,
              first_name: customerEmail.split('@')[0],
              last_name: '',
              role: 'owner',
            });

            const defaultHours = [];
            for (let day = 1; day <= 6; day++) {
              defaultHours.push({ tenant_id: newTenantId, location_id: locationId, staff_id: null, weekday: day, open_at: '09:00:00', close_at: '18:00:00' });
            }
            await db('business_hours').insert(defaultHours);

            await db('notification_templates').insert([
              { tenant_id: newTenantId, type: 'booking_confirmation', channel: 'email', subject: 'Booking Confirmed - {{business_name}}', body_template: 'Hi {{customer_name}},\n\nYour appointment has been confirmed!\n\nService: {{service_name}}\nDate: {{booking_date}}\nTime: {{booking_time}}\nWith: {{staff_name}}\n\nIf you need to make changes: {{manage_link}}\n\nSee you soon!\n{{business_name}}' },
              { tenant_id: newTenantId, type: 'reminder_email', channel: 'email', subject: 'Reminder: Your appointment tomorrow - {{business_name}}', body_template: 'Hi {{customer_name}},\n\nFriendly reminder about your appointment tomorrow.\n\nService: {{service_name}}\nDate: {{booking_date}}\nTime: {{booking_time}}\nWith: {{staff_name}}\n\nPlease confirm or cancel:\n\n✅ I will be there: {{confirm_link}}\n\n❌ I need to cancel: {{cancel_link}}\n\nSee you soon!\n{{business_name}}' },
              { tenant_id: newTenantId, type: 'booking_cancellation', channel: 'email', subject: 'Booking Cancelled - {{business_name}}', body_template: 'Hi {{customer_name}},\n\nYour appointment on {{booking_date}} at {{booking_time}} has been cancelled.\n\nTo book a new appointment: {{booking_link}}\n\n{{business_name}}' },
            ]);

            const baseUrl = process.env.BASE_URL || 'https://bookwizeapp.com';
            sendEmail({
              to: customerEmail,
              subject: 'Welcome to Bookwize — Your account is ready!',
              html: `
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
                  <h2 style="text-align:center;color:#F28C38;margin-bottom:24px">Welcome to Bookwize!</h2>
                  <div style="background:#f8fafc;border-radius:16px;padding:24px;line-height:1.7">
                    <p>Your <strong>${plan}</strong> plan is active. Here are your login details:</p>
                    <p><strong>Dashboard:</strong> <a href="${baseUrl}/admin/login">${baseUrl}/admin/login</a></p>
                    <p><strong>Email:</strong> ${customerEmail}</p>
                    <p><strong>Temporary Password:</strong> ${tempPassword}</p>
                    <p>Please change your password after your first login.</p>
                    <p>Log in to complete your business setup with our guided wizard.</p>
                  </div>
                </div>`,
              text: `Welcome to Bookwize!\n\nYour ${plan} plan is active.\n\nDashboard: ${baseUrl}/admin/login\nEmail: ${customerEmail}\nPassword: ${tempPassword}\n\nPlease change your password after first login.`
            }).catch(err => console.error('Welcome email failed:', err.message));

            console.log(`New tenant ${newTenantId} created from Stripe payment (${customerEmail})`);
          }
        }

        // Step 2: Insert subscription with resolved tenant ID
        await db('subscriptions').insert({
          tenant_id: resolvedTenantId,
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription || null,
          stripe_checkout_session_id: session.id,
          plan,
          billing_type: billing,
          status: 'active',
          amount_cents: config ? config.amount : session.amount_total,
          currency: session.currency || 'cad',
          current_period_start: new Date(),
          current_period_end: billing === 'monthly'
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            : billing === 'yearly'
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
              : null,
        });

        console.log(`Subscription created: ${plan} (${billing}) — tenant ${resolvedTenantId} — session ${session.id}`);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const existingSub = await db('subscriptions')
          .where('stripe_subscription_id', sub.id)
          .first();

        await db('subscriptions')
          .where('stripe_subscription_id', sub.id)
          .update({
            status: sub.status === 'active' ? 'active' : sub.status,
            current_period_start: sub.current_period_start
              ? new Date(sub.current_period_start * 1000)
              : null,
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null,
            updated_at: new Date(),
          });

        // Detect plan change from Stripe price metadata
        if (existingSub && existingSub.tenant_id && sub.items && sub.items.data.length) {
          const priceId = sub.items.data[0].price.id;
          // Look up the price to get plan info from metadata
          try {
            const price = await require('stripe')(process.env.STRIPE_SECRET_KEY).prices.retrieve(priceId);
            const product = await require('stripe')(process.env.STRIPE_SECRET_KEY).products.retrieve(price.product);
            const newPlan = product.metadata?.plan;
            if (newPlan) {
              await db('tenants').where('id', existingSub.tenant_id).update({ plan: newPlan, trial_ends_at: null });
              await db('subscriptions').where('stripe_subscription_id', sub.id).update({ plan: newPlan });
              console.log(`Tenant ${existingSub.tenant_id} plan changed to ${newPlan} via subscription update`);
            }
          } catch (e) {
            console.error('Plan detection error:', e.message);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const canceledSub = await db('subscriptions')
          .where('stripe_subscription_id', sub.id)
          .first();
        await db('subscriptions')
          .where('stripe_subscription_id', sub.id)
          .update({ status: 'canceled', updated_at: new Date() });
        // Downgrade tenant back to trial
        if (canceledSub && canceledSub.tenant_id) {
          await db('tenants').where('id', canceledSub.tenant_id).update({ plan: 'trial' });
          console.log(`Tenant ${canceledSub.tenant_id} downgraded to trial (subscription canceled)`);
        }
        break;
      }

      default:
        // Unhandled event type — just acknowledge
        break;
    }
  } catch (err) {
    console.error('Webhook processing error:', err.message);
  }

  // Always return 200 to acknowledge receipt
  res.json({ received: true });
});

module.exports = router;
