exports.up = function (knex) {
  return knex.schema.createTable('staff', (t) => {
    t.increments('id').unsigned();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('location_id').unsigned().nullable()
      .references('id').inTable('locations').onDelete('SET NULL');
    t.string('first_name', 100).notNullable();
    t.string('last_name', 100).notNullable();
    t.string('display_name', 200).nullable();
    t.string('email', 190).nullable();
    t.string('phone', 40).nullable();
    t.string('photo_url', 500).nullable();
    t.string('title', 100).nullable();
    t.text('bio').nullable();
    t.decimal('commission_rate', 5, 2).nullable();
    t.integer('slot_duration').unsigned().defaultTo(30);
    t.integer('buffer_before').unsigned().defaultTo(0);
    t.integer('buffer_after').unsigned().defaultTo(0);
    t.boolean('is_bookable').notNullable().defaultTo(true);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('sort_order').unsigned().defaultTo(0);
    t.timestamps(true, true);

    t.index('tenant_id');
    t.index(['tenant_id', 'location_id']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('staff');
};
