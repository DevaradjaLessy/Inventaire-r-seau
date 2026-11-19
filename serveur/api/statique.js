/* Service des fichiers de l'interface. Seuls index.html et les dossiers css/ et js/ sont servis :
   le reste du dépôt (serveur, réglages, documentation) n'est jamais exposé. */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const DOSSIERS = ['css', 'js'], TEXTE = ['.html', '.css', '.js', '.svg'];
const ENTETES = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };

function creerStatique(racine, prefixeApi, { https = false } = {}) {
  racine = path.resolve(racine);
  if (https) ENTETES['Strict-Transport-Security'] = 'max-age=31536000';
  const refus = (res, code) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', ...ENTETES }); res.end(code === 404 ? 'Introuvable' : 'Interdit'); };
  return function servir(chemin, res, accepte = '') {
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
      const tete = { 'Content-Type': MIME[ext], 'Cache-Control': 'no-cache', ...ENTETES };
      // Les fichiers texte voyagent compressés si le navigateur l'accepte
      if (!TEXTE.includes(ext) || data.length < 1024 || !/\bgzip\b/.test(accepte)) { res.writeHead(200, tete); return res.end(data); }
      zlib.gzip(data, (e, compresse) => { if (e) { res.writeHead(200, tete); return res.end(data); } res.writeHead(200, { ...tete, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }); res.end(compresse); });
    });
  };
}
module.exports = { creerStatique };
