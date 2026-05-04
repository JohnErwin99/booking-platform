exports.up = function (knex) {
  return knex.schema
    .createTable('services', (t) => {
      t.increments('id').unsigned();
      t.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      t.string('category', 100).nullable();
      t.string('name', 200).notNullable();
      t.text('description').nullable();
      t.integer('duration_minutes').unsigned().notNullable();
      t.integer('price_cents').unsigned().notNullable();
      t.enu('deposit_override_type', ['none', 'percentage', 'fixed']).nullable();
      t.decimal('deposit_override_value', 10, 2).nullable();
      t.boolean('is_active').notNullable().defaultTo(true);
      t.integer('sort_order').unsigned().defaultTo(0);
      t.timestamps(true, true);

      t.index('tenant_id');
      t.index(['tenant_id', 'category']);
    })
    .createTable('staff_services', (t) => {
      t.increments('id').unsigned();
      t.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      t.integer('staff_id').unsigned().notNullable()
        .references('id').inTable('staff').onDelete('CASCADE');
      t.integer('service_id').unsigned().notNullable()
        .references('id').inTable('services').onDelete('CASCADE');
      t.integer('price_override_cents').unsigned().nullable();
      t.integer('duration_override').unsigned().nullable();

      t.unique(['staff_id', 'service_id']);
      t.index('tenant_id');
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('staff_services')
    .dropTableIfExists('services');
};
