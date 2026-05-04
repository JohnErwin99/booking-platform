exports.up = function (knex) {
  return knex.schema.createTable('sessions', (t) => {
    t.string('sid', 255).notNullable().primary();
    t.text('sess', 'mediumtext').notNullable();
    t.datetime('expired').notNullable().index();
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('sessions');
};
