/* Cartographie — fiches de détail (site → port) et fenêtres de modification. */
import { CATEGORIES, COL, DEVICE_STATUS, OUTLET_USAGE, POE_WARN_PCT, PORT_KIND, PORT_ROLE, PORT_STATUS, RACK_FULL_PCT, ROOM_TYPES } from '../../config.js';
import { $, clamp, esc, fmtDate, fmtSpeed, groupBy, plural, typeOf } from '../../utils.js';
import { ico } from '../../icones.js';
import { ipValide, normMac, verifierUnicite } from '../../services/doublons.js';
import { Store } from '../../store.js';
import { DEV_STATE, measuredDev, measuredPort } from '../../services/mesures.js';
import { byId, cablesOf, catOf, labelOf, locLabel, poeColor, poeUsage, portsOf, rackUsage, vlanOf } from '../../services/requetes.js';
import { connectedLabel, effStatus, farEnd, isNetDev, isPassiveNode, otherEnd, outletInfo, scopeOf, STATE_COL, STATE_LABEL } from '../../services/cablage.js';
import { Actions, Changes, Modal, run, stDev, stPort, toast, undoAction, vlanChip } from '../socle.js';
import { Carto, iconOf } from './carto.js';
import { resumeImpact } from '../interventions.js';
import { traceSection } from './tracage.js';
import { structButtons } from './structure.js';
import { Cache } from '../../store.js';

/* Équipements de l'inventaire par adresse MAC, pour rattacher une adresse vue par un switch */
const parMac = () => Cache.get('parMac', () => new Map(Store.db.devices.filter(d => d.mac && d.status !== 'retired').map(d => [normMac(d.mac) || d.mac, d])));

/* ---------- Fiche de détails ---------- */
const kv = rows => `<dl class="kv">${rows.filter(r => r && r[1] !== '' && r[1] != null).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
const li = (id, text, small = '', icon = null) => `<div class="li" data-act="sel" data-id="${id}">${ico(icon || iconOf(id))}<span>${esc(text)}</span>${small ? `<small>${small}</small>` : ''}</div>`;
/* En-tête d'une fiche. « sub » est du HTML : tout texte venu de la base doit y être passé par esc() */
const dHead = (icon, title, sub) => `<div class="d-head"><div class="dico">${ico(icon)}</div><div style="min-width:0"><h2>${esc(title)}</h2><div class="sub">${sub}</div></div></div>`;
const sec = (title, body) => body ? `<div class="d-sec">${title ? `<div class="sec-t">${title}</div>` : ''}${body}</div>` : '';
const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`;
const fmtRate = v => v >= 1000 ? `${(v / 1000).toFixed(2)} Gb/s` : v >= 1 ? `${v.toFixed(1)} Mb/s` : `${Math.round(v * 1000)} kb/s`;
const fmtClock = ts => new Date(ts).toLocaleTimeString('fr-FR');
const mono = s => s ? `<span class="mono">${esc(s)}</span>` : '—';

