const fr = require('./fr');

/**
 * Translate a flash message. Static messages are looked up directly.
 * Dynamic messages (containing variables) are matched by prefix.
 */
function t(msg, lang) {
  if (lang !== 'fr') return msg;

  // Direct match
  if (fr[msg]) return fr[msg];

  // Dynamic messages — match by known prefix patterns
  if (msg.startsWith('Welcome! A confirmation email')) {
    const email = msg.match(/sent to (.+?)\./)?.[1] || '';
    return `Bienvenue! Un courriel de confirmation a été envoyé à ${email}. Veuillez vérifier votre boîte de réception ou courrier indésirable.`;
  }
  if (msg.startsWith('Staff member added.')) {
    const email = msg.match(/sent to (.+?)\./)?.[1] || '';
    return `Membre du personnel ajouté. Un courriel de bienvenue a été envoyé à ${email}. Demandez-leur de vérifier leur boîte de réception ou courrier indésirable.`;
  }
  if (msg.startsWith('Imported ')) {
    const m = msg.match(/Imported (\d+) customer[s]?\. (\d+) skipped/);
    if (m) return `${m[1]} client(s) importé(s). ${m[2]} ignoré(s) (doublon ou vide).`;
  }
  if (msg.startsWith('Google Calendar connected')) {
    const id = msg.match(/\((.+?)\)/)?.[1] || '';
    return `Google Agenda connecté (${id}). Les nouvelles réservations se synchroniseront automatiquement.`;
  }

  // No translation found — return original
  return msg;
}

module.exports = { t };
