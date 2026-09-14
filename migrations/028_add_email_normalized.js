const { normalizeEmail } = require('../utils/spamCheck');

exports.up = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.string('email_normalized', 190).nullable().index();
  });

  const users = await knex('users').select('id', 'email');
  for (const u of users) {
    await knex('users').where('id', u.id).update({ email_normalized: normalizeEmail(u.email) });
  }
};

exports.down = function (knex) {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('email_normalized');
  });
};
