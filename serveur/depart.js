/* Modèle de départ d'une base neuve : VLAN usuels et catalogue par défaut.
   Ils viennent des modules de l'interface, pour n'avoir qu'une seule définition. */
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

async function charger(racineWeb, fichier) { return import(pathToFileURL(path.join(racineWeb, 'js', fichier)).href); }
async function modeleDeDepart(racineWeb) {
  const [{ VLANS_DEF }, { defaultCatalog }] = await Promise.all([charger(racineWeb, 'config.js'), charger(racineWeb, 'catalogue.js')]);
  return JSON.parse(JSON.stringify({ vlans: VLANS_DEF, catalog: defaultCatalog() }));
}
/* Jeu de démonstration fictif (le même que celui de la page publique) */
async function jeuDeDemonstration(racineWeb) { return JSON.parse(JSON.stringify((await charger(racineWeb, 'demo.js')).buildDemo())); }
module.exports = { modeleDeDepart, jeuDeDemonstration };
