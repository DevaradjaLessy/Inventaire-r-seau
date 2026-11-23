/* Écarts entre deux états de la base : liste des changements (pour le serveur) et de quoi les défaire (pour l'annulation).
   Garder l'écart plutôt qu'une copie complète rend l'annulation légère, même sur une grande base. */

/* Collections suivies, avec le nom de leur clé */
const CLES = { vlans: 'id', sites: 'id', buildings: 'id', floors: 'id', rooms: 'id', catalog: 'id', stock: 'catalogId', racks: 'id', devices: 'id', ports: 'id', outlets: 'id', cables: 'id', interventions: 'id', history: 'id' };

/* Égalité de deux valeurs au sens du JSON (une propriété « undefined » compte comme absente) */
function egal(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ta = Array.isArray(a);
  if (ta !== Array.isArray(b)) return false;
  if (ta) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!egal(a[i], b[i])) return false; return true; }
  let n = 0;
  for (const k in a) { const v = a[k]; if (v === undefined) continue; n++; if (!egal(v, b[k])) return false; }
  for (const k in b) if (b[k] !== undefined) n--;
  return n === 0;
}
/* Compare deux états et renvoie la liste des changements : { collection, op, cle, avant, apres }.
   Les suppressions passent en premier (elles libèrent les valeurs uniques), puis les modifications, puis les créations. */
function diff(avant, apres) {
  const supp = [], modif = [], crea = [];
  for (const [c, cle] of Object.entries(CLES)) {
    const anciens = new Map((avant[c] || []).map(o => [o[cle], o])), vus = new Set();
    for (const o of apres[c] || []) {
      const k = o[cle], a = anciens.get(k);
      vus.add(k);
      if (!a) crea.push({ collection: c, op: 'creer', cle: k, apres: o });
      else if (!egal(a, o)) modif.push({ collection: c, op: 'modifier', cle: k, avant: a, apres: o });
    }
    if (vus.size !== anciens.size) for (const [k, a] of anciens) if (!vus.has(k)) supp.push({ collection: c, op: 'supprimer', cle: k, avant: a });
  }
  return [...supp, ...modif, ...crea];
}
/* Écart complet entre l'état d'avant (copie indépendante) et l'état actuel.
   retour : ce qu'il faut pour revenir en arrière — par collection : clés créées, valeurs d'avant des éléments modifiés
   ou supprimés, et l'ordre d'avant quand il a changé. */
function ecartEntre(avant, apres) {
  const changements = diff(avant, apres), parColl = {};
  const de = c => parColl[c] || (parColl[c] = { crees: [], modifies: [], supprimes: [] });
  for (const ch of changements) {
    if (ch.op === 'creer') de(ch.collection).crees.push(ch.cle);
    else if (ch.op === 'modifier') de(ch.collection).modifies.push(ch.avant);
    else de(ch.collection).supprimes.push(ch.avant);
  }
  for (const [c, cle] of Object.entries(CLES)) {
    const a = avant[c] || [], b = apres[c] || [], e = parColl[c];
    let memeOrdre = !(e && e.supprimes.length);
    if (memeOrdre) {   // créations mises à part, les éléments sont-ils restés dans le même ordre ?
      const crees = e && e.crees.length ? new Set(e.crees) : null;
      let i = 0;
      for (const o of b) { const k = o[cle]; if (crees && crees.has(k)) continue; if (!a[i] || a[i][cle] !== k) { memeOrdre = false; break; } i++; }
    }
    if (!memeOrdre) de(c).ordre = a.map(o => o[cle]);
  }
  return { changements, retour: { parColl, meta: avant.meta } };
}
/* Lot à envoyer au serveur pour défaire un écart. À calculer avant « defaire » : il lit les valeurs actuelles. */
function lotInverse(db, retour) {
  const supp = [], modif = [], crea = [];
  for (const [c, x] of Object.entries(retour.parColl)) {
    const cle = CLES[c], actuels = new Map(db[c].map(o => [o[cle], o]));
    for (const k of x.crees) supp.push({ collection: c, op: 'supprimer', cle: k, avant: actuels.get(k) });
    for (const o of x.modifies) modif.push({ collection: c, op: 'modifier', cle: o[cle], avant: actuels.get(o[cle]), apres: o });
    for (const o of x.supprimes) crea.push({ collection: c, op: 'creer', cle: o[cle], apres: o });
  }
  return [...supp, ...modif, ...crea];
}
/* Remet la base dans l'état d'avant l'écart */
function defaire(db, retour) {
  for (const [c, x] of Object.entries(retour.parColl)) {
    const cle = CLES[c], crees = new Set(x.crees), modifies = new Map(x.modifies.map(o => [o[cle], o]));
    let liste = db[c].filter(o => !crees.has(o[cle])).map(o => modifies.get(o[cle]) || o);
    if (x.ordre) { const m = new Map(liste.map(o => [o[cle], o])); for (const o of x.supprimes) m.set(o[cle], o); liste = x.ordre.map(k => m.get(k)); }
    db[c] = liste;
  }
  db.meta = retour.meta;
}

export { CLES, defaire, diff, ecartEntre, egal, lotInverse };
