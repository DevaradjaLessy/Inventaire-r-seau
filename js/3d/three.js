/* Chargement de Three.js (copie locale, js/vendor/three) sans bloquer l'application :
   si la bibliothèque ne se charge pas, tout fonctionne sauf la vue 3D. */
let THREE = null, OrbitControls = null, RoomEnvironment = null;
const threeReady = (async () => {
  try {
    THREE = await import('three');
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
    ({ RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'));
    return true;
  } catch (e) { console.warn('Three.js indisponible :', e.message); return false; }
})();

export { OrbitControls, RoomEnvironment, THREE, threeReady };
