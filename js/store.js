/* Store : état, index, historique, annulation, sauvegarde locale. Toute modification passe par Store.commit(type, texte, mutation). */
import { APP, CATEGORIES, DEVICE_STATUS, OUTLET_USAGE, PORT_KIND, PORT_ROLE, PORT_STATUS } from './config.js';
import { nextId, setRandomIds } from './utils.js';
import { buildDemo, emptyDb } from './demo.js';
import { defaire, diff, ecartEntre, lotInverse } from './ecarts.js';
import { Sync } from './sync.js';
import { Stockage } from './stockage.js';

const Store = {
  db: null, idx: null, undoStack: [], subs: new Set(), saveTimer: 0, saveError: false,
  onSaveError: null,   // appelé une fois si la sauvegarde locale échoue (branché par l'interface)
  MAX_UNDO: 25, MAX_HISTORY: 400,

  mode: 'local',        // local : démonstration dans le navigateur ; serveur : base sur le serveur NetCarto
  onSyncError: null,    // appelé quand le serveur refuse une modification (branché par l'interface)
  onExternalChange: null,

  /* Mode serveur : la base vient de l'API, et chaque modification y est envoyée */
  async initServeur(api) {
    this.mode = 'serveur'; Sync.api = api; setRandomIds(true);
    await this.recharger(false);
    Sync.surChangementExterne = async () => { try { await this.recharger(); this.onExternalChange?.(); } catch { /* serveur momentanément injoignable : nouvel essai au prochain passage */ } };
    Sync.surveiller();
  },
  /* Relit toute la base sur le serveur. L'historique d'annulation, devenu périmé, est vidé. */
  async recharger(prevenir = true) {
    const d = await Sync.charger(), err = this.validate(d);
    if (err) throw new Error('Base reçue du serveur invalide : ' + err);
    this.db = d; this.undoStack = [];
    this.reindex();
    if (prevenir) this.emit();
  },
  /* Envoie au serveur l'écart entre deux états. En cas de refus, l'écran revient en arrière. */
  pousser(avant, type, text, jeton) {
    const changements = diff(avant, this.db);
    if (!changements.length) return;
    Sync.envoyerLot({ type, texte: text || '', changements }).catch(e => this.surRefus(e, jeton));
  },
  /* Refuse une modification que le rôle du compte ne permet pas (le serveur la refuserait de toute façon) */
  autoriser(admin = false) {
    if (this.mode !== 'serveur') return;
    const role = Sync.utilisateur?.role;
    if (role === 'lecture') throw new Error('Votre compte est en lecture seule : aucune modification n\'est possible.');
    if (admin && role !== 'administrateur') throw new Error('Remplacer toute la base est réservé aux administrateurs.');
  },
  get utilisateur() { return Sync.utilisateur; },
  async surRefus(e, jeton) {
    if (e.code === 'abandon') return;
    const i = this.undoStack.findIndex(u => u.jeton === jeton);
    if (e.code === 'conflit' || i < 0) {
      // Quelqu'un d'autre a modifié la base, ou l'état local n'est plus sûr : on repart de la base du serveur
      try { await this.recharger(); } catch { /* serveur injoignable : l'état local est gardé, le prochain envoi le signalera */ }
    } else {
      // Retour à l'état d'avant la modification refusée ; les modifications suivantes, bâties dessus, sont abandonnées
      while (this.undoStack.length > i) this.revenir(this.undoStack.pop());
      this.reindex(); this.emit();
    }
    if (e.code === 'reseau') Sync.poser('horsligne');
    if (e.code !== 'acces') this.onSyncError?.(e);   // session expirée : l'écran de connexion s'affiche déjà
  },

  /* Mode démonstration : la base vient du stockage du navigateur, ou du jeu de démonstration.
     La base retrouvée est gardée en copie de secours avant toute nouvelle modification. */
  async init() {
    let d = null;
    try { d = await Stockage.lire(); } catch { /* stockage illisible */ }
    const retrouvee = d && !this.validate(d);
    this.db = retrouvee ? d : buildDemo();
    this.reindex();
    if (retrouvee) { await Stockage.copier(this.db); this.enregistrer(); }
    // Une modification en attente est écrite avant que la page soit quittée ou mise en arrière-plan
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.saveTimer) this.enregistrer(); });
  },
  /* Vérifie qu'un objet ressemble à une base NetCarto */
  validate(d) {
    if (!d || typeof d !== 'object' || !d.meta || d.meta.app !== APP.name) return 'Ce fichier n\'est pas un export NetCarto.';
    if (d.meta.schemaVersion > APP.schemaVersion) return 'Ce fichier vient d\'une version plus récente de NetCarto.';
    for (const k of Object.keys(emptyDb())) if (k !== 'meta' && !Array.isArray(d[k])) return `Section « ${k} » absente ou invalide.`;
    // Contrôle du contenu : ces valeurs sont insérées dans la page, elles doivent donc avoir une forme sûre
    const ID = /^[A-Za-z0-9_-]{1,64}$/, COLOR = /^#[0-9a-fA-F]{3,8}$/, IMG = /^(data:image\/(png|jpeg|jpg|webp|gif|svg\+xml)[;,]|https?:\/\/)/;
    const id = v => typeof v === 'string' && ID.test(v), ref = v => v == null || v === '' || id(v), col = v => v == null || v === '' || (typeof v === 'string' && COLOR.test(v));
    const nb = v => v == null || (typeof v === 'number' && Number.isFinite(v)), img = v => v == null || v === '' || (typeof v === 'string' && IMG.test(v));
    const RULES = {
      sites: e => id(e.id), buildings: e => id(e.id) && id(e.siteId),
      floors: e => id(e.id) && id(e.buildingId) && e.width > 0 && e.height > 0 && img(e.planImage),
      rooms: e => id(e.id) && id(e.floorId) && [e.x, e.y, e.w, e.h].every(v => typeof v === 'number' && Number.isFinite(v)),
      racks: e => id(e.id) && id(e.roomId) && id(e.catalogId) && e.heightU > 0 && nb(e.x) && nb(e.y) && e.status in DEVICE_STATUS,
      devices: e => id(e.id) && id(e.catalogId) && ref(e.rackId) && ref(e.roomId) && nb(e.x) && nb(e.y) && nb(e.u) && e.status in DEVICE_STATUS,
      ports: e => id(e.id) && id(e.deviceId) && e.status in PORT_STATUS && e.kind in PORT_KIND && e.role in PORT_ROLE && e.poe && typeof e.poe === 'object' && nb(e.poe.watts) && (e.vlan == null || Number.isInteger(e.vlan)),
      outlets: e => id(e.id) && id(e.roomId) && nb(e.x) && nb(e.y) && e.usage in OUTLET_USAGE,
      cables: e => id(e.id) && id(e.a) && id(e.b) && col(e.color),
      catalog: e => id(e.id) && e.category in CATEGORIES && Array.isArray(e.ports) && e.ports.every(g => g && g.kind in PORT_KIND) && (!e.visual || (col(e.visual.color) && col(e.visual.accent) && img(e.visual.frontImage))),
      stock: e => id(e.catalogId) && nb(e.available) && nb(e.threshold),
      vlans: e => Number.isInteger(e.id) && col(e.color),
      history: e => e && typeof e === 'object',
    };
    for (const [k, ok] of Object.entries(RULES)) {
      const i = d[k].findIndex(e => { try { return !e || typeof e !== 'object' || !ok(e); } catch { return true; } });
      if (i >= 0) return `Section « ${k} », élément n° ${i + 1} : valeur manquante ou invalide.`;
    }
    return null;
  },
  /* Sauvegarde locale (IndexedDB), avec un court délai pour regrouper les modifications */
  save() {
    if (this.mode === 'serveur') return;   // en mode serveur, rien n'est gardé dans le navigateur
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.enregistrer(), 300);
  },
  enregistrer() {
    clearTimeout(this.saveTimer); this.saveTimer = 0;
    return Stockage.ecrire(this.db).then(() => { this.saveError = false; }, () => { if (!this.saveError) this.onSaveError?.(); this.saveError = true; });
  },
  /* Reconstruit tous les index de recherche rapide */
  reindex() {
    const d = this.db;
    const I = { id: new Map(), cat: new Map(), stock: new Map(), vlan: new Map(), portsByDev: new Map(), cabByEnd: new Map(), devByRack: new Map(), devByRoom: new Map(), outByRoom: new Map(), racksByRoom: new Map(), roomsByFloor: new Map(), floorsByBld: new Map(), bldBySite: new Map(), devByCat: new Map() };
    const push = (m, k, v) => { if (k == null) return; const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };
    for (const k of ['sites', 'buildings', 'floors', 'rooms', 'racks', 'devices', 'ports', 'outlets', 'cables']) for (const e of d[k]) I.id.set(e.id, e);
    for (const c of d.catalog) { I.cat.set(c.id, c); I.id.set(c.id, c); }
    for (const s of d.stock) I.stock.set(s.catalogId, s);
    for (const v of d.vlans) I.vlan.set(v.id, v);
    for (const b of d.buildings) push(I.bldBySite, b.siteId, b);
    for (const f of d.floors) push(I.floorsByBld, f.buildingId, f);
    for (const r of d.rooms) push(I.roomsByFloor, r.floorId, r);
    for (const r of d.racks) { push(I.racksByRoom, r.roomId, r); push(I.devByCat, r.catalogId, r); }
    for (const x of d.devices) { push(I.devByRack, x.rackId, x); push(I.devByRoom, x.roomId, x); if (x.status !== 'retired') push(I.devByCat, x.catalogId, x); }
    for (const p of d.ports) push(I.portsByDev, p.deviceId, p);
    for (const o of d.outlets) push(I.outByRoom, o.roomId, o);
    for (const c of d.cables) { push(I.cabByEnd, c.a, c); push(I.cabByEnd, c.b, c); }
    for (const a of I.floorsByBld.values()) a.sort((x, y) => x.level - y.level);
    for (const a of I.devByRack.values()) a.sort((x, y) => y.u - x.u);
    this.idx = I;
    Cache.clear();
  },
  /* Applique une modification : instantané pour l'annulation, mutation, historique, index, sauvegarde, notification */
  commit(type, text, fn, ref = null) {
    this.autoriser();
    const snap = JSON.stringify(this.db);
    let res;
    try { res = fn(this.db); }
    catch (e) { this.db = JSON.parse(snap); this.reindex(); throw e; }
    const jeton = ++this.jetons;
    if (text) {
      this.db.history.unshift({ id: nextId(this.db, 'h'), ts: Date.now(), type, text, ref });
      if (this.db.history.length > this.MAX_HISTORY) this.db.history.length = this.MAX_HISTORY;
    }
    this.db.meta.updatedAt = Date.now();
    // L'annulation garde l'écart avec l'état d'avant, pas une copie de toute la base
    const { changements, retour } = ecartEntre(JSON.parse(snap), this.db);
    this.undoStack.push({ retour, text, jeton });
    if (this.undoStack.length > this.MAX_UNDO) this.undoStack.shift();
    this.reindex(); this.save(); this.emit();
    if (this.mode === 'serveur' && changements.length) Sync.envoyerLot({ type, texte: text || '', changements }).catch(e => this.surRefus(e, jeton));
    return res;
  },
  /* Annule la dernière modification */
  undo() {
    if (!this.undoStack.length) return null;
    this.autoriser();
    const u = this.undoStack.pop(), avant = this.db, texte = `Annulation : ${u.text || 'modification'}`;
    const lot = this.mode === 'serveur' && u.retour ? lotInverse(this.db, u.retour) : null;
    this.revenir(u);
    this.reindex(); this.save(); this.emit();
    if (lot && lot.length) Sync.envoyerLot({ type: 'annulation', texte, changements: lot }).catch(e => this.surRefus(e, -1));
    else if (this.mode === 'serveur' && u.snap) this.pousser(avant, 'annulation', texte, -1);
    return u.text || 'modification';
  },
  /* Remet la base dans l'état d'avant une entrée de la pile d'annulation : écart (cas courant) ou copie complète (remplacement de la base) */
  revenir(u) { if (u.snap) this.db = JSON.parse(u.snap); else defaire(this.db, u.retour); },
  /* Remplace toute la base (import, réinitialisation). L'ancienne base reste annulable. */
  replace(db, text) {
    this.autoriser(true);
    this.undoStack.push({ snap: JSON.stringify(this.db), text });
    if (this.undoStack.length > this.MAX_UNDO) this.undoStack.shift();
    this.db = db;
    this.db.history.unshift({ id: nextId(this.db, 'h'), ts: Date.now(), type: 'import', text, ref: null });
    this.reindex(); this.save(); this.emit();
    if (this.mode === 'serveur') Sync.remplacer(this.db).catch(e => this.surRefus(e, -1));
  },
  jetons: 0,
  rev: 0,   // numéro de version, augmenté à chaque modification
  on(fn) { this.subs.add(fn); },
  emit() { this.rev++; for (const fn of this.subs) fn(); },
};
/* Cache des calculs coûteux, vidé à chaque modification de la base */
const Cache = {
  m: new Map(),
  get(key, fn) { if (!this.m.has(key)) this.m.set(key, fn()); return this.m.get(key); },
  clear() { this.m.clear(); },
};

export { Cache, Store };
