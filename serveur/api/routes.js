/* Routes de l'API (préfixe /api/v1). Chaque route renvoie du JSON.
   GET  /info                      version, mode, révision
   GET  /sante                     état du serveur et de la base
   GET  /revision                  numéro de révision de la base
   GET  /base                      toute la base (format JSON de l'interface et des exports)
   PUT  /base                      remplace toute la base, en une transaction
   POST /lots                      applique un lot de modifications, tout ou rien
   GET  /{ressource}[/{id}]        lecture, avec filtres simples (?champ=valeur)
   GET  /supervision/etat|sante    module de supervision (ancien relais) */
'use strict';
const { ErreurMetier, RESSOURCES } = require('../donnees');

const VERSION = require('../package.json').version;

/* Lit le corps JSON d'une requête, dans la limite fixée. Renvoie une ErreurHttp en cas de refus. */
class ErreurHttp extends Error { constructor(statut, message) { super(message); this.statut = statut; } }
function lireJson(req, maxOctets) {
  return new Promise((ok, ko) => {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) { req.resume(); return ko(new ErreurHttp(415, 'Type de contenu attendu : application/json.')); }
    const morceaux = []; let taille = 0, trop = false;
    req.on('data', c => { taille += c.length; if (taille > maxOctets) trop = true; else morceaux.push(c); });
    req.on('error', ko);
    req.on('end', () => {
      if (trop) return ko(new ErreurHttp(413, `Corps de requête trop volumineux (${Math.round(maxOctets / 1048576)} Mo au plus).`));
      try { ok(JSON.parse(Buffer.concat(morceaux).toString('utf8'))); } catch { ko(new ErreurHttp(400, 'Corps de requête illisible : JSON attendu.')); }
    });
  });
}
function creerApi({ depot, releveur, config }) {
  const max = config.limites.corpsMaxMo * 1048576;
  const methode = (req, ...permises) => { if (!permises.includes(req.method)) throw Object.assign(new ErreurHttp(405, `Méthode non permise (attendu : ${permises.join(', ')}).`), { permises }); };
  /* Traite une requête ; renvoie { statut, corps } */
  async function traiter(req, chemin, recherche) {
    const [a, b, ...reste] = chemin.split('/').filter(Boolean);
    if (reste.length) throw new ErreurHttp(404, 'Adresse inconnue.');
    if (a === 'info' && !b) { methode(req, 'GET'); return { app: 'NetCarto', version: VERSION, mode: 'serveur', schema: depot.versionSchema(), revision: depot.revision(), vide: depot.estVide() }; }
    if (a === 'sante' && !b) { methode(req, 'GET'); return { ok: depot.sain(), base: 'ok' }; }
    if (a === 'revision' && !b) { methode(req, 'GET'); return { revision: depot.revision() }; }
    if (a === 'base' && !b) {
      methode(req, 'GET', 'PUT');
      return req.method === 'GET' ? depot.lireBase() : depot.remplacerBase(await lireJson(req, max));
    }
    if (a === 'lots' && !b) { methode(req, 'POST'); return depot.appliquerLot(await lireJson(req, max)); }
    if (a === 'supervision' && (b === 'etat' || b === 'sante')) { methode(req, 'GET'); return b === 'etat' ? releveur.etat() : releveur.sante(); }
    const collection = RESSOURCES[a];
    if (!collection) throw new ErreurHttp(404, 'Adresse inconnue.');
    methode(req, 'GET');
    if (b === undefined) return depot.lister(collection, Object.fromEntries(recherche));
    const cle = collection === 'vlans' ? (/^\d+$/.test(b) ? +b : NaN) : decodeURIComponent(b);
    const o = Number.isNaN(cle) ? null : depot.lire(collection, cle);
    if (!o) throw new ErreurHttp(404, 'Élément introuvable.');
    return o;
  }
  return async function api(req, res, chemin, recherche) {
    const repondre = (statut, corps, entetes = {}) => { res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...entetes }); res.end(JSON.stringify(corps)); };
    try { repondre(200, await traiter(req, chemin, recherche)); }
    catch (e) {
      if (e instanceof ErreurMetier) return repondre(e.statut, { erreur: e.message, code: e.code });
      if (e instanceof ErreurHttp) return repondre(e.statut, { erreur: e.message, code: 'http' }, e.permises ? { Allow: e.permises.join(', ') } : {});
      config.journal?.(`Erreur interne : ${e.stack || e.message}`);
      repondre(500, { erreur: 'Erreur interne du serveur.', code: 'interne' });
    }
  };
}
module.exports = { creerApi, VERSION };
