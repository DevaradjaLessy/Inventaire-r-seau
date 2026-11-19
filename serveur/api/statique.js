/* Service des fichiers de l'interface. Seuls index.html et les dossiers css/ et js/ sont servis :
   le reste du dépôt (serveur, réglages, documentation) n'est jamais exposé. */
'use strict';
const fs = require('fs'), path = require('path');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const DOSSIERS = ['css', 'js'];
const ENTETES = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };

function creerStatique(racine, prefixeApi) {
  racine = path.resolve(racine);
  const refus = (res, code) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', ...ENTETES }); res.end(code === 404 ? 'Introuvable' : 'Interdit'); };
  return function servir(chemin, res) {
    let rel;
    try { rel = decodeURIComponent(chemin); } catch { return refus(res, 404); }
    if (rel === '/' || rel === '') rel = '/index.html';
    const segments = rel.split('/').filter(Boolean), ext = path.extname(rel).toLowerCase();
    const permis = (segments.length === 1 && segments[0] === 'index.html') || (segments.length > 1 && DOSSIERS.includes(segments[0]));
    if (!permis || !MIME[ext] || segments.some(s => s.startsWith('.') || s.includes('\\') || s.includes('\0'))) return refus(res, 403);
    const cible = path.join(racine, ...segments);
    if (!cible.startsWith(racine + path.sep)) return refus(res, 403);
    fs.readFile(cible, (err, data) => {
      if (err) return refus(res, 404);
      // La page d'accueil reçoit l'adresse de l'API : c'est ce qui fait passer l'interface du mode démo au mode serveur
      if (segments[0] === 'index.html') data = Buffer.from(data.toString('utf8').replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta name="netcarto-api" content="${prefixeApi}">`));
      res.writeHead(200, { 'Content-Type': MIME[ext], 'Cache-Control': 'no-cache', ...ENTETES }); res.end(data);
    });
  };
}
module.exports = { creerStatique };
