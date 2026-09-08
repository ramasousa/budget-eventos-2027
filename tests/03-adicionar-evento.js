const A = require('./ambiente');
const { chromium } = A.carregarPlaywright();
const fs = require('fs');
const OUT = A.SAIDA;
const res = [];
const check = (n, c, e = '') => { res.push(!!c); console.log((c ? '  PASS  ' : '  FALHA ') + n + (e ? '  → ' + e : '')); };


async function autenticar(pg, s) {
  await pg.addInitScript(sess => {
    try { localStorage.setItem('ev2027_sessao', JSON.stringify(sess)); } catch (e) {}
  }, s);
}

(async () => {
  const SESSAO = await A.sessaoDe();
  const H = { apikey: 'x', Authorization: 'Bearer ' + SESSAO.access_token };
  // premissas padrão: a prévia de custo depende do câmbio vigente
  await fetch(`${A.API}/rest/v1/eventos2027_settings?on_conflict=id`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id: 1, budget_limit: 300000, fx: { USD: 6.20, EUR: 6.70, GBP: 7.90 } }]),
  });
  await fetch(`${A.API}/rest/v1/eventos2027_plan?event_id=neq.x`, { method: 'DELETE', headers: H });
  // limpa eventos personalizados de rodadas anteriores
  const todos = await (await fetch(`${A.API}/rest/v1/eventos2027_events?select=*`, { headers: H })).json();
  for (const e of todos.filter(e => e.custom)) {
    await fetch(`${A.API}/rest/v1/eventos2027_events?id=eq.${encodeURIComponent(e.id)}`,
      { method: 'DELETE', headers: H });
  }
  const b = await chromium.launch(A.opcoesDoNavegador());
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const pedidos = [];
  p.on('request', r => pedidos.push(r.url()));
  await p.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript',
    body: A.CONFIG_MOCK }));
  await A.autenticar(p, SESSAO);
  await p.goto(`${A.WEB}/app.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);

  const antes = await p.locator('.event-card').count();
  check('catálogo carregou', antes === 24, 'eventos=' + antes);
  check('base de cidades NÃO baixada antes de precisar',
    !pedidos.some(u => u.includes('cidades.json')));

  /* ─── abre o formulário ─── */
  await p.locator('#btnNovoEvento').click();
  await p.waitForTimeout(900);
  check('formulário abre', await p.locator('#modalEvento.open').count() === 1);
  check('base de cidades baixada sob demanda',
    pedidos.some(u => u.includes('cidades.json')));
  check('categorias preenchidas', await p.locator('#fCategoria option').count() === 6);
  check('12 meses no select', await p.locator('#fMes option').count() === 12);

  /* ─── autocomplete ─── */
  await p.fill('#fCidade', 'berl');
  await p.waitForTimeout(400);
  const sugestoes = await p.locator('.ac-item').count();
  check('autocomplete sugere cidades', sugestoes > 0, 'sugestões=' + sugestoes);
  const primeira = await p.locator('.ac-item .ac-cidade').first().textContent();
  check('busca sem acento encontra "Berlim"', primeira.trim() === 'Berlim', primeira);

  // acento: "sao paulo" deve achar "São Paulo"
  await p.fill('#fCidade', 'sao paulo');
  await p.waitForTimeout(400);
  check('busca ignora acentuação',
    (await p.locator('.ac-item .ac-cidade').first().textContent()).trim() === 'São Paulo');

  // navegação por teclado
  await p.fill('#fCidade', 'munique');
  await p.waitForTimeout(400);
  await p.locator('#fCidade').press('ArrowDown');
  await p.locator('#fCidade').press('Enter');
  await p.waitForTimeout(300);
  check('escolha por teclado preenche o campo',
    (await p.locator('#fCidade').inputValue()) === 'Munique');
  const nota = await p.locator('#fCidadeNota').textContent();
  check('mostra país, região e coordenada', /Alemanha.*Europa.*48\./.test(nota), nota.trim());

  /* ─── prévia do custo ─── */
  await p.fill('input[name="name"]', 'Open Banking Summit');
  await p.selectOption('select[name="category"]', 'open');
  await p.selectOption('select[name="monthNum"]', '5');
  await p.fill('input[name="dateLabel"]', 'Meados de maio');
  await p.fill('input[name="passagem"]', '7.500');
  await p.fill('input[name="ticket"]', '900');
  await p.selectOption('select[name="currency"]', 'EUR');
  await p.fill('input[name="hotel"]', '800');
  await p.fill('input[name="nights"]', '3');
  await p.fill('input[name="perDiem"]', '400');
  await p.fill('input[name="days"]', '3');
  await p.fill('input[name="transfer"]', '500');
  await p.waitForTimeout(400);
  // 7500 + 900*6,70 + 800*3 + 400*3 + 500 = 7500+6030+2400+1200+500 = 17.630
  const previa = await p.locator('#fPreviaValor').textContent();
  check('prévia calcula com o câmbio das premissas', previa.includes('17.630'), previa);

  /* ─── validação ─── */
  await p.locator('#btnSalvarEvento').click();
  await p.waitForTimeout(400);
  check('exige o benefício antes de salvar',
    await p.locator('#modalEvento.open').count() === 1 &&
    /benefício/i.test(await p.locator('#toast').textContent()),
    await p.locator('#toast').textContent());

  await p.fill('textarea[name="benefit"]', 'Fórum europeu de Open Finance com agenda regulatória.');
  await p.fill('textarea[name="audience"]', 'Open Finance + arquitetura.');
  await p.fill('textarea[name="outcome"]', 'Leitura antecipada de FiDA.');

  /* ─── salva ─── */
  await p.locator('#btnSalvarEvento').click();
  await p.waitForTimeout(1400);
  check('modal fecha após salvar', await p.locator('#modalEvento.open').count() === 0);
  const depois = await p.locator('.event-card').count();
  check('catálogo cresceu', depois === antes + 1, antes + ' → ' + depois);

  const st = JSON.parse(fs.readFileSync(OUT + '/estado-mock.json', 'utf8'));
  check('gravado no banco como custom', st.custom.length === 1, JSON.stringify(st.custom));
  check('coordenada de Munique persistida',
    st.custom[0] && Math.abs(st.custom[0].lat - 48.14) < 0.2, JSON.stringify(st.custom[0]));

  const novo = st.custom[0].id;
  check('id derivado do nome', novo === 'open-banking-summit', novo);
  check('card marcado como incluído pela equipe',
    await p.locator(`.event-card[data-id="${novo}"] .badge-blue`).count() === 1);
  check('card destacado após criação',
    await p.locator('.event-card.recem-criado').count() === 1);

  /* ─── entra no orçamento como qualquer outro ─── */
  await p.locator(`.event-card[data-id="${novo}"] .card-body`).click();
  await p.waitForTimeout(400);
  check('novo evento soma no orçamento',
    (await p.locator('#railTotal').textContent()).includes('17.630'),
    await p.locator('#railTotal').textContent());

  await p.locator('.tab[data-tab="mapa"]').click();
  await p.waitForTimeout(1800);
  check('nova praça aparece no mapa',
    await p.locator('.leaflet-overlay-pane path.leaflet-interactive').count() === 14,
    'marcadores=' + await p.locator('.leaflet-overlay-pane path.leaflet-interactive').count());
  check('Munique no ranking de praças',
    /Munique/.test(await p.locator('#mapRanking').textContent()));

  await p.locator('.tab[data-tab="calendario"]').click();
  await p.waitForTimeout(400);
  check('aparece no calendário de maio',
    await p.locator(`.tl-pill[data-tl="${novo}"]`).count() === 1);

  await p.screenshot({ path: OUT + '/v3-novo-evento.png' });

  /* ─── evento sem sede definida ─── */
  await p.locator('.tab[data-tab="catalogo"]').click();
  await p.waitForTimeout(300);
  await p.locator('#btnNovoEvento').click();
  await p.waitForTimeout(700);
  await p.fill('input[name="name"]', 'Cúpula Sem Sede');
  await p.fill('textarea[name="benefit"]', 'Evento com sede ainda indefinida.');
  await p.fill('input[name="passagem"]', '9.000');
  await p.locator('#fSemSede').check();
  await p.waitForTimeout(300);
  await p.locator('#btnSalvarEvento').click();
  await p.waitForTimeout(1400);
  const st2 = JSON.parse(fs.readFileSync(OUT + '/estado-mock.json', 'utf8'));
  const semSede = st2.custom.find(e => e.name === 'Cúpula Sem Sede');
  check('evento sem sede é aceito', !!semSede, JSON.stringify(semSede));
  check('sem sede fica sem coordenada', semSede && semSede.lat === null, JSON.stringify(semSede));
  await p.locator('.tab[data-tab="mapa"]').click();
  await p.waitForTimeout(1500);
  check('sem sede não entra no mapa',
    await p.locator('.leaflet-overlay-pane path.leaflet-interactive').count() === 14,
    'marcadores=' + await p.locator('.leaflet-overlay-pane path.leaflet-interactive').count());

  /* ─── remoção ─── */
  await p.locator('.tab[data-tab="catalogo"]').click();
  await p.waitForTimeout(300);
  check('curados não têm botão de remover',
    await p.locator('.event-card[data-id="websummit"] [data-remover]').count() === 0);
  check('personalizados têm botão de remover',
    await p.locator(`.event-card[data-id="${novo}"] [data-remover]`).count() === 1);
  p.on('dialog', d => d.accept());
  await p.locator(`.event-card[data-id="${novo}"] [data-remover]`).click();
  await p.waitForTimeout(1400);
  check('remoção tira do catálogo',
    await p.locator(`.event-card[data-id="${novo}"]`).count() === 0);
  check('remoção também limpa o orçamento',
    (await p.locator('#railTotal').textContent()).trim() === 'R$ 0',
    await p.locator('#railTotal').textContent());

  check('nenhum erro de JavaScript', errs.length === 0, errs.slice(0, 3).join(' | '));

  await b.close();
  const f = res.filter(x => !x).length;
  console.log(`\n${res.length - f}/${res.length} verificações passaram`);
  process.exit(f ? 1 : 0);
})();
