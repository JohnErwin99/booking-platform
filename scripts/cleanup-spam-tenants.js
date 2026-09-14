/**
 * Find (and optionally delete) spam trial tenants.
 *
 * Usage:
 *   node scripts/cleanup-spam-tenants.js            # dry run: list suspects
 *   node scripts/cleanup-spam-tenants.js --delete   # delete listed suspects
 */
require('dotenv').config();
const db = require('../config/database');
const { scoreSignup, normalizeEmail } = require('../utils/spamCheck');

const DELETE = process.argv.includes('--delete');

(async () => {
  const tenants = await db('tenants')
    .where('status', 'trial')
    .select('id', 'name', 'slug', 'email', 'created_at');

  // Count normalized-email collisions across ALL tenants (dot-variant abuse)
  const allUsers = await db('users').where('role', 'owner').select('tenant_id', 'email', 'first_name', 'last_name');
  const ownersByTenant = new Map(allUsers.map(u => [u.tenant_id, u]));
  const normCounts = new Map();
  for (const u of allUsers) {
    const n = normalizeEmail(u.email);
    normCounts.set(n, (normCounts.get(n) || 0) + 1);
  }

  const suspects = [];
  for (const t of tenants) {
    const owner = ownersByTenant.get(t.id) || {};
    const { score, reasons } = scoreSignup({
      business_name: t.name,
      first_name: owner.first_name,
      last_name: owner.last_name,
      email: owner.email || t.email,
    });
    let total = score;
    const allReasons = [...reasons];
    const norm = normalizeEmail(owner.email || t.email);
    if (normCounts.get(norm) > 1) {
      total += 2;
      allReasons.push('email collides with another account after normalization');
    }
    // Zero bookings makes gibberish signups even more suspicious
    if (total >= 2) {
      suspects.push({ ...t, owner_email: owner.email || t.email, score: total, reasons: allReasons.join('; ') });
    }
  }

  if (!suspects.length) {
    console.log('No spam suspects found.');
    process.exit(0);
  }

  console.log(`${suspects.length} suspected spam tenant(s):\n`);
  for (const s of suspects) {
    console.log(`  [${s.score}] #${s.id} "${s.name}" (${s.slug}) <${s.owner_email}> created ${s.created_at}`);
    console.log(`       reasons: ${s.reasons}`);
  }

  if (!DELETE) {
    console.log('\nDry run only. Re-run with --delete to remove these tenants.');
    process.exit(0);
  }

  for (const s of suspects) {
    await db('tenants').where('id', s.id).del(); // FK cascades remove users, locations, etc.
    console.log(`Deleted tenant #${s.id} "${s.name}"`);
  }
  console.log('\nDone.');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
