/* Cartographie — vue de la topologie logique. */
import { CATEGORIES, COL, DEVICE_STATUS, LAYERS } from '../../config.js';
import { $, esc, fmtSpeed, groupBy, sum } from '../../utils.js';
import { ico, ICONS } from '../../icones.js';
import { byId, catOf, locLabel, locOf, portsOf } from '../../services/requetes.js';
import { farEnd, STATE_LABEL } from '../../services/cablage.js';
import { topology } from '../../services/topologie.js';
import { Actions, Tip } from '../socle.js';
import { Carto } from './carto.js';
import { planDrag, svgPoint } from './plan.js';

/* ---------- Topologie logique ---------- */
/* ends : ce qu'on montre des terminaux — « aucun » (le réseau seul), « comptes » (leur nombre sous chaque équipement),
   « detail » (une pastille par terminal, sous son switch d'accès) */
const Topo = { ends: 'comptes', vb: null };
const PAR_RANG = 5, PAS = 27;   // pastilles des terminaux : nombre par rangée et écart
function renderTopo() {
  const host = $('#v-topo'), tp = topology(), tr = Carto.trace;
  const rows = [['perimeter', 150], ['core', 280], ['distribution', 410], ['access', 540]];
  const byLayer = Object.fromEntries(rows.map(([k]) => [k, tp.nodes.filter(d => tp.layer.get(d.id) === k)]));
  const NW = 150, NH = 50, GAP = 26;
  const detail = Topo.ends === 'detail';
  // Niveau chargé : les nœuds sont placés en quinconce sur deux rangées. Pas quand les terminaux sont dessinés : il leur faut la place sous chaque switch.
  const stag = a => !detail && a.length > 6;
  const rangs = detail ? Math.max(0, ...byLayer.access.map(d => Math.ceil((tp.ends.get(d.id) || []).length / PAR_RANG))) : 0, enPlus = rangs ? rangs * PAS + 22 : 0;
  const W = Math.max(900, ...Object.values(byLayer).map(a => (stag(a) ? a.length * (NW + GAP) * 0.56 + NW : a.length * (NW + GAP)) + 140));
  const pos = new Map();
  // Chaque niveau est trié selon la position moyenne de ses voisins du niveau au-dessus
  for (const [k, y] of rows) {
    const list = byLayer[k];
    const bary = d => { const xs = [...tp.adj.get(d.id)].map(n => pos.get(n)?.x).filter(x => x != null); return xs.length ? sum(xs) / xs.length : W / 2; };
    list.sort((a, b) => bary(a) - bary(b) || a.hostname.localeCompare(b.hostname));
    const step = stag(list) ? (NW + GAP) * 0.56 : Math.min(NW + GAP * 3, (W - 140) / Math.max(1, list.length));
    list.forEach((d, i) => pos.set(d.id, { x: 120 + (W - 140) / 2 + (i - (list.length - 1) / 2) * step, y: y + (stag(list) ? (i % 2) * 84 : 0) }));
  }
  const o = [];
  for (const [k, y] of rows) o.push(`<rect x="0" y="${y - 50}" width="${W}" height="${(stag(byLayer[k]) ? 202 : 118) + (k === 'access' ? enPlus : 0)}" fill="${k === 'core' || k === 'access' ? 'var(--input)' : 'var(--canvas2)'}"/><text x="14" y="${y - 30}" fill="var(--txt3)" font-size="11" font-weight="700" letter-spacing="1">${LAYERS[k].toUpperCase()}</text>`);
  // Lien WAN
  const wanRtr = tp.nodes.find(d => portsOf(d.id).some(p => /opérateur|internet|wan/i.test(p.connected)) && pos.has(d.id));
  if (wanRtr) { const p = pos.get(wanRtr.id); o.push(`<path d="M${p.x} ${p.y - NH / 2}V58" stroke="var(--txt3)" stroke-width="2" stroke-dasharray="5 4"/><g transform="translate(${p.x},40)"><ellipse rx="70" ry="20" fill="var(--panel)" stroke="var(--txt3)" stroke-width="1.5"/><text text-anchor="middle" y="4" fill="var(--txt2)" font-size="12" font-weight="600">Internet / WAN</text></g>`); }
  // Liens
  for (const l of tp.links) {
    const a = pos.get(l.a), b = pos.get(l.b); if (!a || !b) continue;
    const [u, d] = a.y <= b.y ? [a, b] : [b, a];
    const st = l.pairs.some(([p, q]) => p.status === 'error' || q.status === 'error') ? 'error' : l.pairs.every(([p, q]) => p.status !== 'up' || q.status !== 'up') ? 'down' : 'up';
    const hl = tr && l.pairs.some(([p, q]) => tr.nodeSet.has(p.id) && tr.nodeSet.has(q.id));
    const path = u.y === d.y ? `M${u.x} ${u.y + NH / 2}C${u.x} ${u.y + NH / 2 + 34},${d.x} ${d.y + NH / 2 + 34},${d.x} ${d.y + NH / 2}` : `M${u.x} ${u.y + NH / 2}C${u.x} ${(u.y + d.y) / 2},${d.x} ${(u.y + d.y) / 2},${d.x} ${d.y - NH / 2}`;
    const sp = Math.max(...l.pairs.map(([p]) => p.speed));
    const tip = [`${byId(l.a).hostname} ↔ ${byId(l.b).hostname}`, ...l.pairs.map(([p, q]) => `${p.name} ↔ ${q.name} · ${fmtSpeed(Math.min(p.speed, q.speed))} · ${STATE_LABEL[p.status === 'up' && q.status === 'up' ? 'up' : p.status === 'error' || q.status === 'error' ? 'error' : 'down']}`)].join('|');
    o.push(`<path d="${path}" fill="none" stroke="transparent" stroke-width="12" data-tip="${esc(tip)}"/><path class="tlink ${hl ? 'hl' : ''}" d="${path}" fill="none" stroke="${st === 'error' ? COL.crit : st === 'down' ? COL.down : sp >= 10000 ? 'var(--link2)' : 'var(--link1)'}" stroke-width="${l.pairs.length > 1 ? 3.2 : 1.8}" ${st === 'down' ? 'stroke-dasharray="5 4"' : ''} pointer-events="none"/>`);
    if (l.pairs.length > 1) { const mx = (u.x + d.x) / 2, my = u.y === d.y ? u.y + NH / 2 + 26 : (u.y + d.y) / 2; o.push(`<g pointer-events="none"><rect x="${mx - 11}" y="${my - 8}" width="22" height="16" rx="8" fill="var(--panel)" stroke="var(--line2)"/><text x="${mx}" y="${my + 4}" text-anchor="middle" fill="var(--txt2)" font-size="10" font-weight="700">×${l.pairs.length}</text></g>`); }
  }
  // Nœuds
  const selDev = locOf(Carto.sel || '').device?.id;
  for (const d of tp.nodes) {
    const p = pos.get(d.id); if (!p) continue;
    const c = catOf(d), cc = CATEGORIES[c.category], bad = d.status === 'fault' ? COL.crit : d.status === 'maintenance' ? COL.warn : portsOf(d.id).some(x => x.status === 'error') ? COL.crit : null;
    const used = portsOf(d.id).filter(x => x.status === 'up').length;
    o.push(`<g class="tnode ${selDev === d.id ? 'sel' : ''} ${tr?.devSet.has(d.id) ? 'hl' : ''}" transform="translate(${p.x - NW / 2},${p.y - NH / 2})" data-act="psel" data-id="${d.id}" data-tip="${esc([d.hostname, `${c.brand} ${c.model}`, d.ip ? `IP : ${d.ip}` : '', locLabel(d.id), `Ports actifs : ${used}/${portsOf(d.id).length}`, `Niveau : ${LAYERS[tp.layer.get(d.id)]}`].filter(Boolean).join('|'))}">
      <rect class="tb" width="${NW}" height="${NH}" rx="7"/><rect width="5" height="${NH}" rx="2" fill="${cc.color}"/>
      <path d="${ICONS[cc.icon]}" transform="translate(13,14) scale(.9)" fill="none" stroke="${cc.color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="42" y="22" fill="var(--txt)" font-size="11.5" font-weight="700">${esc(d.hostname)}</text><text x="42" y="37" fill="var(--txt2)" font-size="10">${esc(c.model.length > 19 ? c.model.slice(0, 18) + '…' : c.model)}</text>
      ${bad ? `<circle cx="${NW - 9}" cy="9" r="4.5" fill="${bad}"/>` : ''}</g>`);
    const e = tp.ends.get(d.id) || [];
    if (detail && tp.layer.get(d.id) === 'access') {
      // Une pastille par terminal, en rangées sous le switch ; un clic ouvre sa fiche
      e.forEach((t, i) => {
        const tc = catOf(t), tcc = CATEGORIES[tc.category], n = Math.min(PAR_RANG, e.length - Math.floor(i / PAR_RANG) * PAR_RANG);
        const x = p.x + ((i % PAR_RANG) - (n - 1) / 2) * PAS, y = p.y + NH / 2 + 22 + Math.floor(i / PAR_RANG) * PAS;
        o.push(`<g class="tend ${selDev === t.id ? 'sel' : ''}" transform="translate(${x},${y})" data-act="psel" data-id="${t.id}" data-tip="${esc([t.hostname, `${tc.brand} ${tc.model}`, t.ip ? `IP : ${t.ip}` : '', locLabel(t.id), `État : ${DEVICE_STATUS[t.status].label}`].filter(Boolean).join('|'))}"><circle class="te" r="11" stroke="${tcc.color}"/><path d="${ICONS[tcc.icon]}" transform="translate(-7.2,-7.2) scale(.6)" fill="none" stroke="${tcc.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${t.status === 'fault' ? `<circle cx="8" cy="-8" r="3.6" fill="${COL.crit}"/>` : ''}</g>`);
      });
    } else if (Topo.ends !== 'aucun') {
      const g2 = groupBy(e, x => catOf(x).category);
      const pcs = portsOf(d.id).filter(x => x.role === 'access' && x.status === 'up' && x.connected && !farEnd(x.id)).length;
      const short = { ap: 'bornes', phone: 'tél.', camera: 'cam.', server: 'serveurs', ups: 'ond.' };
      const parts = [...g2].map(([k, a]) => `${a.length} ${short[k] || CATEGORIES[k].label.toLowerCase()}`); if (pcs) parts.push(`${pcs} postes`);
      const lines = []; for (let i = 0; i < parts.length; i += 2) lines.push(parts.slice(i, i + 2).join(' · '));
      lines.slice(0, 2).forEach((s, i) => o.push(`<text x="${p.x}" y="${p.y + NH / 2 + 14 + i * 12}" text-anchor="middle" fill="var(--txt3)" font-size="9.5" pointer-events="none">${esc(s)}</text>`));
    }
  }
  const H = 720 + Math.max(0, enPlus - 60);
  if (!Topo.vb || Topo.w !== W || Topo.h !== H) { Topo.vb = { x: 0, y: 0, w: W, h: H }; Topo.w = W; Topo.h = H; }
  host.innerHTML = `<svg class="topo" xmlns="http://www.w3.org/2000/svg" viewBox="${Topo.vb.x} ${Topo.vb.y} ${Topo.vb.w} ${Topo.vb.h}">${o.join('')}</svg>
    <div class="overlay tl"><button class="btn icon" data-act="topo-fit" data-tip="Ajuster">${ico('fit')}</button><button class="btn icon" data-act="topo-image" data-tip="Image|Télécharger la topologie en image (PNG)">${ico('download')}</button><span class="seg" role="group" aria-label="Terminaux">${[['aucun', 'Réseau seul', 'Ne montrer que les équipements du réseau'], ['comptes', 'Terminaux comptés', 'Le nombre de terminaux sous chaque équipement'], ['detail', 'Terminaux dessinés', 'Une pastille par terminal, sous son switch d\'accès. Un clic ouvre sa fiche']].map(([v, l, t]) => `<button class="${Topo.ends === v ? 'on' : ''}" data-act="topo-ends" data-v="${v}" data-tip="${l}|${t}">${l}</button>`).join('')}</span>${tr ? `<button class="btn on" data-act="trace-clear">${ico('x')}Effacer le tracé</button>` : ''}</div>
    <div class="overlay bl legend"><b>Liens</b><span><i style="background:var(--link2);height:3px"></i>10 Gb/s et plus</span><span><i style="background:var(--link1);height:2px"></i>1 Gb/s</span><span><i style="background:${COL.down};height:2px"></i>inactif</span><span><i style="background:${COL.crit};height:3px"></i>en erreur</span><span>×2 : liens redondants</span><span>Niveaux calculés à partir du câblage</span>${detail ? '<span>Pastilles : un terminal chacune, sous son switch d\'accès</span>' : ''}</div>`;
  if (!host.dataset.pz) { host.dataset.pz = '1'; panZoom(host, 'svg.topo', () => Topo.vb); }
}
Actions['topo-fit'] = () => { Topo.vb = null; renderTopo(); };
Actions['topo-ends'] = el => { Topo.ends = el.dataset.v; renderTopo(); };
/* Zoom à la molette et déplacement à la souris pour un SVG (cadrage fourni par getVb) */
function panZoom(host, sel, getVb) {
  const apply = svg => { const vb = getVb(); svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); };
  host.addEventListener('wheel', e => {
    const svg = $(sel, host); if (!svg) return; e.preventDefault();
    const vb = getVb(), pt = svgPoint(svg, e), k = e.deltaY > 0 ? 1.18 : 1 / 1.18;
    vb.x = pt.x - (pt.x - vb.x) * k; vb.y = pt.y - (pt.y - vb.y) * k; vb.w *= k; vb.h *= k; apply(svg);
  }, { passive: false });
  host.addEventListener('pointerdown', e => {
    const svg = $(sel, host); if (!svg || e.button !== 0 || !e.target.closest(sel)) return;
    const vb = getVb(), sx = e.clientX, sy = e.clientY, inv = svg.getScreenCTM().inverse().a, x0 = vb.x, y0 = vb.y;
    planDrag.moved = false;
    const move = ev => { if (!planDrag.moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; planDrag.moved = true; Tip.hide(); vb.x = x0 - (ev.clientX - sx) * inv; vb.y = y0 - (ev.clientY - sy) * inv; apply(svg); };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
  host.addEventListener('click', e => { if (planDrag.moved) { e.stopPropagation(); e.preventDefault(); planDrag.moved = false; } }, true);
}

export { renderTopo };
