/* Moteur 3D — registre des gabarits, disposition des ports et dessin des façades sur canvas. */
import { PORT_KIND, PORT_ROLE, U_M } from '../config.js';
import { fmtSpeed, luminance, mulberry32, shade, sum, typeOf } from '../utils.js';
import { byId, cablesOf, labelOf, poeColor, vlanOf } from '../services/requetes.js';
import { connectedLabel, effStatus, isNetDev, segment, STATE_COL, STATE_LABEL } from '../services/cablage.js';

const FACE_W = 0.44;                 // largeur d'une façade 19", hors oreilles (m)
const FACE_PPM = 2048 / FACE_W;      // pixels de texture par mètre
const PORT_DIM = {                   // taille d'un port et pas entre deux ports (m)
  rj45: { w: 0.0118, h: 0.0098, pitch: 0.0136 },
  sfp: { w: 0.0136, h: 0.0088, pitch: 0.0152 },
  'sfp+': { w: 0.0136, h: 0.0088, pitch: 0.0152 },
  lc: { w: 0.0105, h: 0.0085, pitch: 0.0128 },
};

/* ---------- Registre des gabarits 3D ----------
   type « facade »    : équipement 19" dont la façade est dessinée sur un canvas
                        (left / right = marges réservées au décor, depth = profondeur)
   type « enclosure » : baie ou coffret
   type « object »    : objet autonome construit en géométrie (borne, téléphone…)
   Pour ajouter une forme : GABARITS.monGabarit = { type, … } */
const GABARITS = {
  switch:   { type: 'facade', left: 0.036, right: 0.008, depth: 0.30, decor: 'active' },
  router:   { type: 'facade', left: 0.060, right: 0.070, depth: 0.30, decor: 'active', vent: true },
  firewall: { type: 'facade', left: 0.062, right: 0.012, depth: 0.25, decor: 'active' },
  patch:    { type: 'facade', left: 0.020, right: 0.020, depth: 0.09, decor: 'patch', center: true, rowMajor: true },
  fiber:    { type: 'facade', left: 0.040, right: 0.040, depth: 0.25, decor: 'fiber', center: true },
  cablemgr: { type: 'facade', left: 0.020, right: 0.020, depth: 0.05, decor: 'cablemgr' },
  server:   { type: 'facade', left: 0.325, right: 0.010, depth: 0.72, decor: 'server' },
  ups:      { type: 'facade', left: 0.400, right: 0.012, depth: 0.62, decor: 'ups' },
  rack:     { type: 'enclosure' },
  wallrack: { type: 'enclosure', wall: true },
  ap:       { type: 'object' }, phone: { type: 'object' }, camera: { type: 'object' }, outlet: { type: 'object' }, sfp: { type: 'object' }, cable: { type: 'object' },
};
const gabarit = cat => GABARITS[cat.template] || GABARITS.switch;
const portNames = cat => (cat.ports || []).flatMap(g => g.names ? g.names : Array.from({ length: g.count }, (_, i) => `${g.prefix || ''}${(g.start ?? 1) + i}`));

/* Position de chaque port sur la façade (repère centré, en mètres). Sert à la
   texture, aux zones de clic, aux LEDs et aux points d'accroche des cordons. */
