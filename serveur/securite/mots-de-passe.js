/* Mots de passe : règle de solidité et empreinte scrypt salée (fonction intégrée à Node, coûteuse à attaquer). */
'use strict';
const crypto = require('crypto');

const LONGUEUR_MIN = 12, N = 32768, R = 8, P = 1, TAILLE = 64;
const scrypt = (mdp, sel, n, r, p, taille) => new Promise((ok, ko) => crypto.scrypt(mdp, sel, taille, { N: n, r, p, maxmem: 256 * 1024 * 1024 }, (e, cle) => (e ? ko(e) : ok(cle))));

/* Renvoie le motif du refus, ou null si le mot de passe convient */
function controlerMotDePasse(mdp, identifiant = '') {
  if (typeof mdp !== 'string' || mdp.length < LONGUEUR_MIN) return `Le mot de passe doit compter au moins ${LONGUEUR_MIN} caractères.`;
  if (mdp.length > 200) return 'Le mot de passe est trop long (200 caractères au plus).';
  if (identifiant && mdp.toLowerCase().includes(String(identifiant).toLowerCase())) return 'Le mot de passe ne doit pas contenir l\'identifiant.';
  if (new Set(mdp).size < 5) return 'Mot de passe trop simple : variez les caractères.';
  return null;
}
/* Empreinte au format « scrypt$N$r$p$sel$empreinte » */
async function hacher(mdp) {
  const sel = crypto.randomBytes(16);
  return ['scrypt', N, R, P, sel.toString('base64'), (await scrypt(mdp, sel, N, R, P, TAILLE)).toString('base64')].join('$');
}
/* Compare en temps constant ; une empreinte illisible vaut un refus */
async function verifier(mdp, empreinte) {
  const [algo, n, r, p, sel, attendu] = String(empreinte || '').split('$');
  if (algo !== 'scrypt' || !attendu) return false;
  try {
    const a = Buffer.from(attendu, 'base64'), b = await scrypt(String(mdp), Buffer.from(sel, 'base64'), +n, +r, +p, a.length);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
module.exports = { controlerMotDePasse, hacher, verifier, LONGUEUR_MIN };