/* Grille des ports d'un équipement, disposée comme sur la façade */
function portGrid(dev) {
  const c = catOf(dev), ports = portsOf(dev.id), hl = Carto.trace?.nodeSet;
  let i = 0;
  const groups = (c.ports || []).map(grp => {
    const n = grp.names ? grp.names.length : grp.count, list = ports.slice(i, i + n); i += n;
    const two = n >= 16, rows = two ? 2 : 1;
    const cells = list.map(p => {
      const st = effStatus(p), cls = st === 'idle' || st === 'free' ? 'hollow' : st === 'disabled' ? 'dis' : '';
      const far = connectedLabel(p);
      const tip = [`${p.name}`, `${PORT_KIND[p.kind]} · ${PORT_ROLE[p.role]}`, `État : ${STATE_LABEL[st]}`, p.role !== 'pp' ? `VLAN : ${p.vlan == null ? 'Trunk' : p.vlan + ' ' + vlanOf(p.vlan).name}` : '', p.poe.watts ? `PoE : ${p.poe.watts} W` : '', far ? `Connecté : ${far}` : '', p.description].filter(Boolean).join('|');
      return `<i class="pc ${cls} ${Carto.sel === p.id ? 'sel' : ''} ${hl?.has(p.id) ? 'hl' : ''}" style="background:${STATE_COL[st]};${p.kind !== 'rj45' ? 'border-radius:50%;' : ''}" data-act="sel" data-id="${p.id}" data-tip="${esc(tip)}"></i>`;
    });
    return `<div class="pgrp" style="grid-template-rows:repeat(${rows},11px)">${cells.join('')}</div>`;
  });
  return `<div class="pgrid">${groups.join('')}</div>`;
}
function renderDetail() {
  const host = $('#detail'), id = Carto.sel, e = byId(id);
  if (!e) { host.innerHTML = '<div class="empty">Sélectionnez un élément dans l\'arbre ou sur le plan.</div>'; return; }
  const top = host.dataset.id === id ? host.scrollTop : 0;
  host.dataset.id = id;
  host.innerHTML = `<button class="btn m-only m-close" data-act="m-panel" data-p="">${ico('x')}Fermer la fiche</button>` + Detail[typeOf(id)](e) + traceSection();
  host.scrollTop = top;
}
const Detail = {
  site(e) {
    const s = scopeOf(e.id), blds = Store.idx.bldBySite.get(e.id) || [];
    return dHead('site', e.name, esc(e.address)) + sec('', structButtons(e)) + sec('Résumé', kv([['Code', esc(e.code)], ['Bâtiments', blds.length], ['Baies', s.racks.length], ['Équipements', s.devices.length], ['Prises murales', s.outlets.length]])) +
      sec('Bâtiments', blds.map(b => li(b.id, b.name, plural(scopeOf(b.id).devices.length, 'équip.', 'équip.'))).join(''));
  },
  building(e) {
    const s = scopeOf(e.id), floors = Store.idx.floorsByBld.get(e.id) || [];
    return dHead('building', e.name, `Code ${esc(e.code)} · ${esc(byId(e.siteId).name)}`) + sec('', structButtons(e)) + sec('Résumé', kv([['Étages', floors.length], ['Baies', s.racks.length], ['Équipements', s.devices.length], ['Prises murales', s.outlets.length]])) +
      sec('Étages', floors.map(f => li(f.id, f.name, `${scopeOf(f.id).devices.length} équip. · ${scopeOf(f.id).outlets.length} prises`)).join(''));
  },
  floor(e) {
    const s = scopeOf(e.id), rooms = Store.idx.roomsByFloor.get(e.id) || [];
    return dHead('floor', `${byId(e.buildingId).name.split(' — ')[0]} — ${e.name}`, `${e.width} × ${e.height} m`) + sec('', structButtons(e)) + sec('Résumé', kv([['Pièces', rooms.length], ['Baies', s.racks.length], ['Équipements', s.devices.length], ['Prises murales', s.outlets.length]])) +
      sec('Fond de plan', `<p class="muted" style="margin:0 0 8px">${e.planImage ? 'Un plan importé est affiché en fond.' : 'Aucune image : le plan est généré à partir des pièces.'}</p><div class="btns"><button class="btn sm" data-act="plan-img">${ico('image')}Importer un plan</button>${e.planImage ? `<button class="btn sm danger" data-act="plan-img-del">${ico('trash')}Retirer</button>` : ''}</div>`) +
      sec('Pièces', rooms.map(r => li(r.id, r.name, ROOM_TYPES[r.type]?.label || '')).join(''));
  },
  room(e) {
    const I = Store.idx, racks = I.racksByRoom.get(e.id) || [], devs = I.devByRoom.get(e.id) || [], outs = I.outByRoom.get(e.id) || [];
    const st = groupBy(outs, o => outletInfo(o.id).status);
    return dHead('room', e.name, `${ROOM_TYPES[e.type]?.label || ''} · ${esc(locLabel(e.floorId))}`) +
      sec('', structButtons(e)) +
      sec('Résumé', kv([['Surface', `${Math.round(e.w * e.h)} m²`], ['Dimensions', `${e.w} × ${e.h} m`], ['Baies', racks.length], ['Équipements', devs.length], ['Prises murales', outs.length], outs.length ? ['Prises actives', `${(st.get('up') || []).length} / ${outs.length}`] : null])) +
      sec('Baies', racks.map(r => li(r.id, r.name, `${rackUsage(r.id).pct} %`)).join('')) +
      sec('Équipements', devs.map(d => li(d.id, d.hostname, esc(catOf(d).model))).join('')) +
      sec('Prises murales', outs.map(o => { const inf = outletInfo(o.id); return `<div class="li" data-act="sel" data-id="${o.id}"><i class="pc ${inf.status === 'idle' || inf.status === 'free' ? 'hollow' : ''}" style="background:${STATE_COL[inf.status]}"></i><span>${esc(o.label)}</span><small>${OUTLET_USAGE[o.usage]} · ${STATE_LABEL[inf.status]}</small></div>`; }).join(''));
  },
  rack(e) {
    const u = rackUsage(e.id), c = catOf(e);
    return dHead('rack', e.name, esc(locLabel(e.roomId))) +
      sec('Occupation', `<div class="row"><div class="bar grow"><i style="width:${u.pct}%;background:${u.pct >= RACK_FULL_PCT ? COL.serious : 'var(--accent)'}"></i></div><b>${u.used}/${u.total} U</b></div>`) +
      sec('', `<div class="btns"><button class="btn sm pri" data-act="c-view" data-v="rack">${ico('cube')}Vue 3D</button><button class="btn sm" data-act="rack-edit" data-id="${e.id}">${ico('edit')}Modifier</button><button class="btn sm" data-act="rack-print" data-id="${e.id}" data-tip="Imprimer|Fiche de la baie et plan de brassage">${ico('list')}Imprimer</button><button class="btn sm danger" data-act="rack-del" data-id="${e.id}">${ico('trash')}Retirer</button></div>`) +
      sec('Caractéristiques', kv([['Modèle', esc(`${c.brand} ${c.model}`)], ['Hauteur', `${e.heightU} U`], ['N° de série', mono(e.serial)], ['Installée le', fmtDate(e.installDate)], ['Statut', stDev(e.status)]])) +
      sec(`Équipements (${u.devices.length})`, u.devices.map(d => li(d.id, d.hostname, `U${d.u}${catOf(d).heightU > 1 ? '–' + (d.u + catOf(d).heightU - 1) : ''}`)).join('') || '<span class="dim">Baie vide</span>');
  },
  device(e) {
    const c = catOf(e), ports = portsOf(e.id), cat = CATEGORIES[c.category], poe = c.poeBudgetW ? poeUsage(e) : null;
    const used = ports.filter(p => cablesOf(p.id).length || (p.role !== 'pp' && p.status === 'up')).length;
    const retired = e.status === 'retired', md = measuredDev(e.id);
    return dHead(cat.icon, e.hostname, `${cat.one} · ${esc(c.brand)} ${esc(c.model)}`) +
      sec('', `<div class="btns"><button class="btn sm" data-act="dev-edit" data-id="${e.id}">${ico('edit')}Modifier</button>${retired ? '' : `<button class="btn sm" data-act="dev-move" data-id="${e.id}">${ico('move')}Déplacer</button><button class="btn sm" data-act="dev-replace" data-id="${e.id}" data-tip="Remplacer|Échange par un modèle du stock : nom, adresse, configuration et câblage sont repris">${ico('reset')}Remplacer</button><button class="btn sm danger" data-act="dev-remove" data-id="${e.id}">${ico('out')}Retirer</button>`}${e.rackId ? '' : `<button class="btn sm" data-act="c-view" data-v="rack">${ico('cube')}Vue 3D</button>`}</div>`) +
      (isNetDev(e) && !retired ? sec(`${ico('alert')}En cas de panne`, `<div class="impact"><span>${resumeImpact(e.id) || 'Rien de raccordé'}</span><button class="btn sm" data-act="impact" data-id="${e.id}">Détail</button></div>`) : '') +
      sec('Identification', kv([['Statut', stDev(e.status)], ['Emplacement', esc(locLabel(e.id))], ['Adresse IP', mono(e.ip)], ['Adresse MAC', mono(e.mac)], ['N° de série', mono(e.serial)], ['Firmware', esc(e.firmware) || '—'], ['Installé le', fmtDate(e.installDate)], c.heightU ? ['Hauteur', `${c.heightU} U`] : null, c.powerW ? ['Consommation', `${c.powerW} W`] : null, e.notes ? ['Notes', esc(e.notes)] : null])) +
      (md ? sec(`${ico('gauge')}Supervision`, kv([['État mesuré', `<span class="st"><i style="background:${DEV_STATE[md.state].color}"></i>${DEV_STATE[md.state].label}</span>`], md.message ? ['Message', esc(md.message)] : null, ['Ports suivis', ports.filter(x => measuredPort(x.id)).length], ['Relevé', fmtClock(md.ts)]])) : '') +
      (poe ? sec('Budget PoE', `<div class="row"><div class="bar grow"><i style="width:${Math.min(100, poe.pct)}%;background:${poe.pct >= POE_WARN_PCT ? COL.serious : '#f0b93a'}"></i></div><b>${poe.used} / ${poe.budget} W</b></div>`) : '') +
      (ports.length ? sec(`Ports (${used} utilisés sur ${ports.length})`, portGrid(e)) : '');
  },
  port(p) {
    const dev = byId(p.deviceId), passive = p.role === 'pp', st = effStatus(p), cabs = cablesOf(p.id);
    const far = passive ? null : farEnd(p.id);
    const f = (label, html) => `<label>${label}</label>${html}`;
    const inp = (field, val, extra = '') => `<input type="text" data-chg="port-f" data-id="${p.id}" data-f="${field}" value="${esc(val)}" ${extra}>`;
    const speeds = [10, 100, 1000, 2500, 10000, 25000];
    const form = passive ? `<div class="fld">${f('État', `<div class="ro"><span class="st"><i style="background:${STATE_COL[st]}"></i>${STATE_LABEL[st]}</span></div>`)}${f('Description', inp('description', p.description))}</div>` :
      `<div class="fld">
        ${f('État', `<select data-chg="port-f" data-id="${p.id}" data-f="status">${Object.entries(PORT_STATUS).map(([k, v]) => opt(k, v.label, p.status)).join('')}</select>`)}
        ${f(`VLAN <a data-act="vlans" style="cursor:pointer;font-size:11px" data-tip="Gérer les VLAN">gérer</a>`, `<select data-chg="port-f" data-id="${p.id}" data-f="vlan">${opt('', 'Trunk (tous les VLAN)', p.vlan ?? '')}${[...(Store.idx.vlan.has(p.vlan) || p.vlan == null ? [] : [{ id: p.vlan, name: '' }]), ...Store.db.vlans].map(v => opt(v.id, `${v.id} ${v.name}`, p.vlan ?? '')).join('')}</select>`)}
        ${f('Débit', `<select data-chg="port-f" data-id="${p.id}" data-f="speed">${speeds.map(s => opt(s, fmtSpeed(s), p.speed)).join('')}</select>`)}
        ${p.poe.capable ? f('PoE (W)', `<input type="number" min="0" max="90" step="0.5" data-chg="port-f" data-id="${p.id}" data-f="watts" value="${p.poe.watts}">`) : f('PoE', '<div class="ro dim">Non disponible</div>')}
        ${f('Adresse MAC', inp('mac', p.mac, 'class="mono" placeholder="02:00:00:00:00:00"'))}
        ${f('Appareil connecté', far ? `<div class="ro"><a data-act="sel" data-id="${far.id}" style="cursor:pointer">${esc(connectedLabel(p))}</a></div>` : inp('connected', p.connected, 'placeholder="Nom de l\'appareil"'))}
        ${f('Description', inp('description', p.description))}</div>`;
    // Mesure en direct, si une source de supervision suit ce port
    const m = passive ? null : measuredPort(p.id), gap = m?.status && m.status !== p.status;
    const liveSec = m ? sec(`${ico('gauge')}Mesure en direct`, kv([['État mesuré', stPort(m.status || p.status)], gap ? ['Écart', `<span class="st"><span style="color:${COL.warn};display:flex">${ico('alert')}</span>Saisi : ${PORT_STATUS[p.status].label}</span>`] : null,
      m.inMbps != null ? ['Trafic entrant', fmtRate(m.inMbps)] : null, m.outMbps != null ? ['Trafic sortant', fmtRate(m.outMbps)] : null, m.totalMbps != null ? ['Trafic total', fmtRate(m.totalMbps)] : null, m.speedMbps ? ['Débit négocié', fmtSpeed(m.speedMbps)] : null, m.poeW ? ['PoE mesuré', `${m.poeW} W`] : null,
      m.errors ? ['Erreurs de trame', `<span class="st"><span style="color:${COL.warn};display:flex">${ico('alert')}</span>${m.errors}</span> <small class="dim">depuis le relevé précédent</small>`] : null,
      // Une adresse vue par le switch est rattachée à l'équipement de l'inventaire qui la porte : le lien entre le port et ce qui y est branché
      m.macCount > m.macs.length ? ['MAC vues', `${m.macCount} adresses : ce port mène à un autre switch`] : m.macs.length ? ['MAC vues', m.macs.slice(0, 8).map(a => { const x = parMac().get(normMac(a) || a); return `${mono(a)}${x ? ` → <a data-act="sel" data-id="${x.id}" style="cursor:pointer">${esc(x.hostname)}</a>` : ' <small class="dim">inconnue de l\'inventaire</small>'}`; }).join('<br>')] : null, ['Relevé', fmtClock(m.ts)]])) : '';
    const cabList = cabs.map(c => { const o = otherEnd(c, p.id), side = passive ? (isPassiveNode(o) ? 'Arrière' : 'Avant') : ''; return `<div class="li" data-act="sel" data-id="${o}">${ico('cable')}<span>${side ? side + ' : ' : ''}${esc(labelOf(o))}</span><small>${esc(c.type.toUpperCase())} · ${c.length} m</small></div>`; }).join('') || '<span class="dim">Aucun câble sur ce port</span>';
    return dHead(passive ? 'passive' : 'switch', `${p.name}`, `Port de <a data-act="sel" data-id="${dev.id}" style="cursor:pointer">${esc(dev.hostname)}</a> · ${esc(locLabel(dev.id, { short: true }))}`) +
      sec('', `<div class="btns"><button class="btn sm pri" data-act="trace" data-id="${p.id}" ${cabs.length ? '' : 'disabled'}>${ico('trace')}Tracer</button><button class="btn sm" data-act="connect" data-id="${p.id}">${ico('link')}Connecter à…</button>${passive ? '' : p.status === 'disabled' ? `<button class="btn sm" data-act="port-retablir" data-id="${p.id}">${ico('bolt')}Réactiver</button>` : `<button class="btn sm danger" data-act="port-couper" data-id="${p.id}" data-tip="Désactiver le port|Avec un motif, noté dans l'historique">${ico('x')}Désactiver</button>`}<button class="btn sm danger" data-act="disconnect" data-id="${p.id}" ${cabs.length ? '' : 'disabled'}>${ico('unlink')}Débrancher</button></div>`) +
      sec('Port', kv([['Identifiant', mono(p.id)], ['Type', `${PORT_KIND[p.kind]} · ${PORT_ROLE[p.role]}`], passive ? null : ['PoE', p.poe.capable ? (p.poe.watts ? `<span class="st"><i style="background:${poeColor(p.poe.watts)}"></i>${p.poe.watts} W</span>` : 'Oui (aucune charge)') : 'Non']])) +
      liveSec + sec('Configuration', form) + sec('Câblage', cabList);
  },
  outlet(o) {
    const inf = outletInfo(o.id), cabs = cablesOf(o.id);
    return dHead('outlet', `Prise ${o.label}`, esc(locLabel(o.roomId))) +
      sec('', `<div class="btns"><button class="btn sm pri" data-act="trace" data-id="${o.id}" ${cabs.length ? '' : 'disabled'}>${ico('trace')}Tracer</button><button class="btn sm" data-act="connect" data-id="${o.id}">${ico('link')}Connecter à…</button><button class="btn sm danger" data-act="disconnect" data-id="${o.id}" ${cabs.length ? '' : 'disabled'}>${ico('unlink')}Débrancher</button><button class="btn sm danger" data-act="outlet-del" data-id="${o.id}">${ico('trash')}Supprimer</button></div>`) +
      sec('Prise', `<div class="fld"><label>Repère</label><input type="text" data-chg="outlet-f" data-id="${o.id}" data-f="label" value="${esc(o.label)}">
        <label>Usage</label><select data-chg="outlet-f" data-id="${o.id}" data-f="usage">${Object.entries(OUTLET_USAGE).map(([k, v]) => opt(k, v, o.usage)).join('')}</select>
        <label>Identifiant</label><div class="ro mono">${o.id}</div><label>Position</label><div class="ro">x ${o.x} m · y ${o.y} m</div></div>`) +
      sec('Chaîne de liaison', kv([['État', `<span class="st"><i style="background:${STATE_COL[inf.status]}"></i>${STATE_LABEL[inf.status]}</span>`],
        ['Panneau', inf.pp ? `<a data-act="sel" data-id="${inf.pp.id}" style="cursor:pointer">${esc(labelOf(inf.pp.id))}</a>` : '—'],
        ['Switch', inf.net ? `<a data-act="sel" data-id="${inf.net.id}" style="cursor:pointer">${esc(labelOf(inf.net.id))}</a>` : '—'],
        inf.net ? ['VLAN', vlanChip(inf.net.vlan)] : null, inf.net ? ['Débit', fmtSpeed(inf.net.speed)] : null,
        inf.net && inf.net.poe.watts ? ['PoE', `${inf.net.poe.watts} W`] : null,
        ['Terminal', inf.term ? `<a data-act="sel" data-id="${inf.term.deviceId}" style="cursor:pointer">${esc(byId(inf.term.deviceId).hostname)}</a>` : esc(inf.net?.connected) || '—']]));
  },
};

