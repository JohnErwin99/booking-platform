exports.up = async function (knex) {
  // Add review_sent column to bookings table
  await knex.schema.alterTable('bookings', (t) => {
    t.boolean('review_sent').notNullable().defaultTo(false);
  });

  // Create reviews table
  await knex.schema.createTable('reviews', (t) => {
    t.increments('id').unsigned();
    t.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('booking_id').unsigned().notNullable().unique()
      .references('id').inTable('bookings').onDelete('CASCADE');
    t.integer('customer_id').unsigned().notNullable()
      .references('id').inTable('customers').onDelete('CASCADE');
    t.integer('staff_id').unsigned().notNullable()
      .references('id').inTable('staff').onDelete('CASCADE');
    t.integer('service_id').unsigned().notNullable()
      .references('id').inTable('services').onDelete('CASCADE');
    t.integer('rating').notNullable().defaultTo(0)
      .comment('0 = pending submission, 1-5 = actual rating');
    t.text('comment').nullable();
    t.string('photo_url', 500).nullable();
    t.string('review_token', 64).notNullable().unique();
    t.boolean('is_public').notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.index(['tenant_id', 'staff_id'], 'idx_reviews_tenant_staff');
    t.index(['tenant_id', 'is_public'], 'idx_reviews_tenant_public');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('reviews');
  await knex.schema.alterTable('bookings', (t) => {
    t.dropColumn('review_sent');
  });
};
