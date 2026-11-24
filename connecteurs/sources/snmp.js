/* Source SNMP : interroge directement les switchs (MIB standard IF-MIB, donc indépendante de la marque).
   Configuration :
   { type: "snmp", version: "2c", community: "env:SNMP_COMMUNITY", port: 161, timeoutMs: 4000,
     devices: [{ ip: "10.10.99.18", hostname: "SW-A1-ACC-01" }] }
   SNMP v3 : { version: "3", user, authProtocol: "sha", authKey: "env:…", privProtocol: "aes", privKey: "env:…" }
   Droits nécessaires : une communauté ou un utilisateur en LECTURE SEULE.

   Ce que la source remonte, par port physique : nom, état (administratif et opérationnel), débit négocié,
   trafic entrant et sortant (calculé entre deux relevés à partir des compteurs 64 bits), erreurs de trame depuis
   le relevé précédent (l'état devient « error » au-delà du seuil), et adresses MAC apprises (table de commutation).
   Seules les interfaces Ethernet sont gardées (ifType) : les unités logiques, bouclages, agrégats et interfaces
   internes qu'exposent Junos et d'autres systèmes ne polluent pas le relevé.
   Options : seuilErreurs (10 par défaut, erreurs entre deux relevés), macs (true par défaut ; false pour ne pas lire la table).
   Ce que la source ne remonte pas : la puissance PoE par port et le VLAN, qui ne sont pas dans une MIB commune à toutes les marques.

   À VÉRIFIER SUR VOS ÉQUIPEMENTS : validé contre un agent SNMP simulé, pas sur du matériel réel. */
'use strict';
const { secret } = require('../lib/contrat');

const OID = {
  sysName: '1.3.6.1.2.1.1.5.0',
  ifType: '1.3.6.1.2.1.2.2.1.3', ifAdminStatus: '1.3.6.1.2.1.2.2.1.7', ifOperStatus: '1.3.6.1.2.1.2.2.1.8',
  ifInErrors: '1.3.6.1.2.1.2.2.1.14', ifOutErrors: '1.3.6.1.2.1.2.2.1.20',
  // Table de commutation : Q-BRIDGE (avec VLAN) d'abord, BRIDGE (sans VLAN) à défaut ; puis port du pont → interface
  dot1qTpFdbPort: '1.3.6.1.2.1.17.7.1.2.2.1.2', dot1dTpFdbPort: '1.3.6.1.2.1.17.4.3.1.2', dot1dBasePortIfIndex: '1.3.6.1.2.1.17.1.4.1.2',
  ifName: '1.3.6.1.2.1.31.1.1.1.1', ifHighSpeed: '1.3.6.1.2.1.31.1.1.1.15',
  ifHCInOctets: '1.3.6.1.2.1.31.1.1.1.6', ifHCOutOctets: '1.3.6.1.2.1.31.1.1.1.10',
};
const big = v => (Buffer.isBuffer(v) ? BigInt('0x' + (v.toString('hex') || '0')) : BigInt(v || 0));
const ETHERNET = new Set([6, 62, 69, 117]);   // ifType : ethernetCsmacd, fastEther, fastEtherFX, gigabitEthernet
const MACS_MAX = 8;                           // au-delà, le port mène à un autre switch : on garde le nombre, pas la liste
/* Adresses MAC par interface. fdb : Map(indice → port du pont), l'indice se terminant par les six octets de l'adresse ;
   base : Map(port du pont → index d'interface). Renvoie Map(index d'interface → adresses), avec .total (nombre réel par interface). */
function macsParPort(fdb, base) {
  const out = new Map(), toutes = new Map(); out.total = new Map();
  for (const [indice, portPont] of fdb) {
    const ifIndex = base.get(String(portPont));
    if (ifIndex === undefined || ifIndex === null) continue;
    const octets = String(indice).split('.').slice(-6);
    if (octets.length !== 6) continue;
    // Une adresse apprise dans plusieurs VLAN revient plusieurs fois dans la table : elle n'est comptée qu'une fois par port
    const cle = String(ifIndex), mac = octets.map(o => (+o).toString(16).padStart(2, '0')).join(':'), vues = toutes.get(cle) || toutes.set(cle, new Set()).get(cle);
    if (vues.has(mac)) continue;
    vues.add(mac);
    const liste = out.get(cle) || out.set(cle, []).get(cle);
    out.total.set(cle, vues.size);
    if (liste.length < MACS_MAX) liste.push(mac);
  }
  return out;
}

