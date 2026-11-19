/* Tests de l'API HTTP et du service des fichiers de l'interface. */
'use strict';
const test = require('node:test'), assert = require('node:assert'), path = require('path');
const { demarrer } = require('../app');
const { RACINE, dossierTemporaire, demo, requete } = require('./aide');

async function serveur(t, extra = {}) {
  const dossier = extra.dossier || dossierTemporaire(t);
  const app = await demarrer({ serveur: { hote: '127.0.0.1', port: 0 }, donnees: { dossier }, web: { dossier: RACINE }, ...extra.config }, { journal: () => {} });
  t.after(() => app.arreter());
  return { app, base: `http://127.0.0.1:${app.port}`, api: `http://127.0.0.1:${app.port}/api/v1`, dossier };
}

test('informations, santé et base de départ', async t => {
  const { api } = await serveur(t);
  const info = await requete('GET', api + '/info');
  assert.strictEqual(info.code, 200); assert.deepStrictEqual([info.json.app, info.json.mode, info.json.schema], ['NetCarto', 'serveur', 1]);
  assert.match(info.entetes['content-type'], /application\/json/); assert.strictEqual(info.entetes['cache-control'], 'no-store');
  assert.deepStrictEqual((await requete('GET', api + '/sante')).json, { ok: true, base: 'ok' });
  const b = (await requete('GET', api + '/base')).json;
  assert.deepStrictEqual([b.sites.length, b.catalog.length, b.vlans.length, b.meta.demo], [0, 34, 8, false]);
});

test('remplacer la base, puis appliquer un lot ; refus sans effet en cas de doublon', async t => {
  const { api } = await serveur(t), d = await demo();
  const r = await requete('PUT', api + '/base', d);
  assert.strictEqual(r.code, 200, r.texte); assert.ok(r.json.revision > 0);
  assert.strictEqual((await requete('GET', api + '/revision')).json.revision, r.json.revision);
  const [a, b] = d.devices.filter(x => x.ip);
  const ok = await requete('POST', api + '/lots', { type: 'edit', changements: [{ collection: 'devices', op: 'modifier', cle: a.id, avant: a, apres: { ...a, notes: 'via API' } }] });
  assert.strictEqual(ok.code, 200, ok.texte); assert.strictEqual(ok.json.revision, r.json.revision + 1);
  const lu = await requete('GET', `${api}/equipements/${a.id}`);
  assert.strictEqual(lu.json.notes, 'via API');
  const doublon = await requete('POST', api + '/lots', { changements: [{ collection: 'devices', op: 'modifier', cle: a.id, avant: lu.json, apres: { ...lu.json, ip: b.ip } }] });
  assert.strictEqual(doublon.code, 422); assert.match(doublon.json.erreur, /adresse IP/i); assert.strictEqual(doublon.json.code, 'regle');
  const conflit = await requete('POST', api + '/lots', { changements: [{ collection: 'devices', op: 'modifier', cle: a.id, avant: a, apres: { ...a, notes: 'écrase ?' } }] });
  assert.strictEqual(conflit.code, 409); assert.strictEqual(conflit.json.code, 'conflit');
  assert.strictEqual((await requete('GET', `${api}/equipements/${a.id}`)).json.notes, 'via API');
});

test('lecture des ressources : listes, filtres, élément, erreurs', async t => {
  const { api } = await serveur(t), d = await demo();
  await requete('PUT', api + '/base', d);
  for (const [res, col] of [['sites', 'sites'], ['batiments', 'buildings'], ['etages', 'floors'], ['pieces', 'rooms'], ['baies', 'racks'], ['equipements', 'devices'], ['ports', 'ports'], ['prises', 'outlets'], ['cables', 'cables'], ['catalogue', 'catalog'], ['stock', 'stock'], ['vlans', 'vlans'], ['journal', 'history']]) {
    const r = await requete('GET', `${api}/${res}`);
    assert.strictEqual(r.code, 200, res); assert.strictEqual(r.json.length, d[col].length, res);
  }
  const sw = d.devices.find(x => x.hostname === 'SW-A1-ACC-01');
  assert.strictEqual((await requete('GET', `${api}/ports?deviceId=${sw.id}`)).json.length, 52);
  assert.strictEqual((await requete('GET', `${api}/equipements?hostname=SW-A1-ACC-01`)).json[0].id, sw.id);
  assert.strictEqual((await requete('GET', `${api}/vlans/20`)).json.name, 'VOIX');
  assert.strictEqual((await requete('GET', `${api}/stock/cat-pp24`)).json.available, 0);
  assert.strictEqual((await requete('GET', `${api}/equipements/dev-absent`)).code, 404);
  assert.strictEqual((await requete('GET', `${api}/equipements?champInconnu=1`)).code, 400);
  assert.strictEqual((await requete('GET', `${api}/inexistant`)).code, 404);
});

