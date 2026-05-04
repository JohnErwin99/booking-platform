exports.up = function (knex) {
  return knex.schema.createTable('tenants', (t) => {
    t.increments('id').unsigned();
    t.string('name', 200).notNullable();
    t.string('slug', 100).notNullable().unique();
    t.string('custom_domain', 255).nullable().unique();
    t.string('email', 190).notNullable();
    t.string('phone', 40).nullable();
    t.string('timezone', 60).notNullable().defaultTo('America/New_York');
    t.string('currency', 3).notNullable().defaultTo('USD');
    t.enu('status', ['active', 'suspended', 'trial']).notNullable().defaultTo('trial');

    // Branding
    t.string('logo_url', 500).nullable();
    t.string('primary_color', 7).defaultTo('#c9a84c');
    t.string('secondary_color', 7).defaultTo('#0a0a0a');
    t.string('accent_color', 7).defaultTo('#f5f0e8');
    t.string('font_heading', 100).defaultTo('Cormorant Garamond');
    t.string('font_body', 100).defaultTo('Montserrat');

    // Stripe Connect
    t.string('stripe_account_id', 100).nullable();
    t.boolean('stripe_onboarding_complete').defaultTo(false);

    // Policies
    t.integer('cancellation_hours').unsigned().defaultTo(24);
    t.integer('reschedule_hours').unsigned().defaultTo(24);
    t.integer('no_show_fee_cents').unsigned().defaultTo(0);
    t.enu('deposit_type', ['none', 'percentage', 'fixed']).defaultTo('none');
    t.decimal('deposit_value', 10, 2).defaultTo(0);

    // Notification defaults
    t.integer('reminder_email_hours').unsigned().defaultTo(24);
    t.integer('reminder_sms_hours').unsigned().defaultTo(2);
    t.integer('followup_email_hours').unsigned().defaultTo(48);

    t.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('tenants');
};
