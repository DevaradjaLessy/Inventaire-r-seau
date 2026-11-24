/* Services — préférences d'affichage de la personne qui utilise NetCarto : aujourd'hui, les cartes masquées du tableau de bord.
   Mode serveur : elles sont gardées avec le compte (route /session/preferences) et suivent la personne d'un poste à l'autre.
   Mode démonstration : elles sont gardées dans le navigateur.
   Un identifiant de carte n'est jamais inséré dans la page : il est seulement comparé à la liste des cartes connues. */
import { Store } from '../store.js';
import { Sync } from '../sync.js';

const CLE = 'netcarto.preferences', CARTE = /^[a-z0-9-]{1,40}$/;
const propres = liste => (Array.isArray(liste) ? [...new Set(liste.filter(x => typeof x === 'string' && CARTE.test(x)))] : []);
const locales = () => { try { return JSON.parse(localStorage.getItem(CLE) || '{}') || {}; } catch { return {}; } };

const Preferences = {
  visite: null,
  /* Cartes du tableau de bord masquées par cette personne */
  cartesMasquees() {
    if (Store.mode !== 'serveur' && this.visite) return this.visite;   // stockage du navigateur indisponible : le choix de cette visite
    const p = Store.mode === 'serveur' ? Sync.utilisateur?.preferences : locales();
    return propres(p?.tableau?.masques);
  },
  /* Enregistre la liste des cartes masquées ; en mode serveur, la promesse échoue si le serveur refuse */
  async masquerCartes(liste) {
    const masques = propres(liste), preferences = masques.length ? { tableau: { masques } } : {};
    if (Store.mode === 'serveur') { const r = await Sync.appel('PUT', '/session/preferences', { preferences }); if (Sync.utilisateur) Sync.utilisateur.preferences = r.preferences; return; }
    try { if (masques.length) localStorage.setItem(CLE, JSON.stringify(preferences)); else localStorage.removeItem(CLE); this.visite = null; } catch { this.visite = masques; }
  },
};

export { Preferences };
