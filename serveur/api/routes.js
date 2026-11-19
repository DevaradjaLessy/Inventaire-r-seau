/* Routes de l'API (préfixe /api/v1). Chaque route renvoie du JSON.

   Sans connexion
     GET    /info, /sante               version du serveur, état de la base
     GET    /session                    connecté ou non ; premier lancement ou non
     POST   /session                    connexion  { identifiant, motDePasse }
     POST   /initialisation             création du premier administrateur, avec le code affiché au démarrage
   Tout compte connecté
     DELETE /session                    déconnexion
     PUT    /session/mot-de-passe       changer son mot de passe  { actuel, nouveau }
     GET    /revision, /base, /{ressource}[/{id}], /supervision/etat|sante
   Technicien et administrateur
     POST   /lots                       lot de modifications, tout ou rien
   Administrateur
     PUT    /base                       remplace toute la base
     GET|POST /utilisateurs, PUT|DELETE /utilisateurs/{id}
     GET    /audit                      journal d'audit (filtres : cle, collection, identifiant, action, avant, limite)
     GET    /sauvegardes                réglages et liste des sauvegardes
     POST   /sauvegardes                sauvegarde immédiate
     GET|DELETE /sauvegardes/{nom}      télécharger ou supprimer une sauvegarde
     POST   /sauvegardes/restauration   { nom } : remet les données d'inventaire dans l'état de la sauvegarde */
'use strict';
const fs = require('fs');
const { ErreurMetier, RESSOURCES } = require('../donnees');

const VERSION = require('../package.json').version, COOKIE = 'netcarto_session';

class ErreurHttp extends Error { constructor(statut, message) { super(message); this.statut = statut; } }
/* Réponse qui porte aussi des en-têtes (cookie de session) */
class Reponse { constructor(corps, entetes) { this.corps = corps; this.entetes = entetes; } }
/* Réponse qui envoie un fichier à télécharger */
class Fichier { constructor(chemin, nom) { this.chemin = chemin; this.nom = nom; } }

/* Lit le corps JSON d'une requête, dans la limite fixée */
function lireJson(req, maxOctets) {
  return new Promise((ok, ko) => {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) { req.resume(); return ko(new ErreurHttp(415, 'Type de contenu attendu : application/json.')); }
    const morceaux = []; let taille = 0, trop = false;
    req.on('data', c => { taille += c.length; if (taille > maxOctets) trop = true; else morceaux.push(c); });
    req.on('error', ko);
    req.on('end', () => {
      if (trop) return ko(new ErreurHttp(413, `Corps de requête trop volumineux (${Math.round(maxOctets / 1048576)} Mo au plus).`));
      try { const v = JSON.parse(Buffer.concat(morceaux).toString('utf8')); if (!v || typeof v !== 'object') throw new Error(); ok(v); } catch { ko(new ErreurHttp(400, 'Corps de requête illisible : JSON attendu.')); }
    });
  });
}
const jetonDe = req => (req.headers.cookie || '').split(';').map(x => x.trim().split('=')).find(([k]) => k === COOKIE)?.[1] || '';

