/* Services — import CSV d'équipements et de prises murales.
   Le fichier est d'abord analysé en entier : chaque ligne est acceptée ou refusée avec ses motifs.
   L'import n'enregistre que les lignes acceptées, en une seule opération (donc annulable d'un coup). */
import { DEVICE_STATUS, OUTLET_USAGE } from '../config.js';
import { nextId, norm, plural } from '../utils.js';
import { mkDevice } from '../demo.js';
import { Store } from '../store.js';
import { cle, ipValide, normMac, REGLES, valeursPrises } from './doublons.js';
import { freeSlots } from './installation.js';

const MAX_LIGNES = 5000;
/* --- Lecture du texte CSV : séparateur détecté ( ; , ou tabulation), guillemets, retours à la ligne dans les cellules --- */
function lireCsv(texte) {
  const t = String(texte ?? '').replace(/^﻿/, '');
  const premiere = t.split(/\r?\n/, 1)[0] || '';
  const sep = [';', ',', '\t'].map(s => [s, premiere.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const lignes = []; let ligne = [], cell = '', guillemets = false;
  const finCell = () => { ligne.push(cell.trim()); cell = ''; };
  const finLigne = () => { finCell(); if (ligne.some(c => c !== '')) lignes.push(ligne); else lignes.push(null); ligne = []; };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemets) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else guillemets = false; } else cell += c; }
    else if (c === '"' && cell.trim() === '') { cell = ''; guillemets = true; }
    else if (c === sep) finCell();
    else if (c === '\n') finLigne();
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || ligne.length) finLigne();
  return { sep, lignes };
}
/* --- Colonnes reconnues : nom interne → intitulés acceptés (sans accents, sans ponctuation) --- */
const COLONNES = {
  equipements: {
    nom: ['nom', 'hostname', 'nomdhote', 'nomhote', 'equipement'], modele: ['modele', 'model', 'reference', 'ref'],
    batiment: ['batiment', 'bat'], etage: ['etage', 'niveau'], piece: ['piece', 'salle', 'local'], baie: ['baie', 'rack'], u: ['u', 'positionu', 'emplacementu'],
    x: ['x'], y: ['y'], ip: ['ip', 'adresseip'], mac: ['mac', 'adressemac'], serie: ['ndeserie', 'numeroserie', 'numerodeserie', 'serie', 'serial', 'sn'],
    firmware: ['firmware', 'version'], date: ['dateinstallation', 'datedinstallation', 'installele', 'date'], statut: ['statut', 'status', 'etat'], notes: ['notes', 'note', 'commentaire', 'remarque'],
  },
  prises: { repere: ['repere', 'label', 'prise', 'nom'], batiment: ['batiment', 'bat'], etage: ['etage', 'niveau'], piece: ['piece', 'salle', 'local'], x: ['x'], y: ['y'], usage: ['usage', 'type'] },
};
const OBLIGATOIRES = { equipements: ['nom', 'modele'], prises: ['repere', 'piece'] };
const MODELES = {
  equipements: ['nom;modele;batiment;etage;piece;baie;u;x;y;ip;mac;numero_serie;firmware;date_installation;statut;notes',
    'SW-EXEMPLE-01;Catalyst 9200L-24P-4G;;;;BAIE-A2-01;30;;;10.0.0.10;02:00:00:00:00:01;SERIE-EXEMPLE-1;;2026-01-15;En service;Équipement en baie : la colonne baie suffit, u est facultatif',
    'AP-EXEMPLE-01;U6-Pro;A;R+2;Bureaux DSI;;;;;10.0.0.20;;SERIE-EXEMPLE-2;;;;Équipement hors baie : bâtiment, étage et pièce'].join('\r\n'),
  prises: ['repere;batiment;etage;piece;x;y;usage', 'A2-900;A;R+2;Bureaux DSI;;;Données', 'A2-901;A;R+2;Bureaux DSI;25;15;Voix'].join('\r\n'),
};
const intitule = s => norm(s).replace(/[^a-z0-9]/g, '');
const nombre = v => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
function lireDate(v) {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (m) return v;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
/* Trouve une clé d'un dictionnaire { clé: libellé } à partir de la clé ou du libellé saisi */
const parLibelle = (dico, v, lib = x => x) => Object.keys(dico).find(k => k === norm(v) || norm(lib(dico[k])) === norm(v));

/* Pièce désignée par son nom, précisée au besoin par le bâtiment (code ou nom) et l'étage */
function trouverPiece(c) {
  const X = Store.idx;
  let pieces = Store.db.rooms.filter(r => cle(r.name) === cle(c.piece));
  if (!pieces.length) return { erreur: `Pièce introuvable : ${c.piece}` };
  const lieu = r => { const f = X.id.get(r.floorId), b = f && X.id.get(f.buildingId); return { f, b }; };
  if (c.etage) pieces = pieces.filter(r => { const { f } = lieu(r); return f && (cle(f.name) === cle(c.etage) || String(f.level) === c.etage.trim()); });
  if (c.batiment) pieces = pieces.filter(r => { const { b } = lieu(r); return b && (cle(b.code) === cle(c.batiment) || cle(b.name) === cle(c.batiment)); });
  if (!pieces.length) return { erreur: `Pièce introuvable : ${c.piece} (bâtiment ${c.batiment || '?'}, étage ${c.etage || '?'})` };
  if (pieces.length > 1) return { erreur: `Plusieurs pièces s'appellent ${c.piece} : précisez le bâtiment et l'étage` };
  return { piece: pieces[0] };
}
function position(c, piece, err) {
  if (c.x === '' && c.y === '') return null;
  const x = nombre(c.x), y = nombre(c.y);
  if (Number.isNaN(x) || Number.isNaN(y)) { err.push('Position X et Y : deux nombres attendus (en mètres)'); return null; }
  if (!(x >= piece.x && x <= piece.x + piece.w && y >= piece.y && y <= piece.y + piece.h)) { err.push(`Position hors de la pièce ${piece.name} (X de ${piece.x} à ${piece.x + piece.w}, Y de ${piece.y} à ${piece.y + piece.h})`); return null; }
  return { x, y };
}
/* Unicité d'une valeur : contre la base, puis contre les lignes précédentes du fichier */
function unique(champ, valeur, ctx, n, err) {
  const f = REGLES[champ][3], v = f(valeur);
  if (!v) return;
  if (ctx.base[champ].has(v)) err.push(`${REGLES[champ][2]} : ${valeur}`);
  else if (ctx.fichier[champ].has(v)) err.push(`${valeur} en double dans le fichier (déjà à la ligne ${ctx.fichier[champ].get(v)})`);
  else ctx.vus.push([champ, v, n]);
}

/* --- Analyse d'une ligne d'équipement --- */
function ligneEquipement(c, n, ctx) {
  const err = [], d = { hostname: c.nom, ip: c.ip, serial: c.serie, firmware: c.firmware || undefined, notes: c.notes };
  if (!c.nom) err.push('Nom obligatoire'); else unique('hostname', c.nom, ctx, n, err);
  const m = cle(c.modele), cat = m && Store.db.catalog.find(k => [k.model, `${k.brand} ${k.model}`, k.ref, k.id].some(v => cle(v) === m));
  if (!c.modele) err.push('Modèle obligatoire');
  else if (!cat) err.push(`Modèle introuvable dans le catalogue : ${c.modele}`);
  else if (cat.category === 'rack' || cat.template === 'outlet' || cat.mount === 'none') err.push(`${c.modele} n'est pas un équipement (baie, prise ou consommable)`);
  if (c.ip) { if (!ipValide(c.ip)) err.push(`Adresse IP invalide : ${c.ip}`); else unique('ip', c.ip, ctx, n, err); }
  if (c.mac) { d.mac = normMac(c.mac); if (!d.mac) err.push(`Adresse MAC invalide : ${c.mac}`); else unique('mac', d.mac, ctx, n, err); }
  if (c.statut) { d.status = parLibelle(DEVICE_STATUS, c.statut, s => s.label); if (!d.status || d.status === 'retired') err.push(`Statut inconnu : ${c.statut}`); }
  if (c.date) { d.installDate = lireDate(c.date); if (!d.installDate) err.push(`Date invalide : ${c.date} (attendu AAAA-MM-JJ ou JJ/MM/AAAA)`); }
  let reserve = null;
  if (cat && !err.some(e => /Modèle|équipement \(/.test(e))) {
    if (cat.mount === 'rack') {
      const baie = c.baie && Store.db.racks.find(r => cle(r.name) === cle(c.baie)), hU = cat.heightU || 1;
      if (!c.baie) err.push('Baie obligatoire pour ce modèle');
      else if (!baie) err.push(`Baie introuvable : ${c.baie}`);
      else {
        const pris = ctx.u.get(baie.id) || new Set();
        const libres = freeSlots(baie.id, hU).filter(u => { for (let k = u; k < u + hU; k++) if (pris.has(k)) return false; return true; });
        const u = c.u === '' ? libres[0] : nombre(String(c.u).replace(/^u/i, ''));
        if (!libres.length) err.push(`Aucun emplacement libre dans ${baie.name} (${hU} U nécessaires)`);
        else if (!libres.includes(u)) err.push(`Emplacement U${c.u} indisponible dans ${baie.name} (${hU} U nécessaires)`);
        else { Object.assign(d, { rackId: baie.id, u }); reserve = { baie: baie.id, u, hU }; }
      }
    } else if (!c.piece) err.push('Pièce obligatoire pour ce modèle');
    else {
      const { piece, erreur } = trouverPiece(c);
      if (erreur) err.push(erreur);
      else { const p = position(c, piece, err) || { x: +(piece.x + piece.w / 2).toFixed(2), y: +(piece.y + piece.h / 2).toFixed(2) }; Object.assign(d, { roomId: piece.id, ...p }); }
    }
  }
  if (!err.length && reserve) { const s = ctx.u.get(reserve.baie) || new Set(); for (let k = reserve.u; k < reserve.u + reserve.hU; k++) s.add(k); ctx.u.set(reserve.baie, s); }
  return { libelle: c.nom || '(sans nom)', erreurs: err, donnees: { cat, d } };
}
/* --- Analyse d'une ligne de prise murale --- */
function lignePrise(c, n, ctx) {
  const err = [], d = { label: c.repere, usage: 'data' };
  if (!c.repere) err.push('Repère obligatoire'); else unique('label', c.repere, ctx, n, err);
  if (c.usage) { d.usage = parLibelle(OUTLET_USAGE, c.usage); if (!d.usage) err.push(`Usage inconnu : ${c.usage} (${Object.values(OUTLET_USAGE).join(', ')})`); }
  if (!c.piece) err.push('Pièce obligatoire');
  else {
    const { piece, erreur } = trouverPiece(c);
    if (erreur) err.push(erreur);
    else {
      let p = position(c, piece, err);
      if (!p && !err.length) { // sans position : les prises sont réparties le long du mur du haut de la pièce
        const k = ctx.rang.get(piece.id) || 0; ctx.rang.set(piece.id, k + 1);
        p = { x: +(piece.x + 0.5 + (k * 0.6) % Math.max(0.6, piece.w - 1)).toFixed(2), y: +(piece.y + 0.25).toFixed(2) };
      }
      Object.assign(d, { roomId: piece.id, ...p });
    }
  }
  return { libelle: c.repere || '(sans repère)', erreurs: err, donnees: { d } };
}
/* Analyse un fichier. type : « equipements » ou « prises ». Rien n'est modifié. */
function analyserCsv(texte, type) {
  const cols = COLONNES[type], { lignes } = lireCsv(texte), out = { type, lignes: [], ignorees: [], erreur: '' };
  const tete = lignes.find(Boolean);
  if (!tete) { out.erreur = 'Le fichier est vide.'; return out; }
  const index = {};
  tete.forEach((t, i) => { const k = Object.keys(cols).find(c => cols[c].includes(intitule(t))); if (k && index[k] === undefined) index[k] = i; else if (t) out.ignorees.push(t); });
  const manque = OBLIGATOIRES[type].filter(k => index[k] === undefined);
  if (manque.length) { out.erreur = `Colonne${manque.length > 1 ? 's' : ''} obligatoire${manque.length > 1 ? 's' : ''} absente${manque.length > 1 ? 's' : ''} : ${manque.join(', ')}. Téléchargez le modèle de fichier pour voir les colonnes attendues.`; return out; }
  const corps = lignes.slice(lignes.indexOf(tete) + 1);
  if (corps.filter(Boolean).length > MAX_LIGNES) { out.erreur = `Fichier trop long : ${MAX_LIGNES} lignes au plus par import.`; return out; }
  const ctx = { base: valeursPrises(), fichier: Object.fromEntries(Object.keys(REGLES).map(k => [k, new Map()])), u: new Map(), rang: new Map(), vus: [] };
  corps.forEach((l, i) => {
    if (!l) return;
    const n = lignes.indexOf(tete) + i + 2, c = Object.fromEntries(Object.keys(cols).map(k => [k, index[k] === undefined ? '' : (l[index[k]] ?? '')]));
    ctx.vus = [];
    const r = type === 'prises' ? lignePrise(c, n, ctx) : ligneEquipement(c, n, ctx);
    // Seules les lignes acceptées réservent leurs valeurs : une ligne refusée ne bloque pas la suivante
    if (!r.erreurs.length) for (const [champ, v, num] of ctx.vus) ctx.fichier[champ].set(v, num);
    out.lignes.push({ n, ok: !r.erreurs.length, ...r });
  });
  if (!out.lignes.length) out.erreur = 'Le fichier ne contient aucune ligne de données.';
  return out;
}
/* Enregistre les lignes acceptées d'une analyse, en une seule opération. Le stock n'est pas modifié :
   l'import décrit du matériel déjà en place. Renvoie le nombre d'objets créés. */
function importerCsv(analyse) {
  const ok = analyse.lignes.filter(l => l.ok);
  if (!ok.length) throw new Error('Aucune ligne à importer.');
  const prises = analyse.type === 'prises';
  Store.commit('import', `Import CSV : ${prises ? plural(ok.length, 'prise') : plural(ok.length, 'équipement')}`, db => {
    for (const { donnees: { cat, d } } of ok) {
      if (prises) db.outlets.push({ id: nextId(db, 'o'), roomId: d.roomId, label: d.label, x: d.x, y: d.y, usage: d.usage });
      else mkDevice(db, cat, d);
    }
  });
  return ok.length;
}

export { analyserCsv, importerCsv, lireCsv, MODELES };
