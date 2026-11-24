/* Couche d'accès aux données : point d'entrée. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { ouvrir, controler, annexes } = require('./pilote-sqlite');
const { migrer } = require('./migrations');
const { creerDepot } = require('./depot');
const { ErreurMetier } = require('./erreurs');
const { RESSOURCES, COLLECTIONS } = require('./schema');
const { creerSauvegardes, listerDossier, cheminDans } = require('./sauvegardes');

const REGLAGES_SAUVEGARDES = { actif: true, heure: '02:30', conserver: 14, dossier: '' };
const dossierSauvegardes = (fichier, reglages) => reglages.dossier || path.join(path.dirname(fichier), 'sauvegardes');
const sansAnnexes = fichier => { for (const f of annexes(fichier)) fs.rmSync(f, { force: true }); };

/* Lit une sauvegarde comme un document JSON, sans toucher au fichier d'origine :
   une copie de travail est ouverte, mise au niveau du schéma actuel, lue, puis supprimée. */
function lireSauvegarde(fichier, dossierTravail) {
  const copie = path.join(dossierTravail, `lecture-${crypto.randomBytes(6).toString('hex')}.sqlite`);
  fs.copyFileSync(fichier, copie);
  let pilote = null;
  try {
    pilote = ouvrir(copie);
    const { version } = migrer(pilote);
    return creerDepot(pilote, version).lireBase();
  } finally { try { pilote?.fermer(); } catch { /* déjà fermée */ } fs.rmSync(copie, { force: true }); sansAnnexes(copie); }
}

/* Ouvre (ou crée) la base, applique les migrations manquantes, puis pose le modèle de départ si la base est neuve.
   Une base existante est sauvegardée juste avant sa première migration en attente.
   options : { fichier, depart: { vlans, catalog }, sauvegardes: { actif, heure, conserver, dossier }, horloge } */
function ouvrirBase({ fichier, depart = null, sauvegardes = null, horloge = () => Date.now() }) {
  const pilote = ouvrir(fichier);
  try {
    const reglages = { ...REGLAGES_SAUVEGARDES, ...sauvegardes };
    const sv = fichier === ':memory:' ? null : creerSauvegardes({ pilote, controler, dossier: dossierSauvegardes(fichier, reglages), reglages, horloge });
    let sauvee = false;
    const { version } = migrer(pilote, { avant: v => { if (sv && !sauvee) { sauvee = true; sv.creer(`avant-migration-${String(v).padStart(3, '0')}`); } } });
    const depot = creerDepot(pilote, version);
    depot.initialiser(depart);
    if (sv) sv.attacher(depot, f => lireSauvegarde(f, path.dirname(fichier)));
    depot.sauvegardes = sv;
    return depot;
  } catch (e) { pilote.fermer(); throw e; }
}

/* Restauration complète, serveur arrêté : le fichier de la base est remplacé par la sauvegarde (comptes et journal d'audit compris).
   source : nom d'une sauvegarde du dossier, ou chemin d'un fichier. L'état d'avant est gardé dans le dossier des sauvegardes.
   Renvoie { source, avant, version, revision }. */
function restaurerFichier({ fichier, source, sauvegardes = null, horloge = () => Date.now() }) {
  const reglages = { ...REGLAGES_SAUVEGARDES, ...sauvegardes }, dossier = dossierSauvegardes(fichier, reglages);
  let origine;
  try { origine = cheminDans(dossier, source); } catch { origine = path.resolve(String(source)); }
  if (!fs.existsSync(origine) || !fs.statSync(origine).isFile()) throw new Error(`Sauvegarde introuvable : ${source}`);
  const etat = controler(origine);
  if (!etat.ok) throw new Error(`Sauvegarde illisible ou abîmée : rien n'a été modifié (${etat.erreur}).`);
  // L'état actuel est mis de côté : copie propre si la base se lit encore, copie brute du fichier sinon
  let avant = null;
  if (fs.existsSync(fichier)) {
    let pilote = null;
    try { pilote = ouvrir(fichier); avant = creerSauvegardes({ pilote, controler, dossier, reglages, horloge }).creer('avant-restauration').nom; }
    catch { fs.mkdirSync(dossier, { recursive: true }); avant = `base-abimee-${Date.now()}.sqlite`; fs.copyFileSync(fichier, path.join(dossier, avant)); }
    finally { try { pilote?.fermer(); } catch { /* déjà fermée */ } }
  }
  // Remplacement : la copie est écrite à côté, puis renommée d'un coup à la place de la base
  const provisoire = fichier + '.restauration';
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.copyFileSync(origine, provisoire);
  sansAnnexes(fichier);
  fs.renameSync(provisoire, fichier);
  // Ouverture de contrôle : applique les migrations si la sauvegarde date d'une version plus ancienne
  const depot = ouvrirBase({ fichier, sauvegardes: reglages, horloge });
  try { return { source: origine, avant, version: depot.versionSchema(), revision: depot.revision() }; } finally { depot.fermer(); }
}
module.exports = { ouvrirBase, restaurerFichier, listerDossier, dossierSauvegardes, REGLAGES_SAUVEGARDES, ErreurMetier, RESSOURCES, COLLECTIONS };
