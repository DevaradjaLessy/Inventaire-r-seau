#!/usr/bin/env node
/* NetCarto — lancement du serveur.
   Usage : node netcarto.js [--config fichier.toml] [--port 8080] [--hote 127.0.0.1] [--donnees dossier] [--demo]
   Sans fichier de réglages, le serveur écoute sur http://127.0.0.1:8080 et range ses données à côté de lui. */
'use strict';
const { chargerConfig } = require('./config');
const { demarrer } = require('./app');

const AIDE = `NetCarto — serveur
  --config <fichier>   fichier de réglages TOML (ou variable NETCARTO_CONFIG)
  --port <n>           port d'écoute (ou NETCARTO_PORT)
  --hote <adresse>     adresse d'écoute (ou NETCARTO_HOTE) ; 127.0.0.1 par défaut
  --donnees <dossier>  dossier de la base de données (ou NETCARTO_DONNEES)
  --demo               charge le jeu de démonstration si la base ne contient aucun site
  --aide               affiche cette aide`;

(async () => {
  if (process.argv.includes('--aide') || process.argv.includes('--help')) { console.log(AIDE); return; }
  let app;
  try {
    const cfg = chargerConfig();
    app = await demarrer(cfg);
    console.log(`NetCarto ${app.version} à l'écoute sur http://${app.hote}:${app.port}`);
    console.log(`Données : ${cfg.donnees.dossier}${cfg.fichier ? ` — réglages : ${cfg.fichier}` : ' — réglages par défaut'}`);
    if (app.hote !== '127.0.0.1' && app.hote !== 'localhost' && app.hote !== '::1') console.log('ATTENTION : le serveur est joignable depuis le réseau, sans comptes ni HTTPS pour l\'instant (prévus au lot 17).');
  } catch (e) { console.error(`Démarrage impossible : ${e.message}`); process.exit(1); }
  const arret = async () => { await app.arreter(); process.exit(0); };
  process.on('SIGINT', arret); process.on('SIGTERM', arret);
})();
