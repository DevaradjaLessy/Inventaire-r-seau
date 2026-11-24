/* Contrat commun (version 1) entre le relais et NetCarto.
   Chaque source renvoie une liste d'équipements à ce format ; le relais les fusionne.

   équipement : { ip, hostname, state, message, ports: [port] }
   state      : up | warning | down | unknown
   port       : { name, status, speedMbps, inMbps, outMbps, totalMbps, poeW, vlan, macs, errors, macCount }
                errors : erreurs de trame depuis le relevé précédent ; macCount : nombre d'adresses apprises sur le port
   Après fusion, un équipement porte aussi : sources (noms des sources qui l'ont vu) et ecarts (désaccords entre sources).
   status     : up | down | disabled | error */
'use strict';

const STATES = ['up', 'warning', 'down', 'unknown'];
const STATUSES = ['up', 'down', 'disabled', 'error'];
const GRAVITE = { unknown: 0, up: 1, warning: 2, down: 3 };
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function port(p) {
  return {
    name: String(p.name || '').slice(0, 120), status: STATUSES.includes(p.status) ? p.status : null,
    speedMbps: num(p.speedMbps), inMbps: num(p.inMbps), outMbps: num(p.outMbps), totalMbps: num(p.totalMbps),
    poeW: num(p.poeW), vlan: num(p.vlan), macs: Array.isArray(p.macs) ? p.macs.filter(m => typeof m === 'string').map(m => m.slice(0, 40)) : [],
    errors: num(p.errors), macCount: num(p.macCount),
  };
}
function equipement(d) {
  // Une source peut renvoyer n'importe quoi : tout ce qui n'a pas la forme attendue devient une valeur vide, sans lever d'erreur
  const texte = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : '');
  return { ip: texte(d.ip, 255), hostname: texte(d.hostname, 255), state: STATES.includes(d.state) ? d.state : 'unknown', message: texte(d.message, 500), ports: (Array.isArray(d.ports) ? d.ports : []).filter(p => p && typeof p === 'object' && typeof p.name === 'string' && p.name).map(port) };
}
const EST_IP = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]*:[0-9a-f:.]+$/i;
/* Nom d'interface ramené à une forme courte et comparable : « GigabitEthernet1/0/1 » et « Gi1/0/1 » désignent le même port.
   Les noms Junos (« ge-0/0/1 »), Aruba (« 1/1/1 ») et autres sont déjà courts : seule la casse est ignorée.
   La même règle existe dans l'interface (normIf, js/services/mesures.js) : les deux doivent rester d'accord. */
const ABREVIATIONS = [['tengigabitethernet', 'te'], ['twentyfivegige', 'twe'], ['fortygigabitethernet', 'fo'], ['hundredgige', 'hu'], ['gigabitethernet', 'gi'], ['fastethernet', 'fa']];
function nomInterface(nom) {
  let s = String(nom || '').toLowerCase().replace(/\s+/g, '');
  for (const [long, court] of ABREVIATIONS) if (s.startsWith(long)) { s = court + s.slice(long.length); break; }
  return s;
}
/* Nom d'hôte comparable : sans domaine, sans casse (« SW-A1.exemple.interne » et « sw-a1 » désignent le même équipement) */
const nomCourt = h => String(h || '').trim().toLowerCase().split('.')[0];
/* Fusionne les relevés de plusieurs sources, dans l'ordre de la configuration. noms : nom de chaque source.
   - Un équipement est reconnu par son adresse IP ; à défaut d'adresse d'un côté (PRTG peut donner un nom DNS), par son nom d'hôte.
     Deux adresses différentes font toujours deux équipements.
   - La première source qui renseigne une valeur fait foi ; les suivantes complètent ce qui manque, sans rien remplacer.
     « unknown » et une valeur absente ne comptent pas comme une réponse.
   - Un désaccord entre deux sources (état de l'équipement, état d'un port) est noté dans « ecarts », pour être vu.
     Ne sont pas des désaccords : « joignable » et « dégradé » (le problème est gardé), « inactif » et « désactivé » (le plus précis est gardé). */
