/* Source PRTG Network Monitor (API HTTP « table.json »).
   Configuration :
   { type: "prtg", url: "https://prtg.exemple.interne", apiToken: "env:PRTG_TOKEN",
     insecureTls: false, timeoutMs: 15000 }
   Authentification : clé d'API (paramètre apitoken), ou à défaut username + passhash.
   Droits nécessaires : un compte PRTG en lecture seule suffit.

   Ce que la source remonte :
   - l'état de chaque équipement PRTG (reconnu dans NetCarto par son adresse « host ») ;
   - l'état des ports, à partir des capteurs de trafic dont le nom contient l'interface,
     par exemple « (001) GigabitEthernet1/0/1 Traffic ».

   À VÉRIFIER SUR VOTRE PRTG : les codes d'état et le format de « lastvalue » peuvent
   varier selon la version et la langue. Ce connecteur a été validé contre un simulateur. */
'use strict';
const { getJson } = require('../lib/http');
const { secret } = require('../lib/contrat');

/* Code d'état PRTG (status_raw) → état du contrat */
const ETAT = { 3: 'up', 4: 'warning', 5: 'down', 10: 'warning', 11: 'warning', 13: 'down', 14: 'warning' };
const PAUSE = [7, 8, 9, 12];
/* « 1 234 kbit/s », « 12.5 Mbit/s » → Mb/s */
function debit(texte) {
  const m = /([\d\s.,  ]+)\s*(bit|kbit|mbit|gbit)\/s/i.exec(String(texte || ''));
  if (!m) return null;
  let brut = m[1].replace(/[\s  ]/g, '');
  // Séparateur décimal : le dernier point ou la dernière virgule, s'il est suivi de 1 ou 2 chiffres
  const dec = /[.,](\d{1,2})$/.exec(brut);
  brut = dec ? brut.slice(0, dec.index).replace(/[.,]/g, '') + '.' + dec[1] : brut.replace(/[.,]/g, '');
  const v = parseFloat(brut);
  if (!Number.isFinite(v)) return null;
  return +(v * { bit: 1e-6, kbit: 1e-3, mbit: 1, gbit: 1e3 }[m[2].toLowerCase()]).toFixed(3);
}
/* Nom d'interface extrait du nom d'un capteur de trafic, ou null si ce n'en est pas un */
function interfaceDe(capteur) {
  const nom = String(capteur.sensor || capteur.name || ''), type = String(capteur.type || '');
  const m = /^(?:\(\d+\)\s*)?(.+?)\s+(?:Traffic|Trafic)$/i.exec(nom);
  if (m) return m[1].trim();
  return /traffic|trafic/i.test(type) ? nom.replace(/^\(\d+\)\s*/, '').trim() : null;
}
module.exports = function creer(cfg) {
  const base = String(cfg.url || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('PRTG : « url » doit commencer par http:// ou https://');
  const auth = () => (cfg.apiToken ? `apitoken=${encodeURIComponent(secret(cfg.apiToken))}` : `username=${encodeURIComponent(secret(cfg.username))}&passhash=${encodeURIComponent(secret(cfg.passhash))}`);
  const table = (content, columns) => getJson(`${base}/api/table.json?content=${content}&columns=${columns}&count=50000&${auth()}`, { insecureTls: cfg.insecureTls, timeoutMs: cfg.timeoutMs });
  return {
    nom: cfg.nom || 'prtg',
    async relever() {
      const [d, s] = await Promise.all([table('devices', 'objid,device,host,status,message'), table('sensors', 'objid,parentid,sensor,status,lastvalue,type')]);
      const parId = new Map();
      for (const x of d.devices || []) {
        const code = +x.status_raw;
        parId.set(+x.objid, { ip: x.host || '', hostname: x.device || '', state: ETAT[code] || 'unknown', message: PAUSE.includes(code) ? 'En pause dans PRTG' : String(x.message_raw || x.message || '').replace(/<[^>]+>/g, '').slice(0, 200), ports: [] });
      }
      for (const c of s.sensors || []) {
        const dev = parId.get(+c.parentid), nom = interfaceDe(c);
        if (!dev || !nom) continue;
        const code = +c.status_raw;
        dev.ports.push({ name: nom, status: code === 3 ? 'up' : code === 5 || code === 13 ? 'down' : PAUSE.includes(code) ? 'disabled' : ETAT[code] === 'warning' ? 'error' : null, totalMbps: debit(c.lastvalue) });
      }
      return [...parId.values()];
    },
  };
};
module.exports.debit = debit;
module.exports.interfaceDe = interfaceDe;
