exports.up = function (knex) {
  return knex.schema.createTable('booking_payments', (t) => {
    t.increments('id').unsigned();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('booking_id').unsigned().notNullable()
      .references('id').inTable('bookings').onDelete('CASCADE');
    t.string('stripe_payment_intent_id', 100).nullable();
    t.string('stripe_charge_id', 100).nullable();
    t.integer('amount_cents').unsigned().notNullable();
    t.enu('type', ['full_payment', 'deposit', 'no_show_fee', 'cancellation_fee', 'refund']).notNullable();
    t.enu('status', ['pending', 'succeeded', 'failed', 'refunded']).notNullable().defaultTo('pending');
    t.integer('refund_amount_cents').unsigned().defaultTo(0);
    t.timestamps(true, true);

    t.index('tenant_id');
    t.index('booking_id');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('booking_payments');
};
