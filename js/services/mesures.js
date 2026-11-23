/* Services — mesures en direct. L'état « mesuré » (remonté par une source de
   supervision) est gardé à part de l'état « saisi » de la base : il n'est ni
   enregistré ni annulable, et disparaît quand la source est coupée.

   Une source renvoie un relevé au format commun (contrat version 1) :
   { version: 1, source, ts, devices: [{ ip, hostname, state, message,
       ports: [{ name, status, speedMbps, inMbps, outMbps, totalMbps, poeW, vlan, macs, errors, macCount }] }],
     sources: [{ nom, ok, erreur, equipements, ts }] }   (sources : présent quand le relevé vient du relais ou du serveur)
   state  : up | warning | down | unknown
   status : up | down | disabled | error
   Ajouter une source = ajouter une entrée dans SOURCES. */
import { norm } from '../utils.js';
import { Cache, Store } from '../store.js';
import { Sync } from '../sync.js';
import { cablesOf, catOf, portsOf } from './requetes.js';

const DEV_STATE = {
  up: { label: 'Joignable', color: '#0ca30c' }, warning: { label: 'Dégradé', color: '#fab219' },
  down: { label: 'Injoignable', color: '#d03b3b' }, unknown: { label: 'Inconnu', color: '#6b7a8c' },
};
/* Nom d'interface ramené à une forme courte et comparable : « GigabitEthernet1/0/1 » → « gi1/0/1 ».
   La même règle existe dans le module de supervision (nomInterface, connecteurs/lib/contrat.js) : les deux doivent rester d'accord. */
