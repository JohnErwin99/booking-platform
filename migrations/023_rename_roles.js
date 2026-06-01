exports.up = async function (knex) {
  // Alter enum to include 'contributor', then migrate data, then remove old values
  await knex.schema.alterTable('users', (t) => {
    t.enu('role_new', ['owner', 'contributor']).notNullable().defaultTo('contributor').after('role');
  });
  // Copy data: staff → contributor, manager → owner, owner → owner
  await knex.raw("UPDATE users SET role_new = CASE WHEN role = 'staff' THEN 'contributor' WHEN role = 'manager' THEN 'owner' ELSE 'owner' END");
  // Drop old column and rename
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('role');
  });
  await knex.schema.alterTable('users', (t) => {
    t.renameColumn('role_new', 'role');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('users', (t) => {
    t.enu('role_old', ['owner', 'manager', 'staff']).notNullable().defaultTo('staff').after('role');
  });
  await knex.raw("UPDATE users SET role_old = CASE WHEN role = 'contributor' THEN 'staff' ELSE role END");
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('role');
  });
  await knex.schema.alterTable('users', (t) => {
    t.renameColumn('role_old', 'role');
  });
};
