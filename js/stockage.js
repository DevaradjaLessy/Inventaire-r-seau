/* Stockage local du mode démonstration : la base et quelques copies de secours, dans IndexedDB.
   IndexedDB accepte des volumes bien plus grands que localStorage (fonds de plan en image) et n'oblige pas
   à tout convertir en texte. Si IndexedDB est indisponible, on se rabat sur localStorage. */
import { APP } from './config.js';

const NOM = 'netcarto', BASE = 'base', COPIES = 'copies', COURANTE = 'courante', MAX_COPIES = 5;
let ouverture = null;

/* Ouvre la base IndexedDB (une seule fois). Rejette si le navigateur la refuse. */
function ouvrir() {
  if (!ouverture) {
    ouverture = new Promise((ok, ko) => {
      let req;
      try { req = indexedDB.open(NOM, 1); } catch (e) { return ko(e); }
      req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains(BASE)) d.createObjectStore(BASE); if (!d.objectStoreNames.contains(COPIES)) d.createObjectStore(COPIES, { keyPath: 'date' }); };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ko(req.error || new Error('IndexedDB indisponible'));
      req.onblocked = () => ko(new Error('IndexedDB bloquée'));
    });
    ouverture.catch(() => {});
  }
  return ouverture;
}
/* Exécute une opération sur un magasin et attend la fin de la transaction */
async function transaction(magasin, mode, fn) {
  const d = await ouvrir();
  return new Promise((ok, ko) => {
    const tx = d.transaction(magasin, mode), req = fn(tx.objectStore(magasin));
    tx.oncomplete = () => ok(req && 'result' in req ? req.result : undefined);
    tx.onerror = tx.onabort = () => ko(tx.error || new Error('Écriture locale refusée'));
  });
}
const ancienne = () => { try { const s = localStorage.getItem(APP.storageKey); return s ? JSON.parse(s) : null; } catch { return null; } };

const Stockage = {
  /* Base enregistrée, ou null. Les données d'une ancienne version (localStorage) sont reprises. */
  async lire() {
    try { const d = await transaction(BASE, 'readonly', s => s.get(COURANTE)); if (d) return d; } catch { /* IndexedDB indisponible : ancien stockage */ }
    return ancienne();
  },
  /* Enregistre la base. Renvoie une promesse rejetée si rien n'a pu être écrit. */
  async ecrire(db) {
    try {
      await transaction(BASE, 'readwrite', s => s.put(db, COURANTE));
      try { localStorage.removeItem(APP.storageKey); } catch { /* rien à retirer */ }
    } catch { localStorage.setItem(APP.storageKey, JSON.stringify(db)); }
  },
  /* Copies de secours : { date, modifiee, equipements, prises }, de la plus récente à la plus ancienne */
  async copies() {
    try { return (await transaction(COPIES, 'readonly', s => s.getAll())).map(c => ({ date: c.date, modifiee: c.base.meta.updatedAt, equipements: c.base.devices.length, prises: c.base.outlets.length })).sort((a, b) => b.date - a.date); }
    catch { return []; }
  },
  async copie(date) { try { return (await transaction(COPIES, 'readonly', s => s.get(date)))?.base || null; } catch { return null; } },
  /* Garde une copie de la base telle qu'elle est à l'ouverture de la page, sauf si elle est identique à la dernière copie */
  async copier(db) {
    try {
      const liste = await this.copies();
      if (liste[0] && liste[0].modifiee === db.meta.updatedAt) return false;
      await transaction(COPIES, 'readwrite', s => { s.put({ date: Date.now(), base: db }); for (const c of liste.slice(MAX_COPIES - 1)) s.delete(c.date); });
      return true;
    } catch { return false; }
  },
};

export { Stockage };
