exports.up = async function (knex) {
  await knex.schema.createTable('portfolio_photos', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('staff_id').unsigned().notNullable()
      .references('id').inTable('staff').onDelete('CASCADE');
    t.integer('service_id').unsigned().nullable()
      .references('id').inTable('services').onDelete('SET NULL');
    t.string('photo_url', 500).notNullable();
    t.string('caption', 500).nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);

    t.index(['tenant_id', 'staff_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('portfolio_photos');
};
