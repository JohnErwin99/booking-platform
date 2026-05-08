exports.up = function (knex) {
  return knex.schema.createTable('email_queue', (t) => {
    t.increments('id').unsigned();
    t.string('to', 255).notNullable();
    t.string('subject', 500).notNullable();
    t.text('html').notNullable();
    t.text('text').nullable();
    t.integer('attempts').unsigned().defaultTo(0);
    t.integer('max_attempts').unsigned().defaultTo(5);
    t.enu('status', ['pending', 'sent', 'failed']).defaultTo('pending');
    t.text('last_error').nullable();
    t.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('email_queue');
};
