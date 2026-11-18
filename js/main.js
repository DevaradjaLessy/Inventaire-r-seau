/* Point d'entrée : charge tous les modules puis démarre l'application. */
import { Store } from './store.js';
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
import './ui/inventaire.js';
import './ui/recherche.js';
import './ui/materiel/catalogue.js';
import './ui/materiel/installation.js';
import './ui/materiel/palette.js';
import './ui/materiel/modele.js';
import './ui/tableau-de-bord.js';

Store.init();
showTab(UI.tab);
window.NetCarto = { Store, UI, Views, Views3D, Carto, trace, topology, connect, disconnect, installFromStock, removeDevice, select: (id, o) => select(id, o) };   // accès depuis la console du navigateur, pour le diagnostic