test('requêtes refusées : méthode, type de contenu, JSON invalide, corps trop gros', async t => {
  const { api } = await serveur(t, { config: { limites: { corpsMaxMo: 1 } } });
  assert.strictEqual((await requete('DELETE', api + '/base')).code, 405);
  // Écriture venue d'une page d'un autre site : refusée ; depuis la page de NetCarto elle-même : acceptée
  assert.strictEqual((await requete('POST', api + '/lots', { changements: [] }, { Origin: 'http://site-malveillant.test' })).code, 403);
  assert.strictEqual((await requete('POST', api + '/lots', { changements: [] }, { Origin: api.replace('/api/v1', '') })).code, 200);
  assert.strictEqual((await requete('POST', api + '/lots', '{"changements":[]}', { 'Content-Type': 'text/plain' })).code, 415);
  const mauvais = await requete('POST', api + '/lots', '{pas du json');
  assert.strictEqual(mauvais.code, 400); assert.match(mauvais.json.erreur, /JSON/);
  assert.strictEqual((await requete('POST', api + '/lots', { changements: 'non' })).code, 400);
  assert.strictEqual((await requete('PUT', api + '/base', { meta: { app: 'Autre' } })).code, 400);
  const gros = await requete('POST', api + '/lots', { changements: [], bourrage: 'x'.repeat(1.5 * 1024 * 1024) }).catch(e => ({ code: e.code === 'ECONNRESET' || e.code === 'EPIPE' ? 413 : 0 }));
  assert.strictEqual(gros.code, 413);
});

test('fichiers de l\'interface : servis avec l\'adresse de l\'API, sans exposer le reste du dépôt', async t => {
  const { base } = await serveur(t);
  const page = await requete('GET', base + '/');
  assert.strictEqual(page.code, 200); assert.match(page.texte, /<meta name="netcarto-api" content="\/api\/v1">/);
  assert.match(page.entetes['content-type'], /text\/html/); assert.ok(page.entetes['x-content-type-options'] === 'nosniff');
  assert.strictEqual((await requete('GET', base + '/js/main.js')).code, 200);
  assert.strictEqual((await requete('GET', base + '/css/style.css')).code, 200);
  for (const interdit of ['/serveur/netcarto.js', '/serveur/package.json', '/connecteurs/serveur.js', '/.git/config', '/SUIVI.md', '/tests/netcarto.test.js', '/js/%2e%2e/serveur/app.js', '/js/..%2f..%2fserveur/app.js'])
    assert.notStrictEqual((await requete('GET', base + interdit)).code, 200, interdit);
});

test('supervision : l\'ancien relais est un module du serveur', async t => {
  const { api } = await serveur(t, { config: { supervision: { intervalle: 30, sources: [{ type: 'simulation', devices: [{ ip: '10.10.99.18', hostname: 'SW-A1-ACC-01', ports: ['Gi1/0/1', 'Gi1/0/2'] }] }] } } });
  const e = await requete('GET', api + '/supervision/etat');
  assert.strictEqual(e.code, 200); assert.deepStrictEqual([e.json.version, e.json.devices.length, e.json.devices[0].ports.length], [1, 1, 2]);
  assert.strictEqual((await requete('GET', api + '/supervision/sante')).json.sources[0].ok, true);
});

test('les données persistent d\'un démarrage à l\'autre', async t => {
  const dossier = dossierTemporaire(t), d = await demo();
  const a = await demarrer({ serveur: { hote: '127.0.0.1', port: 0 }, donnees: { dossier }, web: { dossier: RACINE } }, { journal: () => {} });
  await requete('PUT', `http://127.0.0.1:${a.port}/api/v1/base`, d); await a.arreter();
  const { api } = await serveur(t, { dossier });
  assert.strictEqual((await requete('GET', api + '/equipements')).json.length, 102);
  assert.ok(require('fs').existsSync(path.join(dossier, 'netcarto.sqlite')));
});
