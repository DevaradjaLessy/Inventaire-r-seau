/* Releveur : interroge les sources configurées à intervalle régulier et garde leur dernier état.
   Utilisé par le relais autonome (serveur.js) et par le serveur NetCarto, dont il est le module de supervision. */
'use strict';
const { fusionner } = require('./contrat');

const TYPES = { simulation: '../sources/simulation', prtg: '../sources/prtg', snmp: '../sources/snmp' };

/* configs : liste de sources ({ type, … }) ; journal : fonction qui reçoit les messages d'erreur */
function creerReleveur(configs = [], journal = () => {}) {
  const sources = configs.map((c, i) => {
    if (!TYPES[c.type]) throw new Error(`Source n° ${i + 1} : type « ${c.type} » inconnu (attendu : ${Object.keys(TYPES).join(', ')}).`);
    return { src: require(TYPES[c.type])(c), devices: [], ok: null, erreur: '', ts: 0 };
  });
  let enCours = false, minuterie = null;
  async function relever() {
    if (enCours) return;
    enCours = true;
    await Promise.all(sources.map(async s => {
      try { s.devices = await s.src.relever(); s.ok = true; s.erreur = ''; }
      catch (e) { s.ok = false; s.erreur = e.message; journal(`[${s.src.nom}] ${e.message}`); }
      s.ts = Date.now();
    }));
    enCours = false;
  }
  return {
    nombre: sources.length,
    relever,
    /* Lance les relevés périodiques (5 secondes au minimum entre deux) ; renvoie la promesse du premier relevé */
    demarrer(intervalleSecondes = 30) { minuterie = setInterval(relever, Math.max(5, intervalleSecondes) * 1000); minuterie.unref?.(); return relever(); },
    arreter() { clearInterval(minuterie); },
    etat: () => ({ version: 1, source: sources.map(s => s.src.nom).join(' + ') || 'aucune', ts: Math.max(0, ...sources.map(s => s.ts)), devices: fusionner(sources.filter(s => s.ok).map(s => s.devices)) }),
    sante: () => ({ sources: sources.map(s => ({ nom: s.src.nom, ok: s.ok, erreur: s.erreur, equipements: s.devices.length, ts: s.ts })) }),
  };
}
module.exports = { creerReleveur, TYPES };
