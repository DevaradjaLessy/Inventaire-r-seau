/* Configuration et constantes : couleurs, états, VLAN, catégories, types de câble. */
const APP = { name: 'NetCarto', version: '1.0', schemaVersion: 1, storageKey: 'netcarto:db:v1' };

/* Palette de statut (réservée : ne pas l'utiliser pour autre chose) */
const COL = { up: '#0ca30c', warn: '#fab219', serious: '#ec835a', crit: '#d03b3b', down: '#6b7a8c', dis: '#3b4656', accent: '#38bdf8' };

/* États d'un port */
const PORT_STATUS = {
  up:       { label: 'Actif',     color: COL.up },
  down:     { label: 'Inactif',   color: COL.down },
  disabled: { label: 'Désactivé', color: COL.dis },
  error:    { label: 'Erreur',    color: COL.crit },
};
/* États d'un équipement */
const DEVICE_STATUS = {
  active:      { label: 'En service',   color: COL.up },
  maintenance: { label: 'Maintenance',  color: COL.warn },
  fault:       { label: 'En panne',     color: COL.crit },
  retired:     { label: 'Hors service', color: COL.down },
};
/* VLAN par défaut : couleurs attribuées dans un ordre fixe */
const VLANS_DEF = [
  { id: 10,  name: 'DATA',       color: '#3987e5', subnet: '10.10.10.0/24' },
  { id: 20,  name: 'VOIX',       color: '#d95926', subnet: '10.10.20.0/24' },
  { id: 30,  name: 'WIFI',       color: '#199e70', subnet: '10.10.30.0/24' },
  { id: 40,  name: 'VIDEO',      color: '#c98500', subnet: '10.10.40.0/24' },
  { id: 50,  name: 'IMPRESSION', color: '#d55181', subnet: '10.10.50.0/24' },
  { id: 99,  name: 'MGMT',       color: '#0ca30c', subnet: '10.10.99.0/24' },
  { id: 100, name: 'SERVEURS',   color: '#9085e9', subnet: '10.10.100.0/24' },
  { id: 200, name: 'INVITES',    color: '#e66767', subnet: '10.10.200.0/24' },
];
const VLAN_GREY = '#7f8b99';
/* Paliers PoE (dégradé ambré) */
const POE_STEPS = [
  { max: 7,   color: '#f6dc8c', label: '≤ 7 W' },
  { max: 15,  color: '#f0b93a', label: '≤ 15 W' },
  { max: 30,  color: '#e08a14', label: '≤ 30 W' },
  { max: 1e9, color: '#c2560a', label: '> 30 W' },
];
/* Catégories de matériel */
const CATEGORIES = {
  switch:     { label: 'Switchs',       one: 'Switch',        icon: 'switch',   color: '#3987e5' },
  router:     { label: 'Routeurs',      one: 'Routeur',       icon: 'router',   color: '#9085e9' },
  firewall:   { label: 'Pare-feu',      one: 'Pare-feu',      icon: 'firewall', color: '#e66767' },
  ap:         { label: 'Bornes Wi-Fi',  one: 'Borne Wi-Fi',   icon: 'ap',       color: '#199e70' },
  passive:    { label: 'Passif',        one: 'Passif',        icon: 'passive',  color: '#8b9bb0' },
  rack:       { label: 'Baies',         one: 'Baie',          icon: 'rack',     color: '#6b7a8c' },
  ups:        { label: 'Onduleurs',     one: 'Onduleur',      icon: 'ups',      color: '#c98500' },
  server:     { label: 'Serveurs',      one: 'Serveur',       icon: 'server',   color: '#d55181' },
  phone:      { label: 'Téléphones IP', one: 'Téléphone IP',  icon: 'phone',    color: '#d95926' },
  camera:     { label: 'Caméras IP',    one: 'Caméra IP',     icon: 'camera',   color: '#b98a2e' },
  consumable: { label: 'Consommables',  one: 'Consommable',   icon: 'cable',    color: '#5d6c80' },
};
/* Types de pièce */
const ROOM_TYPES = {
  office:   { label: 'Bureau',           fill: '#152131' },
  open:     { label: 'Open space',       fill: '#13222e' },
  meeting:  { label: 'Salle de réunion', fill: '#1a2136' },
  hall:     { label: 'Hall / circulation', fill: '#10171f' },
  tech:     { label: 'Local technique',  fill: '#1f2a1d' },
  server:   { label: 'Salle serveurs',   fill: '#232a19' },
  storage:  { label: 'Stockage',         fill: '#1d1d28' },
  workshop: { label: 'Atelier',          fill: '#241f1a' },
};
const OUTLET_USAGE = { data: 'Données', voice: 'Voix', ap: 'Borne Wi-Fi', camera: 'Caméra', printer: 'Imprimante' };
const PORT_KIND = { rj45: 'RJ45', sfp: 'SFP', 'sfp+': 'SFP+', lc: 'LC duplex' };
const PORT_ROLE = { access: 'Accès', uplink: 'Uplink', pp: 'Passif' };
const CABLE_TYPES = {
  cat6a: { label: 'Câble Cat6A (lien permanent)', color: '#8b9bb0', fiber: false },
  patch: { label: 'Cordon de brassage RJ45',      color: '#3987e5', fiber: false },
  om3:   { label: 'Fibre multimode OM3',          color: '#35c2c2', fiber: true },
  os2:   { label: 'Fibre monomode OS2',           color: '#e3c62b', fiber: true },
  dac:   { label: 'Câble DAC (cuivre direct)',    color: '#3a424d', fiber: true },
};
const HISTORY_TYPES = { add: 'Ajout', move: 'Déplacement', remove: 'Retrait', edit: 'Modification', stock: 'Stock', import: 'Import', catalog: 'Catalogue' };
const LAYERS = { perimeter: 'Périmètre', core: 'Cœur', distribution: 'Distribution', access: 'Accès', endpoint: 'Terminaux' };
const RACK_FULL_PCT = 90;   // seuil d'alerte « baie pleine »
const POE_WARN_PCT = 80;    // seuil d'alerte du budget PoE
const U_M = 0.04445;        // hauteur d'une unité de baie, en mètres
/* Préfixe d'identifiant → type d'objet */
const PREFIX_TYPE = { site: 'site', bld: 'building', flr: 'floor', room: 'room', rack: 'rack', dev: 'device', p: 'port', o: 'outlet', cab: 'cable', cat: 'catalog', h: 'history' };

export { APP, CABLE_TYPES, CATEGORIES, COL, DEVICE_STATUS, HISTORY_TYPES, LAYERS, OUTLET_USAGE, POE_STEPS, POE_WARN_PCT, PORT_KIND, PORT_ROLE, PORT_STATUS, PREFIX_TYPE, RACK_FULL_PCT, ROOM_TYPES, U_M, VLAN_GREY, VLANS_DEF };
