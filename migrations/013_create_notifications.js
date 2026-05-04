exports.up = function (knex) {
  return knex.schema
    .createTable('notification_templates', (t) => {
      t.increments('id').unsigned();
      t.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      t.enu('type', [
        'booking_confirmation', 'booking_cancellation', 'reminder_email',
        'reminder_sms', 'followup', 'review_request', 'reschedule'
      ]).notNullable();
      t.enu('channel', ['email', 'sms']).notNullable();
      t.string('subject', 255).nullable();
      t.text('body_template').notNullable();
      t.boolean('is_active').defaultTo(true);
      t.timestamps(true, true);

      t.unique(['tenant_id', 'type', 'channel']);
      t.index('tenant_id');
    })
    .createTable('notification_log', (t) => {
      t.increments('id').unsigned();
      t.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      t.integer('booking_id').unsigned().nullable()
        .references('id').inTable('bookings').onDelete('SET NULL');
      t.integer('customer_id').unsigned().nullable()
        .references('id').inTable('customers').onDelete('SET NULL');
      t.enu('channel', ['email', 'sms']).notNullable();
      t.string('type', 50).notNullable();
      t.string('recipient', 200).notNullable();
      t.string('subject', 255).nullable();
      t.enu('status', ['sent', 'failed', 'bounced']).notNullable();
      t.text('error_message').nullable();
      t.timestamp('sent_at').notNullable().defaultTo(knex.fn.now());

      t.index('tenant_id');
      t.index('booking_id');
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('notification_log')
    .dropTableIfExists('notification_templates');
};
