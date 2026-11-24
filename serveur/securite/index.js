/* Comptes et sessions : connexion, verrouillage, rôles, gestion des utilisateurs.
   Toute lecture ou écriture passe par depot.comptes (pas de SQL ici). */
'use strict';
const crypto = require('crypto');
const { ErreurMetier } = require('../donnees/erreurs');
const { controlerMotDePasse, hacher, verifier, aRelever, empreinteFactice, reglerCout } = require('./mots-de-passe');
const { creerLimiteur } = require('./limiteur');

const ROLES = ['lecture', 'technicien', 'administrateur'], SESSIONS_PAR_COMPTE = 20;
const DEFAUTS = { echecsMax: 5, verrouillageMinutes: 15, sessionHeures: 12, inactiviteMinutes: 120, reinitialisationMinutes: 30, reinitialisationsParHeure: 3, tentativesParAdresse: 20, fenetreMinutes: 10, coutMotDePasse: 17 };
/* Valeur écrite au journal du service : sans caractère de contrôle (pas de fausse ligne injectée), et courte */
const propre = v => String(v ?? '').replace(/[^\x21-\x7e]/g, '?').slice(0, 64) || '-';
/* Adresse de courriel : en minuscules, ou '' ; lève une erreur si la forme est invalide */
function courrielValide(v) {
  const c = String(v || '').trim().toLowerCase();
  // Jeu de caractères restreint : ni balise, ni guillemet, ni séparateur, pour que l'adresse ne puisse rien porter d'autre qu'une adresse
  if (c && (c.length > 254 || !/^[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(c) || c.includes('..'))) throw new ErreurMetier('regle', 'Adresse de courriel invalide.');
  return c;
}
const empreinte = jeton => crypto.createHash('sha256').update(String(jeton)).digest('hex');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sans caractères ambigus (0/O, 1/I)
const code = () => [0, 1, 2].map(() => Array.from(crypto.randomBytes(4), b => ALPHABET[b % ALPHABET.length]).join('')).join('-');

function creerSecurite({ depot, config = {}, horloge = () => Date.now(), courrier = null, journal = () => {} }) {
  const c = depot.comptes, regle = { ...DEFAUTS, ...config };
  reglerCout(regle.coutMotDePasse);
  /* Événement de sécurité au journal du service (journald, Docker) : exploitable par un outil de surveillance */
  const evenement = (nom, champs) => journal(`SECURITE ${nom} ${Object.entries(champs).map(([k, v]) => `${k}=${propre(v)}`).join(' ')}`);
  const limiteur = creerLimiteur({ max: regle.tentativesParAdresse, fenetreMs: regle.fenetreMinutes * 60000, horloge, surBlocage: ip => evenement('adresse_bloquee', { adresse: ip, minutes: regle.fenetreMinutes }) });
  const publique = (u, t = horloge()) => u && ({ id: u.id, identifiant: u.identifiant, nom: u.nom, courriel: u.courriel || '', role: u.role, actif: !!u.actif, verrouille: !!u.verrouille_jusqu_a && u.verrouille_jusqu_a > t, derniereConnexion: u.derniere_connexion || null });
  const audit = (auteur, action, cible, apres = null, ip = '') => c.ajouterAudit({ date: Date.now(), utilisateur_id: auteur?.id || null, identifiant: auteur?.identifiant || '', action, collection: 'utilisateurs', cle: cible?.id || '', libelle: cible?.identifiant || '', avant: null, apres, ip });
  let codeInitialisation = c.nombre() === 0 ? code() : null;

  async function creerUtilisateur({ identifiant, nom = '', courriel = '', role, motDePasse }, auteur = null) {
    identifiant = String(identifiant || '').trim();
    if (!/^[A-Za-z0-9._-]{2,40}$/.test(identifiant)) throw new ErreurMetier('regle', 'Identifiant invalide : 2 à 40 lettres, chiffres, points ou tirets.');
    if (!ROLES.includes(role)) throw new ErreurMetier('regle', `Rôle inconnu (attendu : ${ROLES.join(', ')}).`);
    const refus = controlerMotDePasse(motDePasse, identifiant);
    if (refus) throw new ErreurMetier('regle', refus);
    const u = { id: 'u-' + crypto.randomBytes(8).toString('hex'), identifiant, nom: String(nom || '').trim().slice(0, 80), courriel: courrielValide(courriel), role, mot_de_passe: await hacher(motDePasse), cree_le: horloge() };
    c.creer(u);
    audit(auteur, 'utilisateur_creer', u, { identifiant, nom: u.nom, courriel: u.courriel, role });
    return publique(c.parId(u.id));
  }
  /* Les essais sur un même compte passent un par un : chacun voit le résultat du précédent. Sans cela, des essais lancés
     en même temps liraient tous « zéro échec » et passeraient tous avant que le verrou tombe. La file est bornée. */
  const files = new Map();
  async function unParUn(cle, fn, plein) {
    const f = files.get(cle) || { queue: Promise.resolve(), n: 0 };
    if (f.n >= 12) return plein();
    f.n++; files.set(cle, f);
    const tour = f.queue.then(fn, fn);
    f.queue = tour.then(() => {}, () => {});
    try { return await tour; } finally { if (--f.n === 0) files.delete(cle); }
  }
  /* Vérifie l'identifiant et le mot de passe ; ouvre une session et renvoie son jeton */
  async function connecter(identifiant, motDePasse, { ip = '' } = {}) {
    const saisie = String(identifiant || '').trim(), trouve = c.parIdentifiant(saisie) || (saisie.includes('@') ? c.parCourriel(saisie) : null);
    const cle = trouve ? 'compte:' + trouve.id : 'inconnu:' + saisie.toLowerCase().slice(0, 254);
    return unParUn(cle, () => connecterSeul(identifiant, motDePasse, { ip }), async () => { await verifier(String(motDePasse || ''), empreinteFactice()); throw new ErreurMetier('acces', `Identifiant ou mot de passe incorrect. Après ${regle.echecsMax} échecs, un compte est verrouillé ${regle.verrouillageMinutes} minutes.`); });
  }
  async function connecterSeul(identifiant, motDePasse, { ip = '' } = {}) {
    // Une seule réponse pour tous les refus : compte inconnu, mauvais mot de passe, compte verrouillé ou désactivé.
    // Elle ne dit donc pas si un compte existe, et le temps de calcul est le même dans tous les cas.
    const refus = new ErreurMetier('acces', `Identifiant ou mot de passe incorrect. Après ${regle.echecsMax} échecs, un compte est verrouillé ${regle.verrouillageMinutes} minutes.`), t = horloge();
    // On se connecte avec son identifiant, ou avec son adresse de courriel
    const saisi = String(identifiant || '').trim(), u = c.parIdentifiant(saisi) || (saisi.includes('@') ? c.parCourriel(saisi) : null);
    if (!u) { await verifier(String(motDePasse || ''), empreinteFactice()); evenement('echec_connexion', { compte: saisi, adresse: ip }); c.ajouterAudit({ date: Date.now(), identifiant: String(identifiant || '').slice(0, 40), action: 'echec_connexion', collection: 'utilisateurs', libelle: 'compte inconnu', ip }); throw refus; }
    if (u.verrouille_jusqu_a && u.verrouille_jusqu_a > t) { await verifier(String(motDePasse || ''), empreinteFactice()); evenement('echec_connexion', { compte: u.identifiant, adresse: ip, motif: 'verrouille' }); throw refus; }
    if (!u.actif || !(await verifier(String(motDePasse || ''), u.mot_de_passe))) {
      if (u.actif) { const echecs = u.echecs + 1, verrou = echecs >= regle.echecsMax; c.modifier(u.id, { echecs: verrou ? 0 : echecs, verrouille_jusqu_a: verrou ? t + regle.verrouillageMinutes * 60000 : null }); if (verrou) evenement('compte_verrouille', { compte: u.identifiant, adresse: ip, minutes: regle.verrouillageMinutes }); }
      evenement('echec_connexion', { compte: u.identifiant, adresse: ip });
      audit(u, 'echec_connexion', u, null, ip);
      throw refus;
    }
    const jeton = crypto.randomBytes(32).toString('base64url');
    // Empreinte calculée avec un coût plus faible que le réglage actuel : elle est refaite maintenant que le mot de passe est connu
    const releve = aRelever(u.mot_de_passe) ? { mot_de_passe: await hacher(String(motDePasse)) } : {};
    c.modifier(u.id, { echecs: 0, verrouille_jusqu_a: null, derniere_connexion: t, ...releve });
    c.creerSession(empreinte(jeton), u.id, t, ip);
    c.plafonnerSessions(u.id, SESSIONS_PAR_COMPTE);   // un compte n'empile pas les sessions : les plus anciennes sont fermées
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
  /* Un mauvais « mot de passe actuel » compte comme un échec de connexion : après le seuil, le compte est verrouillé et toutes
     ses sessions sont fermées. Une session volée ne permet donc pas de deviner le mot de passe par essais répétés. */
  async function changerMotDePasse(utilisateur, jeton, actuel, nouveau, { ip = '' } = {}) {
    return unParUn('mdp:' + utilisateur.id, () => changerSeul(utilisateur, jeton, actuel, nouveau, ip), () => { throw new ErreurMetier('interdit', 'Mot de passe actuel incorrect.'); });
  }
  async function changerSeul(utilisateur, jeton, actuel, nouveau, ip) {
    const u = c.parId(utilisateur.id), t = horloge();
    if (!u || !(await verifier(String(actuel || ''), u.mot_de_passe))) {
      if (u) {
        const echecs = u.echecs + 1, verrou = echecs >= regle.echecsMax;
        c.modifier(u.id, { echecs: verrou ? 0 : echecs, verrouille_jusqu_a: verrou ? t + regle.verrouillageMinutes * 60000 : null });
        evenement('echec_mot_de_passe_actuel', { compte: u.identifiant, adresse: ip });
        if (verrou) { c.supprimerSessionsDe(u.id); evenement('compte_verrouille', { compte: u.identifiant, adresse: ip, minutes: regle.verrouillageMinutes }); audit(u, 'echec_connexion', u, { motif: 'mot de passe actuel' }, ip); }
      }
      throw new ErreurMetier('interdit', 'Mot de passe actuel incorrect.');
    }
    const refus = controlerMotDePasse(nouveau, u.identifiant);
    if (refus) throw new ErreurMetier('regle', refus);
    c.modifier(u.id, { mot_de_passe: await hacher(nouveau), echecs: 0, verrouille_jusqu_a: null });
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
    if (v.courriel !== undefined) { champs.courriel = courrielValide(v.courriel); trace.courriel = champs.courriel; }
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
  async function initialiser({ code: recu, identifiant, nom, courriel, motDePasse }) {
    const a = Buffer.from(String(recu || '').trim().toUpperCase()), b = Buffer.from(codeInitialisation || '');
    if (!codeInitialisation || c.nombre() > 0 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new ErreurMetier('interdit', 'Code d\'initialisation incorrect, ou serveur déjà initialisé.');
    const u = await creerUtilisateur({ identifiant, nom, courriel, role: 'administrateur', motDePasse });
    codeInitialisation = null;
    return u;
  }
  /* --- Mot de passe perdu --- */
  /* Fabrique un lien à usage unique pour un compte. Renvoie le jeton (jamais stocké ni journalisé) et sa date d'expiration. */
  function nouveauLien(u, origine) {
    const t = horloge(), jeton = crypto.randomBytes(32).toString('base64url'), expire = t + regle.reinitialisationMinutes * 60000;
    c.purgerReinitialisations(t - 3600000);
    c.creerReinitialisation(empreinte(jeton), u.id, t, expire, origine);
    return { jeton, expire };
  }
  /* Lien remis par un administrateur à un collègue (aucun courriel nécessaire) */
  function lienReinitialisation(id, auteur) {
    const u = c.parId(String(id || ''));
    if (!u) throw new ErreurMetier('regle', 'Compte introuvable.');
    const { jeton, expire } = nouveauLien(u, 'administrateur');
    audit(auteur, 'lien_reinitialisation', u, { minutes: regle.reinitialisationMinutes });
    return { lien: `/?reinitialisation=${jeton}`, expire, identifiant: u.identifiant };
  }
  /* Demande faite depuis l'écran de connexion. Ne dit jamais si le compte existe ; n'envoie rien sans serveur d'envoi. */
  function demanderReinitialisation(compte, { ip = '' } = {}) {
    const saisi = String(compte || '').trim(), t = horloge();
    const u = saisi ? c.parIdentifiant(saisi) || (saisi.includes('@') ? c.parCourriel(saisi) : null) : null;
    if (!u || !u.actif || !u.courriel || !courrier?.actif) return;
    // Limite par compte, comptée dans le journal d'audit : elle tient même après une réinitialisation réussie
    if (c.compterAuditDe('demande_reinitialisation', u.id, Date.now() - 3600000) >= regle.reinitialisationsParHeure) return;
    const { jeton } = nouveauLien(u, 'courriel');
    audit(u, 'demande_reinitialisation', u, null, ip);
    courrier.envoyer({ a: u.courriel, sujet: 'NetCarto — réinitialisation de votre mot de passe',
      texte: `Bonjour,\n\nUne réinitialisation du mot de passe a été demandée pour le compte NetCarto « ${u.identifiant} ».\n\nOuvrez ce lien pour choisir un nouveau mot de passe. Il est valable ${regle.reinitialisationMinutes} minutes et ne sert qu'une fois :\n\n${courrier.adresse}/?reinitialisation=${jeton}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe ne change pas.\n` })
      .catch(e => journal(`Réinitialisation : courriel non envoyé (${e.message})`));
  }
  /* Choix du nouveau mot de passe avec un lien valable */
  async function reinitialiser(jeton, motDePasse, { ip = '' } = {}) {
    const refus = new ErreurMetier('regle', 'Lien de réinitialisation invalide ou expiré. Demandez-en un nouveau.');
    const r = c.reinitialisation(empreinte(String(jeton || ''))), t = horloge();
    if (!r || r.expire_le < t) throw refus;
    const u = c.parId(r.utilisateur_id);
    if (!u || !u.actif) throw refus;
    const faible = controlerMotDePasse(motDePasse, u.identifiant);
    if (faible) throw new ErreurMetier('regle', faible);
    c.modifier(u.id, { mot_de_passe: await hacher(motDePasse), echecs: 0, verrouille_jusqu_a: null });
    c.supprimerReinitialisationsDe(u.id); c.supprimerSessionsDe(u.id);
    audit(u, 'mot_de_passe_reinitialise', u, { origine: r.origine }, ip);
    return { identifiant: u.identifiant };
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
      courriel: { actif: !!courrier?.actif, sansAdresse: comptes.filter(u => u.actif && !u.courriel).map(u => u.identifiant) },
      https: certificat ? { actif: true, autoSigne: !!certificat.autoSigne, expire: certificat.expire.getTime(), joursRestants: Math.floor((certificat.expire.getTime() - t) / jour) } : { actif: false },
    };
  }
  return {
    ROLES, limiteur, etat, lienReinitialisation, demanderReinitialisation, reinitialiser, recuperationParCourriel: () => !!courrier?.actif, creerUtilisateur, connecter, session, deconnecter, changerMotDePasse, modifierUtilisateur, supprimerUtilisateur, initialiser,
    lister: () => c.lister().map(u => publique(u)), trouver: identifiant => publique(c.parIdentifiant(identifiant)),
    aInitialiser: () => c.nombre() === 0, get codeInitialisation() { return codeInitialisation; },
  };
}
module.exports = { creerSecurite, ROLES };
