exports.up = function (knex) {
  return knex.schema
    .createTable('intake_forms', (t) => {
      t.increments('id').unsigned();
      t.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      t.string('name', 200).notNullable();
      t.text('description').nullable();
      t.json('fields_json').notNullable();
      t.boolean('is_required').defaultTo(false);
      t.boolean('is_active').defaultTo(true);
      t.timestamps(true, true);

      t.index('tenant_id');
    })
    .createTable('intake_responses', (t) => {
      t.increments('id').unsigned();
      t.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      t.integer('intake_form_id').unsigned().notNullable()
        .references('id').inTable('intake_forms').onDelete('CASCADE');
      t.integer('customer_id').unsigned().notNullable()
        .references('id').inTable('customers').onDelete('CASCADE');
      t.integer('booking_id').unsigned().nullable()
        .references('id').inTable('bookings').onDelete('SET NULL');
      t.json('responses_json').notNullable();
      t.timestamps(true, true);

      t.index(['tenant_id', 'customer_id']);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('intake_responses')
    .dropTableIfExists('intake_forms');
};
