/* Converte o TopoJSON do Natural Earth em GeoJSON compacto, cortando os
   polígonos que atravessam o antimeridiano — sem isso, Fiji e a Rússia
   viram faixas horizontais cruzando o mapa inteiro. */
const fs = require('fs');
const topo = require(process.env.SCRATCH + '/npm/topojson-client/dist/topojson-client.js');
const world = JSON.parse(fs.readFileSync(process.env.SCRATCH + '/npm/world-atlas/countries-110m.json', 'utf8'));
const geo = topo.feature(world, world.objects.countries);

/* Longitudes contínuas: desfaz o salto de ±360 entre pontos consecutivos. */
function unwrap(ring) {
  const out = [ring[0].slice()];
  for (let i = 1; i < ring.length; i++) {
    let x = ring[i][0];
    const prev = out[i - 1][0];
    while (x - prev > 180) x -= 360;
    while (prev - x > 180) x += 360;
    out.push([x, ring[i][1]]);
  }
  return out;
}

/* Sutherland–Hodgman contra uma reta vertical. */
function clipX(ring, keepLeft, xline) {
  const dentro = p => keepLeft ? p[0] <= xline : p[0] >= xline;
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ain = dentro(a), bin = dentro(b);
    if (ain) out.push(a);
    if (ain !== bin && b[0] !== a[0]) {
      const t = (xline - a[0]) / (b[0] - a[0]);
      out.push([xline, a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

let cortados = 0;
function partirAnel(ring) {
  const u = unwrap(ring);
  const lngs = u.map(p => p[0]);
  const mn = Math.min(...lngs), mx = Math.max(...lngs);
  if (mn >= -180 && mx <= 180) return [ring];          // nada a fazer

  cortados++;
  const partes = [];
  const dentro = clipX(u, true, 180);
  const fora = clipX(u, false, 180).map(p => [p[0] - 360, p[1]]);
  const esqDentro = clipX(dentro, false, -180);
  const esqFora = clipX(dentro, true, -180).map(p => [p[0] + 360, p[1]]);
  [esqDentro, esqFora, fora].forEach(p => { if (p.length >= 4) partes.push(p); });
  return partes.length ? partes : [ring];
}

const r = n => Math.round(n * 100) / 100;
const arredonda = ring => ring.map(p => [r(p[0]), r(p[1])]);

const saida = [];
for (const f of geo.features) {
  const poligonos = f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates] : f.geometry.coordinates;
  const novos = [];
  for (const poly of poligonos) {
    const exterior = poly[0];
    const buracos = poly.slice(1);
    for (const parte of partirAnel(exterior)) {
      novos.push([arredonda(parte)].concat(buracos.map(arredonda)));
    }
  }
  const limpos = novos.filter(p => p[0].length >= 4);
  if (!limpos.length) continue;
  saida.push({
    type: 'Feature',
    properties: { name: f.properties.name },
    geometry: { type: 'MultiPolygon', coordinates: limpos },
  });
}

const out = JSON.stringify({ type: 'FeatureCollection', features: saida });
fs.writeFileSync('assets/vendor/world/countries-110m.geo.json', out);
console.log('países:', saida.length, '| anéis cortados no antimeridiano:', cortados);
console.log('tamanho:', (out.length / 1024).toFixed(0) + ' KB');
