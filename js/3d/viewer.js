/* Moteur 3D — classe Viewer3D : scène, baie, équipements, ports cliquables, LEDs, cordons, caméra. */
import { CABLE_TYPES, COL, DEVICE_STATUS, PORT_KIND, PORT_ROLE, U_M } from '../config.js';
import { clamp, fmtSpeed, mulberry32, shade } from '../utils.js';
import { Store } from '../store.js';
import { byId, cablesOf, catOf, portsOf } from '../services/requetes.js';
import { isPassiveNode, otherEnd } from '../services/cablage.js';
import { OrbitControls, RoomEnvironment, THREE, threeReady } from './three.js';
import { drawFacade, facadeLayout, FACE_W, gabarit, labelCanvas, portModeColor, portNames, portTip } from './facades.js';
import { OBJECTS } from './objets.js';
import { run, Tip } from '../ui/socle.js';

class Viewer3D {
  constructor(host, o = {}) {
    Object.assign(this, { host, o, ok: false, mode: 'none', cablesOn: true, kind: null, key: '', ports: [], portIdx: new Map(), devGroups: new Map(), cableMeshes: new Map(), bodies: [], texCache: new Map(), matCache: new Map(), hl: null, anim: null, dirty: true, lastLed: 0, queue: null, selId: null, hover: null });
    host.classList.add('v3d');
    threeReady.then(ok => {
      if (ok) run(() => this.init());
      if (!this.ok) host.innerHTML = '<div class="empty">Vue 3D indisponible : Three.js n\'a pas pu être chargé (CDN inaccessible ou WebGL désactivé).<br>Le reste de l\'application fonctionne normalement.</div>';
      else if (this.queue) this.queue();
    });
  }
  init() {
    const T = THREE;
    const r = this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    this.host.appendChild(r.domElement);
    const s = this.scene = new T.Scene();
    s.background = new T.Color('#0a100f'); s.fog = new T.Fog('#0a100f', 7, 16);
    this.applyTheme(); document.addEventListener('netcarto:theme', () => this.applyTheme());
    const pm = new T.PMREMGenerator(r); s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    this.camera = new T.PerspectiveCamera(35, 1, 0.01, 60);
    const ct = this.controls = new OrbitControls(this.camera, r.domElement);
    ct.enableDamping = true; ct.dampingFactor = 0.12; ct.minDistance = 0.12; ct.maxDistance = 9; ct.maxPolarAngle = Math.PI * 0.55; ct.zoomSpeed = 1.1;
    ct.addEventListener('change', () => { this.dirty = true; });
    ct.addEventListener('start', () => { ct.autoRotate = false; this.anim = null; });
    const dl = new T.DirectionalLight('#ffffff', 1.7); dl.position.set(1.5, 3, 4); s.add(dl);
    const fill = new T.DirectionalLight('#9fc4ff', 0.7); fill.position.set(-3, 1.5, 2); s.add(fill);
    s.add(new T.HemisphereLight('#cfe3ff', '#1c2026', 0.45));
    this.root = new T.Group(); s.add(this.root);
    this.ray = new T.Raycaster();
    // Géométries partagées
    this.unitBox = new T.BoxGeometry(1, 1, 1);
    const sh = new T.Shape(); sh.moveTo(-0.64, -0.66); sh.lineTo(0.64, -0.66); sh.lineTo(0.64, 0.66); sh.lineTo(-0.64, 0.66); sh.closePath();
    const hole = new T.Path(); hole.moveTo(-0.5, -0.5); hole.lineTo(-0.5, 0.5); hole.lineTo(0.5, 0.5); hole.lineTo(0.5, -0.5); hole.closePath(); sh.holes.push(hole);
    this.frameGeo = new T.ShapeGeometry(sh);
    const fr = col => { const m = new T.Mesh(this.frameGeo, new T.MeshBasicMaterial({ color: col, toneMapped: false, depthTest: false, transparent: true })); m.visible = false; m.renderOrder = 10; s.add(m); return m; };
    this.hoverFrame = fr('#ffffff'); this.selFrame = fr(COL.accent);
    this.selBox = new T.LineSegments(new T.EdgesGeometry(this.unitBox), new T.LineBasicMaterial({ color: COL.accent, toneMapped: false })); this.selBox.visible = false; s.add(this.selBox);
    this.hlCableMat = new T.MeshBasicMaterial({ color: COL.accent, toneMapped: false });
    // Souris : survol (infobulle) et clic
    const el = r.domElement; let down = null;
    el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointermove', e => { if (e.buttons) { Tip.hide(); return; } this.onHover(e); });
    el.addEventListener('pointerleave', () => { this.setHover(null); Tip.hide(); });
    el.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) this.onClick(e); down = null; });
    el.dataset.tipkeep = '1';
    new ResizeObserver(() => this.resize()).observe(this.host);
    this.ok = true;
    this.tick = this.tick.bind(this); requestAnimationFrame(this.tick);
  }
  /* Le fond de la scène suit le thème clair ou sombre */
  applyTheme() {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--scene').trim() || '#0a100f';
    this.scene.background.set(c); this.scene.fog.color.set(c); this.dirty = true;
  }
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h || !this.ok) return;
    this.renderer.setSize(w, h, false); this.renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  /* Boucle de rendu : en pause si la vue est cachée ; LEDs rafraîchies environ 10 fois par seconde */
  tick(t) {
    requestAnimationFrame(this.tick);
    if (!this.host.offsetParent) return;
    if (this.renderer.domElement.width < 2) this.resize();
    if (this.anim) this.stepAnim(t);
    this.controls.update();
    if (t - this.lastLed > 100) { this.lastLed = t; if (this.updateLeds(t)) this.dirty = true; if (this.hlMesh) { this.hlMesh.material.opacity = 0.55 + 0.45 * Math.sin(t / 160); this.dirty = true; } }
    if (this.dirty) { this.dirty = false; this.renderer.render(this.scene, this.camera); }
  }
  /* --- Matériaux et textures --- */
  mat(color, metal = 0.5, rough = 0.5, extra = null) {
    const k = `${color}|${metal}|${rough}|${extra ? JSON.stringify(extra) : ''}`;
    if (!this.matCache.has(k)) { const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...(extra || {}) }); m.userData.keep = true; this.matCache.set(k, m); }
    return this.matCache.get(k);
  }
  canvasTex(cv) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); return t; }
  facadeMat(cat) {
    const img = cat.visual?.frontImage, key = img ? 'img:' + img : drawFacade(cat);
    if (!this.texCache.has(key)) {
      let tex;
      if (img) { tex = new THREE.TextureLoader().load(img, () => { this.dirty = true; }); tex.colorSpace = THREE.SRGBColorSpace; }
      else tex = this.canvasTex(key);
      const m = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.3, roughness: 0.55 }); m.userData.keep = true;
      this.texCache.set(key, m);
    }
    return this.texCache.get(key);
  }
  clear() {
    this.root.traverse(o => {
      if (o.geometry && o.geometry !== this.unitBox && o.geometry !== this.frameGeo && !o.geometry.userData.keep) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) if (!m.userData.keep) { m.map?.dispose(); m.dispose(); }
      if (o.isInstancedMesh) o.dispose();
    });
    this.root.clear();
    Object.assign(this, { ports: [], portIdx: new Map(), devGroups: new Map(), cableMeshes: new Map(), bodies: [], overlay: null, leds: null, hlMesh: null, cableGroup: null, ledPorts: [] });
    this.hoverFrame.visible = this.selFrame.visible = this.selBox.visible = false;
    this.controls.autoRotate = false;
  }
  box(parent, w, h, d, x, y, z, m) { const me = new THREE.Mesh(this.unitBox, m); me.scale.set(w, h, d); me.position.set(x, y, z); parent.add(me); return me; }
  /* Sol en dalles de faux plancher et ombre de contact */
  addFloor(shadowW, shadowD) {
    const T = THREE;
    if (!this.floorMat) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d'), rnd = mulberry32(3);
      c.fillStyle = '#5c636b'; c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.07})`; c.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 3, 2); }
      c.strokeStyle = '#2a2e33'; c.lineWidth = 5; c.strokeRect(0, 0, 256, 256);
      const t = this.canvasTex(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(30, 30);
      this.floorMat = new T.MeshStandardMaterial({ map: t, metalness: 0.15, roughness: 0.62, color: '#8b929a' }); this.floorMat.userData.keep = true;
      const sc = document.createElement('canvas'); sc.width = sc.height = 128; const s2 = sc.getContext('2d'), g2 = s2.createRadialGradient(64, 64, 20, 64, 64, 64);
      g2.addColorStop(0, 'rgba(0,0,0,.75)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); s2.fillStyle = g2; s2.fillRect(0, 0, 128, 128);
      this.shadowMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(sc), transparent: true, depthWrite: false }); this.shadowMat.userData.keep = true;
    }
    const fl = new T.Mesh(new T.PlaneGeometry(18, 18), this.floorMat); fl.rotation.x = -Math.PI / 2; this.root.add(fl);
    const sd = new T.Mesh(new T.PlaneGeometry(shadowW, shadowD), this.shadowMat); sd.rotation.x = -Math.PI / 2; sd.position.y = 0.002; this.root.add(sd);
  }
  /* --- Baie ou coffret --- */
  buildEnclosure(rc, HU, name) {
    const T = THREE, g = new T.Group(), wall = !!gabarit(rc).wall;
    const W = rc.visual?.width || 0.75, D = rc.visual?.depth || 1.07, innerH = HU * U_M, fr = 0.05, H = innerH + 2 * fr;
    const y0 = wall ? 1.05 : 0.06, zF = D / 2 - (wall ? 0.07 : 0.11);
    const mF = this.mat(rc.visual?.color || '#17191c', 0.55, 0.5), mIn = this.mat('#0c0e11', 0.3, 0.8);
    this.box(g, W, fr, D, 0, y0 + fr / 2, 0, mF); this.box(g, W, fr, D, 0, y0 + H - fr / 2, 0, mF);
    for (const sx of [-1, 1]) {
      this.box(g, 0.012, innerH, D - 0.02, sx * (W / 2 - 0.006), y0 + fr + innerH / 2, 0, mF);
      for (const sz of [-1, 1]) this.box(g, 0.04, innerH, 0.04, sx * (W / 2 - 0.02), y0 + fr + innerH / 2, sz * (D / 2 - 0.02), mF);
    }
    this.box(g, W - 0.02, innerH, 0.012, 0, y0 + fr + innerH / 2, -D / 2 + 0.006, mIn);
    // Montants 19" percés, avec le numéro de chaque U
    const rc2 = document.createElement('canvas'); rc2.width = 64; rc2.height = HU * 48; const c = rc2.getContext('2d');
    c.fillStyle = '#868d95'; c.fillRect(0, 0, 64, rc2.height);
    for (let u = 1; u <= HU; u++) {
      const yb = rc2.height - u * 48;
      c.fillStyle = '#0a0c0e'; for (const k of [7, 24, 41]) c.fillRect(8, yb + k - 4, 9, 9);
      c.fillStyle = '#14181c'; c.font = '700 20px system-ui, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(u, 42, yb + 25);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, yb, 64, 1);
    }
    const railMat = new T.MeshStandardMaterial({ map: this.canvasTex(rc2), metalness: 0.6, roughness: 0.45 });
    for (const sx of [-1, 1]) this.box(g, 0.02, innerH, 0.003, sx * 0.2326, y0 + fr + innerH / 2, zF - 0.0035, railMat);
    if (!wall) for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const f = new T.Mesh(new T.CylinderGeometry(0.025, 0.03, 0.06, 12), this.mat('#0c0d0f', 0.4, 0.6)); f.position.set(sx * (W / 2 - 0.06), 0.03, sz * (D / 2 - 0.06)); g.add(f); }
    if (wall) { const wl = new T.Mesh(new T.PlaneGeometry(6, 3.2), this.mat('#2b3138', 0, 0.95)); wl.position.set(0, 1.6, -D / 2 - 0.002); g.add(wl); }
    if (name) { const pl = new T.Mesh(new T.PlaneGeometry(0.2, 0.034), new T.MeshBasicMaterial({ map: this.canvasTex(labelCanvas(name, { w: 384, h: 64, bg: '#0d1117', fg: '#e6edf3', px: 34 })) })); pl.position.set(0, y0 + H - fr / 2, D / 2 + 0.001); g.add(pl); }
    return { g, geo: { W, D, HU, H, yBase: y0 + fr, yTop: y0 + H, zF, sideX: W / 2 - (wall ? 0.028 : 0.085), wall } };
  }
  /* --- Équipement 19" --- */
  buildDevice(cat, dev) {
    const T = THREE, g = new T.Group(), tpl = gabarit(cat), L = facadeLayout(cat), depth = tpl.depth || 0.3, base = cat.visual?.color || '#2a3038';
    const side = this.mat(shade(base, -0.3), 0.55, 0.5);
    const body = new T.Mesh(this.unitBox, [side, side, side, side, this.facadeMat(cat), side]);
    body.scale.set(FACE_W, L.H, depth); body.position.z = -depth / 2; body.userData.devId = dev?.id || null;
    g.add(body); this.bodies.push(body);
    const earM = this.mat(shade(base, -0.1), 0.6, 0.45), scr = this.mat('#c9ced4', 0.9, 0.3);
    for (const sx of [-1, 1]) {
      this.box(g, 0.0215, L.H, 0.003, sx * (FACE_W / 2 + 0.0107), 0, -0.0015, earM);
      for (const sy of L.hU > 1 ? [-1, 1] : [0]) { const s = new T.Mesh(this.screwGeo || (this.screwGeo = Object.assign(new T.CylinderGeometry(0.0042, 0.0042, 0.002, 10).rotateX(Math.PI / 2), { userData: { keep: true } })), scr); s.position.set(sx * 0.2326, sy * (L.H / 2 - 0.012), 0.001); g.add(s); }
    }
    if (tpl.decor === 'cablemgr') {
      const rg = this.ringGeo || (this.ringGeo = Object.assign(new T.TorusGeometry(0.0155, 0.0024, 6, 16).rotateY(Math.PI / 2), { userData: { keep: true } }));
      for (let i = 0; i < 5; i++) { const r = new T.Mesh(rg, this.mat('#15171a', 0.5, 0.5)); r.position.set(-0.16 + i * 0.08, 0, 0.0155); g.add(r); }
    }
    if (dev) {
      const st = new T.Mesh(new T.PlaneGeometry(0.034, 0.0068), new T.MeshBasicMaterial({ map: this.canvasTex(labelCanvas(dev.hostname, { w: 240, h: 48 })) }));
      st.position.set(-FACE_W / 2 + 0.019, -L.H / 2 + 0.0056, 0.0004); g.add(st);
    }
    return { g, L };
  }
  /* Affiche une baie complète */
  showRack(rackId, keepCam) {
    if (!this.ok) { this.queue = () => this.showRack(rackId); return; }
    const T = THREE, rack = byId(rackId);
    this.clear(); this.kind = 'rack'; this.rackId = rackId;
    const rc = catOf(rack), { g, geo } = this.buildEnclosure(rc, rack.heightU, rack.name);
    this.geo = geo; this.root.add(g); this.addFloor(geo.W * 2.2, geo.D * 1.9);
    const ledPorts = [], plugs = [];
    for (const dev of Store.idx.devByRack.get(rackId) || []) {
      const cat = catOf(dev), { g: dg, L } = this.buildDevice(cat, dev);
      const yc = geo.yBase + (dev.u - 1) * U_M + L.hU * U_M / 2;
      dg.position.set(0, yc, geo.zF); this.root.add(dg);
      this.devGroups.set(dev.id, { g: dg, y: yc, H: L.H, depth: gabarit(cat).depth || 0.3 });
      portsOf(dev.id).forEach((p, i) => {
        const lp = L.ports[i]; if (!lp) return;
        const e = { p, dev, lp, x: lp.x, y: yc + lp.y, z: geo.zF, w: lp.w, h: lp.h };
        this.portIdx.set(p.id, this.ports.length); this.ports.push(e);
        if (p.role !== 'pp') ledPorts.push(e);
        const fc = this.frontCable(p); if (fc) { e.cable = fc; plugs.push(e); }
      });
    }
    this.buildPortMeshes(ledPorts, plugs);
    this.buildCables(plugs);
    this.refreshColors(); this.applyHighlight(); this.setSelected(this.selId);
    if (!keepCam) this.frameAll(false);
    this.dirty = true;
  }
  /* Câble visible en façade : le cordon (et non le lien permanent à l'arrière d'un panneau) */
  frontCable(p) { return cablesOf(p.id).find(c => p.role !== 'pp' || !isPassiveNode(otherEnd(c, p.id))) || null; }
  buildPortMeshes(ledPorts, plugs) {
    const T = THREE, M = new T.Matrix4(), q = new T.Quaternion(), V = (x, y, z) => new T.Vector3(x, y, z), col = new T.Color();
    const n = this.ports.length;
    if (!n) return;
    // Zones de clic et surcouche de couleur
    this.overlay = new T.InstancedMesh(this.unitBox, new T.MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false, depthWrite: false }), n);
    this.ports.forEach((e, i) => { M.compose(V(e.x, e.y, e.z + 0.0007), q, V(e.w + 0.0012, e.h + 0.0012, 0.0012)); this.overlay.setMatrixAt(i, M); this.overlay.setColorAt(i, col.set('#000')); });
    this.root.add(this.overlay);
    // LEDs
    this.ledPorts = ledPorts;
    if (ledPorts.length) {
      this.leds = new T.InstancedMesh(this.unitBox, new T.MeshBasicMaterial({ toneMapped: false }), ledPorts.length);
      ledPorts.forEach((e, i) => { M.compose(V(e.x - e.w / 2 + 0.0019, e.y + (e.lp.top ? 1 : -1) * (e.h / 2 + 0.002), e.z + 0.0004), q, V(0.0028, 0.0014, 0.0008)); this.leds.setMatrixAt(i, M); this.leds.setColorAt(i, col.set('#11151a')); e.phase = Math.random() * 10; });
      this.root.add(this.leds);
    }
    // Fiches branchées
    if (plugs.length) {
      this.plugs = new T.InstancedMesh(this.unitBox, this.mat('#ffffff', 0.1, 0.55), plugs.length);
      plugs.forEach((e, i) => { const sf = e.lp.kind !== 'rj45'; M.compose(V(e.x, e.y, e.z + (sf ? 0.011 : 0.008)), q, V(e.w * 0.82, e.h * 0.74, sf ? 0.022 : 0.016)); this.plugs.setMatrixAt(i, M); this.plugs.setColorAt(i, col.set(sf ? '#c9ced4' : e.cable.color || '#3987e5')); });
      this.root.add(this.plugs);
    }
  }
  /* Cordons de brassage : un tube par cordon, qui passe par le côté de la baie */
  buildCables(plugs) {
    const T = THREE, grp = this.cableGroup = new T.Group(), geo = this.geo, done = new Set();
    grp.visible = this.cablesOn; this.root.add(grp);
    let k = 0;
    for (const a of plugs) {
      const cab = a.cable; if (done.has(cab.id)) continue; done.add(cab.id);
      const bi = this.portIdx.get(otherEnd(cab, a.p.id)), b = bi != null ? this.ports[bi] : null;
      const j = ((k * 37) % 17) / 17, zo = 0.03 + j * 0.03, fib = CABLE_TYPES[cab.type]?.fiber && cab.type !== 'dac'; k++;
      const side = ((a.x + (b ? b.x : a.x)) >= 0 ? 1 : -1), sx = side * (geo.sideX - j * 0.022);
      const A = new T.Vector3(a.x, a.y, a.z + 0.014), pts = [A, new T.Vector3(a.x, a.y - 0.004, a.z + zo)];
      if (b) {
        const B = new T.Vector3(b.x, b.y, b.z + 0.014);
        if (Math.abs(a.y - b.y) < 0.03 && Math.abs(a.x - b.x) < 0.1) pts.push(new T.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.012, a.z + zo + 0.01));
        else pts.push(new T.Vector3(sx, a.y - 0.012, a.z + zo * 0.6), new T.Vector3(sx, b.y + (a.y > b.y ? 0.012 : -0.012), b.z + zo * 0.6));
        pts.push(new T.Vector3(b.x, b.y - 0.004, b.z + zo), B);
      } else {
        // L'autre extrémité est ailleurs : le cordon part par le côté puis vers le haut de la baie
        pts.push(new T.Vector3(sx, a.y + 0.02, a.z + zo * 0.5), new T.Vector3(sx, geo.yTop - 0.06, a.z - 0.02));
      }
      const tube = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts, false, 'catmullrom', 0.25), b ? 26 : 16, fib ? 0.0016 : cab.type === 'dac' ? 0.003 : 0.0027, 5), this.mat(cab.color || CABLE_TYPES[cab.type].color, 0.05, 0.6));
      tube.userData.cabId = cab.id; grp.add(tube); this.cableMeshes.set(cab.id, tube);
    }
  }
  /* Affiche un objet seul : aperçu d'un modèle du catalogue, ou équipement hors baie */
  showObject(cat, dev = null) {
    if (!this.ok) { this.queue = () => this.showObject(cat, dev); return; }
    const T = THREE, tpl = gabarit(cat);
    this.clear(); this.kind = 'object'; this.rackId = null;
    let size = 0.3, cy = 0.1;
    if (tpl.type === 'enclosure') {
      const { g, geo } = this.buildEnclosure(cat, cat.heightU || 42, cat.model.split(' ').slice(0, 2).join(' '));
      this.root.add(g); this.addFloor(geo.W * 2.2, geo.D * 1.9); size = geo.H * 0.9; cy = geo.yBase + geo.H / 2 - 0.05;
    } else {
      this.addFloor(0.9, 0.9);
      const ped = new T.Mesh(new T.CylinderGeometry(0.36, 0.38, 0.03, 48), this.mat('#161b22', 0.4, 0.5)); ped.position.y = 0.015; this.root.add(ped);
      if (tpl.type === 'facade') {
        const { g, L } = this.buildDevice(cat, dev);
        const yc = 0.03 + L.H / 2 + 0.002; g.position.set(0, yc, (tpl.depth || 0.3) / 2 > 0.3 ? 0.3 : (tpl.depth || 0.3) / 2);
        this.root.add(g);
        // Ports survolables (informations du catalogue)
        const names = portNames(cat); let gi = 0, n = 0;
        for (const grp of cat.ports || []) { const cnt = grp.names ? grp.names.length : grp.count; for (let i = 0; i < cnt; i++, n++) { const lp = L.ports[n]; this.ports.push({ info: { name: names[n], grp }, lp, x: lp.x, y: yc + lp.y, z: g.position.z, w: lp.w, h: lp.h }); } gi++; }
        this.buildPortMeshes([], []);
        size = 0.27; cy = yc;
      } else {
        const o = OBJECTS[cat.template] ? OBJECTS[cat.template](this, cat) : OBJECTS.sfp(this, cat);
        o.g.position.y = 0.03; this.root.add(o.g); size = o.size; cy = 0.03 + o.h / 2;
      }
    }
    const dist = size / Math.tan(this.camera.fov * Math.PI / 360) * 0.95;
    this.controls.target.set(0, cy, 0); this.camera.position.set(dist * 0.42, cy + dist * 0.42, dist * 0.82);
    this.controls.autoRotate = !dev; this.controls.autoRotateSpeed = 1.2;
    this.controls.update(); this.dirty = true;
  }
  /* --- Couleurs, LEDs, surbrillance --- */
  setMode(m) { this.mode = m; this.refreshColors(); }
  setCables(on) { this.cablesOn = on; if (this.cableGroup) this.cableGroup.visible = on; this.dirty = true; }
  refreshColors() {
    if (!this.overlay) return;
    const col = new THREE.Color();
    this.overlay.material.opacity = this.mode === 'none' ? 0 : 0.86;
    if (this.mode !== 'none') { this.ports.forEach((e, i) => { if (e.p) this.overlay.setColorAt(i, col.set(portModeColor(e.p, this.mode))); }); this.overlay.instanceColor.needsUpdate = true; }
    this.dirty = true;
  }
  updateLeds(t) {
    if (!this.leds) return this.controls?.autoRotate;
    const col = new THREE.Color();
    this.ledPorts.forEach((e, i) => {
      const s = e.p.status;
      let c = '#161b20';
      if (s === 'up') c = Math.random() < 0.22 ? '#0e5a1c' : '#3dff66';
      else if (s === 'error') c = Math.sin(t / 220 + e.phase) > 0 ? '#ff9a1f' : '#4a2b05';
      this.leds.setColorAt(i, col.set(c));
    });
    this.leds.instanceColor.needsUpdate = true;
    return true;
  }
  /* Surbrillance d'un chemin : { nodeSet, cableSet } */
  setHighlight(hl) { this.hl = hl; if (this.ok) this.applyHighlight(); }
  applyHighlight() {
    const T = THREE;
    if (this.hlMesh) { this.root.remove(this.hlMesh); this.hlMesh.material.dispose(); this.hlMesh.dispose(); this.hlMesh = null; }
    for (const [id, m] of this.cableMeshes) { const on = this.hl?.cableSet.has(id); if (on && !m.userData.orig) { m.userData.orig = m.material; m.material = this.hlCableMat; m.scale.setScalar(1); } else if (!on && m.userData.orig) { m.material = m.userData.orig; m.userData.orig = null; } }
    const list = this.hl ? this.ports.filter(e => e.p && this.hl.nodeSet.has(e.p.id)) : [];
    if (list.length) {
      const M = new T.Matrix4(), q = new T.Quaternion();
      this.hlMesh = new T.InstancedMesh(this.frameGeo, new T.MeshBasicMaterial({ color: COL.accent, toneMapped: false, transparent: true, depthTest: false }), list.length);
      list.forEach((e, i) => { M.compose(new T.Vector3(e.x, e.y, e.z + 0.002), q, new T.Vector3(e.w * 1.25, e.h * 1.25, 1)); this.hlMesh.setMatrixAt(i, M); });
      this.hlMesh.renderOrder = 9; this.root.add(this.hlMesh);
    }
    this.dirty = true;
  }
  placeFrame(fr, e) { if (!e) { fr.visible = false; return; } fr.position.set(e.x, e.y, e.z + 0.0025); fr.scale.set(e.w, e.h, 1); fr.visible = true; }
  setSelected(id) {
    this.selId = id; if (!this.ok) return;
    const i = this.portIdx.get(id), dg = this.devGroups.get(id);
    this.placeFrame(this.selFrame, i != null ? this.ports[i] : null);
    this.selBox.visible = !!dg;
    if (dg) { this.selBox.position.set(0, dg.y, this.geo.zF - dg.depth / 2); this.selBox.scale.set(FACE_W + 0.05, dg.H + 0.003, dg.depth + 0.004); }
    this.dirty = true;
  }
  setHover(e) { if (this.hover === e) return; this.hover = e; this.placeFrame(this.hoverFrame, e); this.host.style.cursor = e ? 'pointer' : ''; this.dirty = true; }
  /* --- Souris --- */
  pick(ev) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1), this.camera);
    const hit = this.ray.intersectObjects([this.overlay, ...this.bodies].filter(Boolean), false)[0];
    if (!hit) return null;
    if (hit.object === this.overlay) return { port: this.ports[hit.instanceId] };
    return { devId: hit.object.userData.devId };
  }
  onHover(ev) {
    const h = this.pick(ev);
    if (h?.port) {
      this.setHover(h.port);
      const e = h.port;
      Tip.show(Tip.fmt(e.p ? portTip(e.p, true) : `${e.info.name}|${PORT_KIND[e.info.grp.kind]} · ${PORT_ROLE[e.info.grp.role]}|Débit : ${fmtSpeed(e.info.grp.speed)}${e.info.grp.poe ? '|PoE : oui' : ''}`), ev.clientX, ev.clientY);
    } else {
      this.setHover(null);
      const d = h?.devId && byId(h.devId);
      if (d) { const c = catOf(d); Tip.show(Tip.fmt(`${d.hostname}|${c.brand} ${c.model}|${d.rackId ? `U${d.u}${c.heightU > 1 ? '–' + (d.u + c.heightU - 1) : ''}` : ''}${d.ip ? ' · ' + d.ip : ''}|État : ${DEVICE_STATUS[d.status].label}`), ev.clientX, ev.clientY); this.host.style.cursor = 'pointer'; }
      else Tip.hide();
    }
  }
  onClick(ev) {
    const h = this.pick(ev);
    if (h?.port?.p) this.o.onPort?.(h.port.p.id);
    else if (h?.devId) this.o.onDevice?.(h.devId);
  }
  /* --- Caméra --- */
  flyTo(pos, target, animate = true) {
    if (!animate) { this.camera.position.copy(pos); this.controls.target.copy(target); this.controls.update(); this.dirty = true; return; }
    this.anim = { t0: performance.now(), p0: this.camera.position.clone(), q0: this.controls.target.clone(), p1: pos, q1: target };
  }
  stepAnim(t) {
    const a = this.anim, k = clamp((t - a.t0) / 450, 0, 1), e = k * k * (3 - 2 * k);
    this.camera.position.lerpVectors(a.p0, a.p1, e); this.controls.target.lerpVectors(a.q0, a.q1, e);
    this.dirty = true; if (k >= 1) this.anim = null;
  }
  frameAll(animate = true) {
    const g = this.geo; if (!g) return;
    const yc = g.yBase + g.H / 2 - 0.05, dist = (g.H / 2) / Math.tan(this.camera.fov * Math.PI / 360) * 1.12;
    this.flyTo(new THREE.Vector3(dist * 0.3, yc + dist * 0.08, g.zF + dist * 0.95), new THREE.Vector3(0, yc, 0), animate);
  }
  /* Rapproche la caméra d'un équipement ou d'un port de la baie affichée */
  focus(id) {
    const i = this.portIdx.get(id), dg = this.devGroups.get(id), g = this.geo;
    if (i != null) { const e = this.ports[i]; this.flyTo(new THREE.Vector3(e.x * 0.7 + 0.05, e.y + 0.06, g.zF + 0.5), new THREE.Vector3(e.x, e.y, g.zF)); }
    else if (dg) this.flyTo(new THREE.Vector3(0.18, dg.y + 0.14, g.zF + 1.2), new THREE.Vector3(0, dg.y, g.zF));
    else this.frameAll();
  }
}

export { Viewer3D };
