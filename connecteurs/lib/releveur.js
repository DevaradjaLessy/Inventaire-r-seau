/* Releveur : interroge les sources configurées à intervalle régulier et garde leur dernier état.
   Utilisé par le relais autonome (serveur.js) et par le serveur NetCarto, dont il est le module de supervision. */
'use strict';
const { fusionner } = require('./contrat');

const TYPES = { simulation: '../sources/simulation', prtg: '../sources/prtg', snmp: '../sources/snmp', zabbix: '../sources/zabbix', json: '../sources/json' };
const DELAI_MS = 60000;   // au-delà, une source qui n'a pas répondu est comptée en erreur pour ce relevé

/* configs : liste de sources ({ type, … }), dans l'ordre de priorité (la première fait foi en cas de désaccord) ;
   journal : fonction qui reçoit les messages d'erreur ; options : { delaiMs, fabriques (sources fournies par les tests) } */
function creerReleveur(configs = [], journal = () => {}, options = {}) {
  const fabriques = options.fabriques || {}, delaiMs = options.delaiMs || DELAI_MS, noms = new Map();
  const sources = configs.map((c, i) => {
    if (!fabriques[c.type] && !TYPES[c.type]) throw new Error(`Source n° ${i + 1} : type « ${c.type} » inconnu (attendu : ${Object.keys(TYPES).join(', ')}).`);
    const src = fabriques[c.type] ? fabriques[c.type](c) : require(TYPES[c.type])(c);
    // Deux sources du même nom se distinguent par leur rang : « snmp », « snmp (2) »
    const n = (noms.get(src.nom) || 0) + 1; noms.set(src.nom, n);
    return { src, nom: n > 1 ? `${src.nom} (${n})` : src.nom, devices: [], ok: null, erreur: '', ts: 0 };
  });
  let enCours = null;
  let minuterie = null;
  /* Une source qui ne répond pas dans le délai est abandonnée pour ce relevé : elle ne bloque ni les autres ni les relevés suivants */
  const borne = promesse => new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error(`aucune réponse dans le délai de ${Math.round(delaiMs / 1000)} s`)), delaiMs);
    Promise.resolve(promesse).then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); ko(e); });
  });
  function relever() {
    if (enCours) return enCours;   // un relevé à la fois : un appel pendant un relevé en attend la fin
    enCours = Promise.all(sources.map(async s => {
      try {
        const devices = await borne(s.src.relever());
        if (!Array.isArray(devices)) throw new Error('réponse inattendue (liste d\'équipements attendue)');
        s.devices = devices; s.ok = true; s.erreur = '';
      } catch (e) { s.ok = false; s.erreur = e.message; s.devices = []; journal(`[${s.nom}] ${e.message}`); }
      s.ts = Date.now();
    })).finally(() => { enCours = null; });
    return enCours;
  }
  const sante = () => sources.map(s => ({ nom: s.nom, ok: s.ok, erreur: s.erreur, equipements: s.devices.length, ts: s.ts }));
  return {
    nombre: sources.length,
    relever,
    /* Lance les relevés périodiques (5 secondes au minimum entre deux) ; renvoie la promesse du premier relevé */
    demarrer(intervalleSecondes = 30) { minuterie = setInterval(relever, Math.max(5, intervalleSecondes) * 1000); minuterie.unref?.(); return relever(); },
    arreter() { clearInterval(minuterie); },
    /* État fusionné. « sources » dit, pour chacune, si son dernier relevé a réussi : une source en erreur n'apporte plus rien,
       et l'interface doit pouvoir le dire au lieu de laisser croire que tout est à jour. */
    etat: () => { const bonnes = sources.filter(s => s.ok); return { version: 1, source: sources.map(s => s.nom).join(' + ') || 'aucune', ts: Math.max(0, ...sources.map(s => s.ts)), sources: sante(), devices: fusionner(bonnes.map(s => s.devices), bonnes.map(s => s.nom)) }; },
    sante: () => ({ sources: sante() }),
  };
}
module.exports = { creerReleveur, TYPES };
