/* Couche d'accès aux données : point d'entrée. */
'use strict';
const { ouvrir } = require('./pilote-sqlite');
const { migrer } = require('./migrations');
const { creerDepot } = require('./depot');
const { ErreurMetier } = require('./erreurs');
const { RESSOURCES, COLLECTIONS } = require('./schema');

/* Ouvre (ou crée) la base, applique les migrations manquantes, puis pose le modèle de départ si la base est neuve.
   options : { fichier, depart: { vlans, catalog } } */
function ouvrirBase({ fichier, depart = null }) {
  const pilote = ouvrir(fichier);
  try {
    const { version } = migrer(pilote);
    const depot = creerDepot(pilote, version);
    depot.initialiser(depart);
    return depot;
  } catch (e) { pilote.fermer(); throw e; }
}
module.exports = { ouvrirBase, ErreurMetier, RESSOURCES, COLLECTIONS };
