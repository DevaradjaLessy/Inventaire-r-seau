/* Source Zabbix (API JSON-RPC, Zabbix 6.4 ou plus récent : le jeton part dans l'en-tête « Authorization: Bearer »).
   Configuration :
   { type: "zabbix", url: "https://zabbix.exemple.interne", apiToken: "env:ZABBIX_TOKEN",
     groupes: ["Réseau"], insecureTls: false, timeoutMs: 15000 }
   Droits nécessaires : un utilisateur Zabbix en lecture seule sur les groupes d'hôtes à suivre, et un jeton d'API pour lui.
   groupes (facultatif) : noms des groupes d'hôtes à relever ; sans cette clé, tous les hôtes que le jeton peut lire.

   Ce que la source remonte :
   - l'état de chaque hôte surveillé : injoignable si aucune de ses interfaces ne répond à Zabbix, dégradé s'il a un problème
     en cours (le message est le libellé du problème le plus grave), joignable sinon ;
   - l'état des ports et leur trafic, à partir des éléments « net.if.* » que créent les modèles SNMP fournis avec Zabbix
     (« Network Generic Device by SNMP », modèles Juniper, Cisco, etc.).
   Ce qu'elle ne remonte pas : la différence entre un port désactivé et un port inactif (ces modèles ne lisent que l'état
   opérationnel), ni les adresses MAC. Une source SNMP placée à côté les apporte : les deux se complètent.

   Validée contre un Zabbix 7.0 réel qui surveille un agent SNMP, et contre un simulateur nourri de ses réponses. */
'use strict';
const { postJson } = require('../lib/http');
const { secret } = require('../lib/contrat');

