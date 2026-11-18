/* Contrat commun (version 1) entre le relais et NetCarto.
   Chaque source renvoie une liste d'équipements à ce format ; le relais les fusionne.

   équipement : { ip, hostname, state, message, ports: [port] }
   state      : up | warning | down | unknown
   port       : { name, status, speedMbps, inMbps, outMbps, totalMbps, poeW, vlan, macs }
   status     : up | down | disabled | error */
'use strict';

const STATES = ['up', 'warning', 'down', 'unknown'];
const STATUSES = ['up', 'down', 'disabled', 'error'];
const GRAVITE = { unknown: 0, up: 1, warning: 2, down: 3 };
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function port(p) {
  return {
    name: String(p.name || ''), status: STATUSES.includes(p.status) ? p.status : null,
    speedMbps: num(p.speedMbps), inMbps: num(p.inMbps), outMbps: num(p.outMbps), totalMbps: num(p.totalMbps),
    poeW: num(p.poeW), vlan: num(p.vlan), macs: Array.isArray(p.macs) ? p.macs.map(String) : [],
  };
}
function equipement(d) {
  return { ip: String(d.ip || ''), hostname: String(d.hostname || ''), state: STATES.includes(d.state) ? d.state : 'unknown', message: String(d.message || ''), ports: (d.ports || []).filter(p => p && p.name).map(port) };
}
/* Fusionne les relevés de plusieurs sources : un équipement est reconnu par son IP, sinon par son nom.
   L'état retenu est le plus grave ; pour un port, une valeur renseignée remplace une valeur absente. */
function fusionner(listes) {
  const parCle = new Map();
  for (const liste of listes) for (const brut of liste) {
    const d = equipement(brut), cle = d.ip || d.hostname.toLowerCase();
    if (!cle) continue;
    const deja = parCle.get(cle);
    if (!deja) { parCle.set(cle, d); continue; }
    if (GRAVITE[d.state] > GRAVITE[deja.state]) { deja.state = d.state; deja.message = d.message || deja.message; }
    if (!deja.hostname) deja.hostname = d.hostname;
    const ports = new Map(deja.ports.map(p => [p.name.toLowerCase(), p]));
    for (const p of d.ports) {
      const q = ports.get(p.name.toLowerCase());
      if (!q) { deja.ports.push(p); continue; }
      for (const k of Object.keys(p)) { if (k === 'macs') { if (p.macs.length) q.macs = [...new Set([...q.macs, ...p.macs])]; } else if (p[k] !== null && p[k] !== '') q[k] = p[k]; }
    }
  }
  return [...parCle.values()];
}
/* Une valeur « env:NOM » est lue dans la variable d'environnement NOM : aucun secret dans le fichier de configuration */
function secret(v) {
  if (typeof v !== 'string' || !v.startsWith('env:')) return v;
  const val = process.env[v.slice(4)];
  if (val === undefined) throw new Error(`Variable d'environnement ${v.slice(4)} absente.`);
  return val;
}
module.exports = { equipement, fusionner, secret, STATES, STATUSES };
