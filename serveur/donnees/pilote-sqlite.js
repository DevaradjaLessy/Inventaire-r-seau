/* Pilote SQLite : seul fichier qui connaît le moteur. Il expose une petite interface
   (executer, tous, un, lancer, transaction, fermer) que le reste de la couche de données utilise.
   Passer à PostgreSQL revient à écrire un pilote qui offre la même interface. */
'use strict';
const fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');

function ouvrir(fichier) {
  if (fichier !== ':memory:') fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const db = new DatabaseSync(fichier);
  // Clés étrangères actives ; journal WAL pour que les lectures ne bloquent pas pendant une écriture
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  const cache = new Map();
  const prep = sql => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
  const plat = l => (l ? { ...l } : null);   // objets ordinaires, sans prototype particulier
  let dansTransaction = false;
  return {
    dialecte: 'sqlite',
    executer: sql => db.exec(sql),
    tous: (sql, params = []) => prep(sql).all(...params).map(plat),
    un: (sql, params = []) => plat(prep(sql).get(...params)),
    lancer: (sql, params = []) => prep(sql).run(...params),
    /* Tout ou rien : la fonction est validée entière, ou annulée entière si elle lève une erreur.
       Les clés étrangères sont vérifiées à la validation, ce qui permet d'écrire les lignes dans n'importe quel ordre. */
    transaction(fn) {
      if (dansTransaction) return fn();
      db.exec('BEGIN IMMEDIATE'); dansTransaction = true;
      try {
        db.exec('PRAGMA defer_foreign_keys = ON');
        const r = fn();
        db.exec('COMMIT'); dansTransaction = false;
        return r;
      } catch (e) { try { db.exec('ROLLBACK'); } catch { /* transaction déjà annulée */ } dansTransaction = false; throw e; }
    },
    /* Lignes qui violent une clé étrangère : [{ table, parent }] */
    violationsCles: () => prep('PRAGMA foreign_key_check').all().map(l => ({ table: l.table, parent: l.parent })),
    fermer() { cache.clear(); db.close(); },
  };
}
module.exports = { ouvrir };
