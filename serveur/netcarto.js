#!/usr/bin/env node
/* NetCarto — lancement du serveur et gestion des comptes en ligne de commande.
   Usage : node netcarto.js [--config fichier.toml] [--port 8443] [--hote 127.0.0.1] [--donnees dossier] [--demo] [--http]
           node netcarto.js compte <identifiant> [--role administrateur]     crée le compte, ou change son mot de passe et le déverrouille
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
      Le mot de passe est demandé au clavier (ou lu dans la variable NETCARTO_MOT_DE_PASSE).`;

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

(async () => {
  const args = process.argv.slice(2);
  if (args.includes('--aide') || args.includes('--help')) { console.log(AIDE); return; }
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
