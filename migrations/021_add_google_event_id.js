exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('bookings', 'google_event_id');
  if (!hasColumn) {
    return knex.schema.alterTable('bookings', t => {
      t.string('google_event_id').nullable();
    });
  }
};

exports.down = function(knex) {
  return knex.schema.alterTable('bookings', t => {
    t.dropColumn('google_event_id');
  });
};
