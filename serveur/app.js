/* Application NetCarto : assemble la base, le module de supervision, l'API et le service des fichiers.
   Ce fichier ne lit ni la ligne de commande ni l'environnement : il reçoit sa configuration (voir config.js). */
'use strict';
const fs = require('fs'), http = require('http'), https = require('https'), path = require('path');
const { ouvrirBase } = require('./donnees');
const { modeleDeDepart, jeuDeDemonstration } = require('./depart');
const { creerApi, VERSION } = require('./api/routes');
const { creerStatique } = require('./api/statique');
const { creerReleveur } = require('../connecteurs/lib/releveur');
const { DEFAUTS, controlerSauvegardes, controlerCourriel } = require('./config');
const { creerCourrier } = require('./courrier');
const { creerSecurite } = require('./securite');
const { preparerHttps } = require('./securite/certificat');

const PREFIXE = '/api/v1', VERROU = 'netcarto.verrou';
/* Le serveur tourne-t-il sur ce dossier de données ? (témoin présent et processus vivant) */
function serveurEnMarche(dossier) {
  let pid;
  try { pid = +fs.readFileSync(path.join(dossier, VERROU), 'utf8'); } catch { return false; }
  if (!pid || pid === process.pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/* Démarre le serveur. Renvoie { port, protocole, depot, securite, arreter }. options : { journal, horloge } */
async function demarrer(config, { journal = console.log, horloge = () => Date.now() } = {}) {
  // Les fichiers créés par le serveur (base, journal d'écriture, sauvegardes, clé) ne sont lisibles que par son compte
  try { process.umask(0o077); } catch { /* sans effet sur ce système */ }
  const cfg = { serveur: { ...DEFAUTS.serveur, ...config.serveur }, donnees: { ...config.donnees }, web: { ...config.web }, supervision: { ...DEFAUTS.supervision, ...config.supervision }, limites: { ...DEFAUTS.limites, ...config.limites }, https: { ...DEFAUTS.https, ...config.https }, securite: { ...DEFAUTS.securite, ...config.securite }, sauvegardes: { ...DEFAUTS.sauvegardes, ...config.sauvegardes }, courriel: { ...DEFAUTS.courriel, ...config.courriel }, demo: !!config.demo, journal };
  controlerSauvegardes(cfg.sauvegardes); controlerCourriel(cfg.courriel);
  const depot = ouvrirBase({ fichier: path.join(cfg.donnees.dossier, 'netcarto.sqlite'), depart: await modeleDeDepart(cfg.web.dossier), sauvegardes: cfg.sauvegardes, horloge });
  // Témoin « serveur en marche » : la restauration complète en ligne de commande le consulte avant de remplacer la base
  const verrou = path.join(cfg.donnees.dossier, VERROU);
  fs.writeFileSync(verrou, String(process.pid));
  // Option « démonstration » : une base sans aucun site reçoit le jeu de données fictif
  if (cfg.demo && depot.estVide()) { depot.remplacerBase(await jeuDeDemonstration(cfg.web.dossier)); journal('Jeu de démonstration chargé.'); }
  // Sauvegardes planifiées : contrôle au démarrage (rattrapage), puis chaque minute
  const sauvegardes = depot.sauvegardes;
  const echeance = () => { try { const s = sauvegardes.echeance(); if (s) journal(`Sauvegarde automatique : ${s.nom}`); return s; } catch (e) { journal(`Sauvegarde automatique impossible : ${e.message}`); return null; } };
  echeance();
  const minuterie = setInterval(echeance, 60000); minuterie.unref();
  const releveur = creerReleveur(cfg.supervision.sources, journal);
  await releveur.demarrer(cfg.supervision.intervalle);
  const courrier = creerCourrier(cfg.courriel, journal);
  const securite = creerSecurite({ depot, config: cfg.securite, horloge, courrier, journal });
  // HTTPS par défaut : certificat fourni, ou certificat auto-signé créé dans le dossier de données
  const tls = preparerHttps(cfg.https, cfg.donnees.dossier, { hote: cfg.serveur.hote });
  const api = creerApi({ depot, sauvegardes, releveur, securite, config: cfg, https: !!tls, certificat: tls }), statique = creerStatique(cfg.web.dossier, PREFIXE, { https: !!tls });
  const serveur = (tls ? https.createServer.bind(https, { cert: tls.cert, key: tls.key, minVersion: 'TLSv1.2' }) : http.createServer.bind(http))((req, res) => {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
    if (url.pathname === PREFIXE || url.pathname.startsWith(PREFIXE + '/')) return api(req, res, url.pathname.slice(PREFIXE.length), url.searchParams);
    if (url.pathname.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' }); return res.end(JSON.stringify({ erreur: `Adresse inconnue. L'API est sous ${PREFIXE}.`, code: 'http' })); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    statique(url.pathname, res, req.headers['accept-encoding'] || '');
  });
  // Délais : une liaison qui tarde à envoyer ses en-têtes ou sa requête est coupée (attaque par connexions lentes)
  const delais = { enTetes: 10000, requete: 60000, repos: 5000 };
  serveur.headersTimeout = delais.enTetes; serveur.requestTimeout = delais.requete; serveur.keepAliveTimeout = delais.repos;
  await new Promise((ok, ko) => { serveur.once('error', ko); serveur.listen(cfg.serveur.port, cfg.serveur.hote, ok); });
  let arrete = false;
  return {
    port: serveur.address().port, hote: cfg.serveur.hote, protocole: tls ? 'https' : 'http', certificat: tls, depot, securite, sauvegardes, delais, version: VERSION,
    get codeInitialisation() { return securite.codeInitialisation; },
    async arreter() { if (arrete) return; arrete = true; clearInterval(minuterie); releveur.arreter(); serveur.closeAllConnections?.(); await new Promise(ok => serveur.close(ok)); depot.fermer(); fs.rmSync(verrou, { force: true }); },
  };
}
module.exports = { demarrer, serveurEnMarche, PREFIXE };
