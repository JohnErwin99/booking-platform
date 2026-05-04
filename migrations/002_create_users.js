exports.up = function (knex) {
  return knex.schema.createTable('users', (t) => {
    t.increments('id').unsigned();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.string('email', 190).notNullable();
    t.string('password_hash', 255).notNullable();
    t.string('first_name', 100).notNullable();
    t.string('last_name', 100).notNullable();
    t.enu('role', ['owner', 'manager', 'staff']).notNullable().defaultTo('staff');
    t.integer('staff_id').unsigned().nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('last_login_at').nullable();
    t.timestamps(true, true);

    t.unique(['tenant_id', 'email']);
    t.index('tenant_id');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('users');
};
