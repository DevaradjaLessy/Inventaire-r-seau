#!/usr/bin/env node
/* NetCarto — lancement du serveur et gestion des comptes en ligne de commande.
   Usage : node netcarto.js [--config fichier.toml] [--port 8443] [--hote 127.0.0.1] [--donnees dossier] [--demo] [--http]
           node netcarto.js compte <identifiant> [--role administrateur]     crée le compte, ou change son mot de passe et le déverrouille
           node netcarto.js sauvegarde | sauvegardes | restaurer <sauvegarde>  copie immédiate, liste, restauration complète
           node netcarto.js sante                                             le serveur répond-il ? (code de retour 0 ou 1)
   Sans fichier de réglages, le serveur écoute sur https://127.0.0.1:8443 et range ses données à côté de lui. */
'use strict';
const path = require('path'), readline = require('readline');
const { chargerConfig } = require('./config');
const { demarrer } = require('./app');

const AIDE = `NetCarto — serveur
  --config <fichier>   fichier de réglages TOML (ou variable NETCARTO_CONFIG)
  --port <n>           port d'écoute (ou NETCARTO_PORT) ; 8443 par défaut
  --hote <adresse>     adresse d'écoute (ou NETCARTO_HOTE) ; 127.0.0.1 par défaut
  --donnees <dossier>  dossier de la base de données (ou NETCARTO_DONNEES)
  --demo               charge le jeu de démonstration si la base ne contient aucun site
  --http               désactive le HTTPS (essais sur ce poste uniquement)
  --aide               affiche cette aide

Comptes (le serveur peut rester en marche) :
  node netcarto.js compte <identifiant> [--role lecture|technicien|administrateur]
      crée le compte, ou, s'il existe, change son mot de passe et le déverrouille.
      Le mot de passe est demandé au clavier (ou lu dans la variable NETCARTO_MOT_DE_PASSE).

Sauvegardes (mêmes options --config et --donnees que le serveur) :
  node netcarto.js sauvegarde               copie immédiate de la base (le serveur peut rester en marche)
  node netcarto.js sauvegardes              liste des sauvegardes
  node netcarto.js restaurer <sauvegarde>   remplace toute la base par une sauvegarde, comptes et journal d'audit compris.
      Le serveur doit être arrêté. <sauvegarde> : un nom de la liste, ou le chemin d'un fichier.
      L'état d'avant est gardé dans le dossier des sauvegardes.

Surveillance :
  node netcarto.js sante                    code de retour 0 si le serveur répond, 1 sinon (Docker, systemd, supervision)`;

/* Demande un mot de passe au clavier, sans l'afficher */
function demanderMotDePasse(question) {
  return new Promise(ok => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = false;
    rl._writeToOutput = s => { if (!rl.stdoutMuted) rl.output.write(s); };
    rl.question(question, v => { rl.close(); process.stdout.write('\n'); ok(v); });
    rl.stdoutMuted = true;
  });
}
async function commandeCompte(args) {
  const identifiant = args[1], i = args.indexOf('--role'), role = i >= 0 ? args[i + 1] : 'administrateur';
  if (!identifiant || identifiant.startsWith('--')) throw new Error('Indiquez l\'identifiant : node netcarto.js compte <identifiant>');
  const cfg = chargerConfig({ args: args.slice(2) });
  const { ouvrirBase } = require('./donnees'), { creerSecurite } = require('./securite');
  const depot = ouvrirBase({ fichier: path.join(cfg.donnees.dossier, 'netcarto.sqlite') });
  try {
    const securite = creerSecurite({ depot, config: cfg.securite }), existant = securite.trouver(identifiant);
    const motDePasse = process.env.NETCARTO_MOT_DE_PASSE || await demanderMotDePasse(`Mot de passe pour ${identifiant} (12 caractères au moins) : `);
    if (existant) { await securite.modifierUtilisateur(existant.id, { motDePasse, deverrouiller: true, actif: true }, null); console.log(`Mot de passe de « ${existant.identifiant} » changé ; compte déverrouillé.`); }
    else { const u = await securite.creerUtilisateur({ identifiant, nom: identifiant, role, motDePasse }); console.log(`Compte « ${u.identifiant} » créé, rôle ${u.role}.`); }
  } finally { depot.fermer(); }
}

