/* Application NetCarto : assemble la base, le module de supervision, l'API et le service des fichiers.
   Ce fichier ne lit ni la ligne de commande ni l'environnement : il reçoit sa configuration (voir config.js). */
'use strict';
const http = require('http'), https = require('https'), path = require('path');
const { ouvrirBase } = require('./donnees');
const { modeleDeDepart, jeuDeDemonstration } = require('./depart');
const { creerApi, VERSION } = require('./api/routes');
const { creerStatique } = require('./api/statique');
const { creerReleveur } = require('../connecteurs/lib/releveur');
const { DEFAUTS } = require('./config');
const { creerSecurite } = require('./securite');
const { preparerHttps } = require('./securite/certificat');

const PREFIXE = '/api/v1';

/* Démarre le serveur. Renvoie { port, protocole, depot, securite, arreter }. options : { journal, horloge } */
async function demarrer(config, { journal = console.log, horloge = () => Date.now() } = {}) {
  const cfg = { serveur: { ...DEFAUTS.serveur, ...config.serveur }, donnees: { ...config.donnees }, web: { ...config.web }, supervision: { ...DEFAUTS.supervision, ...config.supervision }, limites: { ...DEFAUTS.limites, ...config.limites }, https: { ...DEFAUTS.https, ...config.https }, securite: { ...DEFAUTS.securite, ...config.securite }, demo: !!config.demo, journal };
  const depot = ouvrirBase({ fichier: path.join(cfg.donnees.dossier, 'netcarto.sqlite'), depart: await modeleDeDepart(cfg.web.dossier) });
  // Option « démonstration » : une base sans aucun site reçoit le jeu de données fictif
  if (cfg.demo && depot.estVide()) { depot.remplacerBase(await jeuDeDemonstration(cfg.web.dossier)); journal('Jeu de démonstration chargé.'); }
  const releveur = creerReleveur(cfg.supervision.sources, journal);
  await releveur.demarrer(cfg.supervision.intervalle);
  const securite = creerSecurite({ depot, config: cfg.securite, horloge });
  // HTTPS par défaut : certificat fourni, ou certificat auto-signé créé dans le dossier de données
  const tls = preparerHttps(cfg.https, cfg.donnees.dossier, { hote: cfg.serveur.hote });
  const api = creerApi({ depot, releveur, securite, config: cfg, https: !!tls }), statique = creerStatique(cfg.web.dossier, PREFIXE, { https: !!tls });
  const serveur = (tls ? https.createServer.bind(https, { cert: tls.cert, key: tls.key }) : http.createServer.bind(http))((req, res) => {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
    if (url.pathname === PREFIXE || url.pathname.startsWith(PREFIXE + '/')) return api(req, res, url.pathname.slice(PREFIXE.length), url.searchParams);
    if (url.pathname.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' }); return res.end(JSON.stringify({ erreur: `Adresse inconnue. L'API est sous ${PREFIXE}.`, code: 'http' })); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    statique(url.pathname, res);
  });
  await new Promise((ok, ko) => { serveur.once('error', ko); serveur.listen(cfg.serveur.port, cfg.serveur.hote, ok); });
  let arrete = false;
  return {
    port: serveur.address().port, hote: cfg.serveur.hote, protocole: tls ? 'https' : 'http', certificat: tls, depot, securite, version: VERSION,
    get codeInitialisation() { return securite.codeInitialisation; },
    async arreter() { if (arrete) return; arrete = true; releveur.arreter(); serveur.closeAllConnections?.(); await new Promise(ok => serveur.close(ok)); depot.fermer(); },
  };
}
module.exports = { demarrer, PREFIXE };
