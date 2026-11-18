/* Cartographie — plan 2D d'un étage (SVG) : zoom, déplacement, mode Édition. */
import { CATEGORIES, COL, DEVICE_STATUS, OUTLET_USAGE, RACK_FULL_PCT, ROOM_TYPES } from '../../config.js';
import { $, clamp, esc, plural, typeOf } from '../../utils.js';
import { ico, ICONS } from '../../icones.js';
import { Store } from '../../store.js';
import { byId, catOf, labelOf, locOf, portsOf, rackUsage, vlanOf } from '../../services/requetes.js';
import { farEnd, outletInfo, rackSize, roomAt, scopeOf, STATE_COL, STATE_LABEL } from '../../services/cablage.js';
import { Actions, Changes, run, Tip, toast } from '../socle.js';
import { Carto, K, select } from './carto.js';
import { drawPlanTrace } from './tracage.js';
import { renderPalette } from '../materiel/palette.js';

/* ---------- Plan 2D ---------- */
const planDrag = { moved: false };
/* Contenu SVG d'un étage. mini = vignette (pièces et baies seulement) */
function planSvg(floor, mini) {
  const I = Store.idx, rooms = I.roomsByFloor.get(floor.id) || [], sel = Carto.sel, o = [];
  const W = floor.width * K, H = floor.height * K;
  if (!mini) o.push(`<defs><pattern id="grid" width="${K}" height="${K}" patternUnits="userSpaceOnUse"><path d="M${K} 0H0V${K}" fill="none" stroke="var(--grid)" stroke-width="1"/></pattern>
    <radialGradient id="wifi"><stop offset="0" stop-color="#199e70" stop-opacity=".34"/><stop offset=".6" stop-color="#199e70" stop-opacity=".12"/><stop offset="1" stop-color="#199e70" stop-opacity="0"/></radialGradient>
    <clipPath id="fclip"><rect width="${W}" height="${H}"/></clipPath></defs>
    <rect x="-2000" y="-2000" width="${W + 4000}" height="${H + 4000}" fill="url(#grid)"/>`);
  o.push(`<rect width="${W}" height="${H}" fill="var(--floor)" stroke="var(--line4)" stroke-width="5"/>`);
  if (floor.planImage && !mini) o.push(`<image href="${esc(floor.planImage)}" width="${W}" height="${H}" preserveAspectRatio="none" opacity=".85"/>`);
  for (const r of rooms) {
    const x = r.x * K, y = r.y * K, w = r.w * K, h = r.h * K, rt = ROOM_TYPES[r.type] || ROOM_TYPES.office;
    o.push(`<rect class="room rt-${ROOM_TYPES[r.type] ? r.type : 'office'} ${sel === r.id ? 'sel' : ''}" x="${x}" y="${y}" width="${w}" height="${h}" ${floor.planImage && !mini ? 'fill-opacity=".35"' : ''} ${mini ? '' : `data-act="psel" data-id="${r.id}" data-tip="${esc(r.name)}|${rt.label} · ${Math.round(r.w * r.h)} m²"`}/>`);
    if (!mini) {
      const fs = clamp(Math.min(w / (r.name.length * 0.56), h / 3.2), 4.5, 11);
      o.push(`<text class="rname" x="${x + w / 2}" y="${y + h * 0.3}" font-size="${fs.toFixed(1)}">${esc(r.name)}</text>`);
      if (h > 70) o.push(`<text class="rtype" x="${x + w / 2}" y="${y + h * 0.3 + fs * 1.25}" font-size="${(fs * 0.72).toFixed(1)}">${rt.label}</text>`);
    }
  }
  const devs = rooms.flatMap(r => I.devByRoom.get(r.id) || []);
  if (!mini && Carto.wifi) {
    o.push('<g clip-path="url(#fclip)" pointer-events="none">');
    for (const d of devs) if (catOf(d)?.category === 'ap' && d.status === 'active') o.push(`<circle cx="${d.x * K}" cy="${d.y * K}" r="${9 * K}" fill="url(#wifi)"/>`);
    o.push('</g>');
  }
  // Baies
  for (const r of rooms) for (const rk of I.racksByRoom.get(r.id) || []) {
    const s = rackSize(rk), u = rackUsage(rk.id), w = s.w * K, d = s.d * K;
    const col = u.pct >= RACK_FULL_PCT ? COL.serious : 'var(--txt2)';
    o.push(`<g class="pobj ${sel === rk.id || Carto.rackId === rk.id && locOf(sel).rack?.id === rk.id ? 'sel' : ''}" transform="translate(${rk.x * K},${rk.y * K})" ${mini ? '' : `data-act="psel" data-id="${rk.id}" data-drag="${rk.id}" data-tip="${esc(rk.name)}|${esc(catOf(rk)?.model || '')}|Occupation : ${u.used}/${u.total} U (${u.pct} %)|Double-clic : ouvrir la vue 3D"`}>
      <rect class="ring" x="${-w / 2 - 4}" y="${-d / 2 - 4}" width="${w + 8}" height="${d + 8}" rx="3"/>
      <rect x="${-w / 2}" y="${-d / 2}" width="${w}" height="${d}" fill="#0a0e13" stroke="${col}" stroke-width="1.6" rx="1.5"/>
      <rect x="${-w / 2 + 2}" y="${d / 2 - 4}" width="${(w - 4) * u.pct / 100}" height="2" fill="${col}"/>
      <path d="M${-w / 2 + 3} ${-d / 2 + 4}h${w - 6}M${-w / 2 + 3} ${-d / 2 + 8}h${w - 6}M${-w / 2 + 3} ${-d / 2 + 12}h${w - 6}" stroke="var(--line3)" stroke-width="1.2"/>
      ${mini ? '' : `<text class="rlabel" y="${d / 2 + 9}">${esc(rk.name)}</text>`}</g>`);
  }
  if (mini) return o.join('');
  // Prises murales
  for (const r of rooms) for (const ot of I.outByRoom.get(r.id) || []) {
    const inf = outletInfo(ot.id), hollow = inf.status === 'idle' || inf.status === 'free';
    const off = ot.usage === 'ap' || ot.usage === 'camera' ? 0.55 : 0;
    const tip = [`Prise ${ot.label}`, `Usage : ${OUTLET_USAGE[ot.usage]}`, inf.pp ? `Panneau : ${labelOf(inf.pp.id)}` : 'Non reliée à un panneau', inf.net ? `Switch : ${labelOf(inf.net.id)}` : 'Non brassée', `État : ${STATE_LABEL[inf.status]}${inf.net && inf.net.vlan != null ? ` · VLAN ${inf.net.vlan} ${vlanOf(inf.net.vlan).name}` : ''}`].join('|');
    o.push(`<g class="pobj ${sel === ot.id ? 'sel' : ''}" transform="translate(${(ot.x + off) * K},${(ot.y + off) * K})" data-act="psel" data-id="${ot.id}" data-drag="${ot.id}" data-tip="${esc(tip)}">
      <rect class="hit" x="-6" y="-6" width="12" height="12"/><rect class="ring" x="-6.5" y="-6.5" width="13" height="13" rx="2"/>
      <rect x="-3.5" y="-3.5" width="7" height="7" rx="1" fill="${hollow ? 'var(--floor)' : STATE_COL[inf.status]}" stroke="${hollow ? 'var(--txt3)' : 'var(--ink)'}" stroke-width="${hollow ? 1.2 : 0.8}" ${inf.status === 'disabled' ? 'stroke-dasharray="1.5 1.2" stroke="var(--txt2)"' : ''}/>
      <text class="lbl" x="5.5" y="1.8">${esc(ot.label)}</text></g>`);
  }
  // Équipements hors baie
  for (const d of devs) {
    const c = catOf(d), cc = CATEGORIES[c?.category] || CATEGORIES.passive, bad = d.status === 'fault' ? COL.crit : d.status === 'maintenance' ? COL.warn : null;
    const p0 = portsOf(d.id)[0], far = p0 ? farEnd(p0.id) : null;
    const tip = [d.hostname, `${c.brand} ${c.model}`, d.ip ? `IP : ${d.ip}` : '', far ? `Relié à : ${labelOf(far.id)}` : 'Non relié', `État : ${DEVICE_STATUS[d.status].label}`].filter(Boolean).join('|');
    const r = c.category === 'phone' ? 5 : 8;
    o.push(`<g class="pobj ${sel === d.id || locOf(sel).device?.id === d.id ? 'sel' : ''}" transform="translate(${d.x * K},${d.y * K})" data-act="psel" data-id="${d.id}" data-drag="${d.id}" data-tip="${esc(tip)}">
      <circle class="ring" r="${r + 3.5}"/>
      ${c.category === 'camera' ? `<path d="M0 0 L-26 14 A30 30 0 0 0 -14 26 Z" fill="${cc.color}" opacity=".22"/>` : ''}
      <circle r="${r}" fill="${cc.color}" stroke="${bad || 'var(--ink)'}" stroke-width="${bad ? 2 : 1}"/>
      <path d="${ICONS[cc.icon]}" transform="translate(${-r * 0.62},${-r * 0.62}) scale(${r * 0.052})" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>
      <text class="lbl" x="${r + 2}" y="1.8">${esc(d.hostname)}</text></g>`);
  }
  o.push('<g id="plan-trace"></g>');
  // Échelle : 5 m
  o.push(`<g transform="translate(0,${H + 14})" pointer-events="none"><path d="M0 0v5h${5 * K}v-5" fill="none" stroke="var(--txt3)" stroke-width="1.2"/><text x="${5 * K + 5}" y="6" fill="var(--txt3)" font-size="8">5 m</text></g>`);
  return o.join('');
}
function fitVb(floor) { const m = 2 * K; return { x: -m, y: -m, w: floor.width * K + 2 * m, h: floor.height * K + 2 * m + 10 }; }
function applyVb(svg) {
  const vb = Carto.vbs[Carto.floorId]; if (!vb || !svg) return;
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  svg.classList.toggle('zoomed', svg.clientWidth / vb.w > 1.25);
}
function renderPlan() {
  const host = $('#v-plan'), t = typeOf(Carto.sel || '');
  // Site ou bâtiment sélectionné : vignettes des étages
  if (t === 'site' || t === 'building' || !Carto.floorId) {
    const floors = Store.db.floors.filter(f => t !== 'building' || f.buildingId === Carto.sel);
    host.innerHTML = `<div class="floor-cards">${floors.map(f => { const s = scopeOf(f.id), b = byId(f.buildingId); return `<div class="fcard" data-act="sel" data-id="${f.id}">
      <h4>${esc(b.name)} — ${esc(f.name)}</h4><div class="muted">${plural((Store.idx.roomsByFloor.get(f.id) || []).length, 'pièce')} · ${plural(s.racks.length, 'baie')} · ${plural(s.devices.length, 'équipement')} · ${plural(s.outlets.length, 'prise')}</div>
      <svg viewBox="-10 -10 ${f.width * K + 20} ${f.height * K + 20}">${planSvg(f, true)}</svg></div>`; }).join('') || '<div class="empty">Aucun étage</div>'}</div>`;
    return;
  }
  const floor = byId(Carto.floorId);
  if (!Carto.vbs[floor.id]) Carto.vbs[floor.id] = fitVb(floor);
  const floorsOpt = Store.db.buildings.map(b => `<optgroup label="${esc(b.name)}">${(Store.idx.floorsByBld.get(b.id) || []).map(f => `<option value="${f.id}" ${f.id === floor.id ? 'selected' : ''}>${esc(b.code)} — ${esc(f.name)}</option>`).join('')}</optgroup>`).join('');
  host.innerHTML = `<svg class="plan ${Carto.edit ? 'editing' : ''}" xmlns="http://www.w3.org/2000/svg">${planSvg(floor, false)}</svg>
    <div class="overlay tl"><select data-chg="plan-floor" data-tip="Changer d'étage">${floorsOpt}</select>
      <button class="btn icon" data-act="plan-fit" data-tip="Ajuster|Recadrer le plan sur l'étage">${ico('fit')}</button>
      <button class="btn ${Carto.wifi ? 'on' : ''}" data-act="plan-wifi" data-tip="Couverture Wi-Fi|Portée indicative des bornes (9 m)">${ico('ap')}Wi-Fi</button>
      <button class="btn ${Carto.edit ? 'on' : ''}" data-act="plan-edit" data-tip="Mode Édition|Déplacer les prises, bornes, caméras, téléphones et baies à la souris">${ico('move')}Édition</button>
      <button class="btn ${Carto.palette ? 'on' : ''}" data-act="palette" data-tip="Stock|Glisser un modèle du stock sur le plan pour l'installer">${ico('box')}Stock</button>
      ${Carto.trace ? `<button class="btn on" data-act="trace-clear">${ico('x')}Effacer le tracé</button>` : ''}</div>
    <div class="overlay bl legend"><b>Prises</b>${['up', 'down', 'disabled', 'error'].map(s => `<span><i style="background:${STATE_COL[s]}"></i>${STATE_LABEL[s]}</span>`).join('')}<span><i style="border:1px solid var(--txt3)"></i>Non brassée</span>
      <b>Équipements</b>${['ap', 'camera', 'phone'].map(c => `<span><i style="background:${CATEGORIES[c].color};border-radius:50%"></i>${CATEGORIES[c].one}</span>`).join('')}<span><i style="border:1.5px solid var(--txt2);height:13px;width:9px"></i>Baie</span></div>
    <div id="palette-host"></div>`;
  applyVb($('svg.plan', host));
  renderPalette?.('plan');
  drawPlanTrace?.();
}
Changes['plan-floor'] = el => select(el.value, { view: 'plan' });
Actions['plan-fit'] = () => { const f = byId(Carto.floorId); Carto.vbs[f.id] = fitVb(f); applyVb($('svg.plan')); };
Actions['plan-wifi'] = () => { Carto.wifi = !Carto.wifi; renderPlan(); };
Actions['plan-edit'] = () => { Carto.edit = !Carto.edit; renderPlan(); if (Carto.edit) toast('Mode Édition : faites glisser un objet pour le déplacer', 'ok'); };

