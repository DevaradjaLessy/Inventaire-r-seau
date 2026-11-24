/* Configuration du serveur. Ordre de priorité : valeurs par défaut, puis fichier TOML,
   puis variables d'environnement, puis arguments de la ligne de commande.
   Aucun chemin propre à un système n'est écrit ici : les dossiers viennent de la configuration.
   Un chemin relatif est compris par rapport au fichier de réglages (ou au dossier du serveur, sans fichier). */
'use strict';
const fs = require('fs'), path = require('path');
const { parse } = require('smol-toml');

const DEFAUTS = {
  serveur: { hote: '127.0.0.1', port: 8443, proxyDeConfiance: false },   // proxyDeConfiance : true seulement si NetCarto est derrière votre propre proxy inverse
  https: { actif: true, certificat: '', cle: '', noms: [] },   // sans fichiers fournis, un certificat auto-signé est créé dans le dossier de données
  securite: { echecsMax: 5, verrouillageMinutes: 15, sessionHeures: 12, inactiviteMinutes: 120, tentativesParAdresse: 20, fenetreMinutes: 10, coutMotDePasse: 17 },
  donnees: { dossier: 'donnees-locales' },
  courriel: { hote: '', port: 587, securite: 'starttls', utilisateur: '', motDePasse: '', expediteur: '', adresse: '', autorite: '' },   // sans hôte : aucun courriel n'est envoyé
  sauvegardes: { actif: true, heure: '02:30', conserver: 14, dossier: '' },   // dossier vide : « sauvegardes » dans le dossier de données
  web: { dossier: '..' },
  supervision: { intervalle: 30, sources: [] },
  limites: { corpsMaxMo: 25 },
};
const fusion = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? fusion(a[k], v) : v; return o; };
const arg = (args, nom) => { const i = args.indexOf('--' + nom); return i >= 0 ? args[i + 1] : undefined; };

