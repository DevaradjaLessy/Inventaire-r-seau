/* Essai réel de la source SNMP contre un véritable agent net-snmp (snmpd), et non contre le simulateur des tests du relais.
   Ignoré si snmpd n'est pas installé (Debian, Ubuntu : apt-get install snmpd). L'agent est lancé le temps de l'essai,
   sur une adresse locale, avec des identifiants fictifs ; celui du système, s'il existe, n'est pas touché. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn, spawnSync } = require('child_process');

const SNMPD = ['/usr/sbin/snmpd', '/usr/local/sbin/snmpd'].find(f => fs.existsSync(f));
const creer = require('../../connecteurs/sources/snmp');
const PORT = 11610 + (process.pid % 300), COMMUNAUTE = 'essai-lecture', AUTH = 'phrase-auth-essai', PRIV = 'phrase-priv-essai';   // valeurs fictives
const attendre = ms => new Promise(r => setTimeout(r, ms));

test('SNMP réel : état, ports physiques, débit et refus d\'accès, en v2c et en v3 chiffré', { skip: !SNMPD && 'snmpd absent de cette machine', timeout: 60000 }, async t => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'netcarto-snmpd-')), conf = path.join(dossier, 'snmpd.conf');
  fs.writeFileSync(conf, [`agentaddress udp:127.0.0.1:${PORT}`, `rocommunity ${COMMUNAUTE} 127.0.0.1`, `createUser netcarto SHA "${AUTH}" AES "${PRIV}"`, 'rouser netcarto priv', 'sysName SW-REEL-01', ''].join('\n'));
  // -C : ce fichier seulement ; l'état de l'agent (utilisateurs v3) va dans le dossier de l'essai
  const agent = spawn(SNMPD, ['-f', '-Lf', path.join(dossier, 'snmpd.log'), '-C', '-c', conf, '-p', path.join(dossier, 'snmpd.pid')], { stdio: 'ignore', env: { ...process.env, SNMP_PERSISTENT_DIR: dossier } });
  // L'agent écrit son état en s'arrêtant : on attend sa fin avant de retirer le dossier
  t.after(async () => { const fin = new Promise(r => agent.once('exit', r)); agent.kill(); await Promise.race([fin, attendre(3000)]); fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });
  const cible = { port: PORT, timeoutMs: 2500, devices: [{ ip: '127.0.0.1' }] };
  const v2 = creer({ type: 'snmp', version: '2c', community: COMMUNAUTE, ...cible });
  let d = null;
  for (let i = 0; i < 20 && (!d || d.state !== 'up'); i++) { await attendre(300); [d] = await v2.relever(); }
  assert.strictEqual(d.state, 'up', `l'agent ne répond pas : ${d.message}`);
  assert.strictEqual(d.hostname, 'SW-REEL-01');
  // Seules les interfaces Ethernet sont remontées : le bouclage « lo » (type 24) est écarté par le type que donne l'agent
  const noms = d.ports.map(p => p.name), systeme = fs.readdirSync('/sys/class/net');
  assert.ok(!noms.includes('lo'), `bouclage écarté : ${noms}`);
  assert.ok(noms.length >= 1 && noms.every(n => systeme.includes(n)), `interfaces du système : ${noms} parmi ${systeme}`);
  for (const p of d.ports) assert.ok(['up', 'down', 'disabled'].includes(p.status), `${p.name} : ${p.status}`);
  // L'état lu correspond à celui du système pour chaque interface montée
  for (const p of d.ports) { const etat = fs.readFileSync(`/sys/class/net/${p.name}/operstate`, 'utf8').trim(); if (etat === 'up') assert.strictEqual(p.status, 'up', p.name); }
  // Second relevé : le débit est un nombre, jamais négatif
  await attendre(1100); [d] = await v2.relever();
  for (const p of d.ports) assert.ok(typeof p.inMbps === 'number' && p.inMbps >= 0 && typeof p.outMbps === 'number' && p.outMbps >= 0 && p.errors >= 0, JSON.stringify(p));
  // SNMP v3, authentifié et chiffré : mêmes ports
  const v3 = base => creer({ type: 'snmp', version: '3', user: 'netcarto', authProtocol: 'sha', authKey: AUTH, privProtocol: 'aes', privKey: PRIV, ...cible, ...base });
  const [c] = await v3({}).relever();
  assert.strictEqual(c.state, 'up', c.message); assert.deepStrictEqual(c.ports.map(p => p.name), noms);
  // Refus : chaque cas donne un message qui dit quoi vérifier, sans faire échouer le relevé
  const [mdp] = await v3({ authKey: 'mauvaise-phrase-auth' }).relever();
  assert.deepStrictEqual([mdp.state, mdp.ports.length], ['down', 0]); assert.match(mdp.message, /SNMP v3.*authentification refusé/);
  const [inconnu] = await v3({ user: 'personne' }).relever();
  assert.strictEqual(inconnu.state, 'down'); assert.match(inconnu.message, /utilisateur inconnu/i);
  const [com] = await creer({ type: 'snmp', version: '2c', community: 'pas-la-bonne', ...cible, timeoutMs: 1200 }).relever();
  assert.strictEqual(com.state, 'down'); assert.match(com.message, /Aucune réponse SNMP.*communauté/);
});

/* Second essai : un vrai système de switch ou de routeur (et non un serveur Linux). Ignoré sans cible :
   NETCARTO_TEST_SWITCH=adresse:port:communauté, et pour la v3 NETCARTO_TEST_SWITCH_V3=utilisateur:phrase d'authentification:phrase de chiffrement.
   Essayé contre MikroTik RouterOS 7 (CHR), dont l'agent SNMP n'est pas net-snmp. */
