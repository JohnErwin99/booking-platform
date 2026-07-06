exports.up = function (knex) {
  return knex.schema.createTable('walkin_queue', (t) => {
    t.increments('id').unsigned();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.string('customer_name', 200).notNullable();
    t.string('customer_phone', 40).nullable();
    t.string('service_name', 200).nullable();
    t.integer('staff_id').unsigned().nullable()
      .references('id').inTable('staff').onDelete('SET NULL');
    t.integer('position').notNullable();
    t.enu('status', ['waiting', 'serving', 'completed', 'cancelled'])
      .notNullable().defaultTo('waiting');
    t.integer('estimated_wait_minutes').nullable();
    t.timestamp('checked_in_at').defaultTo(knex.fn.now());
    t.timestamp('serving_at').nullable();
    t.timestamp('completed_at').nullable();
    t.timestamps(true, true);

    t.index(['tenant_id', 'status'], 'idx_walkin_tenant_status');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('walkin_queue');
};