const layoutCache = new Map();
function facadeLayout(cat) {
  const key = JSON.stringify([cat.template, cat.heightU, cat.ports]);
  if (layoutCache.has(key)) return layoutCache.get(key);
  const tpl = gabarit(cat), hU = cat.heightU || 1, H = hU * U_M - 0.002;
  const left = tpl.left ?? 0.03, right = tpl.right ?? 0.01, avail = FACE_W - left - right, GAP = 0.008, BLOCK = 0.004;
  const groups = (cat.ports || []).map(g => {
    const n = g.names ? g.names.length : g.count, d = PORT_DIM[g.kind] || PORT_DIM.rj45;
    const rows = tpl.center ? (hU >= 2 && n > 24 ? 2 : 1) : n >= 16 ? 2 : 1, cols = Math.ceil(n / rows), blocks = g.kind === 'rj45' || g.kind === 'lc';
    return { g, n, d, rows, cols, blocks, width: cols * d.pitch + (blocks ? Math.floor((cols - 1) / 6) * BLOCK : 0) };
  });
  const total = sum(groups, x => x.width) + Math.max(0, groups.length - 1) * GAP;
  const k = total > avail ? avail / total : 1;
  let cx = -FACE_W / 2 + left + (tpl.center ? (avail - total * k) / 2 : 0), idx = 0;
  const ports = [];
  for (const G of groups) {
    const rowPitch = hU >= 2 && G.rows === 2 ? U_M : 0.0145;
    for (let i = 0; i < G.n; i++) {
      const col = tpl.rowMajor ? i % G.cols : Math.floor(i / G.rows), row = tpl.rowMajor ? Math.floor(i / G.cols) : i % G.rows;
      const x = cx + (col * G.d.pitch + (G.blocks ? Math.floor(col / 6) * BLOCK : 0) + G.d.pitch / 2) * k;
      const y = G.rows === 2 ? (row === 0 ? rowPitch / 2 : -rowPitch / 2) : 0;
      ports.push({ idx: idx++, x, y, w: G.d.w * k, h: G.d.h, kind: G.g.kind, role: G.g.role, top: G.rows === 1 || row === 0, col, block: G.blocks ? Math.floor(col / 6) : 0 });
    }
    cx += (G.width + GAP) * k;
  }
  const L = { H, hU, ports, freeFrom: cx, left, right };
  layoutCache.set(key, L);
  return L;
}

