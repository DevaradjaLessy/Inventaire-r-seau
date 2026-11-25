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

test('Fusion : même équipement vu par deux sources, les valeurs se complètent', () => {
  const r = fusionner([[{ ip: '10.0.0.1', hostname: 'SW', state: 'up', ports: [{ name: 'Gi1/0/1', status: 'up', totalMbps: 3 }] }], [{ ip: '10.0.0.1', state: 'warning', message: 'CPU', ports: [{ name: 'gi1/0/1', speedMbps: 1000, inMbps: 2 }, { name: 'Gi1/0/2', status: 'down' }] }]], ['prtg', 'snmp']);
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].ports.length, 2);
  assert.deepStrictEqual([r[0].ports[0].status, r[0].ports[0].totalMbps, r[0].ports[0].speedMbps, r[0].ports[0].inMbps], ['up', 3, 1000, 2]);
  assert.deepStrictEqual(r[0].sources, ['prtg', 'snmp']);
});
test('Fusion : pas de doublon quand une source donne un nom DNS et l\'autre une adresse, ni quand les noms d\'interface diffèrent de forme', () => {
  // PRTG : le champ « host » porte un nom DNS, et le capteur le nom long de l'interface. SNMP : adresse IP et nom court.
  const r = fusionner([
    [{ ip: 'sw-a1.exemple.interne', hostname: 'SW-A1', state: 'up', ports: [{ name: 'GigabitEthernet1/0/1', status: 'up', totalMbps: 3 }, { name: 'TenGigabitEthernet1/1/1', status: 'up', totalMbps: 900 }] }],
    [{ ip: '10.0.0.1', hostname: 'sw-a1', state: 'up', ports: [{ name: 'Gi1/0/1', status: 'up', speedMbps: 1000, inMbps: 2 }, { name: 'Te1/1/1', status: 'up', speedMbps: 10000 }] }]], ['prtg', 'snmp']);
  assert.strictEqual(r.length, 1, 'un seul équipement');
  assert.deepStrictEqual([r[0].ip, r[0].hostname, r[0].ports.length], ['10.0.0.1', 'SW-A1', 2]);
  assert.deepStrictEqual(r[0].ports.map(p => [p.status, p.totalMbps, p.speedMbps]), [['up', 3, 1000], ['up', 900, 10000]]);
  // Interfaces Junos : le nom est déjà court, et la casse ne compte pas
  const j = fusionner([[{ ip: '10.0.0.2', ports: [{ name: 'ge-0/0/5', status: 'up' }] }], [{ ip: '10.0.0.2', ports: [{ name: 'GE-0/0/5', speedMbps: 1000 }] }]]);
  assert.deepStrictEqual([j[0].ports.length, j[0].ports[0].speedMbps], [1, 1000]);
});
test('Fusion : deux équipements d\'adresses différentes restent distincts, même s\'ils portent le même nom', () => {
  const r = fusionner([[{ ip: '10.0.0.1', hostname: 'switch', state: 'up' }], [{ ip: '10.0.0.2', hostname: 'switch', state: 'down' }]]);
  assert.deepStrictEqual(r.map(d => [d.ip, d.state]), [['10.0.0.1', 'up'], ['10.0.0.2', 'down']]);
  // Sans adresse ni nom : ignoré
  assert.strictEqual(fusionner([[{ state: 'up' }, { ip: '', hostname: ' ' }]]).length, 0);
});
test('Fusion : en cas de désaccord, la première source de la configuration fait foi et l\'écart est signalé', () => {
  const a = [{ ip: '10.0.0.1', hostname: 'SW', state: 'up', ports: [{ name: 'Gi1/0/1', status: 'down' }, { name: 'Gi1/0/2', status: 'up' }] }];
  const b = [{ ip: '10.0.0.1', state: 'down', message: 'Aucune réponse SNMP', ports: [{ name: 'Gi1/0/1', status: 'up' }, { name: 'Gi1/0/2', status: 'up' }] }];
  const [d] = fusionner([a, b], ['prtg', 'snmp']);
  assert.deepStrictEqual([d.state, d.ports[0].status, d.ports[1].status], ['up', 'down', 'up']);
  assert.deepStrictEqual(d.ecarts, ['état : prtg dit « up », snmp dit « down »', 'Gi1/0/1 : prtg dit « down », snmp dit « up »']);
  // L'ordre inversé inverse le résultat : la règle ne dépend que de la configuration
  const [e] = fusionner([b, a], ['snmp', 'prtg']);
  assert.deepStrictEqual([e.state, e.message, e.ports[0].status], ['down', 'Aucune réponse SNMP', 'up']);
  // Une source qui ne sait pas (« unknown », valeur absente) ne masque jamais une source qui sait
  const [f] = fusionner([[{ ip: '10.0.0.3', state: 'unknown', ports: [{ name: 'Gi1/0/1' }] }], [{ ip: '10.0.0.3', state: 'down', ports: [{ name: 'Gi1/0/1', status: 'error' }] }]], ['prtg', 'snmp']);
  assert.deepStrictEqual([f.state, f.ports[0].status, f.ecarts], ['down', 'error', []]);
});
test('Releveur : une source en panne ou qui ne répond plus n\'arrête pas les autres, et l\'état dit laquelle', async () => {
  const { creerReleveur } = require('../lib/releveur');
  const fabriques = {
    bonne: () => ({ nom: 'bonne', relever: async () => [{ ip: '10.0.0.1', hostname: 'SW', state: 'up' }] }),
    cassee: () => ({ nom: 'cassee', relever: async () => { throw new Error('clé refusée'); } }),
    muette: () => ({ nom: 'muette', relever: () => new Promise(() => {}) }),
  };
  const erreurs = [], r = creerReleveur([{ type: 'bonne' }, { type: 'cassee' }, { type: 'muette' }], m => erreurs.push(m), { fabriques, delaiMs: 200 });
  const t0 = Date.now(); await r.relever();
  assert.ok(Date.now() - t0 < 2000, 'le relevé se termine malgré la source muette');
  const e = r.etat();
  assert.deepStrictEqual(e.devices.map(d => d.hostname), ['SW']);
  assert.deepStrictEqual(e.sources.map(s => [s.nom, s.ok]), [['bonne', true], ['cassee', false], ['muette', false]]);
  assert.match(e.sources[1].erreur, /clé refusée/); assert.match(e.sources[2].erreur, /délai/);
  assert.strictEqual(erreurs.length, 2);
  // Un second relevé repart, même si la source muette n'a jamais répondu
  await r.relever(); assert.strictEqual(r.etat().sources[0].ok, true);
  // Deux sources de même type : chacune garde un nom distinct
  const deux = creerReleveur([{ type: 'bonne' }, { type: 'bonne' }], () => {}, { fabriques });
  assert.deepStrictEqual(deux.etat().sources.map(s => s.nom), ['bonne', 'bonne (2)']);
});
test('Releveur : une source interrogée en http:// avec un secret est signalée, sans que le secret apparaisse', async () => {
  const { creerReleveur } = require('../lib/releveur');
  const fabriques = { x: c => ({ nom: c.nom, relever: async () => [] }) }, lignes = [];
  const r = creerReleveur([
    { type: 'x', nom: 'prtg', url: 'http://prtg.exemple.interne', apiToken: 'jeton-fictif-1234' },
    { type: 'x', nom: 'chiffree', url: 'https://prtg.exemple.interne', apiToken: 'jeton-fictif-1234' },
    { type: 'x', nom: 'locale', url: 'http://127.0.0.1:8080/etat', jeton: 'jeton-fictif-1234' },
    { type: 'x', nom: 'ouverte', url: 'http://supervision.exemple.interne/etat.json' },
    { type: 'x', nom: 'compte', url: 'HTTP://prtg2.exemple.interne', username: 'lecture', passhash: '0000' },
  ], m => lignes.push(m), { fabriques });
  await r.relever();
  const avis = Object.fromEntries(r.etat().sources.map(s => [s.nom, s.avertissement]));
  assert.match(avis.prtg, /non chiffrée/); assert.match(avis.compte, /non chiffrée/);
  assert.deepStrictEqual([avis.chiffree, avis.locale, avis.ouverte], ['', '', ''], 'https, adresse locale ou absence de secret : rien à signaler');
  assert.strictEqual(lignes.filter(l => /non chiffrée/.test(l)).length, 2, 'une ligne au journal par source concernée, une seule fois');
  assert.ok(!lignes.join('\n').includes('jeton-fictif') && !JSON.stringify(r.etat()).includes('jeton-fictif'), 'le secret ne sort ni au journal ni dans l\'état');
});
test('SNMP : le switch dit qui est branché sur chaque port (LLDP) — nom annoncé, port distant, description, famille', async () => {
  const snmp = require('net-snmp'), T = snmp.ObjectType, RO = snmp.MaxAccess['read-only'], NA = snmp.MaxAccess['not-accessible'];
  const agent = snmp.createAgent({ port: 18964, disableAuthorization: true, address: '127.0.0.1' }, () => {});
  try {
    const mib = agent.getMib();
    mib.registerProvider({ name: 'sysName', type: snmp.MibProviderType.Scalar, oid: '1.3.6.1.2.1.1.5', scalarType: T.OctetString, maxAccess: RO });
    mib.setScalarValue('sysName', 'EX4000-TEST');
    mib.registerProvider({ name: 'ifEntry', type: snmp.MibProviderType.Table, oid: '1.3.6.1.2.1.2.2.1', maxAccess: NA, tableIndex: [{ columnName: 'ifIndex' }],
      tableColumns: [{ number: 1, name: 'ifIndex', type: T.Integer, maxAccess: RO }, { number: 3, name: 'ifType', type: T.Integer, maxAccess: RO }, { number: 7, name: 'ifAdminStatus', type: T.Integer, maxAccess: RO }, { number: 8, name: 'ifOperStatus', type: T.Integer, maxAccess: RO }] });
    mib.registerProvider({ name: 'ifXEntry', type: snmp.MibProviderType.Table, oid: '1.3.6.1.2.1.31.1.1.1', maxAccess: NA, tableIndex: [{ columnName: 'ifXIndex' }],
      tableColumns: [{ number: 99, name: 'ifXIndex', type: T.Integer, maxAccess: RO }, { number: 1, name: 'ifName', type: T.OctetString, maxAccess: RO }, { number: 6, name: 'ifHCInOctets', type: T.Counter64, maxAccess: RO }, { number: 10, name: 'ifHCOutOctets', type: T.Counter64, maxAccess: RO }, { number: 15, name: 'ifHighSpeed', type: T.Gauge, maxAccess: RO }] });
    // Table des ports locaux de LLDP : son numéro de port n'est pas l'index d'interface ; le nom du port est dans la description ou dans l'identifiant
    mib.registerProvider({ name: 'lldpLocPortEntry', type: snmp.MibProviderType.Table, oid: '1.0.8802.1.1.2.1.3.7.1', maxAccess: NA, tableIndex: [{ columnName: 'lldpLocPortNum' }],
      tableColumns: [{ number: 1, name: 'lldpLocPortNum', type: T.Integer, maxAccess: RO }, { number: 3, name: 'lldpLocPortId', type: T.OctetString, maxAccess: RO }, { number: 4, name: 'lldpLocPortDesc', type: T.OctetString, maxAccess: RO }] });
    // Table des voisins : indexée par (horodatage, port local, rang)
    mib.registerProvider({ name: 'lldpRemEntry', type: snmp.MibProviderType.Table, oid: '1.0.8802.1.1.2.1.4.1.1', maxAccess: NA, tableIndex: [{ columnName: 'lldpRemTimeMark' }, { columnName: 'lldpRemLocalPortNum' }, { columnName: 'lldpRemIndex' }],
      tableColumns: [{ number: 1, name: 'lldpRemTimeMark', type: T.Integer, maxAccess: RO }, { number: 2, name: 'lldpRemLocalPortNum', type: T.Integer, maxAccess: RO }, { number: 3, name: 'lldpRemIndex', type: T.Integer, maxAccess: RO },
        { number: 7, name: 'lldpRemPortId', type: T.OctetString, maxAccess: RO }, { number: 9, name: 'lldpRemSysName', type: T.OctetString, maxAccess: RO }, { number: 10, name: 'lldpRemSysDesc', type: T.OctetString, maxAccess: RO }, { number: 12, name: 'lldpRemSysCapEnabled', type: T.OctetString, maxAccess: RO }] });
    const c64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
    for (const [i, name] of [[501, 'ge-0/0/0'], [503, 'ge-0/0/1'], [504, 'xe-0/1/2'], [505, 'ge-0/0/2'], [506, 'ge-0/0/3']]) { mib.addTableRow('ifEntry', [i, 6, 1, 1]); mib.addTableRow('ifXEntry', [i, name, c64(0), c64(0), 1000]); }
    mib.addTableRow('lldpLocPortEntry', [21, '521', 'ge-0/0/0']);        // nom dans la description
    mib.addTableRow('lldpLocPortEntry', [22, 'ge-0/0/1', '']);           // nom dans l'identifiant
    mib.addTableRow('lldpLocPortEntry', [23, '504', 'Montée vers la distribution']);   // l'identifiant est l'index d'interface
    // Capacités actives : un octet, bit de poids fort en premier (autre, répéteur, pont, borne Wi-Fi, routeur, téléphone, câble, poste)
    mib.addTableRow('lldpRemEntry', [0, 21, 1, Buffer.from('port 1'), 'TEL-ACCUEIL-01', 'Téléphone IP de démonstration', Buffer.from([0x24])]);   // téléphone avec pont intégré
    mib.addTableRow('lldpRemEntry', [0, 22, 1, Buffer.from('eth0'), 'AP-HALL-02', 'Borne Wi-Fi de démonstration', Buffer.from([0x30])]);
    mib.addTableRow('lldpRemEntry', [0, 23, 1, Buffer.from('xe-0/1/0'), 'SW-DIST-01', 'Switch de distribution', Buffer.from([0x28])]);            // pont et routeur : un switch
    mib.addTableRow('lldpRemEntry', [0, 505, 1, Buffer.from([0x02, 0x00, 0x00, 0x00, 0x0a, 0xff]), 'IMP-RH-01', '', Buffer.from([0x01])]);            // aucun port local décrit : le numéro est l'index d'interface
    const src = require('../sources/snmp')({ type: 'snmp', version: '2c', community: 'public', port: 18964, timeoutMs: 1500, devices: [{ ip: '127.0.0.1' }] });
    const [d] = await src.relever();
    assert.strictEqual(d.state, 'up', d.message);
    const v = Object.fromEntries(d.ports.map(p => [p.name, p.voisin]));
    assert.deepStrictEqual(v['ge-0/0/0'], { nom: 'TEL-ACCUEIL-01', port: 'port 1', description: 'Téléphone IP de démonstration', famille: 'phone' });
    assert.deepStrictEqual(v['ge-0/0/1'], { nom: 'AP-HALL-02', port: 'eth0', description: 'Borne Wi-Fi de démonstration', famille: 'ap' });
    assert.deepStrictEqual(v['xe-0/1/2'], { nom: 'SW-DIST-01', port: 'xe-0/1/0', description: 'Switch de distribution', famille: 'switch' });
    assert.deepStrictEqual(v['ge-0/0/2'], { nom: 'IMP-RH-01', port: '02:00:00:00:0a:ff', description: '', famille: 'poste' }, 'un identifiant de port binaire est rendu comme une adresse');
    assert.strictEqual(v['ge-0/0/3'], null, 'un port sans voisin annoncé');
    // Lecture coupée par le réglage : aucun voisin, le reste du relevé inchangé
    const sans = require('../sources/snmp')({ type: 'snmp', version: '2c', community: 'public', port: 18964, timeoutMs: 1500, lldp: false, devices: [{ ip: '127.0.0.1' }] });
    assert.ok((await sans.relever())[0].ports.every(p => p.voisin === null));
  } finally { agent.close(); }
});
test('Contrat : le voisin annoncé d\'un port a une forme fermée ; à la fusion, la première source qui le connaît fait foi', () => {
  const [d] = fusionner([
    [{ ip: '10.0.0.1', ports: [{ name: 'Gi1/0/1', status: 'up' }, { name: 'Gi1/0/2', voisin: { nom: 'TEL-01', port: 'p1', description: 'x'.repeat(400), famille: 'phone', autre: 1 } }, { name: 'Gi1/0/3', voisin: 'un texte' }, { name: 'Gi1/0/4', voisin: { nom: 12, famille: '<img>' } }] }],
    [{ ip: '10.0.0.1', ports: [{ name: 'GigabitEthernet1/0/1', voisin: { nom: 'AP-01', famille: 'ap' } }, { name: 'Gi1/0/2', voisin: { nom: 'AUTRE', famille: 'ap' } }] }],
  ], ['prtg', 'snmp']);
  const v = Object.fromEntries(d.ports.map(p => [p.name, p.voisin]));
  assert.deepStrictEqual(v['Gi1/0/1'], { nom: 'AP-01', port: '', description: '', famille: 'ap' }, 'la seconde source complète ce que la première ignore');
  assert.deepStrictEqual([v['Gi1/0/2'].nom, v['Gi1/0/2'].famille, v['Gi1/0/2'].description.length, Object.keys(v['Gi1/0/2']).sort().join()], ['TEL-01', 'phone', 160, 'description,famille,nom,port']);
  assert.strictEqual(v['Gi1/0/3'], null); assert.strictEqual(v['Gi1/0/4'], null, 'ni nom ni description : pas de voisin');
});
test('SNMP : sur un switch Juniper, seuls les ports physiques sont remontés ; les erreurs de trame donnent l\'état « error »', async () => {
  const snmp = require('net-snmp'), T = snmp.ObjectType, RO = snmp.MaxAccess['read-only'];
  const agent = snmp.createAgent({ port: 18962, disableAuthorization: true, address: '127.0.0.1' }, () => {});
  try {
    const mib = agent.getMib();
    mib.registerProvider({ name: 'sysName', type: snmp.MibProviderType.Scalar, oid: '1.3.6.1.2.1.1.5', scalarType: T.OctetString, maxAccess: RO });
    mib.setScalarValue('sysName', 'EX3400-TEST');
    mib.registerProvider({ name: 'ifEntry', type: snmp.MibProviderType.Table, oid: '1.3.6.1.2.1.2.2.1', maxAccess: snmp.MaxAccess['not-accessible'], tableIndex: [{ columnName: 'ifIndex' }],
      tableColumns: [{ number: 1, name: 'ifIndex', type: T.Integer, maxAccess: RO }, { number: 3, name: 'ifType', type: T.Integer, maxAccess: RO }, { number: 7, name: 'ifAdminStatus', type: T.Integer, maxAccess: RO }, { number: 8, name: 'ifOperStatus', type: T.Integer, maxAccess: RO },
        { number: 14, name: 'ifInErrors', type: T.Counter, maxAccess: RO }, { number: 20, name: 'ifOutErrors', type: T.Counter, maxAccess: RO }] });
    mib.registerProvider({ name: 'ifXEntry', type: snmp.MibProviderType.Table, oid: '1.3.6.1.2.1.31.1.1.1', maxAccess: snmp.MaxAccess['not-accessible'], tableIndex: [{ columnName: 'ifXIndex' }],
      tableColumns: [{ number: 99, name: 'ifXIndex', type: T.Integer, maxAccess: RO }, { number: 1, name: 'ifName', type: T.OctetString, maxAccess: RO }, { number: 6, name: 'ifHCInOctets', type: T.Counter64, maxAccess: RO }, { number: 10, name: 'ifHCOutOctets', type: T.Counter64, maxAccess: RO }, { number: 15, name: 'ifHighSpeed', type: T.Gauge, maxAccess: RO }] });
    const c64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
    // Ce que Junos expose : ports physiques (type 6), unités logiques, bouclage, agrégat, interfaces internes
    const rows = [[501, 'ge-0/0/0', 6, 1, 1, 1000], [502, 'ge-0/0/0.0', 53, 1, 1, 1000], [503, 'ge-0/0/1', 6, 1, 2, 1000], [504, 'xe-0/2/0', 6, 1, 1, 10000], [6, 'lo0', 24, 1, 1, 0], [7, 'ae0', 161, 1, 1, 20000], [8, 'pfe-0/0/0', 1, 1, 1, 800], [9, 'irb', 53, 1, 1, 0], [505, 'ge-0/0/2', 6, 2, 2, 1000]];
    for (const [i, name, type, admin, oper, speed] of rows) { mib.addTableRow('ifEntry', [i, type, admin, oper, 4, 0]); mib.addTableRow('ifXEntry', [i, name, c64(0), c64(0), speed]); }
    const src = require('../sources/snmp')({ type: 'snmp', version: '2c', community: 'public', port: 18962, timeoutMs: 1500, devices: [{ ip: '127.0.0.1' }] });
    const [d] = await src.relever();
    assert.strictEqual(d.state, 'up', d.message);
    assert.deepStrictEqual(d.ports.map(p => [p.name, p.status, p.speedMbps]), [['ge-0/0/0', 'up', 1000], ['ge-0/0/1', 'down', 1000], ['ge-0/0/2', 'disabled', 1000], ['xe-0/2/0', 'up', 10000]]);
    assert.ok(d.ports.every(p => p.errors === null), 'premier relevé : pas encore de variation mesurée');
    // Quelques erreurs isolées ne changent rien ; une série d'erreurs depuis le relevé précédent signale le port
    mib.setTableSingleCell('ifEntry', 14, [501], 4 + 3); mib.setTableSingleCell('ifEntry', 14, [504], 4 + 250);
    const [d2] = await src.relever();
    assert.deepStrictEqual(d2.ports.map(p => [p.name, p.status, p.errors]), [['ge-0/0/0', 'up', 3], ['ge-0/0/1', 'down', 0], ['ge-0/0/2', 'disabled', 0], ['xe-0/2/0', 'error', 250]]);
    // Les erreurs cessent : le port revient à son état normal
    const [d3] = await src.relever();
    assert.deepStrictEqual([d3.ports[3].status, d3.ports[3].errors], ['up', 0]);
  } finally { agent.close(); }
});
test('SNMP : adresses MAC apprises par port, à partir de la table de commutation', () => {
  const { macsParPort } = require('../sources/snmp');
  // Table Q-BRIDGE : indice « vlan.o1.o2.o3.o4.o5.o6 » → port du pont ; table de correspondance port du pont → interface
  const fdb = new Map([['10.0.17.34.51.68.85', 3], ['10.0.17.34.51.68.86', 3], ['20.170.187.204.221.238.255', 7], ['10.2.0.0.0.0.1', 99], ['10.2.0.0.0.0.2', 0]]);
  const r = macsParPort(fdb, new Map([['3', 501], ['7', 504]]));
  assert.deepStrictEqual(r.get('501'), ['00:11:22:33:44:55', '00:11:22:33:44:56']); assert.deepStrictEqual(r.get('504'), ['aa:bb:cc:dd:ee:ff']);
  assert.strictEqual(r.size, 2, 'port de pont inconnu ou nul : ignoré');
  // La même adresse apprise dans plusieurs VLAN (constaté sur RouterOS) n'est comptée qu'une fois
  const multi = macsParPort(new Map([['0.82.84.0.18.52.88', 2], ['1.82.84.0.18.52.88', 2], ['20.82.84.0.18.52.88', 2], ['20.82.84.0.18.52.89', 2]]), new Map([['2', 3]]));
  assert.deepStrictEqual([multi.get('3'), multi.total.get('3')], [['52:54:00:12:34:58', '52:54:00:12:34:59'], 2]);
  // Table BRIDGE (sans VLAN dans l'indice) : six octets seulement
  assert.deepStrictEqual(macsParPort(new Map([['0.17.34.51.68.85', 3]]), new Map([['3', 501]])).get('501'), ['00:11:22:33:44:55']);
  // Un port qui voit beaucoup d'adresses est un lien vers un autre switch : on garde le nombre, pas la liste
  const tronc = new Map(Array.from({ length: 40 }, (_, i) => [`10.0.0.0.0.1.${i}`, 9]));
  const t = macsParPort(tronc, new Map([['9', 600]]));
  assert.strictEqual(t.get('600').length, 8); assert.strictEqual(t.total.get('600'), 40);
});
test('Source JSON : n\'importe quel outil de supervision peut publier son état au format du contrat', async () => {
  const json = require('../sources/json');
  let vu = null;
  const srv = http.createServer((req, res) => {
    vu = req.headers.authorization;
    if (req.url === '/etat') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ version: 1, devices: [{ ip: '10.0.0.9', hostname: 'SW-ZBX', state: 'warning', message: 'Température', ports: [{ name: 'ge-0/0/1', status: 'up' }] }] })); }
    if (req.url === '/liste') { res.writeHead(200); return res.end(JSON.stringify([{ ip: '10.0.0.9', state: 'up' }])); }
    res.writeHead(200); res.end(JSON.stringify({ autre: 'chose' }));
  });
  await new Promise(ok => srv.listen(18903, '127.0.0.1', ok));
  try {
    process.env.NETCARTO_TEST_JETON = 'jeton-de-test';
    const s = json({ type: 'json', nom: 'zabbix', url: 'http://127.0.0.1:18903/etat', jeton: 'env:NETCARTO_TEST_JETON' });
    const d = await s.relever();
    assert.strictEqual(s.nom, 'zabbix'); assert.strictEqual(vu, 'Bearer jeton-de-test');
    assert.deepStrictEqual([d.length, d[0].hostname, d[0].state, d[0].ports[0].name], [1, 'SW-ZBX', 'warning', 'ge-0/0/1']);
    assert.strictEqual((await json({ type: 'json', url: 'http://127.0.0.1:18903/liste' }).relever()).length, 1, 'une simple liste d\'équipements est acceptée');
    await assert.rejects(json({ type: 'json', url: 'http://127.0.0.1:18903/autre' }).relever(), /format/);
    assert.throws(() => json({ type: 'json', url: 'ftp://exemple.invalid' }), /http/);
  } finally { srv.close(); delete process.env.NETCARTO_TEST_JETON; }
});
/* --- Simulateur Zabbix : répond à l'API JSON-RPC avec de vraies réponses enregistrées sur un Zabbix 7.0 --- */
function fauxZabbix(port, modifs = {}) {
  const lire = f => JSON.parse(JSON.stringify(require(`./zabbix/${f}.json`).result)), appels = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      const q = JSON.parse(b), rep = r => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: q.id, ...r })); };
      appels.push({ methode: q.method, params: q.params, type: req.headers['content-type'] });
      if (req.headers.authorization !== 'Bearer jeton-de-test') return rep({ error: { code: -32602, message: 'Invalid params.', data: 'Not authorized.' } });
      if (q.method === 'hostgroup.get') return rep({ result: (q.params.filter?.name || []).includes('Essai NetCarto') ? [{ groupid: '22', name: 'Essai NetCarto' }] : [] });
      if (q.method === 'host.get') { const h = lire('host.get'); (modifs.hote || (() => {}))(h[0]); return rep({ result: h }); }
      if (q.method === 'item.get') return rep({ result: lire('item.get') });
      if (q.method === 'problem.get') return rep({ result: modifs.sansProbleme ? [] : lire('problem.get').filter(p => p.r_eventid === '0') });
      rep({ error: { code: -32601, message: 'Method not found.', data: q.method } });
    });
  });
  return new Promise(ok => srv.listen(port, '127.0.0.1', () => ok({ srv, appels })));
}
test('Zabbix : état des hôtes, problèmes en cours et ports, à partir de vraies réponses de l\'API', async () => {
  const zabbix = require('../sources/zabbix');
  const { srv, appels } = await fauxZabbix(18904);
  try {
    const src = zabbix({ type: 'zabbix', url: 'http://127.0.0.1:18904', apiToken: 'jeton-de-test' });
    const devs = await src.relever();
    assert.strictEqual(src.nom, 'zabbix'); assert.strictEqual(devs.length, 1);
    const [d] = devs;
    // Un problème en cours (gravité moyenne) : l'hôte répond, mais il est signalé « dégradé », avec le libellé du problème
    assert.deepStrictEqual([d.ip, d.hostname, d.state, d.message], ['127.0.0.1', 'SW-REEL-01', 'warning', 'Essai NetCarto : interface ifb0 opérationnellement coupée']);
    assert.deepStrictEqual(d.ports.map(p => [p.name, p.status]), [['eth0', 'up'], ['ifb0', 'down'], ['ifb1', 'down']]);
    const eth = d.ports[0];
    assert.ok(eth.inMbps > 0 && eth.outMbps >= 0, `débits de eth0 : ${eth.inMbps} / ${eth.outMbps} Mb/s`);
    assert.strictEqual(eth.speedMbps, null, 'un débit nominal de 0 n\'est pas une information');
    // Les appels : tous en JSON-RPC, et la recherche des éléments vise les interfaces
    assert.deepStrictEqual(appels.map(a => a.methode), ['host.get', 'item.get', 'problem.get']);
    assert.ok(appels.every(a => /json/.test(a.type)));
    // Limiter à des groupes d'hôtes : leurs identifiants sont cherchés d'abord
    appels.length = 0;
    await zabbix({ type: 'zabbix', url: 'http://127.0.0.1:18904/', apiToken: 'jeton-de-test', groupes: ['Essai NetCarto'] }).relever();
    assert.deepStrictEqual([appels[0].methode, appels[1].methode, appels[1].params.groupids], ['hostgroup.get', 'host.get', ['22']]);
    await assert.rejects(zabbix({ type: 'zabbix', url: 'http://127.0.0.1:18904', apiToken: 'jeton-de-test', groupes: ['Inconnu'] }).relever(), /groupe.*Inconnu/i);
    // Jeton refusé : message clair, sans le jeton
    await assert.rejects(zabbix({ type: 'zabbix', url: 'http://127.0.0.1:18904', apiToken: 'mauvais-jeton' }).relever(), e => /Zabbix.*Not authorized/.test(e.message) && !/mauvais-jeton/.test(e.message));
    assert.throws(() => zabbix({ type: 'zabbix', url: 'zabbix.exemple.interne', apiToken: 'x' }), /http/);
  } finally { srv.close(); }
});
test('Zabbix : hôte injoignable, hôte sans problème, hôte en maintenance', async () => {
  const zabbix = require('../sources/zabbix');
  const cas = async (port, modifs) => { const { srv } = await fauxZabbix(port, modifs); try { return (await zabbix({ type: 'zabbix', url: `http://127.0.0.1:${port}`, apiToken: 'jeton-de-test' }).relever())[0]; } finally { srv.close(); } };
  // L'interface SNMP de l'hôte ne répond plus à Zabbix : injoignable, avec l'erreur que donne Zabbix
  const hs = await cas(18905, { hote: h => Object.assign(h.interfaces[0], { available: '2', error: 'Timeout while connecting to "127.0.0.1:1161".' }) });
  assert.deepStrictEqual([hs.state, hs.message], ['down', 'Timeout while connecting to "127.0.0.1:1161".']);
  const ok = await cas(18906, { sansProbleme: true });
  assert.deepStrictEqual([ok.state, ok.message], ['up', '']);
  const maint = await cas(18907, { sansProbleme: true, hote: h => { h.maintenance_status = '1'; } });
  assert.deepStrictEqual([maint.state, maint.message], ['up', 'En maintenance dans Zabbix']);
  // Aucune interface n'a encore été interrogée : on ne sait pas
  const inconnu = await cas(18908, { sansProbleme: true, hote: h => { h.interfaces[0].available = '0'; } });
  assert.strictEqual(inconnu.state, 'unknown');
});
test('Fusion : une réponse mal formée d\'une source est ignorée, elle ne fait pas tomber toute la supervision', () => {
  const bon = { ip: '10.0.0.1', hostname: 'SW', state: 'up', ports: [{ name: 'Gi1/0/1', status: 'up' }] };
  const r = fusionner([[null, 'texte', 42, { ip: '10.0.0.2', ports: 'abc' }, { ip: '10.0.0.3', ports: [null, 'x', { name: 'Gi1/0/1', status: 'up', errors: '<img>', macs: 'pas une liste' }] }, bon], 'pas une liste', null], ['a', 'b', 'c']);
  assert.deepStrictEqual(r.map(d => [d.ip, d.ports.length]), [['10.0.0.2', 0], ['10.0.0.3', 1], ['10.0.0.1', 1]]);
  assert.deepStrictEqual([r[1].ports[0].errors, r[1].ports[0].macs], [null, []], 'une valeur du mauvais type devient une valeur absente');
});
test('Source HTTP : une réponse démesurée est coupée, au lieu de remplir la mémoire', async () => {
  const { getJson } = require('../lib/http');
  const srv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); const bloc = 'x'.repeat(1024 * 1024); let n = 0; const envoi = () => { if (n++ > 64 || res.destroyed) return res.end(); res.write(bloc, envoi); }; envoi(); });
  await new Promise(ok => srv.listen(18909, '127.0.0.1', ok));
  try { await assert.rejects(getJson('http://127.0.0.1:18909/', { timeoutMs: 5000 }), /trop volumineuse/); } finally { srv.close(); }
});
test('Fusion : « inactif » et « désactivé » ne se contredisent pas, la valeur la plus précise est gardée', () => {
  // Zabbix ne connaît que l'état opérationnel (port inactif) ; le SNMP sait que le port est désactivé par l'administrateur
  const z = [{ ip: '10.0.0.1', state: 'up', ports: [{ name: 'ge-0/0/1', status: 'down' }, { name: 'ge-0/0/2', status: 'down' }] }];
  const s = [{ ip: '10.0.0.1', state: 'up', ports: [{ name: 'ge-0/0/1', status: 'disabled' }, { name: 'ge-0/0/2', status: 'up' }] }];
  const [d] = fusionner([z, s], ['zabbix', 'snmp']);
  assert.deepStrictEqual(d.ports.map(p => p.status), ['disabled', 'down']);
  assert.deepStrictEqual(d.ecarts, ['ge-0/0/2 : zabbix dit « down », snmp dit « up »']);
  const [e] = fusionner([s, z], ['snmp', 'zabbix']);
  assert.deepStrictEqual([e.ports[0].status, e.ecarts.length], ['disabled', 1]);
  // De même pour l'équipement : « joignable » (il répond au SNMP) et « dégradé » (Zabbix lui connaît un problème) vont ensemble.
  // Le problème est gardé avec son message, dans un ordre comme dans l'autre. Seul « injoignable » contredit les deux.
  const up = [{ ip: '10.0.0.5', state: 'up' }], pb = [{ ip: '10.0.0.5', state: 'warning', message: 'Ventilateur en défaut' }], hs = [{ ip: '10.0.0.5', state: 'down', message: 'Aucune réponse' }];
  for (const ordre of [[up, pb], [pb, up]]) { const [x] = fusionner(ordre, ['a', 'b']); assert.deepStrictEqual([x.state, x.message, x.ecarts], ['warning', 'Ventilateur en défaut', []]); }
  const [y] = fusionner([pb, hs], ['zabbix', 'snmp']);
  assert.deepStrictEqual([y.state, y.ecarts], ['warning', ['état : zabbix dit « warning », snmp dit « down »']]);
});
test('Noms d\'interface : le relais et l\'interface de NetCarto les ramènent à la même forme', () => {
  const { nomInterface } = require('../lib/contrat');
  for (const [nom, attendu] of require('./noms-interfaces.json').cas) assert.strictEqual(nomInterface(nom), attendu, nom);
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