function creerApi({ depot, sauvegardes, releveur, securite, config, https }) {
  const max = config.limites.corpsMaxMo * 1048576;
  const cookie = (jeton, duree) => `${COOKIE}=${jeton}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${duree}${https ? '; Secure' : ''}`;
  const methode = (req, ...permises) => { if (!permises.includes(req.method)) throw Object.assign(new ErreurHttp(405, `Méthode non permise (attendu : ${permises.join(', ')}).`), { permises }); };
  const exiger = (u, ...roles) => {
    if (!u) throw new ErreurMetier('acces', 'Connexion requise.');
    if (roles.length && !roles.includes(u.role)) throw new ErreurMetier('interdit', u.role === 'lecture' ? 'Votre compte est en lecture seule.' : 'Cette action est réservée aux administrateurs.');
  };
  /* Traite une requête ; renvoie le corps de la réponse, ou une Reponse avec des en-têtes */
  async function traiter(req, chemin, recherche) {
    const [a, b, ...reste] = chemin.split('/').filter(Boolean);
    if (reste.length) throw new ErreurHttp(404, 'Adresse inconnue.');
    const jeton = jetonDe(req), moi = securite.session(jeton), ip = req.socket.remoteAddress || '', ctx = { utilisateur: moi, ip };
    // --- Sans connexion ---
    if (a === 'sante' && !b) { methode(req, 'GET'); return { ok: depot.sain(), base: 'ok' }; }
    if (a === 'info' && !b) { methode(req, 'GET'); return { app: 'NetCarto', version: VERSION, mode: 'serveur', ...(moi ? { schema: depot.versionSchema(), revision: depot.revision(), vide: depot.estVide() } : {}) }; }
    if (a === 'initialisation' && !b) {
      methode(req, 'POST');
      const v = await lireJson(req, max), u = await securite.initialiser(v), s = await securite.connecter(u.identifiant, v.motDePasse, { ip });
      return new Reponse({ connecte: true, utilisateur: s.utilisateur }, { 'Set-Cookie': cookie(s.jeton, s.dureeSecondes) });
    }
    if (a === 'session' && !b) {
      methode(req, 'GET', 'POST', 'DELETE');
      if (req.method === 'GET') return moi ? { connecte: true, utilisateur: moi, initialisation: false } : { connecte: false, initialisation: securite.aInitialiser() };
      if (req.method === 'DELETE') { securite.deconnecter(jeton); return new Reponse({ connecte: false }, { 'Set-Cookie': cookie('', 0) }); }
      const v = await lireJson(req, max), s = await securite.connecter(v.identifiant, v.motDePasse, { ip });
      return new Reponse({ connecte: true, utilisateur: s.utilisateur }, { 'Set-Cookie': cookie(s.jeton, s.dureeSecondes) });
    }
    // --- Compte connecté ---
    exiger(moi);
    if (a === 'session' && b === 'mot-de-passe') { methode(req, 'PUT'); const v = await lireJson(req, max); await securite.changerMotDePasse(moi, jeton, v.actuel, v.nouveau); return { ok: true }; }
    if (a === 'revision' && !b) { methode(req, 'GET'); return { revision: depot.revision() }; }
    if (a === 'base' && !b) {
      methode(req, 'GET', 'PUT');
      if (req.method === 'GET') return depot.lireBase();
      exiger(moi, 'administrateur');
      return depot.remplacerBase(await lireJson(req, max), ctx);
    }
    if (a === 'lots' && !b) { methode(req, 'POST'); exiger(moi, 'technicien', 'administrateur'); return depot.appliquerLot(await lireJson(req, max), ctx); }
    if (a === 'supervision' && (b === 'etat' || b === 'sante')) { methode(req, 'GET'); return b === 'etat' ? releveur.etat() : releveur.sante(); }
    if (a === 'utilisateurs') {
      exiger(moi, 'administrateur');
      if (!b) { methode(req, 'GET', 'POST'); return req.method === 'GET' ? securite.lister() : securite.creerUtilisateur(await lireJson(req, max), moi); }
      methode(req, 'PUT', 'DELETE');
      if (req.method === 'DELETE') { securite.supprimerUtilisateur(b, moi); return { ok: true }; }
      return securite.modifierUtilisateur(b, await lireJson(req, max), moi);
    }
    if (a === 'audit' && !b) { methode(req, 'GET'); exiger(moi, 'administrateur'); return depot.comptes.listerAudit(Object.fromEntries(recherche)); }
    if (a === 'sauvegardes') {
      exiger(moi, 'administrateur');
      if (!b) {
        methode(req, 'GET', 'POST');
        if (req.method === 'GET') return { reglages: sauvegardes.reglages(), liste: sauvegardes.lister() };
        await lireJson(req, max);
        const s = sauvegardes.creer('manuelle');
        depot.tracer(ctx, 'sauvegarde', '', '', `Sauvegarde ${s.nom}`, null, { taille: s.taille }, null);
        return s;
      }
      if (b === 'restauration') { methode(req, 'POST'); const v = await lireJson(req, max); return sauvegardes.restaurer(v.nom, ctx); }
      methode(req, 'GET', 'DELETE');
      let nom; try { nom = decodeURIComponent(b); } catch { throw new ErreurHttp(400, 'Nom de sauvegarde illisible.'); }
      if (req.method === 'GET') return new Fichier(sauvegardes.chemin(nom), nom);
      sauvegardes.supprimer(nom);
      depot.tracer(ctx, 'sauvegarde_supprimer', '', '', `Suppression de la sauvegarde ${nom}`, null, null, null);
      return { ok: true };
    }
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
    const repondre = (statut, corps, entetes = {}) => { res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(https ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}), ...entetes }); res.end(JSON.stringify(corps)); };
    // Une écriture demandée par une page d'un autre site est refusée (la page de NetCarto a la même origine que l'API)
    const origine = req.headers.origin;
    if (origine && req.method !== 'GET' && req.method !== 'HEAD') { let hote = ''; try { hote = new URL(origine).host; } catch { /* origine illisible */ } if (hote !== req.headers.host) { req.resume(); return repondre(403, { erreur: 'Écriture refusée : la requête vient d\'un autre site.', code: 'http' }); } }
    try {
      const r = await traiter(req, chemin, recherche);
      if (r instanceof Fichier) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(r.chemin).size, 'Content-Disposition': `attachment; filename="${r.nom}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return fs.createReadStream(r.chemin).on('error', () => res.destroy()).pipe(res);
      }
      if (r instanceof Reponse) repondre(200, r.corps, r.entetes); else repondre(200, r);
    }
    catch (e) {
      if (e instanceof ErreurMetier) return repondre(e.statut, { erreur: e.message, code: e.code });
      if (e instanceof ErreurHttp) return repondre(e.statut, { erreur: e.message, code: 'http' }, e.permises ? { Allow: e.permises.join(', ') } : {});
      config.journal?.(`Erreur interne : ${e.stack || e.message}`);
      repondre(500, { erreur: 'Erreur interne du serveur.', code: 'interne' });
    }
  };
}
module.exports = { creerApi, VERSION };
