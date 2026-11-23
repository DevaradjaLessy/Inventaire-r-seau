/* Point d'entrée : charge tous les modules puis démarre l'application. */
import { Store } from './store.js';
import { Sync } from './sync.js';
import { topology } from './services/topologie.js';
import { trace } from './services/tracage.js';
import { connect, disconnect } from './services/connexion.js';
import { installFromStock, removeDevice } from './services/installation.js';
import { showTab, UI, Views } from './ui/socle.js';
import { Carto, select, Views3D } from './ui/carto/carto.js';
import './config.js';
import './utils.js';
import './icones.js';
import './catalogue.js';
import './demo.js';
import './services/requetes.js';
import './services/cablage.js';
import './services/recherche.js';
import './3d/three.js';
import './3d/facades.js';
import './3d/viewer.js';
import './3d/objets.js';
import './ui/carto/plan.js';
import './ui/carto/fiches.js';
import './ui/carto/baie.js';
import './ui/carto/tracage.js';
import './ui/carto/connexion.js';
import './ui/carto/topologie.js';
import './ui/carto/structure.js';
import './ui/inventaire.js';
import './ui/import-csv.js';
import './ui/sauvegardes.js';
import './ui/copies.js';
import './ui/impression.js';
import './ui/export-image.js';
import './ui/historique.js';
import './ui/clavier.js';
import './ui/interventions.js';
import './ui/administration.js';
import { impactOf } from './services/impact.js';
import { planAdressage } from './services/adressage.js';
import { ageDuParc } from './services/cycle-de-vie.js';
import './ui/recherche.js';
import './ui/materiel/catalogue.js';
import './ui/materiel/installation.js';
import './ui/materiel/palette.js';
import './ui/materiel/modele.js';
import { chargerSecurite } from './ui/tableau-de-bord.js';
import './ui/sources.js';
import './ui/synthese.js';
import './ui/dossier.js';
import { ouvrirSession } from './ui/compte.js';
import { Live } from './services/mesures.js';
import { addRoom, deleteStructure, deleteVlan } from './services/structure.js';

// Mode serveur si la page est servie par le serveur NetCarto (il y inscrit l'adresse de son API) ; sinon démonstration locale
const api = document.querySelector('meta[name="netcarto-api"]')?.content;
try {
  if (api) { Sync.api = api; await ouvrirSession(); await Store.initServeur(api); }
  else await Store.init();
}
catch (e) {
  document.querySelector('main').innerHTML = `<div class="boot-error"><h2>Base inaccessible</h2><p class="muted">${String(e.message).replace(/[<>&]/g, '')}</p><p><button class="btn pri" id="boot-retry">Réessayer</button></p></div>`;
  // Pas de gestionnaire écrit dans le HTML : la politique de sécurité du contenu le bloquerait
  document.querySelector('#boot-retry').addEventListener('click', () => location.reload());
  throw e;
}
if (api && /^\/admin\/?$/.test(location.pathname)) UI.tab = 'admin';   // adresse de la page d'administration
showTab(UI.tab);
// Administrateur : l'état de sécurité du serveur alimente les alertes, puis se rafraîchit toutes les cinq minutes
if (api) { const securite = () => chargerSecurite().catch(() => { /* serveur injoignable : l'étiquette d'état le dit déjà */ }); securite(); setInterval(securite, 300000); }
Live.load();
Live.start();   // relevés de supervision, si une source est configurée
window.NetCarto = { impactOf, planAdressage, ageDuParc, Sync, addRoom, deleteStructure, deleteVlan, Live, Store, UI, Views, Views3D, Carto, trace, topology, connect, disconnect, installFromStock, removeDevice, select: (id, o) => select(id, o) };   // accès depuis la console du navigateur, pour le diagnostic
