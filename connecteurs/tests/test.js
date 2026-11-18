/* Tests du relais, sans équipement réel : PRTG et SNMP sont remplacés par des simulateurs locaux.
   Lancer avec : npm test */
'use strict';
const assert = require('assert'), http = require('http');
const { demarrer } = require('../serveur');
const { fusionner } = require('../lib/contrat');
const prtg = require('../sources/prtg');

const get = (url, headers = {}) => new Promise((ok, ko) => http.get(url, { headers }, r => { let b = ''; r.on('data', c => { b += c; }); r.on('end', () => ok({ code: r.statusCode, headers: r.headers, json: b ? JSON.parse(b) : null })); }).on('error', ko));
const tests = [];
const test = (nom, fn) => tests.push([nom, fn]);

/* --- Simulateur PRTG : répond comme /api/table.json --- */
function fauxPrtg(port) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.searchParams.get('apitoken') !== 'cle-de-test') { res.writeHead(401); return res.end('Unauthorized'); }
    const data = u.searchParams.get('content') === 'devices'
      ? { devices: [{ objid: 2001, device: 'SW-TEST-01', host: '192.0.2.10', status: 'Up', status_raw: 3, message: 'OK', message_raw: 'OK' }, { objid: 2002, device: 'SW-TEST-02', host: '192.0.2.11', status: 'Down', status_raw: 5, message_raw: 'Request timed out' }, { objid: 2003, device: 'AP-TEST', host: '192.0.2.12', status: 'Paused', status_raw: 7, message_raw: '' }] }
      : { sensors: [{ objid: 3001, parentid: 2001, sensor: '(001) GigabitEthernet1/0/1 Traffic', status_raw: 3, lastvalue: '1 234 kbit/s', type: 'SNMP Traffic' }, { objid: 3002, parentid: 2001, sensor: '(002) GigabitEthernet1/0/2 Traffic', status_raw: 5, lastvalue: '0 kbit/s', type: 'SNMP Traffic' },
        { objid: 3003, parentid: 2001, sensor: 'Ping', status_raw: 3, lastvalue: '2 msec', type: 'Ping' }, { objid: 3004, parentid: 2001, sensor: '(049) TenGigabitEthernet1/1/1 Traffic', status_raw: 3, lastvalue: '2,5 Gbit/s', type: 'SNMP Traffic' }] };
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data));
  });
  return new Promise(ok => srv.listen(port, '127.0.0.1', () => ok(srv)));
}
test('PRTG : conversion des débits', () => {
  assert.strictEqual(prtg.debit('1 234 kbit/s'), 1.234); assert.strictEqual(prtg.debit('2,5 Gbit/s'), 2500); assert.strictEqual(prtg.debit('12.5 Mbit/s'), 12.5);
  assert.strictEqual(prtg.debit('1,234 kbit/s'), 1.234); assert.strictEqual(prtg.debit('2 msec'), null);
});
test('PRTG : nom d\'interface extrait du capteur', () => {
  assert.strictEqual(prtg.interfaceDe({ sensor: '(001) GigabitEthernet1/0/1 Traffic' }), 'GigabitEthernet1/0/1');
  assert.strictEqual(prtg.interfaceDe({ sensor: 'Ping', type: 'Ping' }), null);
});
test('PRTG : relevé complet contre le simulateur', async () => {
  const srv = await fauxPrtg(18901);
  try {
    const devs = await prtg({ type: 'prtg', url: 'http://127.0.0.1:18901', apiToken: 'cle-de-test' }).relever();
    assert.strictEqual(devs.length, 3);
    const [a, b, c] = devs;
    assert.deepStrictEqual([a.ip, a.hostname, a.state], ['192.0.2.10', 'SW-TEST-01', 'up']);
    assert.deepStrictEqual([b.state, b.message], ['down', 'Request timed out']);
    assert.deepStrictEqual([c.state, c.message], ['unknown', 'En pause dans PRTG']);
    assert.deepStrictEqual(a.ports.map(p => [p.name, p.status, p.totalMbps]), [['GigabitEthernet1/0/1', 'up', 1.234], ['GigabitEthernet1/0/2', 'down', 0], ['TenGigabitEthernet1/1/1', 'up', 2500]]);
    await assert.rejects(prtg({ type: 'prtg', url: 'http://127.0.0.1:18901', apiToken: 'mauvaise' }).relever(), /Accès refusé/);
  } finally { srv.close(); }
});

