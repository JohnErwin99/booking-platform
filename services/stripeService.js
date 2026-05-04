const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Plan config — maps plan keys to Stripe prices
// These get created automatically on first checkout if they don't exist
const PLANS = {
  starter_monthly:  { name: 'Solo / Starter — Monthly',  amount: 1900,  interval: 'month', plan: 'starter', billing: 'monthly' },
  starter_onetime:  { name: 'Solo / Starter — One-Time',  amount: 29900, interval: null,    plan: 'starter', billing: 'onetime' },
  team_monthly:     { name: 'Team — Monthly',             amount: 3900,  interval: 'month', plan: 'team',    billing: 'monthly' },
  team_onetime:     { name: 'Team — One-Time',             amount: 59900, interval: null,    plan: 'team',    billing: 'onetime' },
  business_monthly: { name: 'Business — Monthly',         amount: 6900,  interval: 'month', plan: 'business', billing: 'monthly' },
  business_onetime: { name: 'Business — One-Time',         amount: 99900, interval: null,    plan: 'business', billing: 'onetime' },
};

/**
 * Create a Stripe Checkout session for a given plan key
 */
async function createCheckoutSession(planKey, successUrl, cancelUrl) {
  const config = PLANS[planKey];
  if (!config) throw new Error(`Unknown plan: ${planKey}`);

  const sessionParams = {
    payment_method_types: ['card'],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { plan: config.plan, billing: config.billing, plan_key: planKey },
  };

  if (config.interval) {
    // Subscription (monthly)
    sessionParams.mode = 'subscription';
    sessionParams.line_items = [{
      price_data: {
        currency: 'usd',
        product_data: { name: config.name },
        unit_amount: config.amount,
        recurring: { interval: config.interval },
      },
      quantity: 1,
    }];
  } else {
    // One-time payment
    sessionParams.mode = 'payment';
    sessionParams.line_items = [{
      price_data: {
        currency: 'usd',
        product_data: { name: config.name },
        unit_amount: config.amount,
      },
      quantity: 1,
    }];
  }

  return stripe.checkout.sessions.create(sessionParams);
}

/**
 * Construct a webhook event from the raw body + signature
 */
function constructWebhookEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

module.exports = { stripe, PLANS, createCheckoutSession, constructWebhookEvent };
