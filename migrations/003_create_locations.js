exports.up = function (knex) {
  return knex.schema.createTable('locations', (t) => {
    t.increments('id').unsigned();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.string('name', 200).notNullable();
    t.string('address_line1', 255).nullable();
    t.string('address_line2', 255).nullable();
    t.string('city', 100).nullable();
    t.string('state_province', 100).nullable();
    t.string('postal_code', 20).nullable();
    t.string('country', 2).defaultTo('US');
    t.string('phone', 40).nullable();
    t.string('timezone', 60).nullable();
    t.boolean('is_default').notNullable().defaultTo(false);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('sort_order').unsigned().defaultTo(0);
    t.timestamps(true, true);

    t.index('tenant_id');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('locations');
};