module.exports = function creer(cfg) {
  let snmp;
  try { snmp = require('net-snmp'); } catch { throw new Error('SNMP : le module « net-snmp » est absent. Lancez « npm install » dans le dossier connecteurs.'); }
  const precedent = new Map();   // compteurs du relevé précédent, pour calculer les débits et les erreurs
  const seuilErreurs = cfg.seuilErreurs > 0 ? +cfg.seuilErreurs : 10;
  /* Colonne facultative : une table absente de l'équipement ne fait pas échouer le relevé */
  const facultative = (s, oid) => colonne(s, oid).catch(() => new Map());
  const session = d => {
    const opt = { port: d.port || cfg.port || 161, timeout: cfg.timeoutMs || 4000, retries: 1 };
    if (String(cfg.version) === '3') {
      const u = { name: secret(cfg.user), level: cfg.privKey ? snmp.SecurityLevel.authPriv : cfg.authKey ? snmp.SecurityLevel.authNoPriv : snmp.SecurityLevel.noAuthNoPriv };
      if (cfg.authKey) { u.authProtocol = snmp.AuthProtocols[cfg.authProtocol || 'sha']; u.authKey = secret(cfg.authKey); }
      if (cfg.privKey) { u.privProtocol = snmp.PrivProtocols[cfg.privProtocol || 'aes']; u.privKey = secret(cfg.privKey); }
      return snmp.createV3Session(d.ip, u, { ...opt, version: snmp.Version3 });
    }
    return snmp.createSession(d.ip, secret(cfg.community || 'public'), { ...opt, version: snmp.Version2c });
  };
  /* Parcourt une colonne de table : renvoie Map(index d'interface → valeur) */
  const colonne = (s, oid) => new Promise((resolve, reject) => {
    const out = new Map();
    s.subtree(oid, 40, vbs => { for (const vb of vbs) if (!snmp.isVarbindError(vb)) out.set(vb.oid.slice(oid.length + 1), vb.value); }, err => (err ? reject(err) : resolve(out)));
  });
  const lire = (s, oid) => new Promise((resolve, reject) => s.get([oid], (err, vbs) => (err ? reject(err) : resolve(snmp.isVarbindError(vbs[0]) ? null : vbs[0].value))));
  /* Pourquoi l'équipement ne répond pas, avec ce qu'il faut vérifier. En v2c, un agent ne répond rien à une mauvaise communauté :
     un refus ressemble donc à une panne, et le message le dit. */
  const v3 = String(cfg.version) === '3';
  function raison(e) {
    const m = String(e.message || e);
    if (/timed out|timeout/i.test(m)) return `Aucune réponse SNMP : équipement éteint ou filtré, ou ${v3 ? 'utilisateur refusé' : 'communauté refusée'}`;
    // Le libellé du refus change d'un agent à l'autre (net-snmp : « Wrong Digest » ; RouterOS : « Authentication digest … does not match »)
    if (/wrong digest|digest .*does not match|authentication fail/i.test(m)) return 'SNMP v3 : mot de passe d\'authentification refusé';
    if (/unknown user/i.test(m)) return 'SNMP v3 : utilisateur inconnu de l\'équipement';
    if (/decrypt|unsupported security|not in time window/i.test(m)) return `SNMP v3 : échange refusé (${m.slice(0, 80)}) — vérifiez le chiffrement et l'horloge`;
    return `SNMP : ${m}`.slice(0, 160);
  }
  async function un(d) {
    const s = session(d);
    try {
      const sysName = await lire(s, OID.sysName);
      const [nom, admin, oper, vitesse, entree, sortie] = await Promise.all([OID.ifName, OID.ifAdminStatus, OID.ifOperStatus, OID.ifHighSpeed, OID.ifHCInOctets, OID.ifHCOutOctets].map(o => colonne(s, o)));
      const [type, errIn, errOut] = await Promise.all([OID.ifType, OID.ifInErrors, OID.ifOutErrors].map(o => facultative(s, o)));
      let macs = new Map(); macs.total = new Map();
      if (cfg.macs !== false) {
        const base = await facultative(s, OID.dot1dBasePortIfIndex);
        if (base.size) { let fdb = await facultative(s, OID.dot1qTpFdbPort); if (!fdb.size) fdb = await facultative(s, OID.dot1dTpFdbPort); macs = macsParPort(fdb, base); }
      }
      const maintenant = Date.now(), cle = `${d.ip}:${d.port || cfg.port || 161}`, avant = precedent.get(cle), courant = { t: maintenant, c: new Map() }, ports = [];
      for (const [i, n] of nom) {
        const name = String(n), a = +admin.get(i), o = +oper.get(i);
        // Ports physiques seulement : type Ethernet quand l'équipement le donne, et jamais une unité logique (« ge-0/0/0.0 »)
        if (type.size && !ETHERNET.has(+type.get(i))) continue;
        if (/\.\d+$/.test(name)) continue;
        const cIn = big(entree.get(i)), cOut = big(sortie.get(i)), cErr = errIn.has(i) || errOut.has(i) ? big(errIn.get(i)) + big(errOut.get(i)) : null;
        courant.c.set(i, [cIn, cOut, cErr]);
        let inMbps = null, outMbps = null;
        const p0 = avant && avant.c.get(i), dt = avant ? (maintenant - avant.t) / 1000 : 0;
        if (p0 && dt > 0 && cIn >= p0[0] && cOut >= p0[1]) { inMbps = +(Number(cIn - p0[0]) * 8 / dt / 1e6).toFixed(3); outMbps = +(Number(cOut - p0[1]) * 8 / dt / 1e6).toFixed(3); }
        // Erreurs de trame apparues depuis le relevé précédent (compteur remis à zéro : on repart de zéro)
        const errors = p0 && cErr !== null && p0[2] !== null && p0[2] !== undefined ? (cErr >= p0[2] ? Number(cErr - p0[2]) : 0) : null;
        const status = a === 2 ? 'disabled' : o !== 1 ? 'down' : errors !== null && errors >= seuilErreurs ? 'error' : 'up';
        ports.push({ name, status, speedMbps: +vitesse.get(i) || null, inMbps, outMbps, errors, macs: macs.get(i) || [], macCount: macs.total.get(i) ?? null });
      }
      // Ordre stable et lisible, quel que soit l'ordre des index de l'équipement
      ports.sort((x, y) => x.name.localeCompare(y.name, 'fr', { numeric: true }));
      precedent.set(cle, courant);
      return { ip: d.ip, hostname: d.hostname || String(sysName || ''), state: 'up', message: '', ports };
    } catch (e) {
      return { ip: d.ip, hostname: d.hostname || '', state: 'down', message: raison(e), ports: [] };
    } finally { try { s.close(); } catch { /* session déjà fermée */ } }
  }
  return { nom: cfg.nom || 'snmp', relever: () => Promise.all((cfg.devices || []).map(un)) };
};
module.exports.OID = OID;
module.exports.macsParPort = macsParPort;
