exports.up = function (knex) {
  return knex.schema.alterTable('tenants', (t) => {
    t.timestamp('trial_ends_at').nullable();
    t.string('plan', 50).defaultTo('trial');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('tenants', (t) => {
    t.dropColumn('trial_ends_at');
    t.dropColumn('plan');
  });
};
