exports.up = function (knex) {
  return knex.schema.alterTable('tenants', (t) => {
    t.boolean('onboarding_completed').notNullable().defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('tenants', (t) => {
    t.dropColumn('onboarding_completed');
  });
};
