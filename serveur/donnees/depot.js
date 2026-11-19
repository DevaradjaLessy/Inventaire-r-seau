/* Dépôt : toutes les lectures et écritures de la base passent par ici.
   Le reste du serveur ne connaît ni le SQL ni le moteur. */
'use strict';
const { isDeepStrictEqual } = require('util');
const { ErreurMetier, traduire } = require('./erreurs');
const { COLLECTIONS, ORDRE, GROUPE, ID, versLigne, versObjet, colonnes, colonneCle } = require('./schema');
const { verifier } = require('./regles');

const APP = 'NetCarto', SCHEMA_JSON = 1, MAX_CHANGEMENTS = 50000;
const LIBELLE = { vlans: 'VLAN', sites: 'site', batiments: 'bâtiment', etages: 'étage', pieces: 'pièce', catalogue: 'modèle du catalogue', catalogue_ports: 'groupe de ports', stock: 'ligne de stock', baies: 'baie', equipements: 'équipement', ports: 'port', prises: 'prise murale', cables: 'câble', journal: 'entrée du journal' };

function creerDepot(pilote, versionSchema) {
  const p = pilote;
  const meta = cle => p.un('SELECT valeur FROM meta WHERE cle = ?', [cle])?.valeur ?? null;
  const poserMeta = (cle, valeur) => p.lancer('INSERT INTO meta (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur', [cle, String(valeur)]);
  const revision = () => +(meta('revision') || 0);
  const spec = c => { const s = COLLECTIONS[c]; if (!s) throw new ErreurMetier('invalide', `Collection inconnue : « ${c} ».`); return s; };
  const cleValide = (c, cle) => { if (c === 'vlans' ? !Number.isInteger(cle) : typeof cle !== 'string' || !ID.test(cle)) throw new ErreurMetier('invalide', `${c} : identifiant invalide.`); return cle; };
  const filles = id => p.tous('SELECT * FROM catalogue_ports WHERE catalogue_id = ? ORDER BY ordre', [id]);

  function lire(c, cle) {
    const s = spec(c), l = p.un(`SELECT * FROM ${s.table} WHERE ${colonneCle(c)} = ?`, [cle]);
    return l ? versObjet(c, l, s.enfants ? filles(l.id) : null) : null;
  }
  function lister(c, filtres = {}) {
    const s = spec(c), ou = [], params = [];
    for (const [prop, v] of Object.entries(filtres)) {
      const champ = s.champs.find(x => x[0] === prop);
      if (!champ) throw new ErreurMetier('invalide', `${c} : filtre inconnu « ${prop} ».`);
      ou.push(`${champ[1]} = ?`); params.push(/^(int|num|bool)/.test(champ[2]) ? +v : String(v));
    }
    const lignes = p.tous(`SELECT * FROM ${s.table}${ou.length ? ' WHERE ' + ou.join(' AND ') : ''} ORDER BY ${s.ordre || 'rowid'}`, params);
    if (!s.enfants) return lignes.map(l => versObjet(c, l));
    const parModele = new Map();
    for (const f of p.tous('SELECT * FROM catalogue_ports ORDER BY catalogue_id, ordre')) (parModele.get(f.catalogue_id) || parModele.set(f.catalogue_id, []).get(f.catalogue_id)).push(f);
    return lignes.map(l => versObjet(c, l, parModele.get(l.id) || []));
  }
  /* Toute la base, au format JSON de l'interface et des exports */
  function lireBase() {
    const b = { meta: { app: APP, schemaVersion: SCHEMA_JSON, updatedAt: +(meta('maj') || 0), demo: meta('demo') === '1', seq: +(meta('seq') || 0) } };
    for (const c of ORDRE) b[c] = lister(c);
    return b;
  }
  function inserer(c, o) {
    const { ligne, filles: fl } = versLigne(c, o), cols = colonnes(c), s = COLLECTIONS[c];
    p.lancer(`INSERT INTO ${s.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map(k => ligne[k]));
    if (fl) ecrireFilles(ligne.id, fl);
  }
  function ecrireFilles(id, fl) {
    p.lancer('DELETE FROM catalogue_ports WHERE catalogue_id = ?', [id]);
    const cols = ['catalogue_id', 'ordre', ...GROUPE.map(g => g[1])];
    for (const f of fl) p.lancer(`INSERT INTO catalogue_ports (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, [id, f.ordre, ...GROUPE.map(g => f[g[1]])]);
  }
  function modifier(c, cle, o) {
    const { ligne, filles: fl } = versLigne(c, o), s = COLLECTIONS[c], k = colonneCle(c), cols = colonnes(c).filter(x => x !== k);
    p.lancer(`UPDATE ${s.table} SET ${cols.map(x => x + ' = ?').join(', ')} WHERE ${k} = ?`, [...cols.map(x => ligne[x]), cle]);
    if (fl) ecrireFilles(cle, fl);
  }
  /* Contrôles communs avant validation : clés étrangères, puis règles métier */
  function controler(touchees) {
    const v = p.violationsCles()[0];
    if (v) throw new ErreurMetier('regle', `Référence invalide : ${LIBELLE[v.table] ? 'un élément « ' + LIBELLE[v.table] + ' »' : v.table} pointe vers un élément « ${LIBELLE[v.parent] || v.parent} » absent (référence introuvable, ou élément encore référencé).`);
    const m = verifier(p, touchees);
    if (m) throw new ErreurMetier('regle', m);
  }
  const nomDe = (c, o) => (o && (o.hostname || o.name || o.label || o.model || o.id || o.catalogId)) || c;
  /* Exécute une écriture en traduisant les refus de la base en messages clairs */
  function ecrire(fn, contexte) { try { fn(); } catch (e) { if (e instanceof ErreurMetier) throw e; throw traduire(e, contexte) || e; } }

  /* Applique un lot de modifications, tout ou rien.
     Chaque changement : { collection, op: creer | modifier | supprimer, cle, avant, apres }.
     « avant » est la valeur que l'auteur avait sous les yeux : si la base ne lui correspond plus,
     le lot entier est refusé (conflit) au lieu d'écraser le travail de quelqu'un d'autre. */
  function appliquerLot(lot) {
    if (!lot || typeof lot !== 'object' || !Array.isArray(lot.changements)) throw new ErreurMetier('invalide', 'Lot mal formé : « changements » doit être une liste.');
    if (lot.changements.length > MAX_CHANGEMENTS) throw new ErreurMetier('invalide', `Lot trop volumineux (${MAX_CHANGEMENTS} changements au plus).`);
    return p.transaction(() => {
      const touchees = new Set();
      for (const ch of lot.changements) {
        if (!ch || typeof ch !== 'object') throw new ErreurMetier('invalide', 'Changement mal formé.');
        const c = ch.collection, s = spec(c), cle = cleValide(c, ch.cle), qui = `${LIBELLE[s.table]} ${nomDe(c, ch.apres || ch.avant)}`;
        const courant = lire(c, cle);
        touchees.add(c);
        if (ch.op === 'creer') {
          if (courant) throw new ErreurMetier('conflit', `Cet élément existe déjà : ${qui}.`);
          if (!ch.apres || ch.apres[s.cle] !== cle) throw new ErreurMetier('invalide', `${c} : la clé ne correspond pas à l'objet à créer.`);
          ecrire(() => inserer(c, ch.apres), qui);
        } else if (ch.op === 'modifier' || ch.op === 'supprimer') {
          if (!courant) throw new ErreurMetier('conflit', `Élément introuvable, il a peut-être été supprimé entre-temps : ${qui}.`);
          if (!ch.avant) throw new ErreurMetier('invalide', `${c} : la valeur « avant » est obligatoire pour ${ch.op}.`);
          const { ligne, filles: fl } = versLigne(c, ch.avant);
          if (!isDeepStrictEqual(versObjet(c, ligne, fl), courant)) throw new ErreurMetier('conflit', `${qui} a été modifié entre-temps par quelqu'un d'autre. Rechargez les données, puis recommencez.`);
          if (ch.op === 'supprimer') ecrire(() => p.lancer(`DELETE FROM ${s.table} WHERE ${colonneCle(c)} = ?`, [cle]), qui);
          else { if (!ch.apres || ch.apres[s.cle] !== cle) throw new ErreurMetier('invalide', `${c} : la clé d'un élément ne se modifie pas.`); ecrire(() => modifier(c, cle, ch.apres), qui); }
        } else throw new ErreurMetier('invalide', `Opération inconnue : « ${ch.op} » (attendu : creer, modifier ou supprimer).`);
      }
      ecrire(() => controler(touchees));
      const r = revision() + 1;
      poserMeta('revision', r); poserMeta('maj', Date.now());
      return { revision: r, changements: lot.changements.length };
    });
  }
  /* Remplace toute la base par un document JSON (import, réinitialisation), tout ou rien */
  function remplacerBase(doc) {
    if (!doc || typeof doc !== 'object' || !doc.meta || doc.meta.app !== APP) throw new ErreurMetier('invalide', 'Ce document n\'est pas une base NetCarto.');
    for (const c of ORDRE) if (!Array.isArray(doc[c])) throw new ErreurMetier('invalide', `Section « ${c} » absente ou invalide.`);
    return p.transaction(() => {
      for (const c of [...ORDRE].reverse()) p.lancer(`DELETE FROM ${COLLECTIONS[c].table}`);
      for (const c of ORDRE) {
        // Le journal est fourni du plus récent au plus ancien : on l'écrit dans l'ordre chronologique
        const liste = c === 'history' ? [...doc[c]].reverse() : doc[c];
        liste.forEach((o, i) => ecrire(() => inserer(c, o), `${LIBELLE[COLLECTIONS[c].table]} n° ${i + 1} : ${nomDe(c, o)}`));
      }
      ecrire(() => controler(null));
      const r = revision() + 1;
      poserMeta('revision', r); poserMeta('maj', Date.now()); poserMeta('demo', doc.meta.demo ? 1 : 0); poserMeta('seq', +doc.meta.seq || 0); poserMeta('initialisee', 1);
      return { revision: r };
    });
  }
  /* Première ouverture : la base reçoit le modèle de départ (VLAN usuels, catalogue, stock à zéro), sans aucun site */
  function initialiser(depart) {
    if (meta('initialisee')) return false;
    p.transaction(() => {
      for (const v of depart?.vlans || []) inserer('vlans', v);
      for (const c of depart?.catalog || []) { inserer('catalog', c); inserer('stock', { catalogId: c.id, available: 0, threshold: 0, location: '' }); }
      poserMeta('initialisee', 1); poserMeta('demo', 0); poserMeta('maj', Date.now()); if (!meta('revision')) poserMeta('revision', 0);
    });
    return true;
  }
  return { lire, lister, lireBase, appliquerLot, remplacerBase, initialiser, revision, versionSchema: () => versionSchema, estVide: () => !p.un('SELECT 1 AS x FROM sites LIMIT 1'), sain: () => p.un('SELECT 1 AS ok').ok === 1, fermer: () => p.fermer() };
}
module.exports = { creerDepot };
