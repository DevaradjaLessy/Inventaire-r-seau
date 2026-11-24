/* Sauvegardes de la base : copies complètes et cohérentes, faites pendant que le serveur tourne.
   Un fichier par sauvegarde : netcarto-AAAA-MM-JJ_HHMMSS-motif.sqlite
   Motifs : auto (planifiée), manuelle, avant-migration-NNN, avant-restauration.
   Seules les sauvegardes « auto » sont purgées d'office ; les autres restent jusqu'à ce qu'un administrateur les supprime. */
'use strict';
const fs = require('fs'), path = require('path');
const { ErreurMetier } = require('./erreurs');

const NOM = /^netcarto-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})-([a-z0-9-]+)\.sqlite$/;
const deux = n => String(n).padStart(2, '0');
const horodatage = d => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}_${deux(d.getHours())}${deux(d.getMinutes())}${deux(d.getSeconds())}`;

/* Liste des sauvegardes d'un dossier, de la plus récente à la plus ancienne */
function listerDossier(dossier) {
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier).map(nom => {
    const m = NOM.exec(nom);
    if (!m) return null;
    let taille = 0; try { taille = fs.statSync(path.join(dossier, nom)).size; } catch { return null; }
    return { nom, date: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(), taille, motif: m[7].replace(/-\d+$/, x => (/^-\d{3}$/.test(x) ? x : '')) };
  }).filter(Boolean).sort((a, b) => b.date - a.date || b.nom.localeCompare(a.nom));
}
/* Chemin d'une sauvegarde désignée par son nom : jamais un chemin fourni par l'appelant */
function cheminDans(dossier, nom) {
  if (typeof nom !== 'string' || !NOM.test(nom) || !fs.existsSync(path.join(dossier, nom))) throw new ErreurMetier('introuvable', 'Sauvegarde introuvable.');
  return path.join(dossier, nom);
}

/* options : { pilote, controler, dossier, reglages: { actif, heure, conserver }, horloge } */
function creerSauvegardes({ pilote, controler, dossier, reglages, horloge = () => Date.now() }) {
  let depot = null, lireSauvegarde = null;
  /* Copie la base en service dans un nouveau fichier, puis vérifie la copie */
  function creer(motif = 'manuelle') {
    fs.mkdirSync(dossier, { recursive: true, mode: 0o700 });
    const base = `netcarto-${horodatage(new Date(horloge()))}-${motif}`;
    let nom = `${base}.sqlite`;
    for (let i = 2; fs.existsSync(path.join(dossier, nom)); i++) nom = `${base}-${i}.sqlite`;
    const fichier = path.join(dossier, nom);
    pilote.sauvegarder(fichier);
    const etat = controler(fichier);
    if (!etat.ok) { fs.rmSync(fichier, { force: true }); throw new Error(`Sauvegarde abandonnée : la copie n'est pas lisible (${etat.erreur}).`); }
    try { fs.chmodSync(fichier, 0o600); } catch { /* droits non gérés sur ce système */ }
    return listerDossier(dossier).find(s => s.nom === nom);
  }
  const lister = () => listerDossier(dossier);
  const chemin = nom => cheminDans(dossier, nom);
  function supprimer(nom) { fs.rmSync(chemin(nom)); return { ok: true }; }
  /* Ne garde que les sauvegardes automatiques les plus récentes */
  function purger() {
    const autos = lister().filter(s => s.motif === 'auto');
    for (const s of autos.slice(reglages.conserver)) fs.rmSync(path.join(dossier, s.nom), { force: true });
  }
  /* Planification : fait la sauvegarde du jour si l'heure est passée et qu'elle n'existe pas encore.
     Un serveur resté arrêté rattrape donc à son retour. Renvoie la sauvegarde créée, ou null. */
  function echeance() {
    if (!reglages.actif) return null;
    const [h, m] = reglages.heure.split(':').map(Number), t = horloge(), due = new Date(t);
    due.setHours(h, m, 0, 0);
    if (due.getTime() > t) due.setDate(due.getDate() - 1);
    const derniere = lister().find(s => s.motif === 'auto');
    if (derniere && derniere.date >= due.getTime()) return null;
    const s = creer('auto');
    purger();
    return s;
  }
  /* Restauration à chaud : les données d'inventaire de la sauvegarde remplacent celles en service, en une transaction.
     Les comptes, les sessions et le journal d'audit en service sont gardés. L'état d'avant est sauvegardé. */
  function restaurer(nom, ctx = null) {
    const fichier = chemin(nom), etat = controler(fichier);
    if (!etat.ok) throw new ErreurMetier('regle', `Sauvegarde illisible ou abîmée : elle ne peut pas être restaurée (${etat.erreur}).`);
    const doc = lireSauvegarde(fichier);
    const avant = creer('avant-restauration');
    const r = depot.remplacerBase(doc, ctx, { action: 'restauration', libelle: `Restauration de la sauvegarde ${nom}` });
    return { ...r, avant: avant.nom };
  }
  return { creer, lister, chemin, supprimer, purger, echeance, restaurer, dossier, reglages: () => ({ actif: reglages.actif, heure: reglages.heure, conserver: reglages.conserver }),
    attacher(d, lire) { depot = d; lireSauvegarde = lire; } };
}
module.exports = { creerSauvegardes, listerDossier, cheminDans, NOM };
