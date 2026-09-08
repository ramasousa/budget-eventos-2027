const A = require('./ambiente');
const { chromium } = A.carregarPlaywright();
const fs = require('fs');
const OUT = A.SAIDA;

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  console.log((cond ? '  PASS  ' : '  FALHA ') + name + (extra ? '  → ' + extra : ''));
};


async function autenticar(pg, s) {
  await pg.addInitScript(sess => {
    try { localStorage.setItem('ev2027_sessao', JSON.stringify(sess)); } catch (e) {}
  }, s);
}

(async () => {
  const SESSAO = await A.sessaoDe();
  // Isola o teste: zera o plano compartilhado antes de começar.
  await fetch(`${A.API}/rest/v1/eventos2027_plan?event_id=neq.x`,
    { method: 'DELETE', headers: { apikey: 'x', Authorization: 'Bearer ' + SESSAO.access_token } });
  await fetch(`${A.API}/rest/v1/eventos2027_scenarios?id=neq.x`,
    { method: 'DELETE', headers: { apikey: 'x', Authorization: 'Bearer ' + SESSAO.access_token } });
  await fetch(`${A.API}/rest/v1/eventos2027_settings?on_conflict=id`, {
    method: 'POST',
    headers: { apikey: 'x', Authorization: 'Bearer ' + SESSAO.access_token, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id: 1, budget_limit: 300000, fx: { USD: 6.20, EUR: 6.70, GBP: 7.90 } }]),
  });

  const H0 = { apikey: 'x', Authorization: 'Bearer ' + SESSAO.access_token };
  const ev0 = await (await fetch(`${A.API}/rest/v1/eventos2027_events?select=*`, { headers: H0 })).json();
  for (const e of ev0.filter(e => e.custom)) {
    await fetch(`${A.API}/rest/v1/eventos2027_events?id=eq.${encodeURIComponent(e.id)}`, { method: 'DELETE', headers: H0 });
  }
  const browser = await chromium.launch(A.opcoesDoNavegador());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on('pageerror', e => {
    errors.push('pageerror: ' + e.message);
    console.log('  !! ERRO NA PÁGINA: ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n'));
  });
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // config.js apontado para o mock local
  await page.route('**/assets/js/config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: A.CONFIG_MOCK,
  }));
  await A.autenticar(page, SESSAO);
  await page.goto(`${A.WEB}/app.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  /* ─── CATÁLOGO ─── */
  const cards = await page.locator('.event-card').count();
  check('24 cards renderizados', cards === 24, 'cards=' + cards);

  const railBefore = await page.locator('#railTotal').textContent();
  check('total inicia zerado', railBefore.trim() === 'R$ 0', railBefore);

  // seleciona Web Summit (custo/pessoa: 6200 + 550*6,70 + 700*5 + 350*5 + 600 = 15.735)
  await page.locator('.event-card[data-id="websummit"] .card-body').click();
  await page.waitForTimeout(150);
  const total1 = await page.locator('#railTotal').textContent();
  check('seleção soma no rail', total1.includes('15.735'), total1);
  check('card marcado como selecionado',
    await page.locator('.event-card[data-id="websummit"]').getAttribute('class').then(c => c.includes('selected')));

  // stepper: 2 pessoas → dobra
  await page.locator('.event-card[data-id="websummit"] [data-step="1"]').click();
  await page.waitForTimeout(150);
  const total2 = await page.locator('#railTotal').textContent();
  check('stepper dobra o custo', total2.includes('31.470'), total2);
  check('contador mostra 2', (await page.locator('.event-card[data-id="websummit"] .people-n').textContent()).trim() === '2');

  // barra de orçamento
  const pct = await page.locator('#railPct').textContent();
  check('percentual do limite calculado', /10%/.test(pct), pct.trim());

  /* ─── PERSISTÊNCIA ─── */
  await page.waitForTimeout(900); // debounce de escrita
  const st = JSON.parse(fs.readFileSync(OUT + '/estado-mock.json', 'utf8'));
  const planned = st.plan.find(p => p.event_id === 'websummit');
  check('gravou no "banco" via upsert', planned && planned.people === 2, JSON.stringify(planned || null));
  check('upsert usou on_conflict', st.log.some(l => l.startsWith('POST /rest/v1/eventos2027_plan?on_conflict=event_id')));
  check('enviou apikey', st.log.every(l => l.includes('apikey=sim')));
  check('upsert pediu merge-duplicates', st.log.some(l => l.includes('resolution=merge-duplicates')));

  // desmarcar → DELETE
  await page.locator('.event-card[data-id="apidays-paris"] .card-body').click();
  await page.waitForTimeout(150);
  await page.locator('.event-card[data-id="apidays-paris"] .card-body').click();
  await page.waitForTimeout(900);
  const st2 = JSON.parse(fs.readFileSync(OUT + '/estado-mock.json', 'utf8'));
  check('DELETE remove do plano', !st2.plan.some(p => p.event_id === 'apidays-paris'));

  /* ─── STATUS ─── */
  const sync = await page.locator('#syncText').textContent();
  check('status indica compartilhado', /Compartilhado/.test(sync), sync.trim().slice(0, 70));
  check('indicador verde', (await page.locator('#syncDot').getAttribute('class')).includes('live'));

  /* ─── FILTROS ─── */
  await page.locator('.chip[data-cat="ai"]').click();
  await page.waitForTimeout(120);
  check('filtro de categoria', await page.locator('.event-card').count() === 2, 'ai=' + await page.locator('.event-card').count());
  await page.locator('.chip[data-cat="all"]').click();
  await page.fill('#searchInput', 'lisboa');
  await page.waitForTimeout(320);
  check('busca textual', await page.locator('.event-card').count() === 1);
  await page.fill('#searchInput', '');
  await page.waitForTimeout(320);
  await page.locator('.chip[data-prio="alta"]').click();
  await page.waitForTimeout(120);
  check('filtro de prioridade', await page.locator('.event-card').count() === 9, 'alta=' + await page.locator('.event-card').count());
  await page.locator('.chip[data-prio="all"]').click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: OUT + '/01-catalogo.png', fullPage: false });

  /* ─── MAPA ─── */
  await page.locator('.tab[data-tab="mapa"]').click();
  await page.waitForTimeout(700);
  check('Leaflet real inicializou', await page.locator('.leaflet-container').count() === 1);
  check('não degradou', await page.locator('#mapFallback.show').count() === 0);
  check('zero requisições a servidor de tiles',
    await page.locator('img.leaflet-tile').count() === 0);
  const paths = await page.locator('.leaflet-overlay-pane path').count();
  const marcadores = await page.locator('.leaflet-overlay-pane path.leaflet-interactive').count();
  check('mundo desenhado pela geometria local', paths - marcadores >= 170, 'países=' + (paths - marcadores));
  check('13 marcadores de praça', marcadores === 13, 'marcadores=' + marcadores);
  check('camada de calor criou canvas', await page.locator('canvas.leaflet-heatmap-layer').count() === 1);
  check('crédito da geometria visível',
    /Natural Earth/.test(await page.locator('.map-bottomleft').textContent()));
  // Regressão: Fiji/Rússia atravessavam o antimeridiano e viravam faixas
  // horizontais cruzando o mapa inteiro.
  // A bounding box de um MultiPolygon é larga por natureza quando o país tem
  // ilhas nas duas bordas do mapa (Fiji). O que importa é se algum SUBCAMINHO
  // — um traço contínuo de verdade — atravessa o mapa como uma linha.
  const faixas = await page.evaluate(() => {
    const ruins = [];
    document.querySelectorAll('.leaflet-overlay-pane path:not(.leaflet-interactive)').forEach(el => {
      (el.getAttribute('d') || '').split('M').forEach(sub => {
        const n = (sub.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        if (n.length < 6) return;
        const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
        const dx = Math.max(...xs) - Math.min(...xs), dy = Math.max(...ys) - Math.min(...ys);
        if (dx > 900 && dy < 40) ruins.push(Math.round(dx) + 'x' + Math.round(dy));
      });
    });
    return ruins;
  });
  check('nenhum subcaminho vira faixa atravessando o mapa', faixas.length === 0, JSON.stringify(faixas));
  const ranking = await page.locator('#mapRanking .rank-row').count();
  check('ranking de praças renderizado', ranking === 8, 'linhas=' + ranking);

  // popup: clicar num marcador deve permitir incluir eventos daquela praça
  const antesPopup = Number(await page.locator('#railEvents').textContent());
  await page.locator('.leaflet-overlay-pane path.leaflet-interactive').first().click({ force: true });
  await page.waitForTimeout(400);
  check('popup do marcador abre', await page.locator('.leaflet-popup .evt-popup').count() === 1);
  const btn = page.locator('.evt-popup button[data-map-toggle]').first();
  const jaSelecionado = (await btn.getAttribute('class') || '').includes('on');
  await btn.click();
  await page.waitForTimeout(400);
  const esperado = antesPopup + (jaSelecionado ? -1 : 1);
  check('popup do mapa altera a seleção',
    Number(await page.locator('#railEvents').textContent()) === esperado,
    `${antesPopup} → ${await page.locator('#railEvents').textContent()} (esperado ${esperado})`);

  await page.locator('.map-overlay [data-mapmode="mercado"]').click();
  await page.waitForTimeout(400);
  check('modo Mercado mantém o mapa vivo',
    await page.locator('.leaflet-overlay-pane path.leaflet-interactive').count() === 13);
  await page.locator('.map-overlay [data-mapmode="plano"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/02-mapa.png' });

  /* ─── CALENDÁRIO ─── */
  await page.locator('.tab[data-tab="calendario"]').click();
  await page.waitForTimeout(300);
  check('12 meses no calendário', await page.locator('.tl-month').count() === 12);
  const selNoRail = Number(await page.locator('#railEvents').textContent());
  const pillOn = await page.locator('.tl-pill.on').count();
  check('pílulas destacadas batem com a seleção', pillOn === selNoRail, `pílulas=${pillOn} rail=${selNoRail}`);
  check('meses com carga marcados',
    await page.locator('.tl-month.has-load').count() >= (selNoRail > 0 ? 1 : 0));
  await page.locator('.tl-pill[data-tl="nvidia-gtc"]').click();
  await page.waitForTimeout(300);
  check('seleção pelo calendário funciona',
    Number(await page.locator('#railEvents').textContent()) === selNoRail + 1,
    `${selNoRail} → ${await page.locator('#railEvents').textContent()}`);
  check('mês de março passa a ter carga',
    await page.locator('.tl-month.has-load').count() >= 1);
  await page.screenshot({ path: OUT + '/03-calendario.png' });

  /* ─── CONSOLIDADO ─── */
  await page.locator('.tab[data-tab="consolidado"]').click();
  await page.waitForTimeout(300);
  check('KPIs renderizados', await page.locator('.kpi').count() === 4);
  check('sem tabela plana (exigência do DS)', await page.locator('.tbl').count() === 0);
  check('accordion reflete a seleção',
    await page.locator('.acc-item').count() === Number(await page.locator('#railEvents').textContent()),
    await page.locator('.acc-item').count() + ' itens');
  await page.locator('.acc-head').first().click();
  await page.waitForTimeout(500);
  check('item do accordion abre', await page.locator('.acc-item.open').count() === 1);
  check('detalhe traz as rubricas', await page.locator('.acc-item.open .acc-cost-v').count() === 5);
  const foot = await page.locator('.acc-foot-v').textContent();
  const railNow = await page.locator('#railTotal').textContent();
  check('total da tabela bate com o rail', foot.trim() === railNow.trim(), foot.trim() + ' vs ' + railNow.trim());
  check('gráficos de barra renderizados', await page.locator('.bar-fill').count() >= 10);
  await page.screenshot({ path: OUT + '/04-consolidado.png', fullPage: true });

  /* ─── INGRESSO CORTESIA ─── */
  await page.locator('.tab[data-tab="catalogo"]').click();
  await page.waitForTimeout(250);
  if (!(await page.locator('.event-card[data-id="websummit"]').getAttribute('class')).includes('selected')) {
    await page.locator('.event-card[data-id="websummit"] .card-body').click();
    await page.waitForTimeout(250);
  }
  // 2 participantes no Web Summit: inscrição 550 EUR x 6,70 = R$ 3.685 cada
  await page.locator('.event-card[data-id="websummit"] [data-step="1"]').click();
  await page.waitForTimeout(250);
  const antesCort = await page.locator('#railTotal').textContent();
  await page.locator('.event-card[data-id="websummit"] [data-courtesy-toggle]').click();
  await page.waitForTimeout(400);
  const depoisCort = await page.locator('#railTotal').textContent();
  check('cortesia zera a inscrição de todos', depoisCort !== antesCort, antesCort + ' → ' + depoisCort);
  check('economia calculada (2 x R$ 3.685)',
    (await page.locator('#railEconomia').textContent()).includes('7.370'),
    await page.locator('#railEconomia').textContent());
  check('badge de cortesia no card',
    await page.locator('.event-card[data-id="websummit"] .badge-green').count() >= 1);
  check('contador mostra 2/2',
    (await page.locator('.event-card[data-id="websummit"] .courtesy-n').textContent()).trim() === '2/2');

  // cortesia parcial: 1 de 2
  await page.locator('.event-card[data-id="websummit"] [data-cort="-1"]').click();
  await page.waitForTimeout(400);
  check('cortesia parcial 1/2',
    (await page.locator('.event-card[data-id="websummit"] .courtesy-n').textContent()).trim() === '1/2');
  check('economia cai pela metade',
    (await page.locator('#railEconomia').textContent()).includes('3.685'),
    await page.locator('#railEconomia').textContent());

  await page.waitForTimeout(900);
  const stC = JSON.parse(fs.readFileSync(OUT + '/estado-mock.json', 'utf8'));
  const linha = stC.plan.find(p => p.event_id === 'websummit');
  check('cortesia persistida no banco', linha && linha.courtesy === 1, JSON.stringify(linha));

  // reduzir participantes não pode deixar cortesia órfã (o banco tem CHECK)
  await page.locator('.event-card[data-id="websummit"] [data-step="-1"]').click();
  await page.waitForTimeout(400);
  const cn = (await page.locator('.event-card[data-id="websummit"] .courtesy-n').textContent()).trim();
  check('cortesia respeita o nº de participantes', cn === '1/1', cn);

  /* ─── PREMISSAS / CÂMBIO ─── */
  // garante um evento em EUR SEM cortesia — com cortesia total a inscrição
  // é zero e o câmbio, corretamente, não muda nada
  await page.locator('.tab[data-tab="catalogo"]').click();
  await page.waitForTimeout(200);
  if (!(await page.locator('.event-card[data-id="money2020-eu"]').getAttribute('class')).includes('selected')) {
    await page.locator('.event-card[data-id="money2020-eu"] .card-body').click();
    await page.waitForTimeout(250);
  }
  await page.locator('.tab[data-tab="consolidado"]').click();
  await page.waitForTimeout(300);
  const railNowFx = await page.locator('#railTotal').textContent();
  await page.locator('#btnPremissas').click();
  await page.waitForTimeout(250);
  await page.fill('#fxEUR', '7,50');
  await page.locator('#btnSavePremissas').click();
  await page.waitForTimeout(500);
  const afterFx = await page.locator('#railTotal').textContent();
  check('mudança de câmbio recalcula tudo', afterFx !== railNowFx, 'antes=' + railNowFx + ' depois=' + afterFx);
  // regressão: o mapa está inicializado mas oculto nesta aba; o redesenho não
  // pode lançar e abortar o handler antes de fechar o modal
  check('modal de premissas fecha (mapa oculto não quebra o render)',
    await page.locator('#modalPremissas.open').count() === 0);
  await page.waitForTimeout(900);
  const st3 = JSON.parse(fs.readFileSync(OUT + '/estado-mock.json', 'utf8'));
  check('câmbio persistido nas settings', Number(st3.settings[0].fx.EUR) === 7.5, JSON.stringify(st3.settings[0].fx));

  /* ─── CENÁRIO ─── */
  page.on('dialog', d => d.accept('Cenário de teste'));
  await page.locator('#btnSaveScenario').click();
  await page.waitForTimeout(700);
  const st4 = JSON.parse(fs.readFileSync(OUT + '/estado-mock.json', 'utf8'));
  check('cenário gravado', st4.scenarios.length === 1 && st4.scenarios[0].name === 'Cenário de teste',
    JSON.stringify(st4.scenarios.map(s => s.name)));
  check('cenário guardou total e seleções',
    st4.scenarios[0].total > 0 && Object.keys(st4.scenarios[0].selections).length >= 2,
    JSON.stringify(Object.keys(st4.scenarios[0].selections)));

  /* ─── EXPORTAÇÕES ─── */
  const dl = await Promise.all([
    page.waitForEvent('download'), page.locator('#btnCSV').click(),
  ]).then(r => r[0]);
  const csvPath = OUT + '/export.csv';
  await dl.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  const nSel = Number(await page.locator('#railEvents').textContent());
  const linhasCsv = csv.trim().split('\n').length;
  check('CSV tem cabeçalho + eventos + total',
    linhasCsv === nSel + 2 && csv.includes('TOTAL GERAL'),
    `${linhasCsv} linhas para ${nSel} eventos`);
  check('CSV usa ponto-e-vírgula (Excel pt-BR)', csv.split('\n')[0].split(';').length === 17);
  check('CSV traz colunas de cortesia', /Ingressos cortesia/.test(csv) && /Economia cortesia/.test(csv));

  const dl2 = await Promise.all([
    page.waitForEvent('download'), page.locator('#btnTXT').click(),
  ]).then(r => r[0]);
  await dl2.saveAs(OUT + '/export.txt');
  const txt = fs.readFileSync(OUT + '/export.txt', 'utf8');
  check('TXT com total e premissas', txt.includes('TOTAL ESTIMADO') && txt.includes('PREMISSAS'));
  check('TXT reporta cortesias', txt.includes('INGRESSOS DE CORTESIA'));

  /* ─── REGRESSÃO: resize com o mapa oculto ─── */
  await page.locator('.tab[data-tab="mapa"]').click(); await page.waitForTimeout(900);
  await page.locator('.tab[data-tab="consolidado"]').click(); await page.waitForTimeout(300);
  await page.setViewportSize({ width: 900, height: 1100 });
  await page.waitForTimeout(700);
  check('resize com mapa oculto não quebra', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);

  check('nenhum erro de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
  process.exit(failed.length ? 1 : 0);
})();
