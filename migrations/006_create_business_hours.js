exports.up = function (knex) {
  return knex.schema.createTable('business_hours', (t) => {
    t.increments('id').unsigned();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('location_id').unsigned().nullable()
      .references('id').inTable('locations').onDelete('SET NULL');
    t.integer('staff_id').unsigned().nullable()
      .references('id').inTable('staff').onDelete('CASCADE');
    t.tinyint('weekday').unsigned().notNullable(); // 0=Sun..6=Sat
    t.time('open_at').nullable();   // null = closed
    t.time('close_at').nullable();
    t.time('break_start').nullable();
    t.time('break_end').nullable();

    t.unique(['tenant_id', 'location_id', 'staff_id', 'weekday']);
    t.index('tenant_id');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('business_hours');
};