const SEUIL_ERREURS = 1;   // erreurs de trame par seconde au-delà desquelles un port monté est dit « en erreur »
/* Élément « net.if.* » → champ du port. Les débits arrivent en bits par seconde. */
const CHAMPS = [[/^net\.if\.status\[/, 'oper'], [/^net\.if\.speed\[/, 'vitesse'], [/^net\.if\.in\[/, 'entree'], [/^net\.if\.out\[/, 'sortie'], [/^net\.if\.in\.errors\[/, 'errIn'], [/^net\.if\.out\.errors\[/, 'errOut']];
/* Nom de l'interface d'un élément : l'étiquette « interface » posée par les modèles, à défaut le nom « Interface eth0(…): … » */
function interfaceDe(item) {
  const tag = (item.tags || []).find(t => t.tag === 'interface' && t.value);
  if (tag) return tag.value;
  const m = /^Interface (.+?)\(.*?\):/.exec(String(item.name || ''));
  return m ? m[1].trim() : null;
}
const mbps = v => (v === undefined || v === null || v === '' || !Number.isFinite(+v) ? null : +(+v / 1e6).toFixed(3));

module.exports = function creer(cfg) {
  const base = String(cfg.url || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('Zabbix : « url » doit commencer par http:// ou https://');
  const seuil = cfg.seuilErreurs > 0 ? +cfg.seuilErreurs : SEUIL_ERREURS;
  let n = 0;
  async function appel(methode, params) {
    const r = await postJson(`${base}/api_jsonrpc.php`, { jsonrpc: '2.0', method: methode, params, id: ++n },
      { insecureTls: cfg.insecureTls, timeoutMs: cfg.timeoutMs, headers: { 'Content-Type': 'application/json-rpc', Authorization: `Bearer ${secret(cfg.apiToken)}` } });
    if (r && r.error) throw new Error(`Zabbix a refusé « ${methode} » : ${r.error.data || r.error.message || 'erreur inconnue'}`.slice(0, 200));
    if (!r || !Array.isArray(r.result)) throw new Error(`Zabbix : réponse inattendue à « ${methode} ».`);
    return r.result;
  }
  return {
    nom: cfg.nom || 'zabbix',
    async relever() {
      const filtre = { output: ['hostid', 'host', 'name', 'maintenance_status'], selectInterfaces: ['ip', 'dns', 'useip', 'main', 'available', 'error'], filter: { status: 0 } };
      if (Array.isArray(cfg.groupes) && cfg.groupes.length) {
        const groupes = await appel('hostgroup.get', { output: ['groupid', 'name'], filter: { name: cfg.groupes } });
        const absents = cfg.groupes.filter(g => !groupes.some(x => x.name === g));
        if (absents.length) throw new Error(`Zabbix : groupe d'hôtes introuvable ou illisible avec ce jeton : ${absents.join(', ')}`);
        filtre.groupids = groupes.map(g => g.groupid);
      }
      const hotes = await appel('host.get', filtre);
      if (!hotes.length) return [];
      const ids = hotes.map(h => h.hostid);
      const [items, problemes] = await Promise.all([
        appel('item.get', { output: ['itemid', 'hostid', 'key_', 'name', 'lastvalue', 'lastclock'], hostids: ids, search: { key_: 'net.if.' }, startSearch: true, filter: { status: 0 }, selectTags: ['tag', 'value'] }),
        appel('problem.get', { output: ['eventid', 'objectid', 'name', 'severity'], hostids: ids, selectHosts: ['hostid'], sortfield: ['eventid'], sortorder: 'DESC' }).catch(() => appel('problem.get', { output: ['eventid', 'objectid', 'name', 'severity'], hostids: ids })),
      ]);
      // Ports : les éléments d'une même interface sont réunis
      const ports = new Map();   // hostid → Map(interface → { oper, vitesse, entree, sortie, errIn, errOut })
      for (const it of items) {
        const champ = CHAMPS.find(([re]) => re.test(it.key_ || '')), nom = champ && interfaceDe(it);
        if (!nom || !+it.lastclock) continue;   // jamais relevé : pas d'information
        const h = ports.get(it.hostid) || ports.set(it.hostid, new Map()).get(it.hostid), p = h.get(nom) || h.set(nom, {}).get(nom);
        p[champ[1]] = it.lastvalue;
      }
      // Problèmes en cours, par hôte. problem.get ne dit pas toujours l'hôte : à défaut, tout problème va à l'hôte unique.
      const parHote = new Map();
      for (const pb of problemes) {
        if (pb.r_eventid && pb.r_eventid !== '0') continue;
        const cibles = Array.isArray(pb.hosts) && pb.hosts.length ? pb.hosts.map(x => x.hostid) : hotes.length === 1 ? [hotes[0].hostid] : [];
        for (const id of cibles) (parHote.get(id) || parHote.set(id, []).get(id)).push(pb);
      }
      return hotes.map(h => {
        const ifs = h.interfaces || [], principale = ifs.find(i => i.main === '1') || ifs[0] || {};
        const repond = ifs.some(i => i.available === '1'), muette = ifs.filter(i => i.available === '2');
        const pbs = (parHote.get(h.hostid) || []).sort((a, b) => +b.severity - +a.severity);
        let state = repond ? 'up' : muette.length ? 'down' : 'unknown', message = '';
        if (state === 'down') message = String(muette[0].error || 'Aucune réponse à Zabbix').slice(0, 200);
        else if (pbs.length) { state = 'warning'; message = `${pbs[0].name}${pbs.length > 1 ? ` (+ ${pbs.length - 1} autre${pbs.length > 2 ? 's' : ''})` : ''}`.slice(0, 200); }
        else if (h.maintenance_status === '1') message = 'En maintenance dans Zabbix';
        const liste = [...(ports.get(h.hostid) || new Map())].map(([name, p]) => {
          const up = +p.oper === 1, erreurs = (+p.errIn || 0) + (+p.errOut || 0);
          return { name, status: p.oper === undefined ? null : !up ? 'down' : erreurs >= seuil ? 'error' : 'up', speedMbps: mbps(p.vitesse) || null, inMbps: mbps(p.entree), outMbps: mbps(p.sortie) };
        }).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
        return { ip: principale.useip === '0' ? principale.dns || '' : principale.ip || '', hostname: h.host || h.name || '', state, message, ports: liste };
      });
    },
  };
};
module.exports.interfaceDe = interfaceDe;
