/* Montée en charge côté serveur : grande base fictive, réponses compressées. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const zlib = require('zlib'), http = require('http'), path = require('path');
const { pathToFileURL } = require('url');
const { requete, serveurDeTest, RACINE } = require('./aide');

/* Requête brute : renvoie le corps tel qu'il a circulé (Buffer) et les en-têtes */
const brut = (url, entetes) => new Promise((ok, ko) => http.get(url, { headers: entetes }, res => { const m = []; res.on('data', c => m.push(c)); res.on('end', () => ok({ code: res.statusCode, entetes: res.headers, corps: Buffer.concat(m) })); }).on('error', ko));

test('Grande base : chargement, lecture complète, lot et sauvegarde restent rapides', async t => {
  const { grandeBase } = await import(pathToFileURL(path.join(RACINE, 'tests', 'grande-base.mjs')).href);
  const doc = await grandeBase(), s = await serveurDeTest(t, { config: { sauvegardes: { actif: false } } });
  const chrono = async f => { const d = performance.now(); const r = await f(); return [r, performance.now() - d]; };
  const [, tRemplacer] = await chrono(() => s.app.depot.remplacerBase(doc));
  const [base, tLire] = await chrono(() => s.app.depot.lireBase());
  assert.deepStrictEqual([base.devices.length, base.ports.length, base.cables.length, base.outlets.length], [doc.devices.length, doc.ports.length, doc.cables.length, doc.outlets.length]);
  const dev = s.app.depot.lire('devices', doc.devices[10].id);
  const [, tLot] = await chrono(() => s.app.depot.appliquerLot({ type: 'edit', texte: 'Essai', changements: [{ collection: 'devices', op: 'modifier', cle: dev.id, avant: dev, apres: { ...dev, notes: 'charge' } }] }));
  const [, tSauvegarde] = await chrono(() => s.app.sauvegardes.creer('manuelle'));
  const [liste, tFiltre] = await chrono(() => requete('GET', s.api + '/equipements?hostname=' + doc.devices[2000].hostname, undefined, s.admin));
  assert.strictEqual(liste.json.length, 1);
  // Seuils larges : ils signalent une régression nette (machine de test lente comprise)
  const mesures = { remplacer: [tRemplacer, 20000], lire: [tLire, 5000], lot: [tLot, 1000], sauvegarde: [tSauvegarde, 5000], filtre: [tFiltre, 1000] };
  for (const [nom, [ms, max]] of Object.entries(mesures)) assert.ok(ms < max, `${nom} : ${Math.round(ms)} ms (limite ${max})`);
});

test('Les réponses volumineuses sont compressées quand le navigateur le demande', async t => {
  const s = await serveurDeTest(t, { config: { demo: true } });
  const clair = await brut(s.api + '/base', { ...s.admin });
  assert.strictEqual(clair.code, 200); assert.strictEqual(clair.entetes['content-encoding'], undefined);
  const gz = await brut(s.api + '/base', { ...s.admin, 'Accept-Encoding': 'gzip, deflate, br' });
  assert.strictEqual(gz.entetes['content-encoding'], 'gzip'); assert.match(gz.entetes.vary || '', /Accept-Encoding/i);
  assert.ok(gz.corps.length < clair.corps.length / 4, `${gz.corps.length} octets compressés pour ${clair.corps.length}`);
  assert.deepStrictEqual(JSON.parse(zlib.gunzipSync(gz.corps).toString('utf8')), JSON.parse(clair.corps.toString('utf8')));
  // Une petite réponse n'est pas compressée ; les fichiers de l'interface le sont
  assert.strictEqual((await brut(s.api + '/revision', { ...s.admin, 'Accept-Encoding': 'gzip' })).entetes['content-encoding'], undefined);
  const js = await brut(s.base + '/js/store.js', { 'Accept-Encoding': 'gzip' });
  assert.strictEqual(js.entetes['content-encoding'], 'gzip'); assert.match(zlib.gunzipSync(js.corps).toString('utf8'), /const Store/);
  assert.match((await brut(s.base + '/js/store.js', {})).corps.toString('utf8'), /const Store/);
});
