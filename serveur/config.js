/* Configuration du serveur. Ordre de priorité : valeurs par défaut, puis fichier TOML,
   puis variables d'environnement, puis arguments de la ligne de commande.
   Aucun chemin propre à un système n'est écrit ici : les dossiers viennent de la configuration.
   Un chemin relatif est compris par rapport au fichier de réglages (ou au dossier du serveur, sans fichier). */
'use strict';
const fs = require('fs'), path = require('path');
const { parse } = require('smol-toml');

const DEFAUTS = {
  serveur: { hote: '127.0.0.1', port: 8080 },
  donnees: { dossier: 'donnees-locales' },
  web: { dossier: '..' },
  supervision: { intervalle: 30, sources: [] },
  limites: { corpsMaxMo: 25 },
};
const fusion = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? fusion(a[k], v) : v; return o; };
const arg = (args, nom) => { const i = args.indexOf('--' + nom); return i >= 0 ? args[i + 1] : undefined; };

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
  if (!(cfg.limites.corpsMaxMo > 0)) throw new Error('Réglage « limites.corpsMaxMo » invalide.');
  return cfg;
}
module.exports = { chargerConfig, DEFAUTS };
