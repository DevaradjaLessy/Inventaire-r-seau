/* Campagne d'attaques contre un serveur NetCarto de test, local et jetable (jeu de démonstration, comptes fictifs).
   Lancer :  node --disable-warning=ExperimentalWarning tests/campagne-attaques.js   (dans le dossier serveur/)
   Chaque essai affiche TENU ou CÈDE ; le code de retour est 1 si une défense cède.
   Les attaques qui ont réussi lors de la campagne du 22 novembre 2026 sont aussi rejouées, une par une, dans securite.test.js.
   Ce script ne vise que le serveur qu'il démarre lui-même : il n'accepte aucune adresse extérieure. */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const RACINE = path.join(__dirname, '..', '..'), MDP = 'Mot-de-passe-de-test-1';   // mot de passe fictif
const { demarrer } = require('../app');
const resultats = [];
const note = (classe, nom, tenu, detail = '') => { resultats.push({ classe, nom, tenu }); console.log(`${tenu ? 'TENU ' : 'CÈDE '} [${classe}] ${nom}${detail ? ' — ' + String(detail).slice(0, 150) : ''}`); };

function req(base, methode, chemin, { corps, entetes = {}, brut = false } = {}) {
  return new Promise(ok => {
    const data = corps === undefined ? null : typeof corps === 'string' || Buffer.isBuffer(corps) ? corps : JSON.stringify(corps);
    const u = new URL(base);
    const r = http.request({ host: u.hostname, port: u.port, method: methode, path: chemin, headers: { ...(data !== null && !brut ? { 'Content-Type': 'application/json' } : {}), ...(data !== null ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...entetes } }, res => {
      let b = ''; res.setEncoding('utf8'); res.on('data', c => { b += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(b); } catch { /* pas du JSON */ } ok({ code: res.statusCode, entetes: res.headers, json, texte: b }); });
    });
    r.on('error', e => ok({ code: 0, erreur: e.message, entetes: {}, json: null, texte: '' }));
    r.setTimeout(20000, () => r.destroy(new Error('délai')));
    if (data !== null) r.write(data);
    r.end();
  });
}
const cookieDe = r => ({ Cookie: (r.entetes['set-cookie'] || []).map(c => c.split(';')[0]).join('; ') });

