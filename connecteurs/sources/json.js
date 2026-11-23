/* Source JSON : lit une adresse HTTP qui publie l'état au format du contrat (voir lib/contrat.js).
   Elle sert à raccorder un outil de supervision qui n'a pas de source dédiée (Zabbix, Centreon, LibreNMS, Nagios, un script maison) :
   il suffit qu'un petit programme, côté supervision, publie la liste des équipements à ce format.
   Configuration :
   { type: "json", nom: "zabbix", url: "https://supervision.exemple.interne/netcarto.json", jeton: "env:SUPERVISION_JETON",
     insecureTls: false, timeoutMs: 15000 }
   Réponse attendue : { "version": 1, "devices": [ { ip, hostname, state, message, ports: [ { name, status, … } ] } ] }
   ou directement la liste des équipements. Le jeton, s'il est donné, part dans l'en-tête « Authorization: Bearer ». */
'use strict';
const { getJson } = require('../lib/http');
const { secret } = require('../lib/contrat');

module.exports = function creer(cfg) {
  const url = String(cfg.url || '');
  if (!/^https?:\/\//.test(url)) throw new Error('Source JSON : « url » doit commencer par http:// ou https://');
  return {
    nom: cfg.nom || 'json',
    async relever() {
      const r = await getJson(url, { insecureTls: cfg.insecureTls, timeoutMs: cfg.timeoutMs, headers: cfg.jeton ? { Authorization: `Bearer ${secret(cfg.jeton)}` } : {} });
      const liste = Array.isArray(r) ? r : r && Array.isArray(r.devices) ? r.devices : null;
      if (!liste) throw new Error('Source JSON : format inattendu (liste d\'équipements, ou objet avec « devices », attendu).');
      return liste;
    },
  };
};
