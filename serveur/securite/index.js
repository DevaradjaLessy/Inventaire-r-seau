/* Comptes et sessions : connexion, verrouillage, rôles, gestion des utilisateurs.
   Toute lecture ou écriture passe par depot.comptes (pas de SQL ici). */
'use strict';
const crypto = require('crypto');
const { ErreurMetier } = require('../donnees/erreurs');
const { controlerMotDePasse, hacher, verifier } = require('./mots-de-passe');

const ROLES = ['lecture', 'technicien', 'administrateur'];
const DEFAUTS = { echecsMax: 5, verrouillageMinutes: 15, sessionHeures: 12, inactiviteMinutes: 120 };
const empreinte = jeton => crypto.createHash('sha256').update(String(jeton)).digest('hex');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sans caractères ambigus (0/O, 1/I)
const code = () => [0, 1, 2].map(() => Array.from(crypto.randomBytes(4), b => ALPHABET[b % ALPHABET.length]).join('')).join('-');

function creerSecurite({ depot, config = {}, horloge = () => Date.now() }) {
  const c = depot.comptes, regle = { ...DEFAUTS, ...config };
  const publique = (u, t = horloge()) => u && ({ id: u.id, identifiant: u.identifiant, nom: u.nom, role: u.role, actif: !!u.actif, verrouille: !!u.verrouille_jusqu_a && u.verrouille_jusqu_a > t, derniereConnexion: u.derniere_connexion || null });
  const audit = (auteur, action, cible, apres = null, ip = '') => c.ajouterAudit({ date: Date.now(), utilisateur_id: auteur?.id || null, identifiant: auteur?.identifiant || '', action, collection: 'utilisateurs', cle: cible?.id || '', libelle: cible?.identifiant || '', avant: null, apres, ip });
  let codeInitialisation = c.nombre() === 0 ? code() : null;

  async function creerUtilisateur({ identifiant, nom = '', role, motDePasse }, auteur = null) {
    identifiant = String(identifiant || '').trim();
    if (!/^[A-Za-z0-9._-]{2,40}$/.test(identifiant)) throw new ErreurMetier('regle', 'Identifiant invalide : 2 à 40 lettres, chiffres, points ou tirets.');
    if (!ROLES.includes(role)) throw new ErreurMetier('regle', `Rôle inconnu (attendu : ${ROLES.join(', ')}).`);
    const refus = controlerMotDePasse(motDePasse, identifiant);
    if (refus) throw new ErreurMetier('regle', refus);
    const u = { id: 'u-' + crypto.randomBytes(8).toString('hex'), identifiant, nom: String(nom || '').trim().slice(0, 80), role, mot_de_passe: await hacher(motDePasse), cree_le: horloge() };
    c.creer(u);
    audit(auteur, 'utilisateur_creer', u, { identifiant, nom: u.nom, role });
    return publique(c.parId(u.id));
  }
  /* Vérifie l'identifiant et le mot de passe ; ouvre une session et renvoie son jeton */
  async function connecter(identifiant, motDePasse, { ip = '' } = {}) {
    const refus = new ErreurMetier('acces', 'Identifiant ou mot de passe incorrect.'), t = horloge();
    const u = c.parIdentifiant(String(identifiant || ''));
    if (!u) { await verifier(String(motDePasse || ''), 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'); c.ajouterAudit({ date: Date.now(), identifiant: String(identifiant || '').slice(0, 40), action: 'echec_connexion', collection: 'utilisateurs', libelle: 'compte inconnu', ip }); throw refus; }
    if (u.verrouille_jusqu_a && u.verrouille_jusqu_a > t) throw new ErreurMetier('verrouille', `Compte verrouillé après plusieurs échecs. Réessayez dans ${Math.ceil((u.verrouille_jusqu_a - t) / 60000)} minute(s), ou demandez à un administrateur de le déverrouiller.`);
    if (!u.actif || !(await verifier(String(motDePasse || ''), u.mot_de_passe))) {
      if (u.actif) { const echecs = u.echecs + 1, verrou = echecs >= regle.echecsMax; c.modifier(u.id, { echecs: verrou ? 0 : echecs, verrouille_jusqu_a: verrou ? t + regle.verrouillageMinutes * 60000 : null }); }
      audit(u, 'echec_connexion', u, null, ip);
      throw refus;
    }
    const jeton = crypto.randomBytes(32).toString('base64url');
    c.modifier(u.id, { echecs: 0, verrouille_jusqu_a: null, derniere_connexion: t });
    c.creerSession(empreinte(jeton), u.id, t, ip);
    c.purgerSessions(t - regle.sessionHeures * 3600000);
    audit(u, 'connexion', u, null, ip);
    return { jeton, utilisateur: publique(c.parId(u.id), t), dureeSecondes: regle.sessionHeures * 3600 };
  }
  /* Utilisateur de la session, ou null si elle est absente, expirée, ou si le compte est désactivé */
  function session(jeton) {
    if (!jeton) return null;
    const e = empreinte(jeton), s = c.session(e), t = horloge();
    if (!s) return null;
    if (!s.actif || t - s.creee_le > regle.sessionHeures * 3600000 || t - s.vue_le > regle.inactiviteMinutes * 60000) { c.supprimerSession(e); return null; }
    if (t - s.vue_le > 30000) c.toucherSession(e, t);
    return publique(s, t);
  }
  const deconnecter = jeton => { if (jeton) c.supprimerSession(empreinte(jeton)); };
  async function changerMotDePasse(utilisateur, jeton, actuel, nouveau) {
    const u = c.parId(utilisateur.id);
    if (!u || !(await verifier(String(actuel || ''), u.mot_de_passe))) throw new ErreurMetier('interdit', 'Mot de passe actuel incorrect.');
    const refus = controlerMotDePasse(nouveau, u.identifiant);
    if (refus) throw new ErreurMetier('regle', refus);
    c.modifier(u.id, { mot_de_passe: await hacher(nouveau) });
    c.supprimerSessionsDe(u.id, empreinte(jeton));   // les autres sessions de ce compte sont fermées
    audit(u, 'mot_de_passe', u);
  }
  /* Il doit toujours rester un administrateur actif */
  const dernierAdmin = u => u.role === 'administrateur' && u.actif && c.nombreAdministrateurs() <= 1;
  async function modifierUtilisateur(id, v, auteur) {
    const u = c.parId(id);
    if (!u) throw new ErreurMetier('regle', 'Compte introuvable.');
    const champs = {}, trace = {};
    if (v.nom !== undefined) { champs.nom = String(v.nom).trim().slice(0, 80); trace.nom = champs.nom; }
    if (v.role !== undefined && v.role !== u.role) {
      if (!ROLES.includes(v.role)) throw new ErreurMetier('regle', `Rôle inconnu (attendu : ${ROLES.join(', ')}).`);
      if (dernierAdmin(u)) throw new ErreurMetier('regle', 'Impossible : c\'est le dernier administrateur actif.');
      champs.role = v.role; trace.role = v.role;
    }
    if (v.actif !== undefined && !!v.actif !== !!u.actif) {
      if (!v.actif && auteur && auteur.id === u.id) throw new ErreurMetier('regle', 'Vous ne pouvez pas désactiver votre propre compte.');
      if (!v.actif && dernierAdmin(u)) throw new ErreurMetier('regle', 'Impossible : c\'est le dernier administrateur actif.');
      champs.actif = v.actif ? 1 : 0; trace.actif = !!v.actif;
    }
    if (v.motDePasse !== undefined) { const refus = controlerMotDePasse(v.motDePasse, u.identifiant); if (refus) throw new ErreurMetier('regle', refus); champs.mot_de_passe = await hacher(v.motDePasse); trace.motDePasse = 'réinitialisé'; }
    if (v.deverrouiller) { champs.echecs = 0; champs.verrouille_jusqu_a = null; trace.deverrouille = true; }
    c.modifier(id, champs);
    if (champs.actif === 0 || champs.mot_de_passe) c.supprimerSessionsDe(id);
    audit(auteur, 'utilisateur_modifier', u, trace);
    return publique(c.parId(id));
  }
  function supprimerUtilisateur(id, auteur) {
    const u = c.parId(id);
    if (!u) throw new ErreurMetier('regle', 'Compte introuvable.');
    if (auteur && auteur.id === id) throw new ErreurMetier('regle', 'Vous ne pouvez pas supprimer votre propre compte.');
    if (dernierAdmin(u)) throw new ErreurMetier('regle', 'Impossible : c\'est le dernier administrateur actif.');
    c.supprimer(id);
    audit(auteur, 'utilisateur_supprimer', u, { identifiant: u.identifiant });
  }
  /* Création du premier administrateur, avec le code affiché au démarrage du serveur */
  async function initialiser({ code: recu, identifiant, nom, motDePasse }) {
    const a = Buffer.from(String(recu || '').trim().toUpperCase()), b = Buffer.from(codeInitialisation || '');
    if (!codeInitialisation || c.nombre() > 0 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new ErreurMetier('interdit', 'Code d\'initialisation incorrect, ou serveur déjà initialisé.');
    const u = await creerUtilisateur({ identifiant, nom, role: 'administrateur', motDePasse });
    codeInitialisation = null;
    return u;
  }
  /* État de sécurité du serveur, pour l'administrateur : ce qui mérite un coup d'œil, sans aucun secret.
     options : { sauvegardes (module des sauvegardes), certificat (HTTPS en service, ou null) } */
  function etat({ sauvegardes = null, certificat = null } = {}) {
    const t = horloge(), jour = 86400000, comptes = c.lister();
    const copies = sauvegardes ? sauvegardes.lister() : [], derniere = copies[0] || null, reglages = sauvegardes ? sauvegardes.reglages() : { actif: false };
    return {
      echecs24h: c.compterAudit('echec_connexion', t - jour),
      verrouilles: comptes.filter(u => u.verrouille_jusqu_a && u.verrouille_jusqu_a > t).map(u => u.identifiant),
      jamaisConnectes: comptes.filter(u => u.actif && !u.derniere_connexion).map(u => u.identifiant),
      inactifs90j: comptes.filter(u => u.actif && u.derniere_connexion && u.derniere_connexion < t - 90 * jour).map(u => u.identifiant),
      comptes: { total: comptes.length, actifs: comptes.filter(u => u.actif).length, administrateurs: comptes.filter(u => u.actif && u.role === 'administrateur').length },
      sessions: c.nombreSessions(t - regle.inactiviteMinutes * 60000),
      sauvegarde: { automatique: !!reglages.actif, nombre: copies.length, derniere: derniere ? derniere.date : null, ageHeures: derniere ? Math.max(0, Math.round((t - derniere.date) / 360000) / 10) : null },
      https: certificat ? { actif: true, autoSigne: !!certificat.autoSigne, expire: certificat.expire.getTime(), joursRestants: Math.floor((certificat.expire.getTime() - t) / jour) } : { actif: false },
    };
  }
  return {
    ROLES, etat, creerUtilisateur, connecter, session, deconnecter, changerMotDePasse, modifierUtilisateur, supprimerUtilisateur, initialiser,
    lister: () => c.lister().map(u => publique(u)), trouver: identifiant => publique(c.parIdentifiant(identifiant)),
    aInitialiser: () => c.nombre() === 0, get codeInitialisation() { return codeInitialisation; },
  };
}
module.exports = { creerSecurite, ROLES };