const IF_ABBR = [['tengigabitethernet', 'te'], ['twentyfivegige', 'twe'], ['fortygigabitethernet', 'fo'], ['hundredgige', 'hu'], ['gigabitethernet', 'gi'], ['fastethernet', 'fa']];
function normIf(name) {
  let s = norm(name).replace(/\s+/g, '');
  for (const [long, short] of IF_ABBR) if (s.startsWith(long)) { s = short + s.slice(long.length); break; }
  return s;
}
/* Source « simulation » : fait vivre le jeu de démonstration sans aucun équipement réel */
const sim = new Map();
function simulate() {
  const devices = [];
  for (const d of Store.db.devices) {
    const c = catOf(d);
    if (!c || d.status === 'retired' || c.category === 'passive' || !d.ip) continue;
    const ports = portsOf(d.id).filter(p => p.role !== 'pp').map(p => {
      let st = sim.get(p.id) ?? p.status;
      // De temps en temps, un port câblé change d'état, comme un poste qu'on allume ou qu'on éteint
      if (p.role === 'access' && cablesOf(p.id).length && (st === 'up' || st === 'down') && Math.random() < 0.015) st = st === 'up' ? 'down' : 'up';
      sim.set(p.id, st);
      const up = st === 'up', load = Math.random() ** 3 * (p.role === 'uplink' ? 0.25 : 0.08);
      return { name: p.name, status: st, speedMbps: p.speed, inMbps: up ? +(p.speed * load).toFixed(2) : 0, outMbps: up ? +(p.speed * load * (0.2 + Math.random() * 0.6)).toFixed(2) : 0,
        poeW: up && p.poe.watts ? +(p.poe.watts + (Math.random() - 0.5) * 0.8).toFixed(1) : 0, vlan: p.vlan, macs: up && p.mac ? [p.mac] : [] };
    });
    devices.push({ ip: d.ip, hostname: d.hostname, state: d.status === 'fault' ? 'down' : d.status === 'maintenance' ? 'warning' : 'up', message: d.status === 'fault' ? 'Aucune réponse' : '', ports });
  }
  return { version: 1, source: 'simulation', ts: Date.now(), devices };
}
const SOURCES = {
  none: { label: 'Aucune (saisie manuelle uniquement)' },
  simulation: { label: 'Simulation (démonstration, sans équipement)', fetch: async () => simulate() },
  relais: {
    label: 'Relais NetCarto (PRTG, SNMP…)', needsUrl: true,
    async fetch(cfg) {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 10000);
      try {
        const adresse = cfg.url ? cfg.url.replace(/\/+$/, '') + '/api/etat' : Sync.api ? Sync.api + '/supervision/etat' : location.origin + '/api/etat';
        const r = await fetch(adresse, { signal: ctl.signal, headers: cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {} });
        if (!r.ok) throw new Error(r.status === 401 ? 'Jeton refusé par le relais (401).' : `Le relais a répondu ${r.status}.`);
        return await r.json();
      } catch (e) { throw new Error(e.name === 'AbortError' ? 'Le relais ne répond pas (délai dépassé).' : e instanceof TypeError ? 'Relais injoignable. Vérifiez l\'adresse. Depuis une page publique (GitHub Pages), le navigateur bloque l\'accès à un service interne : ouvrez NetCarto depuis le relais lui-même.' : e.message); }
      finally { clearTimeout(timer); }
    },
  },
};
const Live = {
  KEY: 'netcarto:source',
  cfg: { type: 'none', url: '', token: '', interval: 30 },   // url vide : le relais est à la même adresse que la page
  state: 'off',          // off | ok | error
  error: '', ts: 0, source: '', dev: new Map(), port: new Map(), unmatched: [], matched: 0,
  sources: [],           // état de chaque source du relais : { nom, ok, erreur, equipements, ts }
  ecarts: [],            // désaccords entre sources, tels que le relais les signale
  diag: new Map(),       // par équipement reconnu : { reconnus, inconnus: [noms d'interface sans port correspondant] }
  subs: new Set(), timer: 0, busy: false,
  load() { try { Object.assign(this.cfg, JSON.parse(localStorage.getItem(this.KEY) || '{}')); } catch { /* réglages illisibles : valeurs par défaut */ } if (!SOURCES[this.cfg.type]) this.cfg.type = 'none'; },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.cfg)); } catch { /* stockage indisponible */ } },
  on(fn) { this.subs.add(fn); },
  emit() { Cache.clear(); for (const fn of this.subs) fn(); },
  /* (Re)démarre le relevé périodique selon les réglages */
  start() {
    clearInterval(this.timer);
    this.vider(); this.matched = 0; this.ts = 0; this.error = '';
    if (!SOURCES[this.cfg.type].fetch) { this.state = 'off'; this.emit(); return; }
    this.timer = setInterval(() => this.poll(), Math.max(5, +this.cfg.interval || 30) * 1000);
    return this.poll();
  },
  async poll() {
    if (this.busy) return;
    this.busy = true;
    try { this.apply(await SOURCES[this.cfg.type].fetch(this.cfg)); this.state = 'ok'; this.error = ''; }
    // En erreur, plus aucune mesure n'est affichée : l'état saisi reprend sa place, plutôt qu'un état mesuré qui n'est plus vrai
    catch (e) { this.state = 'error'; this.error = e.message || String(e); this.vider(); }
    finally { this.busy = false; this.emit(); }
  },
  vider() { this.dev.clear(); this.port.clear(); this.diag.clear(); this.unmatched = []; this.sources = []; this.ecarts = []; },
  /* Rattache un relevé aux équipements (par IP, sinon par nom) et aux ports (par nom d'interface) */
  apply(snap) {
    if (!snap || snap.version !== 1 || !Array.isArray(snap.devices)) throw new Error('Relevé au format inattendu (contrat version 1 attendu).');
    // Un relevé trop ancien signale un relais arrêté : ses mesures ne sont pas présentées comme l'état réel
    const ts = snap.ts || Date.now(), limite = Math.max(90, 3 * (+this.cfg.interval || 30)) * 1000;
    if (Date.now() - ts > limite) { this.vider(); throw new Error(`Le dernier relevé date de ${new Date(ts).toLocaleTimeString('fr-FR')} : la supervision ne tourne plus.`); }
    // Nom d'hôte comparé sans domaine : « sw-a1.exemple.interne » et « SW-A1 » désignent le même équipement
    const court = h => norm(h || '').trim().split('.')[0];
    const byIp = new Map(), byName = new Map();
    for (const d of Store.db.devices) { if (d.status === 'retired') continue; if (d.ip) byIp.set(d.ip, d); byName.set(court(d.hostname), d); }
    this.vider();
    this.sources = Array.isArray(snap.sources) ? snap.sources.map(s => ({ nom: String(s.nom || ''), ok: s.ok, erreur: String(s.erreur || ''), equipements: +s.equipements || 0, ts: +s.ts || 0 })) : [];
    for (const m of snap.devices) {
      const d = byIp.get(m.ip) || byName.get(court(m.hostname)) || (m.ip && !/^[\d.:a-f]+$/i.test(m.ip) ? byName.get(court(m.ip)) : null);
      if (!d) { this.unmatched.push(m.hostname || m.ip || '?'); continue; }
      for (const e of m.ecarts || []) this.ecarts.push(`${d.hostname} — ${e}`);
      const inconnus = [];
      // Le relais fusionne déjà ses sources ; s'il n'a pas pu rapprocher deux relevés du même équipement (l'un sans nom, l'autre
      // sans adresse), ils arrivent séparés : ils sont réunis ici par la même règle — le premier fait foi, le suivant complète.
      const qui = (m.sources || []).join(' + ') || 'une source', etat = DEV_STATE[m.state] ? m.state : 'unknown', vu = this.dev.get(d.id);
      if (!vu) this.dev.set(d.id, { state: etat, message: m.message || '', ts, qui });
      else if (etat !== 'unknown') { if (vu.state === 'unknown') Object.assign(vu, { state: etat, message: m.message || '', qui }); else if (vu.state !== etat) this.ecarts.push(`${d.hostname} — état : ${vu.qui} dit « ${vu.state} », ${qui} dit « ${etat} »`); }
      const idx = new Map(portsOf(d.id).map(p => [normIf(p.name), p]));
      for (const mp of m.ports || []) {
        const p = idx.get(normIf(mp.name || ''));
        // Sans port correspondant : noté pour le diagnostic, sauf une unité logique (« ge-0/0/0.0 »), qui n'est pas un port
        if (!p) { if (mp.name && !/\.\d+$/.test(mp.name)) inconnus.push(String(mp.name)); continue; }
        const mesure = { status: ['up', 'down', 'disabled', 'error'].includes(mp.status) ? mp.status : null, speedMbps: mp.speedMbps ?? null, inMbps: mp.inMbps ?? null, outMbps: mp.outMbps ?? null, totalMbps: mp.totalMbps ?? null, poeW: mp.poeW ?? null, vlan: mp.vlan ?? null, macs: mp.macs || [], errors: mp.errors ?? null, macCount: mp.macCount ?? null, ts, nom: String(mp.name), qui };
        const deja = this.port.get(p.id);
        if (!deja) { this.port.set(p.id, mesure); continue; }
        if (deja.status && mesure.status && deja.status !== mesure.status) this.ecarts.push(`${d.hostname} — ${deja.nom} : ${deja.qui} dit « ${deja.status} », ${qui} dit « ${mesure.status} »`);
        for (const k of ['status', 'speedMbps', 'inMbps', 'outMbps', 'totalMbps', 'poeW', 'vlan', 'errors', 'macCount']) if (deja[k] === null || deja[k] === undefined) deja[k] = mesure[k];
        if (mesure.macs.length) deja.macs = [...new Set([...deja.macs, ...mesure.macs])];
      }
      const avant = this.diag.get(d.id);
      this.diag.set(d.id, { reconnus: new Set(portsOf(d.id).filter(x => this.port.has(x.id))).size, inconnus: [...new Set([...(avant?.inconnus || []), ...inconnus])].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })) });
    }
    this.matched = this.dev.size; this.ts = ts; this.source = snap.source || this.cfg.type;
  },
};
const measuredPort = id => Live.port.get(id) || null;
const measuredDev = id => Live.dev.get(id) || null;

export { DEV_STATE, Live, measuredDev, measuredPort, normIf, SOURCES };
