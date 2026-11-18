/* Source SNMP : interroge directement les switchs (MIB standard IF-MIB, donc indépendante de la marque).
   Configuration :
   { type: "snmp", version: "2c", community: "env:SNMP_COMMUNITY", port: 161, timeoutMs: 4000,
     devices: [{ ip: "10.10.99.18", hostname: "SW-A1-ACC-01" }] }
   SNMP v3 : { version: "3", user, authProtocol: "sha", authKey: "env:…", privProtocol: "aes", privKey: "env:…" }
   Droits nécessaires : une communauté ou un utilisateur en LECTURE SEULE.

   Ce que la source remonte, par port : nom, état (administratif et opérationnel), débit négocié,
   trafic entrant et sortant (calculé entre deux relevés à partir des compteurs 64 bits).

   À VÉRIFIER SUR VOS ÉQUIPEMENTS : validé contre un agent SNMP simulé, pas sur du matériel réel. */
'use strict';
const { secret } = require('../lib/contrat');

const OID = {
  sysName: '1.3.6.1.2.1.1.5.0',
  ifAdminStatus: '1.3.6.1.2.1.2.2.1.7', ifOperStatus: '1.3.6.1.2.1.2.2.1.8',
  ifName: '1.3.6.1.2.1.31.1.1.1.1', ifHighSpeed: '1.3.6.1.2.1.31.1.1.1.15',
  ifHCInOctets: '1.3.6.1.2.1.31.1.1.1.6', ifHCOutOctets: '1.3.6.1.2.1.31.1.1.1.10',
};
const big = v => (Buffer.isBuffer(v) ? BigInt('0x' + (v.toString('hex') || '0')) : BigInt(v || 0));

module.exports = function creer(cfg) {
  let snmp;
  try { snmp = require('net-snmp'); } catch { throw new Error('SNMP : le module « net-snmp » est absent. Lancez « npm install » dans le dossier connecteurs.'); }
  const precedent = new Map();   // compteurs du relevé précédent, pour calculer les débits
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
  async function un(d) {
    const s = session(d);
    try {
      const sysName = await lire(s, OID.sysName);
      const [nom, admin, oper, vitesse, entree, sortie] = await Promise.all([OID.ifName, OID.ifAdminStatus, OID.ifOperStatus, OID.ifHighSpeed, OID.ifHCInOctets, OID.ifHCOutOctets].map(o => colonne(s, o)));
      const maintenant = Date.now(), avant = precedent.get(d.ip), courant = { t: maintenant, c: new Map() }, ports = [];
      for (const [i, n] of nom) {
        const name = String(n), a = +admin.get(i), o = +oper.get(i);
        const cIn = big(entree.get(i)), cOut = big(sortie.get(i));
        courant.c.set(i, [cIn, cOut]);
        let inMbps = null, outMbps = null;
        const p0 = avant && avant.c.get(i), dt = avant ? (maintenant - avant.t) / 1000 : 0;
        if (p0 && dt > 0 && cIn >= p0[0] && cOut >= p0[1]) { inMbps = +(Number(cIn - p0[0]) * 8 / dt / 1e6).toFixed(3); outMbps = +(Number(cOut - p0[1]) * 8 / dt / 1e6).toFixed(3); }
        ports.push({ name, status: a === 2 ? 'disabled' : o === 1 ? 'up' : 'down', speedMbps: +vitesse.get(i) || null, inMbps, outMbps });
      }
      precedent.set(d.ip, courant);
      return { ip: d.ip, hostname: d.hostname || String(sysName || ''), state: 'up', message: '', ports };
    } catch (e) {
      return { ip: d.ip, hostname: d.hostname || '', state: 'down', message: /timed out|timeout/i.test(e.message) ? 'Aucune réponse SNMP' : `SNMP : ${e.message}`.slice(0, 160), ports: [] };
    } finally { try { s.close(); } catch { /* session déjà fermée */ } }
  }
  return { nom: cfg.nom || 'snmp', relever: () => Promise.all((cfg.devices || []).map(un)) };
};
module.exports.OID = OID;
