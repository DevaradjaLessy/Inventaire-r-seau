/* Service des fichiers de l'interface. Seuls index.html et les dossiers css/ et js/ sont servis :
   le reste du dépôt (serveur, réglages, documentation) n'est jamais exposé. */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const DOSSIERS = ['css', 'js'], TEXTE = ['.html', '.css', '.js', '.svg'];
const ENTETES = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()' };

/* Politique de sécurité du contenu de la page : tout vient de NetCarto lui-même.
   Les deux scripts écrits dans la page (carte d'import, thème) sont autorisés par leur empreinte, calculée sur la page servie :
   un script ajouté par une injection n'a pas d'empreinte connue et ne s'exécute pas.
   Les styles en attribut restent permis (l'interface en pose partout) ; ils ne permettent pas d'exécuter du code. */
function politique(html) {
  const empreintes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  return ["default-src 'self'", `script-src 'self' ${empreintes.join(' ')}`.trim(), "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "connect-src 'self'", "font-src 'self'",
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
}

function creerStatique(racine, prefixeApi, { https = false } = {}) {
  racine = path.resolve(racine);
  if (https) ENTETES['Strict-Transport-Security'] = 'max-age=31536000';
  const refus = (res, code) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', ...ENTETES }); res.end(code === 404 ? 'Introuvable' : 'Interdit'); };
  return function servir(chemin, res, accepte = '') {
    let rel;
    try { rel = decodeURIComponent(chemin); } catch { return refus(res, 404); }
    // La page d'administration est la même page, ouverte sur sa vue « Administration »
    if (rel === '/' || rel === '' || rel === '/admin' || rel === '/admin/') rel = '/index.html';
    const segments = rel.split('/').filter(Boolean), ext = path.extname(rel).toLowerCase();
    const permis = (segments.length === 1 && segments[0] === 'index.html') || (segments.length > 1 && DOSSIERS.includes(segments[0]));
    if (!permis || !MIME[ext] || segments.some(s => s.startsWith('.') || s.includes('\\') || s.includes('\0'))) return refus(res, 403);
    const cible = path.join(racine, ...segments);
    if (!cible.startsWith(racine + path.sep)) return refus(res, 403);
    fs.readFile(cible, (err, data) => {
      if (err) return refus(res, 404);
      // La page d'accueil reçoit l'adresse de l'API : c'est ce qui fait passer l'interface du mode démo au mode serveur
      const tete = { 'Content-Type': MIME[ext], 'Cache-Control': 'no-cache', ...ENTETES };
      if (segments[0] === 'index.html') {
        const html = data.toString('utf8').replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta name="netcarto-api" content="${prefixeApi}">`);
        data = Buffer.from(html); tete['Content-Security-Policy'] = politique(html);
      }
      // Les fichiers texte voyagent compressés si le navigateur l'accepte
      if (!TEXTE.includes(ext) || data.length < 1024 || !/\bgzip\b/.test(accepte)) { res.writeHead(200, tete); return res.end(data); }
      zlib.gzip(data, (e, compresse) => { if (e) { res.writeHead(200, tete); return res.end(data); } res.writeHead(200, { ...tete, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }); res.end(compresse); });
    });
  };
}
module.exports = { creerStatique };