/* --- Modification d'un port ou d'une prise depuis la fiche --- */
const PORT_FIELD = { status: 'état', vlan: 'VLAN', speed: 'débit', watts: 'PoE', mac: 'MAC', connected: 'appareil connecté', description: 'description' };
Changes['port-f'] = el => {
  const p = byId(el.dataset.id), f = el.dataset.f;
  let v = el.value.trim(), shown = v;
  if (f === 'vlan') { v = v === '' ? null : +v; shown = v == null ? 'Trunk' : `${v} (${vlanOf(v).name})`; }
  if (f === 'speed') { v = +v; shown = fmtSpeed(v); }
  if (f === 'status') shown = PORT_STATUS[v].label;
  if (f === 'watts') { v = clamp(+v || 0, 0, 90); shown = `${v} W`; }
  if (f === 'mac' && v && !/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(v)) { renderDetail(); throw new Error('Adresse MAC invalide (format attendu : 02:00:00:00:00:00).'); }
  Store.commit('edit', `Port ${labelOf(p.id)} : ${PORT_FIELD[f]} → ${shown || '(vide)'}`, () => {
    if (f === 'watts') p.poe.watts = v; else p[f] = v;
    if (f === 'status' && v !== 'up') p.poe.watts = 0;
  }, p.id);
};
Changes['outlet-f'] = el => {
  const o = byId(el.dataset.id), f = el.dataset.f, v = el.value.trim();
  if (f === 'label') {
    if (!v) { renderDetail(); throw new Error('Le repère de la prise ne peut pas être vide.'); }
    try { verifierUnicite({ label: v }, o.id); } catch (e) { renderDetail(); throw e; }
  }
  Store.commit('edit', `Prise ${o.label} : ${f === 'label' ? 'repère' : 'usage'} → ${f === 'label' ? v : OUTLET_USAGE[v]}`, () => { o[f] = v; }, o.id);
};
/* --- Modification d'un équipement ou d'une baie --- */
Actions['dev-edit'] = el => {
  const d = byId(el.dataset.id);
  Modal.open({
    title: `Modifier ${esc(d.hostname)}`,
    body: `<div class="form-grid">
      <label class="f"><span>Nom d'hôte</span><input type="text" name="hostname" value="${esc(d.hostname)}" autofocus></label>
      <label class="f"><span>Statut</span><select name="status">${Object.entries(DEVICE_STATUS).filter(([k]) => k !== 'retired' || d.status === 'retired').map(([k, v]) => opt(k, v.label, d.status)).join('')}</select></label>
      <label class="f"><span>Adresse IP</span><input type="text" name="ip" class="mono" value="${esc(d.ip)}"></label>
      <label class="f"><span>Adresse MAC</span><input type="text" name="mac" class="mono" value="${esc(d.mac)}"></label>
      <label class="f"><span>N° de série</span><input type="text" name="serial" class="mono" value="${esc(d.serial)}"></label>
      <label class="f"><span>Firmware</span><input type="text" name="firmware" value="${esc(d.firmware)}"></label>
      <label class="f"><span>Date d'installation</span><input type="date" name="installDate" value="${esc(d.installDate)}"></label>
      <label class="f full"><span>Notes</span><textarea name="notes" rows="2">${esc(d.notes)}</textarea></label></div>`,
    ok: 'Enregistrer',
    onOk(v) {
      if (!v.hostname) throw new Error('Le nom d\'hôte est obligatoire.');
      if (v.ip && !ipValide(v.ip)) throw new Error('Adresse IP invalide.');
      if (v.mac) { const mac = normMac(v.mac); if (!mac) throw new Error('Adresse MAC invalide (attendu : aa:bb:cc:dd:ee:ff).'); v.mac = mac; }
      verifierUnicite({ hostname: v.hostname, ip: v.ip, mac: v.mac }, d.id);
      Store.commit('edit', `Modification de ${v.hostname}`, () => Object.assign(d, v), d.id);
      toast('Équipement modifié', 'ok', undoAction);
      return true;
    },
  });
};
Actions['rack-edit'] = el => {
  const r = byId(el.dataset.id);
  Modal.open({
    title: `Modifier ${esc(r.name)}`,
    body: `<div class="form-grid"><label class="f"><span>Nom</span><input type="text" name="name" value="${esc(r.name)}" autofocus></label>
      <label class="f"><span>N° de série</span><input type="text" name="serial" class="mono" value="${esc(r.serial)}"></label>
      <label class="f"><span>Date d'installation</span><input type="date" name="installDate" value="${esc(r.installDate)}"></label></div>`,
    ok: 'Enregistrer',
    onOk(v) { if (!v.name) throw new Error('Le nom est obligatoire.'); verifierUnicite({ rackName: v.name }, r.id); Store.commit('edit', `Modification de la baie ${v.name}`, () => Object.assign(r, v), r.id); return true; },
  });
};
/* --- Fond de plan importé --- */
Actions['plan-img'] = () => { const f = $('#file-image'); f.value = ''; f.click(); };
$('#file-image').addEventListener('change', e => {
  const file = e.target.files[0], floor = byId(Carto.floorId);
  if (!file || !floor) return;
  const rd = new FileReader();
  rd.onload = () => run(() => {
    if (rd.result.length > 3e6) toast('Image volumineuse : la sauvegarde locale peut échouer. Préférez une image de moins de 2 Mo.', 'warn');
    Store.commit('edit', `Fond de plan importé pour ${labelOf(floor.id)}`, () => { floor.planImage = rd.result; }, floor.id);
  });
  rd.readAsDataURL(file);
});
Actions['plan-img-del'] = () => { const floor = byId(Carto.floorId); Store.commit('edit', `Fond de plan retiré pour ${labelOf(floor.id)}`, () => { floor.planImage = ''; }, floor.id); };

export { dHead, kv, li, mono, opt, renderDetail, sec };
