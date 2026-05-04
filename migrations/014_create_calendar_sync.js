exports.up = function (knex) {
  return knex.schema.createTable('calendar_sync', (t) => {
    t.increments('id').unsigned();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('staff_id').unsigned().notNullable()
      .references('id').inTable('staff').onDelete('CASCADE');
    t.enu('provider', ['google', 'outlook', 'apple']).notNullable();
    t.string('calendar_id', 255).notNullable();
    t.text('access_token').nullable();
    t.text('refresh_token').nullable();
    t.timestamp('token_expires_at').nullable();
    t.string('sync_token', 255).nullable();
    t.timestamp('last_synced_at').nullable();
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);

    t.index(['tenant_id', 'staff_id']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('calendar_sync');
};
