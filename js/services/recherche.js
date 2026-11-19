/* Services — recherche globale. */
import { CATEGORIES } from '../config.js';
import { norm } from '../utils.js';
import { Store } from '../store.js';
import { byId, deviceIcon, labelOf, locLabel } from './requetes.js';

/* --- Recherche globale : équipements, ports, prises, pièces, baies, modèles --- */
function search(q, limit = 6) {
  const n = norm(q.trim());
  if (n.length < 2) return [];
  // Une adresse MAC se retrouve quel que soit son format : 02:aa:bb…, 02-AA-BB…, 02aa.bbcc…
  const hexa = /^[0-9a-f.:\- ]+$/i.test(q.trim()) ? q.replace(/[^0-9a-f]/gi, '').toLowerCase() : '', mac = v => hexa.length >= 6 && !!v && v.replace(/[^0-9a-f]/gi, '').toLowerCase().includes(hexa);
  const d = Store.db, hit = (...f) => f.some(x => x && norm(x).includes(n));
  const groups = [
    ['Équipements', d.devices.filter(x => hit(x.hostname, x.ip, x.mac, x.serial) || mac(x.mac)).map(x => ({ id: x.id, icon: deviceIcon(x), label: x.hostname, sub: [x.ip, locLabel(x.id, { short: true })].filter(Boolean).join(' · ') }))],
    ['Prises murales', d.outlets.filter(x => hit(x.label)).map(x => ({ id: x.id, icon: 'outlet', label: `Prise ${x.label}`, sub: locLabel(x.roomId) }))],
    ['Ports', d.ports.filter(p => hit(p.mac, p.connected, p.description, `${byId(p.deviceId)?.hostname} ${p.name}`) || mac(p.mac)).map(p => ({ id: p.id, icon: 'passive', label: labelOf(p.id), sub: [p.connected, p.mac, p.description].filter(Boolean).join(' · ') }))],
    ['Pièces', d.rooms.filter(x => hit(x.name)).map(x => ({ id: x.id, icon: 'room', label: x.name, sub: locLabel(x.floorId) }))],
    ['Baies', d.racks.filter(x => hit(x.name, x.serial)).map(x => ({ id: x.id, icon: 'rack', label: x.name, sub: locLabel(x.roomId) }))],
    ['Catalogue', d.catalog.filter(x => hit(x.brand, x.model, x.ref)).map(x => ({ id: x.id, icon: CATEGORIES[x.category].icon, label: `${x.brand} ${x.model}`, sub: CATEGORIES[x.category].one }))],
  ];
  return groups.filter(([, a]) => a.length).map(([name, a]) => ({ name, total: a.length, items: a.slice(0, limit) }));
}

export { search };
