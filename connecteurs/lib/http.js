/* Petit client HTTP(S) qui renvoie du JSON, sans dépendance. */
'use strict';
const http = require('http'), https = require('https');
const TAILLE_MAX = 32 * 1024 * 1024;   // taille maximale d'une réponse de supervision

/* options : { insecureTls (certificat auto-signé accepté), timeoutMs, headers } */
const getJson = (url, options = {}) => requete('GET', url, null, options);
/* Envoie un objet en JSON (POST) et renvoie la réponse JSON */
const postJson = (url, corps, options = {}) => requete('POST', url, JSON.stringify(corps), options);
function requete(methode, url, corps, options) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: methode, headers: { Accept: 'application/json', ...(corps === null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corps) }), ...(options.headers || {}) }, rejectUnauthorized: !options.insecureTls, timeout: options.timeoutMs || 15000 }, res => {
      let body = '';
      res.setEncoding('utf8');
      // Une réponse démesurée (source en panne ou hostile) est coupée avant de remplir la mémoire
      res.on('data', c => { body += c; if (body.length > TAILLE_MAX) { req.destroy(); reject(new Error(`Réponse trop volumineuse de ${u.host} (plus de ${TAILLE_MAX / 1048576} Mo).`)); } });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) return reject(new Error(`Accès refusé (${res.statusCode}) : vérifiez la clé d'API.`));
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Réponse ${res.statusCode} de ${u.host}.`));
        try { resolve(JSON.parse(body)); } catch { reject(new Error(`Réponse illisible de ${u.host} (JSON attendu).`)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`${u.host} ne répond pas (délai dépassé).`)));
    req.on('error', e => reject(new Error(e.code === 'ECONNREFUSED' ? `${u.host} refuse la connexion.` : e.message)));
    req.end(corps === null ? undefined : corps);
  });
}
module.exports = { getJson, postJson };
