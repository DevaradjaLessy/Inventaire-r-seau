/* Essai réel de la source Zabbix contre un vrai serveur Zabbix, et de la chaîne complète Zabbix + SNMP.
   Ignoré sans serveur d'essai : donner son adresse et un jeton en lecture seule dans NETCARTO_TEST_ZABBIX_URL et
   NETCARTO_TEST_ZABBIX_JETON. L'hôte attendu se nomme dans NETCARTO_TEST_ZABBIX_HOTE (par défaut SW-REEL-01).
   Pour la chaîne avec le SNMP, donner aussi l'agent que surveille Zabbix : NETCARTO_TEST_SNMP=adresse:port:communauté. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const zabbix = require('../../connecteurs/sources/zabbix');
const { creerReleveur } = require('../../connecteurs/lib/releveur');

const URL_Z = process.env.NETCARTO_TEST_ZABBIX_URL, JETON = process.env.NETCARTO_TEST_ZABBIX_JETON, HOTE = process.env.NETCARTO_TEST_ZABBIX_HOTE || 'SW-REEL-01';
const SNMP = (process.env.NETCARTO_TEST_SNMP || '').split(':'), sans = !(URL_Z && JETON) && 'aucun serveur Zabbix d\'essai indiqué';

test('Zabbix réel : hôtes, état, ports et trafic lus par l\'API avec un jeton en lecture seule', { skip: sans, timeout: 60000 }, async () => {
  const devs = await zabbix({ type: 'zabbix', url: URL_Z, apiToken: JETON }).relever();
  const d = devs.find(x => x.hostname === HOTE);
  assert.ok(d, `hôte ${HOTE} absent : ${devs.map(x => x.hostname)}`);
  assert.ok(['up', 'warning'].includes(d.state), `état ${d.state} : ${d.message}`);
  assert.ok(d.ip, 'adresse de l\'interface principale');
  assert.ok(d.ports.length >= 1, 'au moins un port');
  for (const p of d.ports) { assert.ok(['up', 'down', 'error'].includes(p.status), `${p.name} : ${p.status}`); assert.ok(p.inMbps === null || p.inMbps >= 0); }
  assert.ok(d.ports.some(p => p.status === 'up'), `un port monté : ${JSON.stringify(d.ports.map(p => [p.name, p.status]))}`);
  // Jeton refusé : erreur claire, qui ne répète pas le jeton
  await assert.rejects(zabbix({ type: 'zabbix', url: URL_Z, apiToken: 'jeton-qui-n-existe-pas' }).relever(), e => /Zabbix/.test(e.message) && !/jeton-qui/.test(e.message));
  // Groupe d'hôtes inconnu : dit lequel
  await assert.rejects(zabbix({ type: 'zabbix', url: URL_Z, apiToken: JETON, groupes: ['Groupe qui n\'existe pas'] }).relever(), /introuvable/);
});

test('Chaîne réelle : Zabbix et SNMP voient le même équipement, NetCarto n\'en garde qu\'un, sans désaccord inutile', { skip: sans || (SNMP.length < 3 && 'aucun agent SNMP d\'essai indiqué'), timeout: 60000 }, async () => {
  const erreurs = [], r = creerReleveur([
    { type: 'zabbix', url: URL_Z, apiToken: JETON },
    { type: 'snmp', version: '2c', community: SNMP[2], port: +SNMP[1], timeoutMs: 3000, devices: [{ ip: SNMP[0] }] },
  ], m => erreurs.push(m));
  await r.relever();
  const e = r.etat();
  assert.deepStrictEqual(erreurs, []); assert.deepStrictEqual(e.sources.map(s => [s.nom, s.ok]), [['zabbix', true], ['snmp', true]]);
  const vus = e.devices.filter(d => d.hostname === HOTE || d.ip === SNMP[0]);
  assert.strictEqual(vus.length, 1, `un seul équipement attendu : ${JSON.stringify(e.devices.map(d => [d.ip, d.hostname, d.sources]))}`);
  const [d] = vus;
  assert.deepStrictEqual(d.sources, ['zabbix', 'snmp']);
  // Chaque port n'apparaît qu'une fois ; le SNMP précise ce que Zabbix ne sait pas (port désactivé), sans que ce soit un désaccord
  const noms = d.ports.map(p => p.name);
  assert.strictEqual(new Set(noms).size, noms.length, `ports en double : ${noms}`);
  assert.deepStrictEqual(d.ecarts.filter(x => !/^état/.test(x)), [], 'aucun désaccord sur l\'état des ports');
  console.log('      chaîne réelle :', JSON.stringify({ etat: d.state, message: d.message, ports: d.ports.map(p => [p.name, p.status, p.inMbps]), ecarts: d.ecarts }));
});
