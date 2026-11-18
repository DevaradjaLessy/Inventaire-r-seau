/* Cartographie — affichage du chemin de câblage tracé. */
import { CABLE_TYPES, COL, PORT_KIND } from '../../config.js';
import { $, esc, typeOf } from '../../utils.js';
import { ico } from '../../icones.js';
import { byId, labelOf, locLabel, locOf } from '../../services/requetes.js';
import { STATE_LABEL } from '../../services/cablage.js';
import { trace } from '../../services/tracage.js';
import { Actions, toast } from '../socle.js';
import { Carto, K, renderCarto } from './carto.js';

/* ---------- Traçage du câblage ---------- */
Actions.trace = el => {
  const tr = trace(el.dataset.id);
  if (tr.nodes.length < 2) throw new Error('Rien n\'est branché sur cet élément.');
  Carto.trace = tr;
  renderCarto();
  toast(tr.complete ? `Chemin tracé jusqu'au cœur : ${tr.nodes.length} points, ${tr.cables.length} câbles` : `Chemin partiel : ${tr.stop}`, tr.complete ? 'ok' : 'warn');
};
Actions['trace-clear'] = () => { Carto.trace = null; renderCarto(); };
/* Liste des sauts du chemin, affichée dans la fiche */
function traceSection() {
  const tr = Carto.trace;
  if (!tr) return '';
  const rows = [];
  let ci = 0;
  tr.nodes.forEach((n, i) => {
    if (i > 0) {
      if (tr.internal.has(i)) rows.push(`<div class="hop"><span class="n" style="visibility:hidden"></span><span class="cabl">↓ traversée de ${esc(byId(byId(n).deviceId).hostname)}</span></div>`);
      else { const c = tr.cables[ci++]; if (c) rows.push(`<div class="hop"><span class="n" style="visibility:hidden"></span><span class="cabl">↓ ${esc(CABLE_TYPES[c.type]?.label || c.type)} · ${c.length} m${c.label ? ' · ' + esc(c.label) : ''}</span></div>`); }
    }
    const t = typeOf(n), e = byId(n);
    const sub = t === 'outlet' ? locLabel(e.roomId) : `${PORT_KIND[e.kind]}${e.role === 'pp' ? '' : ' · ' + STATE_LABEL[e.status]} · ${locLabel(e.deviceId, { short: true })}`;
    rows.push(`<div class="hop" data-act="sel" data-id="${n}"><span class="n">${i + 1}</span><div><b>${esc(labelOf(n))}</b><div class="cabl">${esc(sub)}</div></div></div>`);
  });
  return `<div class="d-sec"><div class="sec-t">${ico('trace')}Chemin de câblage<button class="btn sm" style="margin-left:auto" data-act="trace-clear">${ico('x')}Effacer</button></div>
    <div class="muted" style="margin-bottom:6px">${tr.complete ? `<span class="st"><i style="background:${COL.up}"></i>Chemin complet jusqu'au cœur</span>` : `<span class="st"><i style="background:${COL.warn}"></i>Chemin partiel</span> — ${esc(tr.stop)}`}</div>${rows.join('')}</div>`;
};
/* Position sur le plan d'un nœud du chemin, s'il est sur l'étage affiché */
function tracePoint(n, floorId) {
  const l = locOf(n);
  if (l.floor?.id !== floorId) return null;
  const e = l.rack || l.device || l.outlet;
  return e && e.x != null ? { x: e.x * K, y: e.y * K, id: e.id } : null;
}
function drawPlanTrace() {
  const g = $('#plan-trace'), tr = Carto.trace;
  if (!g || !tr) return;
  const pts = [];
  let leaves = false;
  for (const n of tr.nodes) { const p = tracePoint(n, Carto.floorId); if (!p) { if (pts.length) leaves = true; continue; } if (!pts.length || pts.at(-1).id !== p.id) pts.push(p); }
  if (!pts.length) { g.innerHTML = ''; return; }
  // Tracé en équerre entre deux points successifs
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L${pts[i].x} ${pts[i - 1].y} L${pts[i].x} ${pts[i].y}`;
  const last = pts.at(-1), others = tr.nodes.some(n => !tracePoint(n, Carto.floorId));
  g.innerHTML = `<path class="trace-line" d="${d}"/>${pts.map(p => `<circle class="trace-halo" cx="${p.x}" cy="${p.y}" r="11"/>`).join('')}
    ${others ? `<text x="${last.x + 14}" y="${last.y - 12}" fill="var(--hl)" font-size="8" font-weight="700">↗ suite du chemin sur un autre étage</text>` : ''}`;
};

export { drawPlanTrace, traceSection };
