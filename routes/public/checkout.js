const express = require('express');
const db = require('../../config/database');
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
    const session = await createCheckoutSession(
      plan,
      `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      `${baseUrl}/checkout/cancel`
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

        await db('subscriptions').insert({
          tenant_id: session.metadata.tenant_id || null,
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription || null,
          stripe_checkout_session_id: session.id,
          plan: plan,
          billing_type: billing,
          status: 'active',
          amount_cents: config ? config.amount : session.amount_total,
          currency: session.currency || 'usd',
          current_period_start: new Date(),
          current_period_end: billing === 'monthly'
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            : null,
        });

        console.log(`Subscription created: ${plan} (${billing}) — session ${session.id}`);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
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
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await db('subscriptions')
          .where('stripe_subscription_id', sub.id)
          .update({ status: 'canceled', updated_at: new Date() });
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