/* Dessine la façade d'un modèle sur un canvas (une texture par modèle, mise en cache) */
const facadeCache = new Map();
function drawFacade(cat) {
  const key = JSON.stringify([cat.template, cat.heightU, cat.ports, cat.visual, cat.brand, cat.model]);
  if (facadeCache.has(key)) return facadeCache.get(key);
  const L = facadeLayout(cat), tpl = gabarit(cat), v = cat.visual || {};
  const cw = 2048, ch = Math.round(L.H * FACE_PPM);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const c = cv.getContext('2d');
  const X = m => (m + FACE_W / 2) * FACE_PPM, Y = m => (L.H / 2 - m) * FACE_PPM, S = m => m * FACE_PPM;
  const base = v.color || '#2a3038', light = luminance(base) > 0.5;
  const ink = light ? '#1b2026' : '#dfe4ea', ink2 = light ? 'rgba(20,24,28,.6)' : 'rgba(225,231,238,.55)', accent = v.accent || '#38bdf8';
  const names = portNames(cat);
  const text = (s, x, y, px, o = {}) => { c.font = `${o.w || 600} ${px}px system-ui, Arial, sans-serif`; c.textAlign = o.a || 'left'; c.textBaseline = o.b || 'alphabetic'; c.fillStyle = o.c || ink; if (o.max) { const m = c.measureText(s).width; if (m > o.max) c.font = `${o.w || 600} ${Math.max(8, px * o.max / m)}px system-ui, Arial, sans-serif`; } c.fillText(s, x, y); };
  const dot = (x, y, r, col) => { c.fillStyle = '#05070a'; c.beginPath(); c.arc(x, y, r + 1.5, 0, 7); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
  const vent = (x0, x1, y0 = 0.2, y1 = 0.8) => { c.fillStyle = 'rgba(0,0,0,.72)'; for (let y = ch * y0; y < ch * y1; y += 13) for (let x = X(x0) + ((Math.round(y / 13) % 2) * 7); x < X(x1); x += 14) { c.beginPath(); c.arc(x, y, 4.2, 0, 7); c.fill(); } };
  // Fond : dégradé, effet brossé, liseré
  const gr = c.createLinearGradient(0, 0, 0, ch);
  gr.addColorStop(0, shade(base, 0.1)); gr.addColorStop(0.5, base); gr.addColorStop(1, shade(base, -0.2));
  c.fillStyle = gr; c.fillRect(0, 0, cw, ch);
  const rnd = mulberry32(7);
  c.globalAlpha = 0.05; for (let i = 0; i < 200; i++) { c.fillStyle = rnd() > 0.5 ? '#fff' : '#000'; c.fillRect(0, rnd() * ch, cw, 1); } c.globalAlpha = 1;
  c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 4; c.strokeRect(2, 2, cw - 4, ch - 4);
  c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(4, 4, cw - 8, 2);
  const lx = 14, lw = S(L.left) - 22;   // colonne de gauche : logo, modèle, voyants
  const logo = v.logo ?? cat.brand;
  if (tpl.decor === 'active') {
    text(logo, lx, 40, 30, { w: 800, max: lw });
    c.fillStyle = accent; c.fillRect(lx, 48, Math.min(lw, 70), 4);
    text(cat.model, lx, 72, 13, { c: ink2, max: lw });
    ['SYS', 'STA', 'PWR'].forEach((t, i) => { dot(lx + 8 + i * 34, 96, 4.5, i === 1 && cat.category === 'firewall' ? '#ffb020' : '#2fe05a'); text(t, lx + 8 + i * 34, 116, 9, { a: 'center', c: ink2 }); });
    if (tpl.vent) vent(FACE_W / 2 - L.right + 0.006, FACE_W / 2 - 0.008);
    else if (FACE_W / 2 - L.right - L.freeFrom > 0.05) vent(L.freeFrom + 0.004, FACE_W / 2 - L.right - 0.004);
  } else if (tpl.decor === 'patch') {
    text(logo, cw - 14, ch / 2 + 5, 15, { a: 'right', c: ink2, max: S(L.right + 0.03) });
    // Bandeau d'étiquettes blanc au-dessus de chaque bloc de 6 ports
    const seen = new Set();
    for (const p of L.ports) { const k = `${p.block}:${p.y}`; if (seen.has(k)) continue; seen.add(k); const blk = L.ports.filter(q => q.block === p.block && q.y === p.y); const x0 = X(blk[0].x - blk[0].w / 2), x1 = X(blk.at(-1).x + blk.at(-1).w / 2); c.fillStyle = '#e9ecef'; c.fillRect(x0, Y(p.y + p.h / 2 + 0.0078), x1 - x0, S(0.0052)); }
  } else if (tpl.decor === 'fiber') {
    text(logo, lx, ch / 2 + 6, 17, { w: 700, c: ink2 });
    c.fillStyle = '#e8c21d'; c.beginPath(); c.moveTo(cw - 60, ch / 2 + 22); c.lineTo(cw - 34, ch / 2 - 24); c.lineTo(cw - 8, ch / 2 + 22); c.fill();
    text('!', cw - 34, ch / 2 + 16, 26, { a: 'center', w: 800, c: '#111' });
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(S(0.03), ch - 16, cw - S(0.06), 6);
  } else if (tpl.decor === 'cablemgr') {
    c.fillStyle = 'rgba(0,0,0,.45)'; for (let i = 0; i < 5; i++) c.fillRect(X(-0.16 + i * 0.08) - 46, ch * 0.3, 92, ch * 0.4);
  } else if (tpl.decor === 'server') {
    text(logo, lx, 30, 20, { w: 800, max: 90 });
    dot(lx + 12, ch / 2 + 6, 9, '#2fe05a'); text(cat.model, lx, ch - 46, 10, { c: ink2, max: 96 });
    // Baies de disques
    const x0 = 0.03 - FACE_W / 2, x1 = L.left - FACE_W / 2 - 0.012, hor = L.hU === 1;
    const cols = hor ? 4 : 16, rows = hor ? 2 : 1, bw = (x1 - x0) / cols, bh = (L.H - 0.008) / rows;
    for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) {
      const bx = X(x0 + i * bw) + 3, by = Y(L.H / 2 - 0.004 - r * bh) + 3, w = S(bw) - 6, h = S(bh) - 6;
      c.fillStyle = '#0b0c0e'; c.fillRect(bx, by, w, h);
      c.fillStyle = '#191c20'; c.fillRect(bx + 3, by + 3, w - 6, h - 6);
      c.fillStyle = 'rgba(0,0,0,.8)'; for (let yy = by + 9; yy < by + h - 12; yy += 9) for (let xx = bx + 9 + (Math.round(yy / 9) % 2) * 5; xx < bx + w - 8; xx += 10) { c.beginPath(); c.arc(xx, yy, 2.6, 0, 7); c.fill(); }
      c.fillStyle = '#2fe05a'; c.fillRect(bx + w - 14, by + h - 9, 6, 3); c.fillStyle = accent; c.fillRect(bx + 6, by + h - 9, 14, 3);
    }
  } else if (tpl.decor === 'ups') {
    text(logo, lx, 44, 30, { w: 800, max: 130 }); text(cat.model, lx, 70, 13, { c: ink2, max: 200 });
    c.fillStyle = accent; c.fillRect(lx, ch - 30, 120, 6);
    // Grille d'aération et afficheur
    c.fillStyle = 'rgba(0,0,0,.6)'; for (let y = 26; y < ch - 26; y += 16) c.fillRect(S(0.05), y, S(0.2), 8);
    const sx = S(0.275), sy = ch / 2 - 62, sw = S(0.085), sh = 124;
    c.fillStyle = '#05070a'; c.fillRect(sx - 8, sy - 8, sw + 16, sh + 16);
    const sg = c.createLinearGradient(0, sy, 0, sy + sh); sg.addColorStop(0, '#1d4f8f'); sg.addColorStop(1, '#0d2a52'); c.fillStyle = sg; c.fillRect(sx, sy, sw, sh);
    text('230 V', sx + 14, sy + 36, 24, { w: 700, c: '#d8ecff' }); text('CHARGE 42 %', sx + 14, sy + 66, 17, { c: '#a9d0ff' }); text('AUTONOMIE 18 min', sx + 14, sy + 94, 15, { c: '#a9d0ff' });
    c.fillStyle = '#7fd08a'; c.fillRect(sx + 14, sy + 104, sw * 0.42, 8);
    for (let i = 0; i < 3; i++) { c.fillStyle = '#0a0c0f'; c.beginPath(); c.arc(S(0.375) + i * 34, ch / 2, 12, 0, 7); c.fill(); c.strokeStyle = ink2; c.lineWidth = 2; c.stroke(); }
  }
  // Ports
  for (const p of L.ports) {
    const x = X(p.x - p.w / 2), y = Y(p.y + p.h / 2), w = S(p.w), h = S(p.h), nm = names[p.idx] || '';
    const num = /\d+$/.test(nm) && nm.length > 5 ? nm.match(/\d+$/)[0] : nm;
    if (p.kind === 'rj45') {
      const metal = p.role !== 'pp';
      c.fillStyle = metal ? '#a7adb4' : '#2b2f35'; c.fillRect(x - 3, y - 3, w + 6, h + 6);
      c.fillStyle = '#050607'; c.fillRect(x, y, w, h);
      // Ergot du connecteur et contacts dorés
      const tw = w * 0.4, th = h * 0.2;
      c.fillStyle = metal ? '#a7adb4' : '#2b2f35'; if (p.top) { c.fillRect(x, y, (w - tw) / 2, th); c.fillRect(x + (w + tw) / 2, y, (w - tw) / 2, th); } else { c.fillRect(x, y + h - th, (w - tw) / 2, th); c.fillRect(x + (w + tw) / 2, y + h - th, (w - tw) / 2, th); }
      c.fillStyle = '#c8a64e'; for (let k2 = 0; k2 < 8; k2++) c.fillRect(x + w * 0.15 + k2 * w * 0.09, p.top ? y + h - h * 0.3 : y + 2, w * 0.045, h * 0.26);
    } else if (p.kind === 'lc') {
      c.fillStyle = '#12151a'; c.fillRect(x - 3, y - 3, w + 6, h + 6);
      c.fillStyle = p.idx % 2 ? '#2c9aa0' : '#35c2c2'; c.fillRect(x, y, w, h);
      c.fillStyle = '#06080a'; c.beginPath(); c.arc(x + w * 0.28, y + h / 2, h * 0.24, 0, 7); c.arc(x + w * 0.72, y + h / 2, h * 0.24, 0, 7); c.fill();
    } else {
      c.fillStyle = '#b9bec5'; c.fillRect(x - 3, y - 3, w + 6, h + 6);
      c.fillStyle = '#08090b'; c.fillRect(x, y, w, h);
      c.fillStyle = '#23272d'; c.fillRect(x + 3, y + h * 0.55, w - 6, h * 0.3);
      c.fillStyle = '#8d939b'; c.beginPath(); c.moveTo(x + w / 2 - 6, p.top ? y - 3 : y + h + 3); c.lineTo(x + w / 2 + 6, p.top ? y - 3 : y + h + 3); c.lineTo(x + w / 2, p.top ? y + 4 : y + h - 4); c.fill();
    }
    const ty = p.top ? Y(p.y + p.h / 2 + 0.0032) : Y(p.y - p.h / 2 - 0.0032);
    const onLabel = tpl.decor === 'patch';
    text(num, X(p.x) + (p.role === 'pp' ? 0 : S(0.0018)), ty, num.length > 3 ? 11 : 14, { a: 'center', b: p.top ? 'alphabetic' : 'hanging', c: onLabel ? '#15181c' : ink, max: w - (p.role === 'pp' ? 0 : 8), w: 700 });
  }
  facadeCache.set(key, cv);
  return cv;
}
/* Petite texture de texte (étiquette de nom d'hôte, plaque de baie) */
function labelCanvas(str, { w = 256, h = 48, bg = '#f2f4f6', fg = '#14181d', px = 26 } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.font = `700 ${px}px ui-monospace, Menlo, Consolas, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = fg;
  const m = c.measureText(str).width; if (m > w - 12) c.font = `700 ${px * (w - 12) / m}px ui-monospace, Menlo, Consolas, monospace`;
  c.fillText(str, w / 2, h / 2 + 1);
  return cv;
}
/* Infobulle d'un port (texte « Titre|ligne|ligne ») */
function portTip(p, withHost) {
  const st = effStatus(p), far = connectedLabel(p);
  return [withHost ? labelOf(p.id) : p.name, `${PORT_KIND[p.kind]} · ${PORT_ROLE[p.role]}`, `État : ${STATE_LABEL[st]}`, p.role !== 'pp' ? `VLAN : ${p.vlan == null ? 'Trunk' : p.vlan + ' ' + vlanOf(p.vlan).name}` : '', p.role !== 'pp' ? `Débit : ${fmtSpeed(p.speed)}` : '', p.poe.watts ? `PoE : ${p.poe.watts} W` : '', far ? `Connecté : ${far}` : '', p.description].filter(Boolean).join('|');
}
/* Couleur d'un port selon le mode de coloration */
function portModeColor(p, mode) {
  if (mode === 'status') return STATE_COL[effStatus(p)];
  if (mode === 'vlan') {
    let q = p;
    if (p.role === 'pp') { q = null; for (const n of segment(p.id).nodes) { if (typeOf(n) !== 'port') continue; const x = byId(n); if (x.role !== 'pp' && isNetDev(byId(x.deviceId))) q = x; } if (!q) return '#161b21'; }
    else if (!cablesOf(p.id).length && p.status !== 'up') return '#161b21';
    return q.vlan == null ? '#e4e9ef' : vlanOf(q.vlan).color;
  }
  if (mode === 'poe') return p.poe?.watts ? poeColor(p.poe.watts) : p.poe?.capable ? '#2a3646' : '#11151a';
  return '#000000';
}

export { drawFacade, facadeLayout, FACE_W, gabarit, GABARITS, labelCanvas, portModeColor, portNames, portTip };
