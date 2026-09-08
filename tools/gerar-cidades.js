/* ──────────────────────────────────────────────────────────────────────────
   Gera a base de cidades do autocomplete de "Adicionar evento".

   Fonte: all-the-cities (GeoNames) + world-countries (nome do país em
   português e continente). Filtramos por população para tirar as homônimas
   pequenas — "Cologne" com 7 mil habitantes é uma cidade de Minnesota, não
   a Colônia alemã — e forçamos a entrada de sedes de evento que são
   pequenas demais para o corte (Davos, Cannes, Palo Alto...).

   Uso:  SCRATCH=<pasta-com-os-pacotes-npm> node tools/gerar-cidades.js
   ────────────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const S = process.env.SCRATCH;
const cidades = require(S + '/cidades/package/index.js');
const paises = require(S + '/cidades/wc/countries.json');

const CORTE = 120000;

/* Sedes de evento abaixo do corte que não podem faltar. */
const FORCAR = [
  ['Davos', 'CH'], ['Cannes', 'FR'], ['Monaco', 'MC'], ['Palo Alto', 'US'],
  ['Mountain View', 'US'], ['Santa Clara', 'US'], ['Sunnyvale', 'US'],
  ['Redmond', 'US'], ['Cupertino', 'US'], ['Menlo Park', 'US'],
  ['Cambridge', 'GB'], ['Oxford', 'GB'], ['Basel', 'CH'], ['Lausanne', 'CH'],
  ['Bruges', 'BE'], ['Ghent', 'BE'], ['Heidelberg', 'DE'], ['Aspen', 'US'],
];

/* Nome de exibição em português para as praças mais usadas. */
const PT = {
  'Lisbon': 'Lisboa', 'London': 'Londres', 'New York City': 'Nova York',
  'Genève': 'Genebra', 'Zürich': 'Zurique', 'Munich': 'Munique',
  'Köln': 'Colônia', 'Copenhagen': 'Copenhague', 'Stockholm': 'Estocolmo',
  'Berlin': 'Berlim', 'Warsaw': 'Varsóvia', 'Prague': 'Praga', 'Vienna': 'Viena',
  'Brussels': 'Bruxelas', 'The Hague': 'Haia', 'Amsterdam': 'Amsterdã',
  'Milan': 'Milão', 'Rome': 'Roma', 'Florence': 'Florença',
  'Venice': 'Veneza', 'Turin': 'Turim', 'Naples': 'Nápoles',
  'Athens': 'Atenas', 'Istanbul': 'Istambul', 'Moscow': 'Moscou',
  'Beijing': 'Pequim', 'Shanghai': 'Xangai', 'Guangzhou': 'Cantão',
  'Tokyo': 'Tóquio', 'Kyoto': 'Quioto', 'Seoul': 'Seul',
  'Singapore': 'Singapura', 'Bangkok': 'Bangcoc', 'New Delhi': 'Nova Délhi',
  'Mexico City': 'Cidade do México', 'Cape Town': 'Cidade do Cabo',
  'Johannesburg': 'Joanesburgo', 'Riyadh': 'Riade', 'Montréal': 'Montreal',
  'San Francisco': 'São Francisco', 'Philadelphia': 'Filadélfia',
  'Marseille': 'Marselha', 'Bordeaux': 'Bordéus', 'Sevilla': 'Sevilha',
  'Seville': 'Sevilha', 'Frankfurt am Main': 'Frankfurt', 'Nürnberg': 'Nuremberg',
  'Antwerp': 'Antuérpia', 'Rotterdam': 'Roterdã', 'Edinburgh': 'Edimburgo',
  'Helsinki': 'Helsinque', 'Geneva': 'Genebra', 'Zurich': 'Zurique',
  'Taipei': 'Taipé', 'Ho Chi Minh City': 'Cidade de Ho Chi Minh',
  'Tel Aviv-Yafo': 'Tel Aviv', 'Hamburg': 'Hamburgo', 'Gothenburg': 'Gotemburgo',
  'Kraków': 'Cracóvia', 'Budapest': 'Budapeste', 'Bucharest': 'Bucareste',
  'Belgrade': 'Belgrado', 'Lyon': 'Lião', 'Nice': 'Nice', 'Toulouse': 'Toulouse',
};

/* País → nome em português + região no vocabulário do orçamento. */
const porPais = {};
for (const p of paises) {
  let regiao;
  if (p.region === 'Europe') regiao = 'Europa';
  else if (p.region === 'Africa') regiao = 'África';
  else if (p.region === 'Oceania') regiao = 'Ásia-Pacífico';
  else if (p.region === 'Asia') regiao = p.subregion === 'Western Asia' ? 'Oriente Médio' : 'Ásia-Pacífico';
  else if (p.region === 'Americas') regiao = p.subregion === 'North America' ? 'América do Norte' : 'América Latina';
  else regiao = '—';
  porPais[p.cca2] = { nome: (p.translations.por && p.translations.por.common) || p.name.common, regiao };
}

const forcadas = new Set(FORCAR.map(([n, c]) => n + '|' + c));
const escolhidas = new Map();          // nome|país → registro

for (const c of cidades) {
  const chave = c.name + '|' + c.country;
  if (c.population < CORTE && !forcadas.has(chave)) continue;
  const pais = porPais[c.country];
  if (!pais) continue;
  const anterior = escolhidas.get(chave);
  if (anterior && anterior.pop >= c.population) continue;
  escolhidas.set(chave, {
    nome: PT[c.name] || c.name,
    original: c.name,
    pais: pais.nome,
    regiao: pais.regiao,
    lng: Math.round(c.loc.coordinates[0] * 10000) / 10000,
    lat: Math.round(c.loc.coordinates[1] * 10000) / 10000,
    pop: c.population,
  });
}

/* Formato compacto: [nome, país, região, lat, lng, nomeOriginal?] */
const lista = [...escolhidas.values()]
  .sort((a, b) => b.pop - a.pop)
  .map(c => {
    const linha = [c.nome, c.pais, c.regiao, c.lat, c.lng];
    if (c.original !== c.nome) linha.push(c.original);   // busca também pelo original
    return linha;
  });

const out = JSON.stringify(lista);
fs.writeFileSync('assets/vendor/cidades/cidades.json', out);
console.log('cidades:', lista.length, '| tamanho:', (out.length / 1024).toFixed(0) + ' KB');
