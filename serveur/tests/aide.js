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
/* Requête HTTP : renvoie { code, entetes, json, texte } */
function requete(methode, url, corps, entetes = {}) {
  return new Promise((ok, ko) => {
    const data = corps === undefined ? null : typeof corps === 'string' ? corps : JSON.stringify(corps);
    const req = http.request(url, { method: methode, headers: { ...(data !== null ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...entetes } }, res => {
      let b = ''; res.setEncoding('utf8'); res.on('data', c => { b += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(b); } catch { /* réponse non JSON */ } ok({ code: res.statusCode, entetes: res.headers, json, texte: b }); });
    });
    req.on('error', ko); if (data !== null) req.write(data); req.end();
  });
}
const parCle = (liste, cle = 'id') => [...liste].sort((a, b) => String(a[cle]).localeCompare(String(b[cle])));
module.exports = { RACINE, dossierTemporaire, demo, depart, requete, parCle };
