/* Relais de supervision NetCarto.
   Interroge les sources configurées (PRTG, SNMP…) à intervalle régulier et expose leur
   état fusionné, en lecture seule, au format du contrat (lib/contrat.js).

   GET /api/etat   → { version: 1, source, ts, devices: […] }   (lu par NetCarto)
   GET /api/sante  → état de chaque source, pour le diagnostic
   GET /…          → fichiers de NetCarto, si l'option « webRoot » est renseignée

   Usage : node serveur.js [chemin/vers/config.json]
   Les identifiants restent ici : ils ne sont jamais envoyés au navigateur. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { fusionner, secret } = require('./lib/contrat');

const TYPES = { simulation: './sources/simulation', prtg: './sources/prtg', snmp: './sources/snmp' };

function demarrer(cfg, journal = console.log) {
  const sources = (cfg.sources || []).map((c, i) => {
    if (!TYPES[c.type]) throw new Error(`Source n° ${i + 1} : type « ${c.type} » inconnu (attendu : ${Object.keys(TYPES).join(', ')}).`);
    return { src: require(TYPES[c.type])(c), devices: [], ok: null, erreur: '', ts: 0 };
  });
  const jeton = cfg.token ? secret(cfg.token) : '';
  const origines = cfg.corsOrigins || [];
  // Comparaison en temps constant, pour ne rien laisser deviner du jeton
  const jetonValide = recu => { const a = Buffer.from(String(recu || '')), b = Buffer.from('Bearer ' + jeton); return a.length === b.length && crypto.timingSafeEqual(a, b); };
  let enCours = false;
  async function relever() {
    if (enCours) return;
    enCours = true;
    await Promise.all(sources.map(async s => {
      try { s.devices = await s.src.relever(); s.ok = true; s.erreur = ''; }
      catch (e) { s.ok = false; s.erreur = e.message; journal(`[${s.src.nom}] ${e.message}`); }
      s.ts = Date.now();
    }));
    enCours = false;
  }
  const serveur = http.createServer((req, res) => {
    const origine = req.headers.origin;
    if (origine && (origines.includes('*') || origines.includes(origine))) { res.setHeader('Access-Control-Allow-Origin', origine); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Authorization'); }
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.method !== 'GET') return json(405, { erreur: 'Lecture seule : seule la méthode GET est acceptée.' });
    const chemin = new URL(req.url, 'http://x').pathname;
    if (jeton && chemin.startsWith('/api/') && !jetonValide(req.headers.authorization)) return json(401, { erreur: 'Jeton absent ou invalide.' });
    if (chemin === '/api/etat') return json(200, { version: 1, source: sources.map(s => s.src.nom).join(' + ') || 'aucune', ts: Math.max(0, ...sources.map(s => s.ts)), devices: fusionner(sources.filter(s => s.ok).map(s => s.devices)) });
    if (chemin === '/api/sante') return json(200, { sources: sources.map(s => ({ nom: s.src.nom, ok: s.ok, erreur: s.erreur, equipements: s.devices.length, ts: s.ts })) });
    if (chemin.startsWith('/api/')) return json(404, { erreur: 'Chemin inconnu. Disponibles : /api/etat, /api/sante' });
    return fichier(chemin, res);
  });
  /* Sert aussi les fichiers de NetCarto (option « webRoot ») : la page et le relais ont alors la même
     adresse, ce qui évite les blocages du navigateur entre une page publique et un service interne. */
  const racine = cfg.webRoot ? path.resolve(cfg.webRoot) : null;
  const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
  function fichier(chemin, res) {
    const refus = code => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(code === 404 ? 'Introuvable' : 'Interdit'); };
    if (!racine) return refus(404);
    let rel;
    try { rel = decodeURIComponent(chemin); } catch { return refus(404); }
    if (rel.endsWith('/')) rel += 'index.html';
    const segments = rel.split('/').filter(Boolean);
    // Seuls les fichiers de l'application sont servis : ni fichiers cachés, ni configuration, ni dossier du relais
    if (segments.some(s => s.startsWith('.') || s === '..') || ['connecteurs', 'tests', 'node_modules'].includes(segments[0]) || !MIME[path.extname(rel).toLowerCase()]) return refus(403);
    const cible = path.join(racine, ...segments);
    if (!cible.startsWith(racine + path.sep)) return refus(403);
    fs.readFile(cible, (err, data) => { if (err) return refus(404); res.writeHead(200, { 'Content-Type': MIME[path.extname(rel).toLowerCase()], 'Cache-Control': 'no-cache' }); res.end(data); });
  }
  const minuterie = setInterval(relever, Math.max(5, cfg.intervalSeconds || 30) * 1000);
  const pret = relever().then(() => new Promise(ok => serveur.listen(cfg.port || 8787, cfg.host || '127.0.0.1', ok)));
  return { serveur, pret, relever, arreter: () => { clearInterval(minuterie); return new Promise(ok => serveur.close(ok)); } };
}

if (require.main === module) {
  const fichier = path.resolve(process.argv[2] || path.join(__dirname, 'config.json'));
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(fichier, 'utf8')); }
  catch (e) { console.error(`Configuration illisible (${fichier}) : ${e.message}\nCopiez config.exemple.json en config.json, puis adaptez-le.`); process.exit(1); }
  try {
    const r = demarrer(cfg);
    r.pret.then(() => console.log(`Relais NetCarto à l'écoute sur http://${cfg.host || '127.0.0.1'}:${cfg.port || 8787} — ${(cfg.sources || []).length} source(s), relevé toutes les ${Math.max(5, cfg.intervalSeconds || 30)} s`));
  } catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { demarrer };
