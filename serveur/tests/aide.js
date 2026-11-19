/* Outils communs aux tests du serveur : dossier temporaire, jeu de démonstration, requêtes HTTP. */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { pathToFileURL } = require('url');

const RACINE = path.join(__dirname, '..', '..');
/* Dossier de données jetable, supprimé à la fin du test */
function dossierTemporaire(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'netcarto-test-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}
/* Le jeu de démonstration et le modèle de départ viennent des modules de l'interface (une seule source de vérité) */
const module_ = f => import(pathToFileURL(path.join(RACINE, 'js', f)).href);
async function demo() { return JSON.parse(JSON.stringify((await module_('demo.js')).buildDemo())); }
async function depart() { const { modeleDeDepart } = require('../depart'); return modeleDeDepart(RACINE); }
/* Requête HTTP ou HTTPS : renvoie { code, entetes, json, texte }. options : { ca } pour un certificat auto-signé */
function requete(methode, url, corps, entetes = {}, options = {}) {
  return new Promise((ok, ko) => {
    const data = corps === undefined ? null : typeof corps === 'string' ? corps : JSON.stringify(corps);
    const lib = url.startsWith('https:') ? require('https') : http;
    const req = lib.request(url, { method: methode, ...options, headers: { ...(data !== null ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...entetes } }, res => {
      let b = ''; res.setEncoding('utf8'); res.on('data', c => { b += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(b); } catch { /* réponse non JSON */ } ok({ code: res.statusCode, entetes: res.headers, json, texte: b }); });
    });
    req.on('error', ko); if (data !== null) req.write(data); req.end();
  });
}
/* Cookie de session renvoyé par une réponse de connexion, prêt à être renvoyé */
const cookieDe = rep => ({ Cookie: (rep.entetes['set-cookie'] || []).map(c => c.split(';')[0]).join('; ') });
const MDP = 'Mot-de-passe-de-test-1';   // mot de passe des comptes créés pour les tests (fictif)
/* Démarre un serveur de test (HTTP, dossier jetable) avec trois comptes : admin, tech, lecteur.
   Renvoie leurs en-têtes de session : { admin, tech, lecteur }. */
async function serveurDeTest(t, { dossier = null, config = {}, comptes = true, options = {} } = {}) {
  const { demarrer } = require('../app');
  dossier = dossier || dossierTemporaire(t);
  const app = await demarrer({ serveur: { hote: '127.0.0.1', port: 0 }, donnees: { dossier }, web: { dossier: RACINE }, https: { actif: false }, ...config }, { journal: () => {}, ...options });
  t.after(() => app.arreter());
  const base = `http://127.0.0.1:${app.port}`, api = base + '/api/v1', r = { app, base, api, dossier };
  if (comptes) {
    for (const [identifiant, role] of [['admin', 'administrateur'], ['tech', 'technicien'], ['lecteur', 'lecture']]) {
      if (!app.securite.trouver(identifiant)) await app.securite.creerUtilisateur({ identifiant, nom: identifiant, role, motDePasse: MDP });
      r[identifiant] = cookieDe(await requete('POST', api + '/session', { identifiant, motDePasse: MDP }));
    }
  }
  return r;
}
const parCle = (liste, cle = 'id') => [...liste].sort((a, b) => String(a[cle]).localeCompare(String(b[cle])));
module.exports = { RACINE, MDP, dossierTemporaire, demo, depart, requete, cookieDe, serveurDeTest, parCle };
