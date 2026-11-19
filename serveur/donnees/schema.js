/* Correspondance entre le modèle JSON de NetCarto (celui de l'interface et des exports) et les tables.
   Pour chaque collection : la table, la clé, et la liste des champs [propriété JSON, colonne, type].
   Types : id, ref (identifiant d'un autre objet), ref? (ou vide), txt, txt! (non vide), num, num?, int, int?,
   bool, json. Un type suivi de « ~ » est facultatif : la propriété est absente du JSON quand la colonne est vide.
   Une propriété « a.b » désigne un objet imbriqué. */
'use strict';
const { ErreurMetier } = require('./erreurs');

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const COLLECTIONS = {
  vlans:     { table: 'vlans', cle: 'id', ordre: 'id', champs: [['id', 'id', 'int'], ['name', 'nom', 'txt!'], ['color', 'couleur', 'txt'], ['subnet', 'sous_reseau', 'txt']] },
  sites:     { table: 'sites', cle: 'id', champs: [['id', 'id', 'id'], ['name', 'nom', 'txt!'], ['code', 'code', 'txt'], ['address', 'adresse', 'txt']] },
  buildings: { table: 'batiments', cle: 'id', champs: [['id', 'id', 'id'], ['siteId', 'site_id', 'ref'], ['code', 'code', 'txt!'], ['name', 'nom', 'txt!']] },
  floors:    { table: 'etages', cle: 'id', champs: [['id', 'id', 'id'], ['buildingId', 'batiment_id', 'ref'], ['level', 'niveau', 'int'], ['name', 'nom', 'txt!'], ['width', 'largeur', 'num'], ['height', 'profondeur', 'num'], ['planImage', 'image_plan', 'txt']] },
  rooms:     { table: 'pieces', cle: 'id', champs: [['id', 'id', 'id'], ['floorId', 'etage_id', 'ref'], ['name', 'nom', 'txt!'], ['type', 'type', 'txt!'], ['x', 'x', 'num'], ['y', 'y', 'num'], ['w', 'largeur', 'num'], ['h', 'profondeur', 'num']] },
  catalog:   { table: 'catalogue', cle: 'id', enfants: 'ports', champs: [['id', 'id', 'id'], ['category', 'categorie', 'txt!'], ['brand', 'marque', 'txt'], ['model', 'modele', 'txt!'], ['ref', 'reference', 'txt'], ['template', 'gabarit', 'txt!'], ['mount', 'montage', 'txt!'], ['heightU', 'hauteur_u', 'int'], ['layer', 'niveau', 'txt?'],
               ['poeBudgetW', 'budget_poe_w', 'num'], ['poeDrawW', 'conso_poe_w', 'num'], ['powerW', 'puissance_w', 'num'], ['firmware', 'firmware', 'txt'], ['specs', 'caracteristiques', 'json'],
               ['visual.color', 'couleur', 'txt'], ['visual.accent', 'accent', 'txt'], ['visual.logo', 'logo', 'txt'], ['visual.frontImage', 'image_facade', 'txt'], ['visual.width', 'largeur_m', 'num~'], ['visual.depth', 'profondeur_m', 'num~'], ['description', 'description', 'txt']] },
  stock:     { table: 'stock', cle: 'catalogId', champs: [['catalogId', 'catalogue_id', 'id'], ['available', 'disponible', 'int'], ['threshold', 'seuil', 'int'], ['location', 'lieu', 'txt']] },
  racks:     { table: 'baies', cle: 'id', champs: [['id', 'id', 'id'], ['roomId', 'piece_id', 'ref'], ['catalogId', 'catalogue_id', 'ref'], ['name', 'nom', 'txt!'], ['heightU', 'hauteur_u', 'int'], ['x', 'x', 'num'], ['y', 'y', 'num'], ['serial', 'serie', 'txt'], ['installDate', 'date_installation', 'txt'], ['status', 'statut', 'txt!']] },
  devices:   { table: 'equipements', cle: 'id', champs: [['id', 'id', 'id'], ['catalogId', 'catalogue_id', 'ref'], ['hostname', 'nom_hote', 'txt!'], ['rackId', 'baie_id', 'ref?'], ['u', 'u', 'int?'], ['roomId', 'piece_id', 'ref?'], ['x', 'x', 'num?'], ['y', 'y', 'num?'], ['serial', 'serie', 'txt'], ['ip', 'ip', 'txt'], ['mac', 'mac', 'txt'],
               ['firmware', 'firmware', 'txt'], ['installDate', 'date_installation', 'txt'], ['status', 'statut', 'txt!'], ['layer', 'niveau', 'txt~'], ['notes', 'notes', 'txt']] },
  ports:     { table: 'ports', cle: 'id', ordre: 'rowid', champs: [['id', 'id', 'id'], ['deviceId', 'equipement_id', 'ref'], ['idx', 'idx', 'int'], ['name', 'nom', 'txt!'], ['kind', 'type', 'txt!'], ['role', 'role', 'txt!'], ['speed', 'debit', 'num'], ['status', 'etat', 'txt!'], ['vlan', 'vlan', 'int?'],
               ['poe.capable', 'poe_possible', 'bool'], ['poe.watts', 'poe_watts', 'num'], ['mac', 'mac', 'txt'], ['connected', 'connecte', 'txt'], ['description', 'description', 'txt']] },
  outlets:   { table: 'prises', cle: 'id', champs: [['id', 'id', 'id'], ['roomId', 'piece_id', 'ref'], ['label', 'repere', 'txt!'], ['x', 'x', 'num'], ['y', 'y', 'num'], ['usage', 'usage', 'txt!']] },
  cables:    { table: 'cables', cle: 'id', extremites: true, champs: [['id', 'id', 'id'], ['type', 'type', 'txt!'], ['length', 'longueur', 'num'], ['color', 'couleur', 'txt'], ['label', 'libelle', 'txt']] },
  history:   { table: 'journal', cle: 'id', ordre: 'date DESC, rowid DESC', champs: [['id', 'id', 'id'], ['ts', 'date', 'int'], ['type', 'type', 'txt!'], ['text', 'texte', 'txt'], ['ref', 'ref', 'ref?']] },
};
/* Ordre d'écriture qui respecte les dépendances (utile pour un remplacement complet) */
const ORDRE = ['vlans', 'sites', 'buildings', 'floors', 'rooms', 'catalog', 'stock', 'racks', 'devices', 'ports', 'outlets', 'cables', 'history'];
/* Groupes de ports d'un modèle du catalogue (table fille) */
const GROUPE = [['kind', 'type', 'txt!'], ['count', 'nombre', 'int'], ['speed', 'debit', 'num'], ['poe', 'poe', 'bool'], ['role', 'role', 'txt!'], ['prefix', 'prefixe', 'txt'], ['start', 'debut', 'int'], ['names', 'noms', 'json~']];
/* Nom des ressources dans les adresses de l'API */
const RESSOURCES = { sites: 'sites', batiments: 'buildings', etages: 'floors', pieces: 'rooms', baies: 'racks', equipements: 'devices', ports: 'ports', prises: 'outlets', cables: 'cables', catalogue: 'catalog', stock: 'stock', vlans: 'vlans', journal: 'history' };

