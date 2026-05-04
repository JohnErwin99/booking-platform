exports.up = function (knex) {
  return knex.schema.createTable('customers', (t) => {
    t.increments('id').unsigned();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.string('first_name', 100).notNullable();
    t.string('last_name', 100).notNullable();
    t.string('email', 190).notNullable();
    t.string('phone', 40).nullable();
    t.date('date_of_birth').nullable();
    t.text('notes').nullable();
    t.text('preferences').nullable();
    t.string('tags', 500).nullable();
    t.integer('total_bookings').unsigned().notNullable().defaultTo(0);
    t.integer('total_spent_cents').unsigned().notNullable().defaultTo(0);
    t.integer('total_no_shows').unsigned().notNullable().defaultTo(0);
    t.date('last_visit_date').nullable();
    t.string('stripe_customer_id', 100).nullable();
    t.timestamps(true, true);

    t.unique(['tenant_id', 'email']);
    t.index('tenant_id');
    t.index(['tenant_id', 'last_name', 'first_name']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('customers');
};
