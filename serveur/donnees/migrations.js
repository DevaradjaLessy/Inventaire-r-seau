/* Migrations versionnées : chaque fichier « NNN_nom.sql » du dossier du dialecte est appliqué une seule fois,
   dans l'ordre, chacun dans sa transaction. La table « migrations » garde la trace de ce qui est fait. */
'use strict';
const fs = require('fs'), path = require('path');

function lister(dialecte) {
  const dossier = path.join(__dirname, 'migrations', dialecte);
  return fs.readdirSync(dossier).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort().map(f => ({ version: +f.slice(0, 3), nom: f, sql: fs.readFileSync(path.join(dossier, f), 'utf8') }));
}
/* Met la base au dernier niveau. avant(version) est appelé avant chaque migration d'une base existante (sauvegarde). */
function migrer(pilote, { avant = null, jusqua = Infinity } = {}) {
  pilote.executer('CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, nom TEXT NOT NULL, appliquee_le TEXT NOT NULL)');
  const faites = new Set(pilote.tous('SELECT version FROM migrations').map(l => l.version));
  const appliquees = [], existante = faites.size > 0;   // une base neuve n'a rien à sauvegarder
  for (const m of lister(pilote.dialecte)) {
    if (faites.has(m.version) || m.version > jusqua) continue;
    if (existante && avant) avant(m.version);
    pilote.transaction(() => { pilote.executer(m.sql); pilote.lancer('INSERT INTO migrations (version, nom, appliquee_le) VALUES (?, ?, ?)', [m.version, m.nom, new Date().toISOString()]); });
    faites.add(m.version); appliquees.push(m.version);
  }
  return { version: Math.max(0, ...faites), appliquees };
}
module.exports = { migrer, lister };