const SW = (process.env.NETCARTO_TEST_SWITCH || '').split(':'), SW3 = (process.env.NETCARTO_TEST_SWITCH_V3 || '').split(':');
test('SNMP réel sur un système de switch : ports physiques seulement, port désactivé, adresses MAC sans doublon', { skip: SW.length < 3 && 'aucun switch d\'essai indiqué', timeout: 60000 }, async () => {
  const cible = { port: +SW[1], timeoutMs: 5000, devices: [{ ip: SW[0] }] };
  const [d] = await creer({ type: 'snmp', version: '2c', community: SW[2], ...cible }).relever();
  assert.strictEqual(d.state, 'up', d.message); assert.ok(d.hostname, 'nom donné par l\'équipement');
  assert.ok(d.ports.length >= 2, JSON.stringify(d.ports.map(p => p.name)));
  // Ni bouclage, ni pont, ni interface de VLAN : seuls les ports Ethernet
  assert.ok(d.ports.every(p => !/^(lo|bridge|vlan|br-)/i.test(p.name)), `interfaces logiques écartées : ${d.ports.map(p => p.name)}`);
  assert.ok(d.ports.some(p => p.status === 'up' && p.speedMbps > 0), 'un port monté avec son débit négocié');
  for (const p of d.ports) { assert.strictEqual(new Set(p.macs).size, p.macs.length, `${p.name} : adresse MAC en double ${p.macs}`); assert.ok(p.macCount === null || p.macCount >= p.macs.length); }
  console.log('      switch réel :', d.hostname, JSON.stringify(d.ports.map(p => [p.name, p.status, p.speedMbps, p.macs])));
  if (SW3.length >= 3) {
    const v3 = m => creer({ type: 'snmp', version: '3', user: SW3[0], authProtocol: 'sha', authKey: SW3[1], privProtocol: 'aes', privKey: SW3[2], ...cible, ...m }).relever();
    const [c] = await v3({});
    assert.strictEqual(c.state, 'up', c.message); assert.deepStrictEqual(c.ports.map(p => [p.name, p.status]), d.ports.map(p => [p.name, p.status]));
    const [faux] = await v3({ authKey: 'mauvaise-phrase-auth', timeoutMs: 2500 });
    assert.strictEqual(faux.state, 'down'); assert.match(faux.message, /SNMP v3.*authentification refusé/, faux.message);
  }
});