function fusionner(listes, noms = []) {
  const sortie = [], parIp = new Map(), parNom = new Map();
  listes.forEach((liste, rang) => {
    const source = noms[rang] || `source ${rang + 1}`;
    for (const brut of Array.isArray(liste) ? liste : []) {
      if (!brut || typeof brut !== 'object') continue;
      const d = equipement(brut);
      // Un « ip » qui n'est pas une adresse est un nom DNS : il sert de nom d'hôte de rechange
      let dns = '';
      if (d.ip && !EST_IP.test(d.ip)) { dns = d.ip; d.ip = ''; }
      const nomsHote = [...new Set([nomCourt(d.hostname), nomCourt(dns)].filter(Boolean))];
      if (!d.hostname.trim()) d.hostname = dns;
      if (!d.ip && !nomsHote.length) continue;
      let deja = d.ip ? parIp.get(d.ip) : null;
      if (!deja) { const parNomTrouve = nomsHote.map(n => parNom.get(n)).find(Boolean); if (parNomTrouve && (!d.ip || !parNomTrouve.ip)) deja = parNomTrouve; }
      if (!deja) {
        deja = { ...d, ports: [], sources: [], ecarts: [], _etat: null, _ports: new Map() };
        if (d.state !== 'unknown') deja._etat = { source, state: d.state };
        sortie.push(deja);
      } else {
        if (!deja.ip && d.ip) deja.ip = d.ip;
        if (!deja.hostname) deja.hostname = d.hostname;
        if (d.state !== 'unknown') {
          if (!deja._etat) { deja._etat = { source, state: d.state }; deja.state = d.state; deja.message = d.message; }
          else if (deja._etat.state !== d.state) {
            // « Joignable » et « dégradé » vont ensemble : l'équipement répond, et une source lui connaît un problème. Le problème est gardé.
            const repond = ['up', 'warning'];
            if (repond.includes(deja._etat.state) && repond.includes(d.state)) { if (d.state === 'warning') { deja._etat = { source, state: 'warning' }; deja.state = 'warning'; deja.message = d.message; } }
            else deja.ecarts.push(`état : ${deja._etat.source} dit « ${deja._etat.state} », ${source} dit « ${d.state} »`);
          }
        }
        if (!deja.message && deja._etat?.source === source) deja.message = d.message;
      }
      if (deja.ip) parIp.set(deja.ip, deja);
      for (const n of nomsHote) if (!parNom.has(n)) parNom.set(n, deja);
      if (!deja.sources.includes(source)) deja.sources.push(source);
      for (const p of d.ports) {
        const cle = nomInterface(p.name), q = deja._ports.get(cle);
        if (!q) { const neuf = { ...p, _etat: p.status ? source : null }; deja._ports.set(cle, neuf); deja.ports.push(neuf); continue; }
        for (const k of Object.keys(p)) {
          if (k === 'name') continue;
          if (k === 'macs') { if (p.macs.length) q.macs = [...new Set([...q.macs, ...p.macs])]; continue; }
          if (p[k] === null || p[k] === '') continue;
          if (q[k] === null || q[k] === '' || q[k] === undefined) { q[k] = p[k]; if (k === 'status') q._etat = source; }
          else if (k === 'status' && q[k] !== p[k]) {
            // « Inactif » et « désactivé » disent tous deux que le port ne passe rien : la valeur la plus précise est gardée, sans écart
            const eteints = ['down', 'disabled'];
            if (eteints.includes(q[k]) && eteints.includes(p[k])) { q[k] = 'disabled'; q._etat = q[k] === p[k] ? source : q._etat; }
            else deja.ecarts.push(`${q.name} : ${q._etat} dit « ${q[k]} », ${source} dit « ${p[k]} »`);
          }
        }
      }
    }
  });
  // Les champs de travail ne sortent pas
  for (const d of sortie) { delete d._etat; delete d._ports; for (const p of d.ports) delete p._etat; }
  return sortie;
}
/* Une valeur « env:NOM » est lue dans la variable d'environnement NOM : aucun secret dans le fichier de configuration */
function secret(v) {
  if (typeof v !== 'string' || !v.startsWith('env:')) return v;
  const val = process.env[v.slice(4)];
  if (val === undefined) throw new Error(`Variable d'environnement ${v.slice(4)} absente.`);
  return val;
}
module.exports = { equipement, fusionner, nomInterface, secret, STATES, STATUSES };
