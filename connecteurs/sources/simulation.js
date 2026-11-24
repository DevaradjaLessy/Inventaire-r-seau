/* Source « simulation » : renvoie des équipements fictifs décrits dans la configuration.
   Sert à vérifier la chaîne relais → NetCarto sans aucun équipement réel.
   Configuration : { type: "simulation", devices: [{ ip, hostname, ports: ["Gi1/0/1", …] }] }
   Un port peut aussi être donné en entier ({ name, status, … }) : il est alors renvoyé tel quel, pour rejouer un cas précis. */
'use strict';

module.exports = function creer(cfg) {
  return {
    nom: cfg.nom || 'simulation',
    async relever() {
      return (cfg.devices || []).map(d => ({
        ip: d.ip, hostname: d.hostname, state: d.state || 'up', message: '',
        ports: (d.ports || []).map((name, i) => { if (name && typeof name === 'object') return { ...name }; const up = i % 5 !== 4; return { name, status: up ? 'up' : 'down', speedMbps: 1000, inMbps: up ? +(Math.random() * 40).toFixed(2) : 0, outMbps: up ? +(Math.random() * 12).toFixed(2) : 0 }; }),
      }));
    },
  };
};
