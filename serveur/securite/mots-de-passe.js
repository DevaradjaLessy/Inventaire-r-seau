/* Mots de passe : règle de solidité et empreinte scrypt salée (fonction intégrée à Node, coûteuse à attaquer).
   Coût par défaut : N = 2^17, r = 8, p = 1 (recommandation OWASP pour scrypt), soit environ 128 Mo par calcul.
   Les calculs passent par une file : deux à la fois au plus, pour qu'une rafale de connexions ne sature pas la mémoire. */
'use strict';
const crypto = require('crypto');

const LONGUEUR_MIN = 12, R = 8, P = 1, TAILLE = 64, COUT_DEFAUT = 17, COUT_MIN = 14, COUT_MAX = 20, EN_PARALLELE = 2;
let cout = COUT_DEFAUT, enCours = 0;
const attente = [];
/* Règle le coût : exposant de N (17 → N = 131072). Réservé à la configuration du serveur. */
function reglerCout(exposant) {
  if (!Number.isInteger(exposant) || exposant < COUT_MIN || exposant > COUT_MAX) throw new Error(`Réglage « securite.coutMotDePasse » invalide : nombre entier attendu entre ${COUT_MIN} et ${COUT_MAX}.`);
  cout = exposant;
}
const liberer = () => { enCours--; const suivant = attente.shift(); if (suivant) suivant(); };
async function scrypt(mdp, sel, n, r, p, taille) {
  if (enCours >= EN_PARALLELE) await new Promise(ok => attente.push(ok));
  enCours++;
  try { return await new Promise((ok, ko) => crypto.scrypt(mdp, sel, taille, { N: n, r, p, maxmem: 160 * n * r + 1048576 }, (e, cle) => (e ? ko(e) : ok(cle)))); }
  finally { liberer(); }
}
/* Mots et suites trop répandus : refusés même allongés de chiffres ou de signes */
const COURANTS = ['motdepasse', 'password', 'passw', 'azerty', 'azertyuiop', 'qwerty', 'qwertyuiop', 'netcarto', 'administrateur', 'administrator', 'admin', 'bienvenue', 'welcome', 'bonjour', 'soleil', 'changeme', 'changezmoi', 'iloveyou', 'jetaime', 'letmein', 'secret', 'reseau', 'network', 'cisco', 'root', 'toor'];

/* Renvoie le motif du refus, ou null si le mot de passe convient */
function controlerMotDePasse(mdp, identifiant = '') {
  if (typeof mdp !== 'string' || mdp.length < LONGUEUR_MIN) return `Le mot de passe doit compter au moins ${LONGUEUR_MIN} caractères.`;
  if (mdp.length > 200) return 'Le mot de passe est trop long (200 caractères au plus).';
  if (identifiant && mdp.toLowerCase().includes(String(identifiant).toLowerCase())) return 'Le mot de passe ne doit pas contenir l\'identifiant.';
  if (new Set(mdp).size < 5) return 'Mot de passe trop simple : variez les caractères.';
  // Ce qui reste une fois retirés chiffres et signes : s'il n'y a rien, ou seulement un mot répandu, le mot de passe se devine
  const lettres = mdp.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  if (!lettres || COURANTS.includes(lettres) || COURANTS.some(m => lettres === m + m)) return 'Mot de passe trop courant : il figure parmi les premiers essayés par un attaquant. Préférez une phrase de plusieurs mots.';
  return null;
}
/* Empreinte au format « scrypt$N$r$p$sel$empreinte » */
async function hacher(mdp) {
  const sel = crypto.randomBytes(16), n = 2 ** cout;
  return ['scrypt', n, R, P, sel.toString('base64'), (await scrypt(mdp, sel, n, R, P, TAILLE)).toString('base64')].join('$');
}
/* Compare en temps constant ; une empreinte illisible vaut un refus */
async function verifier(mdp, empreinte) {
  const [algo, n, r, p, sel, attendu] = String(empreinte || '').split('$');
  if (algo !== 'scrypt' || !attendu || !(+n >= 2 && +n <= 2 ** COUT_MAX)) return false;
  try {
    const a = Buffer.from(attendu, 'base64'), b = await scrypt(String(mdp), Buffer.from(sel, 'base64'), +n, +r, +p, a.length);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
/* Vrai si l'empreinte a été calculée avec un coût plus faible que le coût courant : à recalculer à la prochaine connexion réussie */
const aRelever = empreinte => { const n = +String(empreinte || '').split('$')[1]; return !(n >= 2 ** cout); };
/* Empreinte factice au coût courant : sert à dépenser le même temps quand le compte n'existe pas ou est verrouillé */
let factice = null;
const empreinteFactice = () => { if (!factice || aRelever(factice)) factice = ['scrypt', 2 ** cout, R, P, crypto.randomBytes(16).toString('base64'), crypto.randomBytes(TAILLE).toString('base64')].join('$'); return factice; };
module.exports = { controlerMotDePasse, hacher, verifier, aRelever, empreinteFactice, reglerCout, LONGUEUR_MIN };
