/* Services — mesures en direct. L'état « mesuré » (remonté par une source de
   supervision) est gardé à part de l'état « saisi » de la base : il n'est ni
   enregistré ni annulable, et disparaît quand la source est coupée.

   Une source renvoie un relevé au format commun (contrat version 1) :
   { version: 1, source, ts, devices: [{ ip, hostname, state, message,
       ports: [{ name, status, speedMbps, inMbps, outMbps, totalMbps, poeW, vlan, macs }] }] }
   state  : up | warning | down | unknown
   status : up | down | disabled | error
   Ajouter une source = ajouter une entrée dans SOURCES. */
import { norm } from '../utils.js';
import { Cache, Store } from '../store.js';
import { cablesOf, catOf, portsOf } from './requetes.js';

const DEV_STATE = {
  up: { label: 'Joignable', color: '#0ca30c' }, warning: { label: 'Dégradé', color: '#fab219' },
  down: { label: 'Injoignable', color: '#d03b3b' }, unknown: { label: 'Inconnu', color: '#6b7a8c' },
};
/* Nom d'interface ramené à une forme courte et comparable : « GigabitEthernet1/0/1 » → « gi1/0/1 » */
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
        const r = await fetch((cfg.url || location.origin).replace(/\/+$/, '') + '/api/etat', { signal: ctl.signal, headers: cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {} });
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
  subs: new Set(), timer: 0, busy: false,
  load() { try { Object.assign(this.cfg, JSON.parse(localStorage.getItem(this.KEY) || '{}')); } catch { /* réglages illisibles : valeurs par défaut */ } if (!SOURCES[this.cfg.type]) this.cfg.type = 'none'; },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.cfg)); } catch { /* stockage indisponible */ } },
  on(fn) { this.subs.add(fn); },
  emit() { Cache.clear(); for (const fn of this.subs) fn(); },
  /* (Re)démarre le relevé périodique selon les réglages */
  start() {
    clearInterval(this.timer);
    this.dev.clear(); this.port.clear(); this.unmatched = []; this.matched = 0; this.ts = 0; this.error = '';
    if (!SOURCES[this.cfg.type].fetch) { this.state = 'off'; this.emit(); return; }
    this.timer = setInterval(() => this.poll(), Math.max(5, +this.cfg.interval || 30) * 1000);
    return this.poll();
  },
  async poll() {
    if (this.busy) return;
    this.busy = true;
    try { this.apply(await SOURCES[this.cfg.type].fetch(this.cfg)); this.state = 'ok'; this.error = ''; }
    catch (e) { this.state = 'error'; this.error = e.message || String(e); }
    finally { this.busy = false; this.emit(); }
  },
  /* Rattache un relevé aux équipements (par IP, sinon par nom) et aux ports (par nom d'interface) */
  apply(snap) {
    if (!snap || snap.version !== 1 || !Array.isArray(snap.devices)) throw new Error('Relevé au format inattendu (contrat version 1 attendu).');
    const byIp = new Map(), byName = new Map();
    for (const d of Store.db.devices) { if (d.status === 'retired') continue; if (d.ip) byIp.set(d.ip, d); byName.set(norm(d.hostname), d); }
    this.dev.clear(); this.port.clear(); this.unmatched = [];
    const ts = snap.ts || Date.now();
    for (const m of snap.devices) {
      const d = byIp.get(m.ip) || byName.get(norm(m.hostname || ''));
      if (!d) { this.unmatched.push(m.hostname || m.ip || '?'); continue; }
      this.dev.set(d.id, { state: DEV_STATE[m.state] ? m.state : 'unknown', message: m.message || '', ts });
      const idx = new Map(portsOf(d.id).map(p => [normIf(p.name), p]));
      for (const mp of m.ports || []) {
        const p = idx.get(normIf(mp.name || ''));
        if (p) this.port.set(p.id, { status: ['up', 'down', 'disabled', 'error'].includes(mp.status) ? mp.status : null, speedMbps: mp.speedMbps ?? null, inMbps: mp.inMbps ?? null, outMbps: mp.outMbps ?? null, totalMbps: mp.totalMbps ?? null, poeW: mp.poeW ?? null, vlan: mp.vlan ?? null, macs: mp.macs || [], ts });
      }
    }
    this.matched = this.dev.size; this.ts = ts; this.source = snap.source || this.cfg.type;
  },
};
const measuredPort = id => Live.port.get(id) || null;
const measuredDev = id => Live.dev.get(id) || null;

export { DEV_STATE, Live, measuredDev, measuredPort, normIf, SOURCES };
