exports.up = function (knex) {
  return knex.schema.alterTable('users', (t) => {
    t.string('photo_url', 500).nullable().after('last_name');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('users', (t) => {
    t.dropColumn('photo_url');
  });
};
