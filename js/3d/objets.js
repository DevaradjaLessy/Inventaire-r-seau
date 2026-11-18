/* Moteur 3D — objets autonomes en géométrie procédurale (borne, téléphone, caméra, prise, module SFP, cordon). */
import { shade } from '../utils.js';
import { THREE } from './three.js';
import { labelCanvas } from './facades.js';

/* ---------- Objets autonomes (géométrie procédurale) ----------
   Chaque fonction renvoie { g: groupe posé sur y = 0, h: hauteur, size: rayon de cadrage } */
function roundedSlab(T, w, d, h, r) {
  const s = new T.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const b = Math.min(h * 0.25, 0.004);
  const g = new T.ExtrudeGeometry(s, { depth: h - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 3, curveSegments: 8 });
  g.rotateX(-Math.PI / 2); g.translate(0, b, 0);
  return g;
}
const OBJECTS = {
  ap(v, cat) {
    const T = THREE, g = new T.Group(), col = cat.visual?.color || '#f1f2f3';
    const body = new T.Mesh(roundedSlab(T, 0.22, 0.22, 0.04, 0.045), v.mat(col, 0.05, 0.42)); g.add(body);
    const plate = new T.Mesh(roundedSlab(T, 0.17, 0.17, 0.006, 0.03), v.mat(shade(col, -0.05), 0.05, 0.35)); plate.position.y = 0.038; g.add(plate);
    const led = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.002, 16), new T.MeshBasicMaterial({ color: '#3dff66', toneMapped: false })); led.position.set(0, 0.0455, 0.06); g.add(led);
    const lg = new T.Mesh(new T.PlaneGeometry(0.09, 0.022), new T.MeshBasicMaterial({ map: v.canvasTex(labelCanvas(cat.visual?.logo || cat.brand, { w: 256, h: 64, bg: shade(col, -0.05), fg: cat.visual?.accent || '#555', px: 34 })) })); lg.rotation.x = -Math.PI / 2; lg.position.set(0, 0.0445, -0.01); g.add(lg);
    return { g, h: 0.045, size: 0.19 };
  },
  phone(v, cat) {
    const T = THREE, g = new T.Group(), col = cat.visual?.color || '#2a2d31', m = v.mat(col, 0.1, 0.5);
    // Corps incliné : profil extrudé
    const s = new T.Shape(); s.moveTo(-0.09, 0); s.lineTo(0.09, 0); s.lineTo(0.09, 0.02); s.lineTo(-0.07, 0.095); s.lineTo(-0.09, 0.085); s.closePath();
    const bg = new T.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2 }); bg.translate(0, 0, -0.1); bg.rotateY(-Math.PI / 2);
    g.add(new T.Mesh(bg, m));
    const ang = Math.atan2(0.075, 0.16), tilt = new T.Group(); tilt.position.set(0, 0.0605, 0.01); tilt.rotation.x = -Math.PI / 2 + ang; g.add(tilt);
    // Écran
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 160; const c = sc.getContext('2d');
    const gr = c.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#16335c'); gr.addColorStop(1, '#0a1a33'); c.fillStyle = gr; c.fillRect(0, 0, 256, 160);
    c.fillStyle = '#dbe9ff'; c.font = '700 30px system-ui'; c.fillText('10:42', 14, 40); c.font = '16px system-ui'; c.fillStyle = '#9fc0ee'; c.fillText('Poste 4217 (fictif)', 14, 68);
    for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(14, 86 + i * 18, 228, 12); }
    const scr = new T.Mesh(new T.PlaneGeometry(0.085, 0.053), new T.MeshBasicMaterial({ map: v.canvasTex(sc) })); scr.position.set(0.035, 0.045, 0.004); tilt.add(scr);
    const bez = new T.Mesh(new T.PlaneGeometry(0.095, 0.063), v.mat('#050607', 0.2, 0.3)); bez.position.set(0.035, 0.045, 0.0035); tilt.add(bez);
    // Clavier
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) { const key = v.box(tilt, 0.016, 0.011, 0.004, 0.012 + k * 0.022, -0.012 - r * 0.016, 0.004, v.mat('#40454c', 0.1, 0.6)); key.userData.k = 1; }
    // Combiné
    const hs = new T.Mesh(roundedSlab(T, 0.045, 0.19, 0.026, 0.018), v.mat(shade(col, -0.15), 0.1, 0.45)); hs.rotation.x = Math.PI / 2; hs.position.set(-0.062, 0.01, 0.018); tilt.add(hs);
    return { g, h: 0.1, size: 0.17 };
  },
  camera(v, cat) {
    const T = THREE, g = new T.Group(), col = cat.visual?.color || '#f0f0ee';
    const base = new T.Mesh(new T.CylinderGeometry(0.075, 0.078, 0.035, 40), v.mat(col, 0.05, 0.45)); base.position.y = 0.0175; g.add(base);
    const ring = new T.Mesh(new T.CylinderGeometry(0.066, 0.075, 0.012, 40), v.mat(shade(col, -0.08), 0.05, 0.4)); ring.position.y = 0.041; g.add(ring);
    const inner = new T.Mesh(new T.SphereGeometry(0.05, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), v.mat('#0b0c0e', 0.3, 0.4)); inner.position.y = 0.045; g.add(inner);
    const lens = new T.Mesh(new T.CylinderGeometry(0.014, 0.016, 0.02, 20), v.mat('#15181c', 0.8, 0.2)); lens.position.set(0, 0.078, 0.03); lens.rotation.x = 0.9; g.add(lens);
    const glass = new T.Mesh(new T.SphereGeometry(0.063, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshPhysicalMaterial({ color: '#20262c', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.38 })); glass.position.y = 0.045; g.add(glass);
    return { g, h: 0.11, size: 0.15 };
  },
  outlet(v, cat) {
    const T = THREE, g = new T.Group(), up = new T.Group(); up.rotation.x = -Math.PI / 2 + 1.15; up.position.y = 0.045; g.add(up);
    up.add(new T.Mesh(roundedSlab(T, 0.086, 0.086, 0.011, 0.008).rotateX(Math.PI / 2), v.mat(cat.visual?.color || '#eceeef', 0.02, 0.5)));
    v.box(up, 0.05, 0.05, 0.003, 0, 0, 0.012, v.mat('#dfe2e4', 0.02, 0.5));
    v.box(up, 0.0125, 0.0105, 0.002, 0, -0.004, 0.0142, v.mat('#050607', 0.2, 0.5));
    v.box(up, 0.03, 0.007, 0.0006, 0, 0.012, 0.0138, v.mat('#ffffff', 0, 0.8));
    return { g, h: 0.09, size: 0.085 };
  },
  sfp(v, cat) {
    const g = new THREE.Group(), y = 0.006;
    v.box(g, 0.0135, 0.0085, 0.056, 0, y, 0, v.mat('#b9bec4', 0.9, 0.3));
    v.box(g, 0.014, 0.0098, 0.012, 0, y, 0.031, v.mat('#22262b', 0.3, 0.5));
    v.box(g, 0.0045, 0.0045, 0.002, -0.0032, y, 0.0372, v.mat('#050607', 0.2, 0.5)); v.box(g, 0.0045, 0.0045, 0.002, 0.0032, y, 0.0372, v.mat('#050607', 0.2, 0.5));
    v.box(g, 0.0145, 0.0012, 0.014, 0, y + 0.0054, 0.03, v.mat(cat.visual?.accent || '#d8cbb0', 0.4, 0.4));
    return { g, h: 0.012, size: 0.04 };
  },
  cable(v, cat) {
    const T = THREE, g = new T.Group(), m = v.mat(cat.visual?.color || '#3987e5', 0.05, 0.55);
    for (let i = 0; i < 4; i++) { const t = new T.Mesh(new T.TorusGeometry(0.06 + (i % 2) * 0.004, 0.0032, 8, 48), m); t.rotation.x = Math.PI / 2; t.position.y = 0.004 + i * 0.0062; g.add(t); }
    v.box(g, 0.012, 0.008, 0.022, 0.066, 0.006, 0.02, v.mat('#e9ecef', 0.1, 0.4)); v.box(g, 0.012, 0.008, 0.022, 0.062, 0.02, -0.024, v.mat('#e9ecef', 0.1, 0.4));
    return { g, h: 0.03, size: 0.085 };
  },
};

export { OBJECTS };
