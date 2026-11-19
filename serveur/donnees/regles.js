/* Règles vérifiées par le serveur avant de valider une transaction, en plus des contraintes de la base.
   Chaque fonction renvoie le message de la première anomalie trouvée, ou null. */
'use strict';

/* Aucun chevauchement dans une baie, et rien au-delà de sa hauteur */
function baies(p) {
  const lignes = p.tous(`SELECT e.nom_hote, e.u, MAX(1, c.hauteur_u) AS h, b.id AS baie, b.nom AS baie_nom, b.hauteur_u AS total
    FROM equipements e JOIN baies b ON b.id = e.baie_id JOIN catalogue c ON c.id = e.catalogue_id ORDER BY b.id, e.u`);
  let baie = null, occupe = null;
  for (const l of lignes) {
    if (l.baie !== baie) { baie = l.baie; occupe = new Map(); }
    if (l.u < 1 || l.u + l.h - 1 > l.total) return `${l.nom_hote} dépasse de la baie ${l.baie_nom} (U${l.u} à U${l.u + l.h - 1}, hauteur ${l.total} U).`;
    for (let u = l.u; u < l.u + l.h; u++) { if (occupe.has(u)) return `${l.nom_hote} chevauche ${occupe.get(u)} dans la baie ${l.baie_nom} (U${u}).`; occupe.set(u, l.nom_hote); }
  }
  return null;
}
/* Un port actif reçoit un câble au plus ; un port passif ou une prise murale, deux (arrière et avant) */
function cables(p) {
  const port = p.un(`SELECT e.nom_hote, po.nom, po.role, COUNT(*) AS n FROM (SELECT a_port_id AS id FROM cables WHERE a_port_id IS NOT NULL UNION ALL SELECT b_port_id FROM cables WHERE b_port_id IS NOT NULL) x
    JOIN ports po ON po.id = x.id JOIN equipements e ON e.id = po.equipement_id GROUP BY x.id HAVING n > CASE WHEN po.role = 'pp' THEN 2 ELSE 1 END LIMIT 1`);
  if (port) return `Trop de câbles sur le port ${port.nom_hote} · ${port.nom} (${port.n} câbles, ${port.role === 'pp' ? 2 : 1} au plus).`;
  const prise = p.un(`SELECT pr.repere, COUNT(*) AS n FROM (SELECT a_prise_id AS id FROM cables WHERE a_prise_id IS NOT NULL UNION ALL SELECT b_prise_id FROM cables WHERE b_prise_id IS NOT NULL) x
    JOIN prises pr ON pr.id = x.id GROUP BY x.id HAVING n > 2 LIMIT 1`);
  if (prise) return `Trop de câbles sur la prise ${prise.repere} (${prise.n} câbles, 2 au plus).`;
  const boucle = p.un('SELECT id FROM cables WHERE (a_port_id IS NOT NULL AND a_port_id = b_port_id) OR (a_prise_id IS NOT NULL AND a_prise_id = b_prise_id) LIMIT 1');
  return boucle ? 'Un câble ne peut pas relier un élément à lui-même.' : null;
}
/* Une pièce reste à l'intérieur de son étage */
function pieces(p) {
  const l = p.un('SELECT pi.nom, e.nom AS etage FROM pieces pi JOIN etages e ON e.id = pi.etage_id WHERE pi.x < -0.001 OR pi.y < -0.001 OR pi.x + pi.largeur > e.largeur + 0.001 OR pi.y + pi.profondeur > e.profondeur + 0.001 LIMIT 1');
  return l ? `La pièce « ${l.nom} » dépasse de l'étage ${l.etage}.` : null;
}
/* Règles à contrôler selon les collections touchées par la transaction */
const DECLENCHEURS = [[['devices', 'racks', 'catalog'], baies], [['cables', 'ports', 'outlets'], cables], [['rooms', 'floors'], pieces]];
function verifier(pilote, touchees) {
  for (const [collections, regle] of DECLENCHEURS) if (!touchees || collections.some(c => touchees.has(c))) { const m = regle(pilote); if (m) return m; }
  return null;
}
module.exports = { verifier };
