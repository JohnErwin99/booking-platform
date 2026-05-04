exports.up = function (knex) {
  return knex.schema.createTable('customer_notes', (t) => {
    t.increments('id').unsigned();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('customer_id').unsigned().notNullable()
      .references('id').inTable('customers').onDelete('CASCADE');
    t.integer('booking_id').unsigned().nullable()
      .references('id').inTable('bookings').onDelete('SET NULL');
    t.integer('staff_id').unsigned().nullable()
      .references('id').inTable('staff').onDelete('SET NULL');
    t.text('note').notNullable();
    t.timestamps(true, true);

    t.index(['tenant_id', 'customer_id']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('customer_notes');
};
