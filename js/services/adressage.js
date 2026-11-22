/* Services — plan d'adressage IPv4 : occupation de chaque sous-réseau de VLAN, prochaine adresse libre, adresses hors plan.
   Calculé à partir des adresses saisies sur les équipements ; rien n'est interrogé sur le réseau. */
import { Cache, Store } from '../store.js';

const SEUIL_PLEIN_PCT = 90;   // seuil d'alerte « sous-réseau presque plein »
/* Adresse « a.b.c.d » → nombre (ou null si elle n'est pas valide) */
function ipNum(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s || '').trim());
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.some(x => x > 255) ? null : o[0] * 16777216 + o[1] * 65536 + o[2] * 256 + o[3];
}
const ipTxt = n => [Math.floor(n / 16777216), Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join('.');
/* « 10.10.10.0/24 » → { base, fin, premier, dernier, hotes } : premier et dernier sont les adresses d'hôte utilisables */
function reseau(cidr) {
  const m = /^(.+)\/(\d{1,2})$/.exec(String(cidr || '').trim()), ip = m ? ipNum(m[1]) : null, bits = m ? +m[2] : 99;
  if (ip == null || bits > 32) return null;
  const taille = 2 ** (32 - bits), base = Math.floor(ip / taille) * taille, fin = base + taille - 1;
  // /31 et /32 : pas d'adresse de réseau ni de diffusion à retirer
  return bits >= 31 ? { base, fin, premier: base, dernier: fin, hotes: taille } : { base, fin, premier: base + 1, dernier: fin - 1, hotes: taille - 2 };
}
/* Plan complet : { vlans: [{ vlan, net, utilisees, hotes, pct, libre, chevauche }], hors: [équipements], sansReseau: [vlans] } */
function planAdressage() {
  return Cache.get('adressage', () => {
    const d = Store.db, devs = d.devices.filter(x => x.status !== 'retired').map(x => ({ dev: x, n: ipNum(x.ip) })).filter(x => x.n != null);
    const nets = d.vlans.map(v => ({ vlan: v, net: reseau(v.subnet) }));
    const vlans = nets.filter(x => x.net).map(({ vlan, net }) => {
      const prises = new Set(devs.filter(x => x.n >= net.premier && x.n <= net.dernier).map(x => x.n));
      let libre = null;
      for (let n = net.premier; n <= net.dernier && n < net.premier + prises.size + 1; n++) if (!prises.has(n)) { libre = ipTxt(n); break; }
      const chevauche = nets.filter(o => o.net && o.vlan !== vlan && o.net.base <= net.fin && net.base <= o.net.fin).map(o => o.vlan.id);
      return { vlan, net, utilisees: prises.size, hotes: net.hotes, pct: net.hotes ? Math.min(100, Math.round(prises.size * 100 / net.hotes)) : 0, libre, chevauche };
    }).sort((a, b) => a.vlan.id - b.vlan.id);
    const hors = devs.filter(x => !nets.some(o => o.net && x.n >= o.net.base && x.n <= o.net.fin)).map(x => x.dev);
    return { vlans, hors, sansReseau: nets.filter(x => !x.net).map(x => x.vlan) };
  });
}

export { ipNum, ipTxt, planAdressage, reseau, SEUIL_PLEIN_PCT };
