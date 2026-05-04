exports.up = function (knex) {
  return knex.schema.createTable('blocked_dates', (t) => {
    t.increments('id').unsigned();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('location_id').unsigned().nullable()
      .references('id').inTable('locations').onDelete('SET NULL');
    t.integer('staff_id').unsigned().nullable()
      .references('id').inTable('staff').onDelete('CASCADE');
    t.date('blocked_date').notNullable();
    t.boolean('all_day').notNullable().defaultTo(true);
    t.time('start_time').nullable();
    t.time('end_time').nullable();
    t.string('reason', 200).nullable();
    t.timestamps(true, true);

    t.index(['tenant_id', 'blocked_date']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('blocked_dates');
};