/* --- Simulateur SNMP : agent local qui expose sysName, ifTable et ifXTable --- */
test('SNMP : relevé contre un agent simulé, puis calcul des débits', async () => {
  const snmp = require('net-snmp'), T = snmp.ObjectType, RO = snmp.MaxAccess['read-only'];
  const agent = snmp.createAgent({ port: 18961, disableAuthorization: true, address: '127.0.0.1' }, () => {});
  try {
    const mib = agent.getMib();
    mib.registerProvider({ name: 'sysName', type: snmp.MibProviderType.Scalar, oid: '1.3.6.1.2.1.1.5', scalarType: T.OctetString, maxAccess: RO });
    mib.setScalarValue('sysName', 'SW-SNMP-01');
    mib.registerProvider({ name: 'ifEntry', type: snmp.MibProviderType.Table, oid: '1.3.6.1.2.1.2.2.1', maxAccess: snmp.MaxAccess['not-accessible'], tableIndex: [{ columnName: 'ifIndex' }],
      tableColumns: [{ number: 1, name: 'ifIndex', type: T.Integer, maxAccess: RO }, { number: 7, name: 'ifAdminStatus', type: T.Integer, maxAccess: RO }, { number: 8, name: 'ifOperStatus', type: T.Integer, maxAccess: RO }] });
    mib.registerProvider({ name: 'ifXEntry', type: snmp.MibProviderType.Table, oid: '1.3.6.1.2.1.31.1.1.1', maxAccess: snmp.MaxAccess['not-accessible'], tableIndex: [{ columnName: 'ifXIndex' }],
      tableColumns: [{ number: 99, name: 'ifXIndex', type: T.Integer, maxAccess: RO }, { number: 1, name: 'ifName', type: T.OctetString, maxAccess: RO }, { number: 6, name: 'ifHCInOctets', type: T.Counter64, maxAccess: RO }, { number: 10, name: 'ifHCOutOctets', type: T.Counter64, maxAccess: RO }, { number: 15, name: 'ifHighSpeed', type: T.Gauge, maxAccess: RO }] });
    const c64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };   // compteur 64 bits
    const rows = [[1, 'Gi1/0/1', 1, 1, 1000], [2, 'Gi1/0/2', 1, 2, 1000], [3, 'Gi1/0/3', 2, 2, 1000]];
    for (const [i, name, admin, oper, speed] of rows) { mib.addTableRow('ifEntry', [i, admin, oper]); mib.addTableRow('ifXEntry', [i, name, c64(1000000), c64(500000), speed]); }
    const src = require('../sources/snmp')({ type: 'snmp', version: '2c', community: 'public', port: 18961, timeoutMs: 1500, devices: [{ ip: '127.0.0.1' }] });
    const [d] = await src.relever();
    assert.strictEqual(d.state, 'up', d.message); assert.strictEqual(d.hostname, 'SW-SNMP-01');
    assert.deepStrictEqual(d.ports.map(p => [p.name, p.status, p.speedMbps, p.inMbps]), [['Gi1/0/1', 'up', 1000, null], ['Gi1/0/2', 'down', 1000, null], ['Gi1/0/3', 'disabled', 1000, null]]);
    // Deuxième relevé : le compteur du port 1 a avancé de 1,25 Mo → débit non nul
    mib.setTableSingleCell('ifXEntry', 6, [1], c64(1000000 + 1250000));
    await new Promise(r => setTimeout(r, 1000));
    const [d2] = await src.relever();
    const p1 = d2.ports[0];
    assert.ok(p1.inMbps > 5 && p1.inMbps < 12, `débit entrant attendu vers 10 Mb/s, obtenu ${p1.inMbps}`); assert.strictEqual(p1.outMbps, 0);
    // Équipement muet : état « down », sans faire échouer le relevé
    const muet = require('../sources/snmp')({ type: 'snmp', version: '2c', community: 'public', port: 18999, timeoutMs: 300, devices: [{ ip: '127.0.0.1', hostname: 'ABSENT' }] });
    const [m] = await muet.relever();
    assert.deepStrictEqual([m.state, m.hostname, m.ports.length], ['down', 'ABSENT', 0]);
  } finally { agent.close(); }
});