const lire = (o, chemin) => chemin.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
function ecrire(o, chemin, v) { const ks = chemin.split('.'); let x = o; for (const k of ks.slice(0, -1)) x = x[k] || (x[k] = {}); x[ks.at(-1)] = v; }
const refus = (ou, prop, quoi) => new ErreurMetier('invalide', `${ou} : ${quoi} pour « ${prop} ».`);

/* Contrôle et convertit une valeur JSON vers sa valeur de colonne */
function versColonne(v, type, prop, ou) {
  const facultatif = type.endsWith('~'), t = facultatif ? type.slice(0, -1) : type;
  if (facultatif && v === undefined) return null;
  const vide = v === null || v === undefined;
  switch (t) {
    case 'id': if (typeof v !== 'string' || !ID.test(v)) throw refus(ou, prop, 'identifiant invalide (lettres, chiffres, tirets ; 64 caractères au plus)'); return v;
    case 'ref': if (typeof v !== 'string' || !ID.test(v)) throw refus(ou, prop, 'référence manquante ou invalide'); return v;
    case 'ref?': if (vide || v === '') return null; if (typeof v !== 'string' || !ID.test(v)) throw refus(ou, prop, 'référence invalide'); return v;
    case 'txt': if (typeof v !== 'string') throw refus(ou, prop, 'texte attendu'); return v;
    case 'txt!': if (typeof v !== 'string' || !v.trim()) throw refus(ou, prop, 'valeur manquante'); return v;
    case 'txt?': if (vide) return null; if (typeof v !== 'string') throw refus(ou, prop, 'texte attendu'); return v;
    case 'num': if (typeof v !== 'number' || !Number.isFinite(v)) throw refus(ou, prop, 'nombre attendu'); return v;
    case 'num?': if (vide) return null; if (typeof v !== 'number' || !Number.isFinite(v)) throw refus(ou, prop, 'nombre attendu'); return v;
    case 'int': if (!Number.isInteger(v)) throw refus(ou, prop, 'nombre entier attendu'); return v;
    case 'int?': if (vide) return null; if (!Number.isInteger(v)) throw refus(ou, prop, 'nombre entier attendu'); return v;
    case 'bool': if (typeof v !== 'boolean') throw refus(ou, prop, 'vrai ou faux attendu'); return v ? 1 : 0;
    case 'json': if (vide || typeof v !== 'object') throw refus(ou, prop, 'objet attendu'); return JSON.stringify(v);
    default: throw new Error('type de champ inconnu : ' + type);
  }
}
function versValeur(c, type) {
  const facultatif = type.endsWith('~'), t = facultatif ? type.slice(0, -1) : type;
  if (facultatif && c === null) return undefined;
  if (t === 'bool') return !!c;
  if (t === 'json') return c === null ? null : JSON.parse(c);
  return c;
}
/* Refuse toute propriété inconnue : sans cela, elle serait perdue en silence à l'enregistrement */
function sansInconnues(o, champs, ou, extra = []) {
  const connus = new Set(extra);
  for (const [prop] of champs) { connus.add(prop.split('.')[0]); }
  for (const k of Object.keys(o)) if (!connus.has(k)) throw new ErreurMetier('invalide', `${ou} : propriété inconnue « ${k} ».`);
  for (const [prop] of champs) if (prop.includes('.')) { const [parent, enfant] = prop.split('.'); void enfant; const sous = o[parent]; if (sous == null || typeof sous !== 'object') throw refus(ou, parent, 'objet attendu'); const permis = new Set(champs.filter(([p]) => p.startsWith(parent + '.')).map(([p]) => p.split('.')[1])); for (const k of Object.keys(sous)) if (!permis.has(k)) throw new ErreurMetier('invalide', `${ou} : propriété inconnue « ${parent}.${k} ».`); }
}
/* Extrémité d'un câble : l'identifiant d'un port (p-…) ou d'une prise (o-…) */
function extremite(v, prop, ou) {
  if (typeof v !== 'string' || !ID.test(v)) throw refus(ou, prop, 'extrémité manquante ou invalide');
  if (v.startsWith('p-')) return { port: v, prise: null };
  if (v.startsWith('o-')) return { port: null, prise: v };
  throw refus(ou, prop, 'extrémité qui n\'est ni un port ni une prise');
}
/* Objet JSON → ligne de table (et lignes filles éventuelles) */
function versLigne(collection, o) {
  const spec = COLLECTIONS[collection], ou = collection;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new ErreurMetier('invalide', `${ou} : objet attendu.`);
  sansInconnues(o, spec.champs, ou, [...(spec.extremites ? ['a', 'b'] : []), ...(spec.enfants ? [spec.enfants] : [])]);
  const ligne = {};
  for (const [prop, col, type] of spec.champs) ligne[col] = versColonne(lire(o, prop), type, prop, ou);
  if (spec.extremites) { const a = extremite(o.a, 'a', ou), b = extremite(o.b, 'b', ou); Object.assign(ligne, { a_port_id: a.port, a_prise_id: a.prise, b_port_id: b.port, b_prise_id: b.prise }); }
  let filles = null;
  if (spec.enfants) {
    if (!Array.isArray(o[spec.enfants])) throw refus(ou, spec.enfants, 'liste attendue');
    filles = o[spec.enfants].map((g, i) => { const w = `${ou}.${spec.enfants}[${i}]`; if (!g || typeof g !== 'object') throw new ErreurMetier('invalide', `${w} : objet attendu.`); sansInconnues(g, GROUPE, w); const l = { ordre: i }; for (const [prop, col, type] of GROUPE) l[col] = versColonne(g[prop], type, prop, w); return l; });
  }
  return { ligne, filles };
}
/* Ligne de table → objet JSON */
function versObjet(collection, ligne, filles = null) {
  const spec = COLLECTIONS[collection], o = {};
  for (const [prop, col, type] of spec.champs) { const v = versValeur(ligne[col], type); if (v !== undefined) ecrire(o, prop, v); }
  if (spec.extremites) { o.a = ligne.a_port_id || ligne.a_prise_id; o.b = ligne.b_port_id || ligne.b_prise_id; }
  if (spec.enfants) o[spec.enfants] = (filles || []).map(l => { const g = {}; for (const [prop, col, type] of GROUPE) { const v = versValeur(l[col], type); if (v !== undefined) g[prop] = v; } return g; });
  return o;
}
const colonnes = collection => { const s = COLLECTIONS[collection]; return [...s.champs.map(c => c[1]), ...(s.extremites ? ['a_port_id', 'a_prise_id', 'b_port_id', 'b_prise_id'] : [])]; };
const colonneCle = collection => { const s = COLLECTIONS[collection]; return s.champs.find(c => c[0] === s.cle)[1]; };

module.exports = { COLLECTIONS, ORDRE, GROUPE, RESSOURCES, ID, versLigne, versObjet, colonnes, colonneCle };
