exports.up = function (knex) {
  return knex.schema.createTable('bookings', (t) => {
    t.increments('id').unsigned();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('location_id').unsigned().notNullable()
      .references('id').inTable('locations');
    t.integer('staff_id').unsigned().notNullable()
      .references('id').inTable('staff');
    t.integer('customer_id').unsigned().notNullable()
      .references('id').inTable('customers');
    t.integer('service_id').unsigned().notNullable()
      .references('id').inTable('services');

    // Denormalized for fast calendar/list queries
    t.string('staff_name', 200).notNullable();
    t.string('customer_name', 200).notNullable();
    t.string('customer_email', 190).notNullable();
    t.string('customer_phone', 40).nullable();
    t.string('service_name', 200).notNullable();

    // Schedule
    t.date('booking_date').notNullable();
    t.time('start_time').notNullable();
    t.time('end_time').notNullable();
    t.integer('duration_minutes').unsigned().notNullable();

    // Pricing
    t.integer('price_cents').unsigned().notNullable().defaultTo(0);
    t.integer('deposit_cents').unsigned().notNullable().defaultTo(0);

    // Status
    t.enu('status', ['confirmed', 'cancelled', 'completed', 'no_show'])
      .notNullable().defaultTo('confirmed');
    t.text('cancellation_reason').nullable();
    t.timestamp('cancelled_at').nullable();
    t.enu('cancelled_by', ['customer', 'admin', 'system']).nullable();

    // Notes
    t.text('notes').nullable();
    t.text('admin_notes').nullable();
    t.enu('source', ['online', 'admin', 'widget', 'social']).defaultTo('online');

    // External calendar sync
    t.string('google_event_id', 255).nullable();
    t.string('outlook_event_id', 255).nullable();

    // Notification flags
    t.boolean('confirmation_sent').defaultTo(false);
    t.boolean('reminder_sent').defaultTo(false);
    t.boolean('followup_sent').defaultTo(false);

    // Manage token (for self-service cancel/reschedule links)
    t.string('manage_token', 64).nullable().unique();

    t.timestamps(true, true);

    // Prevent double-booking same staff same slot
    t.unique(['tenant_id', 'staff_id', 'booking_date', 'start_time', 'status'], { indexName: 'uniq_staff_slot' });
    t.index(['tenant_id', 'booking_date'], 'idx_tenant_date');
    t.index(['tenant_id', 'staff_id', 'booking_date'], 'idx_staff_date');
    t.index(['tenant_id', 'customer_id'], 'idx_tenant_customer');
    t.index(['tenant_id', 'status'], 'idx_tenant_status');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('bookings');
};