test('Fusion : même équipement vu par deux sources', () => {
  const r = fusionner([[{ ip: '10.0.0.1', hostname: 'SW', state: 'up', ports: [{ name: 'Gi1/0/1', status: 'up', totalMbps: 3 }] }], [{ ip: '10.0.0.1', state: 'warning', message: 'CPU', ports: [{ name: 'gi1/0/1', speedMbps: 1000, inMbps: 2 }, { name: 'Gi1/0/2', status: 'down' }] }]]);
  assert.strictEqual(r.length, 1); assert.deepStrictEqual([r[0].state, r[0].message, r[0].ports.length], ['warning', 'CPU', 2]);
  assert.deepStrictEqual([r[0].ports[0].status, r[0].ports[0].totalMbps, r[0].ports[0].speedMbps, r[0].ports[0].inMbps], ['up', 3, 1000, 2]);
});
test('Relais : API en lecture seule, jeton et CORS', async () => {
  const r = demarrer({ port: 18787, webRoot: require('path').join(__dirname, '..', '..'), token: 'secret-test', corsOrigins: ['http://netcarto.test'], sources: [{ type: 'simulation', devices: [{ ip: '10.10.99.18', hostname: 'SW-A1-ACC-01', ports: ['Gi1/0/1', 'Gi1/0/2'] }] }] }, () => {});
  await r.pret;
  try {
    const base = 'http://127.0.0.1:18787';
    assert.strictEqual((await get(base + '/api/etat')).code, 401);
    const ok = await get(base + '/api/etat', { Authorization: 'Bearer secret-test', Origin: 'http://netcarto.test' });
    assert.strictEqual(ok.code, 200); assert.strictEqual(ok.headers['access-control-allow-origin'], 'http://netcarto.test');
    assert.deepStrictEqual([ok.json.version, ok.json.devices.length, ok.json.devices[0].ports.length], [1, 1, 2]);
    const autre = await get(base + '/api/etat', { Authorization: 'Bearer secret-test', Origin: 'http://ailleurs.test' });
    assert.strictEqual(autre.headers['access-control-allow-origin'], undefined);
    assert.strictEqual((await get(base + '/api/sante', { Authorization: 'Bearer secret-test' })).json.sources[0].ok, true);
    const post = await new Promise(ok2 => { const q = http.request(base + '/api/etat', { method: 'POST', headers: { Authorization: 'Bearer secret-test' } }, x => { x.resume(); ok2(x.statusCode); }); q.end(); });
    assert.strictEqual(post, 405);
    // Fichiers de NetCarto servis par le relais (webRoot), sans exposer le dossier du relais
    const txt = url => new Promise(ok3 => http.get(url, x => { let b = ''; x.on('data', c => { b += c; }); x.on('end', () => ok3([x.statusCode, b])); }));
    const [c1, page] = await txt(base + '/'); assert.strictEqual(c1, 200); assert.ok(page.includes('NetCarto'));
    assert.strictEqual((await txt(base + '/js/main.js'))[0], 200);
    for (const interdit of ['/connecteurs/config.exemple.json', '/connecteurs/serveur.js', '/.git/config', '/SUIVI.md', '/js/%2e%2e/connecteurs/serveur.js']) assert.notStrictEqual((await txt(base + interdit))[0], 200, interdit);
  } finally { await r.arreter(); }
});

(async () => {
  let echecs = 0;
  for (const [nom, fn] of tests) {
    try { await fn(); console.log('  ok   ' + nom); }
    catch (e) { echecs++; console.log('  ÉCHEC ' + nom + '\n        ' + String(e.message).split('\n')[0]); }
  }
  console.log(echecs ? `\n${echecs} test(s) en échec` : `\n${tests.length} tests réussis`);
  process.exit(echecs ? 1 : 0);
})();
