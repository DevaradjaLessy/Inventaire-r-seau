/* Petit client HTTP(S) qui renvoie du JSON, sans dépendance. */
'use strict';
const http = require('http'), https = require('https');

/* options : { insecureTls (certificat auto-signé accepté), timeoutMs, headers } */
function getJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, { headers: { Accept: 'application/json', ...(options.headers || {}) }, rejectUnauthorized: !options.insecureTls, timeout: options.timeoutMs || 15000 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) return reject(new Error(`Accès refusé (${res.statusCode}) : vérifiez la clé d'API.`));
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Réponse ${res.statusCode} de ${u.host}.`));
        try { resolve(JSON.parse(body)); } catch { reject(new Error(`Réponse illisible de ${u.host} (JSON attendu).`)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`${u.host} ne répond pas (délai dépassé).`)));
    req.on('error', e => reject(new Error(e.code === 'ECONNREFUSED' ? `${u.host} refuse la connexion.` : e.message)));
  });
}
module.exports = { getJson };
