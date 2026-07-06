exports.up = async function (knex) {
  // Add rebook_days column to services table
  await knex.schema.alterTable('services', (t) => {
    t.integer('rebook_days').unsigned().nullable().defaultTo(null)
      .comment('Days after appointment to suggest rebooking');
  });

  // Create rebook_reminders table
  await knex.schema.createTable('rebook_reminders', (t) => {
    t.increments('id').unsigned();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('booking_id').unsigned().notNullable()
      .references('id').inTable('bookings').onDelete('CASCADE');
    t.integer('customer_id').unsigned().notNullable()
      .references('id').inTable('customers').onDelete('CASCADE');
    t.integer('service_id').unsigned().notNullable()
      .references('id').inTable('services').onDelete('CASCADE');
    t.integer('staff_id').unsigned().notNullable()
      .references('id').inTable('staff').onDelete('CASCADE');
    t.date('suggested_date').notNullable();
    t.enu('status', ['pending', 'sent', 'booked', 'dismissed'])
      .notNullable().defaultTo('pending');
    t.timestamp('sent_at').nullable();
    t.timestamps(true, true);

    t.index(['tenant_id', 'status'], 'idx_rebook_tenant_status');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('rebook_reminders');
  await knex.schema.alterTable('services', (t) => {
    t.dropColumn('rebook_days');
  });
};