(async () => {
  const lancer = async (securite = {}) => {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-attaque-'));
    const app = await demarrer({ serveur: { hote: '127.0.0.1', port: 0 }, donnees: { dossier }, web: { dossier: RACINE }, https: { actif: false }, demo: true, securite: { coutMotDePasse: 14, ...securite } }, { journal: () => {} });
    for (const [id, role] of [['admin', 'administrateur'], ['tech', 'technicien'], ['lecteur', 'lecture']]) await app.securite.creerUtilisateur({ identifiant: id, nom: id, courriel: id + '@exemple.test', role, motDePasse: MDP });
    const base = `http://127.0.0.1:${app.port}`, s = { app, dossier, base };
    for (const id of ['admin', 'tech', 'lecteur']) s[id] = cookieDe(await req(base, 'POST', '/api/v1/session', { corps: { identifiant: id, motDePasse: MDP } }));
    return s;
  };
  const fermer = async s => { await s.app.arreter(); fs.rmSync(s.dossier, { recursive: true, force: true }); };
  let s = await lancer({ tentativesParAdresse: 100000 });
  const A = '/api/v1';

  // ===== 1. Accès sans compte =====
  for (const c of ['/base', '/equipements', '/utilisateurs', '/audit', '/securite', '/sauvegardes', '/revision', '/supervision/etat']) { const r = await req(s.base, 'GET', A + c); note('accès', `sans session : GET ${c}`, r.code === 401, r.code); }
  for (const jeton of ['', 'x', 'null', '../../etc', 'A'.repeat(43), "' OR '1'='1"]) { const r = await req(s.base, 'GET', A + '/base', { entetes: { Cookie: 'netcarto_session=' + jeton } }); if (r.code !== 401) note('accès', `cookie forgé « ${jeton.slice(0, 12)} »`, false, r.code); }
  note('accès', 'cookies forgés (6 formes)', true);
  { const c = cookieDe(await req(s.base, 'POST', A + '/session', { corps: { identifiant: 'tech', motDePasse: MDP } })); await req(s.base, 'DELETE', A + '/session', { entetes: c }); const r = await req(s.base, 'GET', A + '/revision', { entetes: c }); note('accès', 'cookie rejoué après déconnexion', r.code === 401, r.code); }
  { const r = await req(s.base, 'GET', A + '/base', { entetes: { Cookie: '__Host-netcarto_session=' + s.admin.Cookie.split('=')[1] } }); note('accès', 'jeton valide sous le nom de cookie HTTPS, en HTTP', r.code === 401, r.code); }

  // ===== 2. Élévation de privilèges =====
  const adminSeul = [['GET', '/utilisateurs'], ['POST', '/utilisateurs', { identifiant: 'pirate', role: 'administrateur', motDePasse: MDP }], ['GET', '/audit'], ['GET', '/securite'], ['GET', '/sauvegardes'], ['POST', '/sauvegardes', {}], ['POST', '/recuperation/lien', { id: 'x' }], ['PUT', '/base', { meta: { app: 'NetCarto' } }], ['POST', '/sauvegardes/restauration', { nom: 'x' }]];
  for (const qui of ['tech', 'lecteur']) for (const [m, c, corps] of adminSeul) { const r = await req(s.base, m, A + c, { corps, entetes: s[qui] }); if (r.code !== 403) note('privilèges', `${qui} : ${m} ${c}`, false, r.code); }
  note('privilèges', 'routes d\'administration refusées au technicien et au lecteur (18 essais)', true);
  { const r = await req(s.base, 'POST', A + '/lots', { corps: { type: 'edit', texte: 'x', changements: [] }, entetes: s.lecteur }); note('privilèges', 'lecteur : écriture d\'un lot', r.code === 403, r.code); }
  { const u = (await req(s.base, 'GET', A + '/utilisateurs', { entetes: s.admin })).json.find(x => x.identifiant === 'tech');
    for (const coll of ['utilisateurs', 'sessions', 'audit', 'meta', 'migrations', 'reinitialisations']) { const r = await req(s.base, 'POST', A + '/lots', { corps: { type: 'edit', texte: 'x', changements: [{ collection: coll, op: 'modifier', cle: u.id, avant: u, apres: { ...u, role: 'administrateur' } }] }, entetes: s.tech }); if (r.code === 200) note('privilèges', `technicien : lot sur la table « ${coll} »`, false, r.code); }
    note('privilèges', 'tables internes hors de portée des lots (6 essais)', true);
    const r2 = await req(s.base, 'PUT', A + '/utilisateurs/' + u.id, { corps: { role: 'administrateur' }, entetes: s.tech }); note('privilèges', 'technicien : se promouvoir administrateur', r2.code === 403, r2.code); }
  // Variantes d'adresse et de méthode
  for (const c of ['//utilisateurs', '/utilisateurs/', '/Utilisateurs', '/%75tilisateurs', '/utilisateurs%2f', '/./utilisateurs', '/x/../utilisateurs', '/utilisateurs?x=1', '/utilisateurs;x', '/utilisateurs%00']) { const r = await req(s.base, 'GET', A + c, { entetes: s.tech }); if (r.code === 200) note('privilèges', `variante d'adresse ${c}`, false, r.code); }
  note('privilèges', 'variantes d\'adresse vers /utilisateurs (10 essais)', true);
  for (const m of ['HEAD', 'PATCH', 'OPTIONS', 'TRACE']) { const r = await req(s.base, m, A + '/utilisateurs', { entetes: { ...s.tech, 'X-HTTP-Method-Override': 'GET' } }); if (r.code === 200) note('privilèges', `méthode ${m}`, false, r.code); }
  note('privilèges', 'méthodes inattendues et en-tête de substitution de méthode', true);

  // ===== 3. Requêtes venues d'un autre site =====
  { const e = { identifiant: 'csrf', role: 'administrateur', motDePasse: MDP };
    const r1 = await req(s.base, 'POST', A + '/utilisateurs', { corps: e, entetes: { ...s.admin, Origin: 'https://site-malveillant.exemple' } }); note('autre site', 'écriture avec Origin étranger', r1.code === 403, r1.code);
    const r2 = await req(s.base, 'POST', A + '/utilisateurs', { corps: JSON.stringify(e), brut: true, entetes: { ...s.admin, 'Content-Type': 'text/plain' } }); note('autre site', 'formulaire simple (text/plain)', r2.code === 415, r2.code);
    const r3 = await req(s.base, 'POST', A + '/utilisateurs', { corps: e, entetes: { ...s.admin, Origin: 'null' } }); note('autre site', 'Origin « null » (page isolée)', r3.code === 403, r3.code);
    const r4 = await req(s.base, 'POST', A + '/utilisateurs', { corps: e, entetes: { ...s.admin, Origin: `http://127.0.0.1:${s.app.port}.site-malveillant.exemple` } }); note('autre site', 'Origin qui commence comme le vrai', r4.code === 403, r4.code);
    const r5 = await req(s.base, 'GET', A + '/base', { entetes: { ...s.admin, Origin: 'https://site-malveillant.exemple' } }); note('autre site', 'lecture : aucun en-tête CORS accordé', !r5.entetes['access-control-allow-origin'], r5.entetes['access-control-allow-origin']); }

  // ===== 4. Injections =====
  { const n = (await req(s.base, 'GET', A + '/equipements', { entetes: s.lecteur })).json.length;
    for (const v of ["' OR '1'='1", "x' UNION SELECT mot_de_passe,2,3 FROM utilisateurs--", '1; DROP TABLE equipements', '%27%20OR%201=1--']) { const r = await req(s.base, 'GET', A + '/equipements?hostname=' + encodeURIComponent(v), { entetes: s.lecteur }); if (r.code !== 200 || r.json.length) note('injection', `SQL dans un filtre : ${v.slice(0, 20)}`, false, r.code); }
    for (const c of ["/equipements?hostname)=1--=x", '/equipements?nom_hote=x', "/audit?limite=1;DROP TABLE audit", "/audit?avant=1 OR 1=1", "/audit?action=' OR 1=1--", "/equipements/' OR 1=1--", '/vlans/1 OR 1=1']) { const r = await req(s.base, 'GET', A + encodeURI(c), { entetes: s.admin }); if (r.code === 500 || /scrypt|mot_de_passe/.test(r.texte)) note('injection', `SQL : ${c}`, false, r.code); }
    const n2 = (await req(s.base, 'GET', A + '/equipements', { entetes: s.lecteur })).json.length;
    note('injection', 'SQL dans les filtres, les identifiants et le journal (11 essais)', n === n2 && n > 0); }
  for (const c of ['/..%2f..%2fetc/passwd', '/js/..%2f..%2fserveur/netcarto.js', '/js/%2e%2e/%2e%2e/SUIVI.md', '/js/..%5c..%5cserveur%5cconfig.js', '/js/main.js%00.png', '/serveur/netcarto.js', '/.git/config', '/SUIVI.md', '/tests/netcarto.test.js', '/installation/netcarto.toml', '/js//../../serveur/app.js', '/css/../serveur/package.json', '/index.html/../serveur/app.js']) {
    const r = await req(s.base, 'GET', c); if (r.code === 200 && !/netcarto-api/.test(r.texte)) note('injection', `fichier hors de l'interface : ${c}`, false, r.code); else if (r.code === 200) note('injection', `chemin ${c} sert la page`, true); }
  note('injection', 'traversée de dossier vers les fichiers du serveur (13 essais)', true);
  { for (const nom of ['../netcarto.sqlite', '..%2fnetcarto.sqlite', 'netcarto.sqlite', '/etc/passwd', 'netcarto-2026-01-01_000000-auto.sqlite/../../netcarto.sqlite']) { const r = await req(s.base, 'GET', A + '/sauvegardes/' + encodeURIComponent(nom), { entetes: s.admin }); if (r.code === 200) note('injection', `téléchargement hors du dossier des sauvegardes : ${nom}`, false); }
    note('injection', 'nom de sauvegarde détourné (5 essais)', true); }
  { const eq = (await req(s.base, 'GET', A + '/equipements', { entetes: s.tech })).json[0];
    const r = await req(s.base, 'POST', A + '/lots', { corps: `{"type":"edit","texte":"x","changements":[{"collection":"devices","op":"modifier","cle":"${eq.id}","avant":${JSON.stringify(eq)},"apres":${JSON.stringify(eq).slice(0, -1)},"__proto__":{"pollue":true},"constructor":{"prototype":{"pollue":true}}}}]}`, entetes: s.tech });
    note('injection', 'pollution de prototype par un lot', ({}).pollue === undefined && r.code !== 200, r.code); }

  // ===== 5. Robustesse : requêtes mal formées =====
  { const malformes = ['{', '[]', 'null', '"texte"', '{"a":' + '['.repeat(5000) + ']'.repeat(5000) + '}', '\u0000\u0001', '{"type":"edit","changements":"non"}', '{"type":"edit","changements":[null]}', '{"type":"edit","changements":[{"collection":"devices","op":"creer","cle":{"$ne":1},"apres":{}}]}'];
    for (const m of malformes) { const r = await req(s.base, 'POST', A + '/lots', { corps: m, brut: true, entetes: { ...s.tech, 'Content-Type': 'application/json' } }); if (r.code >= 500 || r.code === 0) note('robustesse', `corps mal formé : ${m.slice(0, 24)}`, false, r.code + ' ' + (r.erreur || r.texte.slice(0, 80))); }
    await new Promise(ok => { const c = net.connect(s.app.port, '127.0.0.1', () => { c.write('POST /api/v1/session HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 50000\r\n\r\n{"identifiant":"'); setTimeout(() => { c.destroy(); ok(); }, 300); }); c.on('error', ok); });
    await new Promise(ok => { const c = net.connect(s.app.port, '127.0.0.1', () => { c.write('GET /api/v1/base HTTP/1.1\r\nHost: x\r\nCookie: ' + 'a'.repeat(70000) + '\r\n\r\n'); c.on('data', () => {}); setTimeout(() => { c.destroy(); ok(); }, 300); }); c.on('error', ok); });
    const r = await req(s.base, 'GET', A + '/sante'); note('robustesse', 'requêtes mal formées, tronquées ou démesurées : le serveur reste debout', r.code === 200, r.code); }
  { const t = Date.now(); const r = await req(s.base, 'POST', A + '/utilisateurs', { corps: { identifiant: 'regex', role: 'lecture', motDePasse: MDP, courriel: 'a@' + 'a.'.repeat(30000) + '!' }, entetes: s.admin }); note('robustesse', 'adresse de courriel conçue pour ralentir le contrôle', Date.now() - t < 1500, `${Date.now() - t} ms, code ${r.code}`); }
  await fermer(s);

  // ===== 6. Contournement des limites =====
  s = await lancer({ tentativesParAdresse: 20 });
  { const rafale = await Promise.all(Array.from({ length: 80 }, (_, i) => req(s.base, 'POST', A + '/session', { corps: { identifiant: 'inconnu' + i, motDePasse: 'mauvais-mot-de-passe' } })));
    const evalues = rafale.filter(r => r.code === 401).length; note('limites', 'rafale de 80 connexions simultanées depuis une adresse (limite : 20)', evalues <= 20, `${evalues} essais réellement évalués`); }
  await fermer(s);
  s = await lancer({ tentativesParAdresse: 100000, echecsMax: 5 });
  { const mots = Array.from({ length: 60 }, (_, i) => i === 45 ? MDP : 'mauvais-mot-de-passe-' + i);
    const rafale = await Promise.all(mots.map(m => req(s.base, 'POST', A + '/session', { corps: { identifiant: 'lecteur', motDePasse: m } })));
    note('limites', 'rafale de 60 mots de passe sur un compte (verrou : 5 échecs) : le bon, en 46e position, ne doit pas passer', !rafale.some(r => r.code === 200), rafale.some(r => r.code === 200) ? 'le bon mot de passe a été accepté malgré le verrou' : ''); }
  await fermer(s);
  s = await lancer({ tentativesParAdresse: 5 });
  { for (let i = 0; i < 5; i++) await req(s.base, 'POST', A + '/session', { corps: { identifiant: 'x', motDePasse: 'mauvais-mot-de-passe' } });
    for (const e of [{ 'X-Forwarded-For': '203.0.113.9' }, { 'X-Real-IP': '203.0.113.9' }, { Forwarded: 'for=203.0.113.9' }, { 'X-Client-IP': '203.0.113.9' }, { 'True-Client-IP': '203.0.113.9' }]) { const r = await req(s.base, 'POST', A + '/session', { corps: { identifiant: 'tech', motDePasse: MDP }, entetes: e }); if (r.code !== 429) note('limites', `adresse usurpée par ${Object.keys(e)[0]}`, false, r.code); }
    note('limites', 'adresse usurpée par un en-tête (5 formes)', true);
    const r = await req(s.base, 'PUT', A + '/session/mot-de-passe', { corps: { actuel: 'x', nouveau: MDP + '9' }, entetes: s.tech });
    let n = 0; for (let i = 0; i < 30; i++) if ((await req(s.base, 'PUT', A + '/session/mot-de-passe', { corps: { actuel: 'mauvais-' + i, nouveau: MDP + '9' }, entetes: s.tech })).code === 403) n++;
    note('limites', 'session volée : deviner le mot de passe actuel par essais répétés', n < 30, `${n} essais sur 30 évalués (premier : ${r.code})`); }
  await fermer(s);

  // ===== 7. Récupération de compte =====
  s = await lancer({ tentativesParAdresse: 100000 });
  { const u = (await req(s.base, 'GET', A + '/utilisateurs', { entetes: s.admin })).json, tech = u.find(x => x.identifiant === 'tech'), adm = u.find(x => x.identifiant === 'admin');
    const lien = (await req(s.base, 'POST', A + '/recuperation/lien', { corps: { id: tech.id }, entetes: s.admin })).json.lien, jeton = lien.split('=')[1];
    for (const j of [jeton.slice(0, -1), jeton.toUpperCase(), jeton + 'x', '', ' ' + jeton]) { const r = await req(s.base, 'POST', A + '/recuperation/mot-de-passe', { corps: { jeton: j, motDePasse: 'Autre-mot-de-passe-77' } }); if (r.code === 200) note('récupération', 'jeton altéré accepté', false); }
    note('récupération', 'jeton altéré (5 formes)', true);
    const r1 = await req(s.base, 'POST', A + '/recuperation/mot-de-passe', { corps: { jeton, motDePasse: 'Autre-mot-de-passe-77', identifiant: 'admin', id: adm.id, utilisateur_id: adm.id } });
    const r2 = await req(s.base, 'POST', A + '/session', { corps: { identifiant: 'admin', motDePasse: 'Autre-mot-de-passe-77' } });
    note('récupération', 'lien d\'un technicien détourné vers le compte administrateur', r1.json?.identifiant === 'tech' && r2.code === 401, `${r1.json?.identifiant} / ${r2.code}`);
    const r3 = await req(s.base, 'GET', A + '/audit?limite=200', { entetes: s.admin }); note('récupération', 'jeton absent du journal d\'audit', !r3.texte.includes(jeton)); }
  // ===== 8. Fuites d'information =====
  { const r = await req(s.base, 'GET', A + '/utilisateurs', { entetes: s.admin }); note('fuites', 'liste des comptes sans empreinte de mot de passe', !/scrypt|mot_de_passe/.test(r.texte));
    const r2 = await req(s.base, 'POST', A + '/lots', { corps: { type: 'edit', texte: 'x', changements: [{ collection: 'devices', op: 'creer', cle: 'dev-zz', apres: { id: 'dev-zz' } }] }, entetes: s.admin }); note('fuites', 'message d\'erreur sans requête SQL ni chemin de fichier', !/SELECT|INSERT|\/home\/|node_modules|at .*\.js/.test(r2.texte), r2.texte.slice(0, 100));
    const r3 = await req(s.base, 'GET', A + '/base', { entetes: s.lecteur }); note('fuites', 'base lue par un lecteur : ni comptes, ni sessions, ni audit', !/utilisateurs|sessions|scrypt|courriel/.test(r3.texte));
    const r4 = await req(s.base, 'GET', '/'); note('fuites', 'aucun en-tête qui nomme le logiciel serveur', !r4.entetes.server && !r4.entetes['x-powered-by']);
    const t0 = Date.now(); await req(s.base, 'POST', A + '/session', { corps: { identifiant: 'inconnu-xyz', motDePasse: 'mauvais-mot-de-passe' } }); const tInconnu = Date.now() - t0; const t1 = Date.now(); await req(s.base, 'POST', A + '/session', { corps: { identifiant: 'tech', motDePasse: 'mauvais-mot-de-passe' } }); const tConnu = Date.now() - t1;
    note('fuites', 'temps de réponse : compte inconnu et compte connu indiscernables', Math.abs(tInconnu - tConnu) < Math.max(tInconnu, tConnu) * 0.6 + 25, `${tInconnu} ms / ${tConnu} ms`); }
  await fermer(s);
  const cedes = resultats.filter(r => !r.tenu);
  console.log(`\n${resultats.length} essais notés, ${cedes.length} défense(s) qui cède(nt)`); for (const c of cedes) console.log('  →', c.classe, ':', c.nom);
  process.exitCode = cedes.length ? 1 : 0;
})().catch(e => { console.error('ARRÊT', e.stack.split('\n').slice(0, 4).join(' / ')); process.exit(1); });