/* Convertit une position de la souris en coordonnées du plan (unités SVG) */
function svgPoint(svg, e) { return new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse()); }
function initPlanEvents(host) {
  host.addEventListener('wheel', e => {
    const svg = $('svg.plan', host); if (!svg) return;
    e.preventDefault();
    const vb = Carto.vbs[Carto.floorId], pt = svgPoint(svg, e);
    const nw = clamp(vb.w * (e.deltaY > 0 ? 1.18 : 1 / 1.18), 80, 6000), k = nw / vb.w;
    vb.x = pt.x - (pt.x - vb.x) * k; vb.y = pt.y - (pt.y - vb.y) * k; vb.w = nw; vb.h *= k;
    applyVb(svg);
  }, { passive: false });
  host.addEventListener('pointerdown', e => {
    const svg = $('svg.plan', host);
    if (!svg || e.button !== 0 || !e.target.closest('svg.plan')) return;
    const vb = Carto.vbs[Carto.floorId], sx = e.clientX, sy = e.clientY, inv = svg.getScreenCTM().inverse().a;
    const dragEl = Carto.edit ? e.target.closest('[data-drag]') : null;
    const start = { x: vb.x, y: vb.y }, p0 = svgPoint(svg, e);
    let last = null;
    planDrag.moved = false;
    const move = ev => {
      if (!planDrag.moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      planDrag.moved = true; Tip.hide();
      if (dragEl) {
        const p = svgPoint(svg, ev), e0 = byId(dragEl.dataset.drag), f = byId(Carto.floorId);
        last = { x: clamp(e0.x + (p.x - p0.x) / K, 0.1, f.width - 0.1), y: clamp(e0.y + (p.y - p0.y) / K, 0.1, f.height - 0.1) };
        const off = e0.usage === 'ap' || e0.usage === 'camera' ? 0.55 : 0;
        dragEl.setAttribute('transform', `translate(${(last.x + off) * K},${(last.y + off) * K})`);
      } else {
        svg.classList.add('panning');
        vb.x = start.x - (ev.clientX - sx) * inv; vb.y = start.y - (ev.clientY - sy) * inv;
        applyVb(svg);
      }
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      svg.classList.remove('panning');
      if (dragEl && last) run(() => moveOnPlan(dragEl.dataset.drag, +last.x.toFixed(2), +last.y.toFixed(2)));
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
  // Un glisser ne doit pas déclencher le clic de sélection
  host.addEventListener('click', e => { if (planDrag.moved) { e.stopPropagation(); e.preventDefault(); planDrag.moved = false; } }, true);
  host.addEventListener('dblclick', e => { const el = e.target.closest('[data-id]'); if (el && typeOf(el.dataset.id) === 'rack') select(el.dataset.id, { view: 'rack' }); });
}
/* Déplace une prise, un équipement ou une baie sur le plan */
function moveOnPlan(id, x, y) {
  const e = byId(id), room = roomAt(Carto.floorId, x, y);
  if (!room) throw new Error('Position hors des pièces : déplacement annulé.');
  Store.commit('move', `Déplacement de ${labelOf(id)} (${room.name})`, () => { e.x = x; e.y = y; e.roomId = room.id; }, id);
}

export { initPlanEvents, planDrag, renderPlan, svgPoint };
