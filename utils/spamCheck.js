/**
 * Heuristics to detect bot/spam signups.
 */

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'sharklasers.com', '10minutemail.com', '10minutemail.net', 'temp-mail.org',
  'tempmail.com', 'tempmail.net', 'tempmailo.com', 'throwawaymail.com',
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'getnada.com', 'nada.email',
  'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'trashmail.com',
  'trashmail.de', 'mytemp.email', 'fakeinbox.com', 'mintemail.com',
  'mohmal.com', 'spamgourmet.com', 'mailcatch.com', 'inboxkitten.com',
  'emailondeck.com', 'moakt.com', 'tmail.ws', 'burnermail.io',
  'mail-temp.com', 'tempinbox.com', 'mailsac.com', 'codoteam.com',
  '33mail.com', 'anonaddy.me', 'dropmail.me', 'harakirimail.com',
  'grr.la', 'spam4.me', 'mvrht.net', 'tmpmail.org', 'tmpmail.net',
  'crazymailing.com', 'tempr.email', 'discard.email', 'discardmail.com',
  'spambog.com', 'spambog.de', 'teleworm.us', 'jetable.org',
  'mail7.io', 'linshiyouxiang.net', 'nowmymail.com', 'mailpoof.com',
]);

/**
 * Normalize an email for deduplication:
 * lowercase, trim, strip +tags; for gmail also strip dots in the local part
 * (gmail ignores dots, spammers use dot-variants to look unique).
 */
function normalizeEmail(email) {
  const e = String(email || '').toLowerCase().trim();
  const at = e.lastIndexOf('@');
  if (at === -1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  const plus = local.indexOf('+');
  if (plus !== -1) local = local.slice(0, plus);
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

function isDisposableDomain(email) {
  const at = String(email || '').lastIndexOf('@');
  if (at === -1) return false;
  return DISPOSABLE_DOMAINS.has(String(email).slice(at + 1).toLowerCase().trim());
}

// Letter pairs that essentially never occur in real names/words
const RARE_BIGRAMS = /qb|qc|qd|qf|qg|qh|qj|qk|ql|qm|qn|qp|qr|qs|qt|qv|qw|qx|qy|qz|lq|jq|jx|jz|vq|vk|vj|vx|wx|xj|zx|gzp|vck|bqz|fzx/;

/** Does this look like machine-generated gibberish (e.g. "Qmyrmkas", "Insvckt")? */
function looksRandomName(name) {
  const alpha = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
  if (alpha.length < 5) return false;
  if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(alpha)) return true;
  if (RARE_BIGRAMS.test(alpha)) return true;
  const vowels = (alpha.match(/[aeiouy]/g) || []).length;
  return vowels / alpha.length < 0.2;
}

/**
 * Score a signup. Higher = more likely spam.
 * Callers should block at score >= 3 and log/flag at 1-2.
 */
function scoreSignup({ business_name, first_name, last_name, email }) {
  const reasons = [];
  let score = 0;

  if (isDisposableDomain(email)) { score += 3; reasons.push('disposable email domain'); }

  // Ignore common suffixes so "Qmyrmkas LLC" is judged on "Qmyrmkas"
  const coreName = String(business_name || '').replace(/\b(llc|inc|ltd|corp|co)\b\.?/gi, '').trim();
  if (looksRandomName(coreName)) { score += 3; reasons.push('random-looking business name'); }
  if (looksRandomName(first_name)) { score += 2; reasons.push('random-looking first name'); }
  if (looksRandomName(last_name)) { score += 2; reasons.push('random-looking last name'); }

  if (first_name && last_name && String(first_name).toLowerCase() === String(last_name).toLowerCase()) {
    score += 1; reasons.push('first name equals last name');
  }

  const url = /https?:\/\/|www\./i;
  if (url.test(business_name) || url.test(first_name) || url.test(last_name)) {
    score += 3; reasons.push('URL in name field');
  }

  // Heavily dotted gmail local part (br.iel.le.min.ut.illo@gmail.com pattern)
  const e = String(email || '').toLowerCase();
  if (/@(gmail|googlemail)\.com$/.test(e)) {
    const dots = (e.split('@')[0].match(/\./g) || []).length;
    if (dots >= 3) { score += 2; reasons.push('gmail dot-variant address'); }
  }

  return { score, reasons };
}

module.exports = { normalizeEmail, isDisposableDomain, looksRandomName, scoreSignup, DISPOSABLE_DOMAINS };
