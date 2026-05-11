const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Plan config
const PLANS = {
  solo_monthly:     { name: 'Solo — Monthly',   amount: 1900,  interval: 'month', plan: 'solo', billing: 'monthly' },
  solo_onetime:     { name: 'Solo — One-Time',  amount: 29900, interval: null,    plan: 'solo', billing: 'onetime' },
  team_monthly:     { name: 'Team — Monthly',   amount: 3900,  interval: 'month', plan: 'team', billing: 'monthly' },
  team_onetime:     { name: 'Team — One-Time',  amount: 59900, interval: null,    plan: 'team', billing: 'onetime' },
  // Legacy aliases (keep for existing Stripe products)
  starter_monthly:  { name: 'Solo — Monthly',   amount: 1900,  interval: 'month', plan: 'solo', billing: 'monthly' },
  starter_onetime:  { name: 'Solo — One-Time',  amount: 29900, interval: null,    plan: 'solo', billing: 'onetime' },
};

// Cache for Stripe price IDs — created once, reused
const priceCache = {};

/**
 * Get or create a Stripe Price (and its Product) for a plan key.
 * This ensures the same price ID is used every time, enabling upgrades/downgrades.
 */
async function getOrCreatePrice(planKey) {
  if (priceCache[planKey]) return priceCache[planKey];

  const config = PLANS[planKey];
  if (!config) throw new Error(`Unknown plan: ${planKey}`);

  // Search for existing product by metadata
  const existingProducts = await stripe.products.search({
    query: `metadata['bookwize_plan_key']:'${planKey}'`,
  });

  let product;
  if (existingProducts.data.length > 0) {
    product = existingProducts.data[0];
  } else {
    // Create new product
    product = await stripe.products.create({
      name: config.name,
      metadata: { bookwize_plan_key: planKey, plan: config.plan, billing: config.billing },
    });
    console.log(`Created Stripe product: ${config.name} (${product.id})`);
  }

  // Search for existing price on this product
  const existingPrices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 1,
  });

  let price;
  if (existingPrices.data.length > 0) {
    price = existingPrices.data[0];
  } else {
    // Create new price
    const priceParams = {
      product: product.id,
      unit_amount: config.amount,
      currency: 'cad',
      metadata: { bookwize_plan_key: planKey },
    };

    if (config.interval) {
      priceParams.recurring = { interval: config.interval };
    }

    price = await stripe.prices.create(priceParams);
    console.log(`Created Stripe price: ${config.name} — $${config.amount / 100} (${price.id})`);
  }

  priceCache[planKey] = price.id;
  return price.id;
}

/**
 * Create a Stripe Checkout session for a given plan key.
 * Uses persistent price IDs so Stripe can manage upgrades/downgrades.
 */
async function createCheckoutSession(planKey, successUrl, cancelUrl, extra = {}) {
  const config = PLANS[planKey];
  if (!config) throw new Error(`Unknown plan: ${planKey}`);

  const priceId = await getOrCreatePrice(planKey);

  const metadata = { plan: config.plan, billing: config.billing, plan_key: planKey };
  if (extra.tenant_id) metadata.tenant_id = String(extra.tenant_id);
  if (extra.email) metadata.email = extra.email;

  const sessionParams = {
    payment_method_types: ['card'],
    mode: config.interval ? 'subscription' : 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  };

  if (extra.email) sessionParams.customer_email = extra.email;

  // For subscriptions, allow plan switching in customer portal
  if (config.interval) {
    sessionParams.subscription_data = {
      metadata,
    };
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

module.exports = { stripe, PLANS, getOrCreatePrice, createCheckoutSession, constructWebhookEvent };
