/* Export en image (PNG) d'un dessin SVG de la page : plan d'un étage, topologie.
   Le dessin est copié avec ses styles calculés (couleurs des variables comprises), puis tracé sur un canevas. */
import { $, today } from '../utils.js';
import { byId, labelOf } from '../services/requetes.js';
import { Actions, toast } from './socle.js';
import { Carto } from './carto/carto.js';

const PROPRIETES = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'paint-order', 'display', 'visibility'];
/* Copie autonome d'un SVG : chaque élément porte ses styles, le cadre est celui du dessin entier (ou celui fourni) */
function copieAutonome(svg, cadre, largeur) {
  const copie = svg.cloneNode(true), sources = svg.querySelectorAll('*'), cibles = copie.querySelectorAll('*');
  sources.forEach((el, i) => { const cs = getComputedStyle(el), st = cibles[i].style; for (const p of PROPRIETES) st.setProperty(p, cs.getPropertyValue(p)); cibles[i].removeAttribute('class'); });
  const fond = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  for (const [k, v] of Object.entries({ x: cadre.x, y: cadre.y, width: cadre.w, height: cadre.h, fill: getComputedStyle(svg).backgroundColor })) fond.setAttribute(k, v);
  copie.insertBefore(fond, copie.firstChild);
  copie.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); copie.removeAttribute('class');
  copie.setAttribute('viewBox', `${cadre.x} ${cadre.y} ${cadre.w} ${cadre.h}`);
  copie.setAttribute('width', largeur); copie.setAttribute('height', Math.round(largeur * cadre.h / cadre.w));
  return copie;
}
/* Télécharge le SVG en PNG. largeur : largeur de l'image en pixels. */
async function exporterPng(svg, cadre, nom, largeur = 2400) {
  const copie = copieAutonome(svg, cadre, largeur), w = +copie.getAttribute('width'), h = +copie.getAttribute('height');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copie)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = () => ko(new Error('dessin illisible')); img.src = url; });
    const canevas = Object.assign(document.createElement('canvas'), { width: w, height: h }), ctx = canevas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    // Contrôle simple : une image d'une seule couleur signale un export raté
    const px = ctx.getImageData(0, 0, w, h).data, couleurs = new Set();
    for (let i = 0; i < px.length && couleurs.size <= 64; i += 4 * 997) couleurs.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    window.__dernierExport = { nom, largeur: w, hauteur: h, couleurs: couleurs.size };
    const blob = await new Promise(ok => canevas.toBlob(ok, 'image/png'));
    const lien = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nom });
    document.body.appendChild(lien); lien.click(); lien.remove(); setTimeout(() => URL.revokeObjectURL(lien.href), 2000);
    toast('Image téléchargée', 'ok');
  } finally { URL.revokeObjectURL(url); }
}
const nomFichier = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const signaler = e => toast(`Export en image impossible : ${e.message}`, 'err');

/* Plan : l'étage entier, quel que soit le zoom à l'écran */
Actions['plan-image'] = () => {
  const svg = $('svg.plan'), f = byId(Carto.floorId), K = 20, m = 2 * K;
  if (!svg || !f) return;
  exporterPng(svg, { x: -m, y: -m, w: f.width * K + 2 * m, h: f.height * K + 2 * m + 10 }, `netcarto-plan-${nomFichier(labelOf(f.id))}-${today()}.png`).catch(signaler);
};
/* Topologie : tout le schéma */
Actions['topo-image'] = () => {
  const svg = $('svg.topo');
  if (!svg) return;
  const b = svg.getBBox();
  exporterPng(svg, { x: b.x, y: b.y, w: b.width, h: b.height }, `netcarto-topologie-${today()}.png`).catch(signaler);
};

export { exporterPng };