/* Contrôle de santé : interroge le serveur de ce poste. En HTTPS, seul le certificat du serveur lui-même est accepté. */
function commandeSante(args) {
  const cfg = chargerConfig({ args: args.slice(1) }), fs = require('fs'), crypto = require('crypto');
  const hote = ['0.0.0.0', '::', ''].includes(cfg.serveur.hote) ? '127.0.0.1' : cfg.serveur.hote, protocole = cfg.https.actif ? 'https' : 'http';
  const adresse = `${protocole}://${hote.includes(':') ? `[${hote}]` : hote}:${cfg.serveur.port}`;
  return new Promise((ok, ko) => {
    let attendu = null;
    if (cfg.https.actif) {
      const fichier = cfg.https.certificat || path.join(cfg.donnees.dossier, 'certificats', 'netcarto.crt');
      try { attendu = new crypto.X509Certificate(fs.readFileSync(fichier)).fingerprint256; } catch { return ko(new Error(`certificat du serveur introuvable (${fichier})`)); }
    }
    const req = require(protocole).get({ host: hote, port: cfg.serveur.port, path: '/api/v1/sante', timeout: 4000, rejectUnauthorized: false }, res => {
      if (attendu && res.socket.getPeerCertificate().fingerprint256 !== attendu) { res.resume(); return ko(new Error('le certificat présenté n\'est pas celui de ce serveur')); }
      let corps = ''; res.setEncoding('utf8'); res.on('data', c => { corps += c; });
      res.on('end', () => { let v = null; try { v = JSON.parse(corps); } catch { /* réponse inattendue */ } if (res.statusCode === 200 && v && v.ok) ok(adresse); else ko(new Error(`réponse inattendue (${res.statusCode})`)); });
    });
    req.on('timeout', () => req.destroy(new Error('pas de réponse en 4 secondes')));
    req.on('error', e => ko(new Error(e.code === 'ECONNREFUSED' ? `rien n'écoute sur ${adresse}` : e.message)));
  });
}

/* Sauvegarde immédiate, liste, restauration complète */
function commandeSauvegardes(args) {
  const cfg = chargerConfig({ args: args.filter((a, i) => i > 0 && !(args[0] === 'restaurer' && i === 1)) });
  const { ouvrirBase, restaurerFichier, listerDossier, dossierSauvegardes } = require('./donnees');
  const fichier = path.join(cfg.donnees.dossier, 'netcarto.sqlite'), dossier = dossierSauvegardes(fichier, cfg.sauvegardes);
  const taille = n => (n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.ceil(n / 1024)} Ko`);
  if (args[0] === 'sauvegardes') {
    const liste = listerDossier(dossier);
    console.log(liste.length ? liste.map(s => `${s.nom}   ${new Date(s.date).toLocaleString('fr-FR')}   ${taille(s.taille)}`).join('\n') : 'Aucune sauvegarde.');
    console.log(`Dossier : ${dossier}`);
    return;
  }
  if (!require('fs').existsSync(fichier) && args[0] === 'sauvegarde') throw new Error(`aucune base dans ${cfg.donnees.dossier}`);
  if (args[0] === 'sauvegarde') {
    const depot = ouvrirBase({ fichier, sauvegardes: cfg.sauvegardes });
    try { const s = depot.sauvegardes.creer('manuelle'); console.log(`Sauvegarde faite : ${s.nom} (${taille(s.taille)})\nDossier : ${dossier}`); } finally { depot.fermer(); }
    return;
  }
  const source = args[1];
  if (!source || source.startsWith('--')) throw new Error('indiquez la sauvegarde : node netcarto.js restaurer <sauvegarde>');
  if (!args.includes('--forcer') && require('./app').serveurEnMarche(cfg.donnees.dossier)) throw new Error('le serveur NetCarto est en marche sur ce dossier de données. Arrêtez-le, puis relancez la commande.');
  const r = restaurerFichier({ fichier, source, sauvegardes: cfg.sauvegardes });
  console.log(`Base restaurée depuis ${r.source}\nSchéma niveau ${r.version}, révision ${r.revision}.${r.avant ? `\nL'état d'avant est gardé : ${path.join(dossier, r.avant)}` : ''}\nVous pouvez relancer le serveur.`);
}

(async () => {
  const args = process.argv.slice(2);
  if (args.includes('--aide') || args.includes('--help')) { console.log(AIDE); return; }
  if (args[0] === 'sante') { try { console.log(`NetCarto est en marche (${await commandeSante(args)}).`); } catch (e) { console.error(`NetCarto ne répond pas : ${e.message}`); process.exit(1); } return; }
  if (['sauvegarde', 'sauvegardes', 'restaurer'].includes(args[0])) { try { commandeSauvegardes(args); } catch (e) { console.error(`Impossible : ${e.message}`); process.exit(1); } return; }
  if (args[0] === 'compte') { try { await commandeCompte(args); } catch (e) { console.error(`Impossible : ${e.message}`); process.exit(1); } return; }
  let app;
  try {
    const cfg = chargerConfig();
    app = await demarrer(cfg);
    console.log(`NetCarto ${app.version} à l'écoute sur ${app.protocole}://${app.hote}:${app.port}`);
    console.log(`Données : ${cfg.donnees.dossier}${cfg.fichier ? ` — réglages : ${cfg.fichier}` : ' — réglages par défaut'}`);
    if (app.certificat?.autoSigne) console.log(`HTTPS : certificat auto-signé (${app.certificat.fichier}). Le navigateur affichera un avertissement à la première visite : c'est attendu.`);
    if (!app.certificat) console.log('ATTENTION : HTTPS désactivé. Les mots de passe circulent en clair : à réserver aux essais sur ce poste.');
    if (app.codeInitialisation) console.log(`\nAucun compte n'existe encore. Ouvrez la page et créez le compte administrateur avec ce code :\n\n    ${app.codeInitialisation}\n`);
  } catch (e) { console.error(`Démarrage impossible : ${e.message}`); process.exit(1); }
  const arret = async () => { await app.arreter(); process.exit(0); };
  process.on('SIGINT', arret); process.on('SIGTERM', arret);
})();