/* Réglages des sauvegardes : heure au format HH:MM, nombre entier de sauvegardes automatiques gardées */
function controlerSauvegardes(s) {
  if (typeof s.actif !== 'boolean') throw new Error('Réglage « sauvegardes.actif » invalide : true ou false attendu.');
  if (typeof s.heure !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.heure)) throw new Error('Réglage « sauvegardes.heure » invalide : heure attendue au format HH:MM, par exemple "02:30".');
  if (!Number.isInteger(s.conserver) || s.conserver < 1) throw new Error('Réglage « sauvegardes.conserver » invalide : nombre entier d\'au moins 1 attendu.');
  if (typeof s.dossier !== 'string') throw new Error('Réglage « sauvegardes.dossier » invalide : chemin attendu.');
}
/* Réglages de l'envoi de courriels : facultatifs. Avec un hôte, l'expéditeur et l'adresse publique de NetCarto sont obligatoires. */
function controlerCourriel(c) {
  if (typeof c.hote !== 'string') throw new Error('Réglage « courriel.hote » invalide.');
  if (!c.hote) return;
  if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) throw new Error('Réglage « courriel.port » invalide.');
  if (!['starttls', 'tls', 'aucune'].includes(c.securite)) throw new Error('Réglage « courriel.securite » invalide : "starttls", "tls" ou "aucune" attendu.');
  if (!/^[^\s@<>]+@[^\s@<>]+$|^[^<>\r\n]*<[^\s@<>]+@[^\s@<>]+>$/.test(c.expediteur || '') || /[\r\n]/.test(c.expediteur || '')) throw new Error('Réglage « courriel.expediteur » obligatoire : adresse d\'expédition, par exemple "NetCarto <netcarto@exemple.interne>".');
  // Un compte sur une liaison sans chiffrement enverrait son mot de passe en clair sur le réseau
  if (c.securite === 'aucune' && c.utilisateur) throw new Error('Réglage « courriel.securite » : avec "aucune", le mot de passe du compte d\'envoi circulerait en clair. Choisissez "starttls" ou "tls", ou retirez « utilisateur » si votre relais interne n\'en demande pas.');
  // Autorité de certification interne : fichier PEM du certificat qui a signé celui du serveur d'envoi
  if (typeof c.autorite !== 'string') throw new Error('Réglage « courriel.autorite » invalide : chemin d\'un fichier attendu.');
  if (c.autorite && !fs.existsSync(c.autorite)) throw new Error(`Réglage « courriel.autorite » : fichier introuvable (${c.autorite}).`);
  if (!/^https?:\/\/[^\s/]+/.test(c.adresse || '')) throw new Error('Réglage « courriel.adresse » obligatoire : adresse par laquelle vos collègues ouvrent NetCarto, par exemple "https://netcarto.exemple.interne:8443". Elle sert à écrire les liens des courriels.');
}
/* options : { env, args } (par défaut : ceux du processus) */
function chargerConfig({ env = process.env, args = process.argv.slice(2) } = {}) {
  const fichier = arg(args, 'config') || env.NETCARTO_CONFIG || null;
  let cfg = fusion({}, DEFAUTS), base = __dirname;
  if (fichier) {
    const f = path.resolve(fichier);
    if (!fs.existsSync(f)) throw new Error(`Fichier de réglages introuvable : ${f}`);
    let lu;
    try { lu = parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error(`Fichier de réglages illisible (TOML) : ${f}\n${e.message}`); }
    cfg = fusion(cfg, lu); base = path.dirname(f);
  }
  cfg.donnees.dossier = path.resolve(base, cfg.donnees.dossier);
  cfg.web.dossier = path.resolve(base, cfg.web.dossier);
  if (cfg.sauvegardes.dossier) cfg.sauvegardes.dossier = path.resolve(base, cfg.sauvegardes.dossier);
  for (const k of ['certificat', 'cle']) if (cfg.https[k]) cfg.https[k] = path.resolve(base, cfg.https[k]);
  if (cfg.courriel.autorite) cfg.courriel.autorite = path.resolve(base, cfg.courriel.autorite);
  // Variables d'environnement et arguments : chemins relatifs au dossier courant
  const hote = arg(args, 'hote') || env.NETCARTO_HOTE, port = arg(args, 'port') || env.NETCARTO_PORT, donnees = arg(args, 'donnees') || env.NETCARTO_DONNEES;
  if (hote) cfg.serveur.hote = hote;
  if (port !== undefined) cfg.serveur.port = /^\d+$/.test(String(port)) ? +port : port;
  if (donnees) cfg.donnees.dossier = path.resolve(donnees);
  cfg.fichier = fichier ? path.resolve(fichier) : null;
  cfg.demo = args.includes('--demo');
  // Contrôles
  if (!Number.isInteger(cfg.serveur.port) || cfg.serveur.port < 0 || cfg.serveur.port > 65535) throw new Error('Réglage « serveur.port » invalide : nombre entier attendu entre 0 et 65535.');
  if (typeof cfg.serveur.hote !== 'string' || !cfg.serveur.hote) throw new Error('Réglage « serveur.hote » invalide.');
  if (!Array.isArray(cfg.supervision.sources)) throw new Error('Réglage « supervision.sources » invalide : liste attendue.');
  if (args.includes('--http')) cfg.https.actif = false;
  for (const k of ['echecsMax', 'verrouillageMinutes', 'sessionHeures', 'inactiviteMinutes', 'tentativesParAdresse', 'fenetreMinutes']) if (!(cfg.securite[k] > 0)) throw new Error(`Réglage « securite.${k} » invalide : nombre positif attendu.`);
  if (!Number.isInteger(cfg.securite.coutMotDePasse) || cfg.securite.coutMotDePasse < 14 || cfg.securite.coutMotDePasse > 20) throw new Error('Réglage « securite.coutMotDePasse » invalide : nombre entier attendu entre 14 et 20 (17 recommandé).');
  if (typeof cfg.serveur.proxyDeConfiance !== 'boolean') throw new Error('Réglage « serveur.proxyDeConfiance » invalide : true ou false attendu.');
  // Le mot de passe du serveur d'envoi ne s'écrit pas dans le fichier : "env:NOM" le lit dans l'environnement
  if (/^env:/.test(cfg.courriel.motDePasse || '')) cfg.courriel.motDePasse = env[cfg.courriel.motDePasse.slice(4)] || '';
  cfg.courriel.adresse = String(cfg.courriel.adresse || '').replace(/\/+$/, '');
  controlerCourriel(cfg.courriel);
  controlerSauvegardes(cfg.sauvegardes);
  if (!(cfg.limites.corpsMaxMo > 0)) throw new Error('Réglage « limites.corpsMaxMo » invalide.');
  return cfg;
}
module.exports = { chargerConfig, controlerSauvegardes, controlerCourriel, DEFAUTS };
