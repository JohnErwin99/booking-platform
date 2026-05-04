exports.up = function (knex) {
  return knex.schema.createTable('subscriptions', (t) => {
    t.increments('id').unsigned();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.string('stripe_customer_id', 100).nullable();
    t.string('stripe_subscription_id', 100).nullable();
    t.string('stripe_checkout_session_id', 100).nullable();
    t.enu('plan', ['starter', 'team', 'business']).notNullable().defaultTo('starter');
    t.enu('billing_type', ['monthly', 'onetime']).notNullable().defaultTo('monthly');
    t.enu('status', ['active', 'past_due', 'canceled', 'incomplete', 'trialing']).notNullable().defaultTo('incomplete');
    t.integer('amount_cents').unsigned().notNullable();
    t.string('currency', 3).defaultTo('usd');
    t.timestamp('current_period_start').nullable();
    t.timestamp('current_period_end').nullable();
    t.timestamps(true, true);

    t.index('tenant_id');
    t.index('stripe_customer_id');
    t.index('stripe_subscription_id');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('subscriptions');
};
