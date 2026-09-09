/* ──────────────────────────────────────────────────────────────────────────
   Viagens nacionais: a política de visita aos polos.

   O que importa aqui não é "o campo aceita número", é que a REGRA produza o
   número certo e que o número certo chegue às duas telas. O bug que este
   arquivo existe para impedir é o clássico do projeto: a capa mostrando uma
   metade do orçamento e a ferramenta mostrando a outra.
   ────────────────────────────────────────────────────────────────────────── */
const A = require('./ambiente');
const { chromium } = A.carregarPlaywright();
const { Custo } = require('../assets/js/custo.js');
const OUT = A.SAIDA;
const p9 = A.placar();
const check = p9.check;

const brl = n => 'R$ ' + Math.round(n).toLocaleString('pt-BR');

(async () => {
  const SESSAO = await A.sessaoDe();
  const H = A.cabecalhos();
  await A.limparPlano(SESSAO);
  await A.limparEventosPersonalizados(SESSAO);
  await A.premissasPadrao(SESSAO);
  await A.comViagensNacionais(SESSAO);          // Recife e Curitiba, padrão

  const politica = () => fetch(`${A.API}/rest/v1/eventos2027_settings?select=nacional&id=eq.1`,
    { headers: H }).then(r => r.json()).then(rows => rows[0].nacional);

  const b = await chromium.launch(A.opcoesDoNavegador());
  const ctx = await b.newContext({ viewport: { width: 1500, height: 980 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.route('**/assets/js/config.js', r => r.fulfill({
    contentType: 'application/javascript', body: A.CONFIG_MOCK }));
  await A.autenticar(pg, SESSAO);
  await pg.goto(`${A.WEB}/app.html`, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1600);

  /* ═══ A POLÍTICA PADRÃO ═══ */
  await pg.locator('.tab[data-tab="nacional"]').click();
  await pg.waitForTimeout(400);

  const esperado = Custo.nacional(Custo.NACIONAL_PADRAO).total;   // 2 polos × 8 viagens × 2.000
  check('a fórmula do padrão fecha em R$ 32.000', esperado === 32000, brl(esperado));

  check('dois polos na tela', await pg.locator('.polo-card:not(.novo)').count() === 2,
    'polos=' + await pg.locator('.polo-card:not(.novo)').count());
  check('Recife e Curitiba nomeados',
    (await pg.locator('.polo-nome').allTextContents()).join('|').includes('Recife'));
  check('dois cargos na matriz', await pg.locator('.mz-row:not(.novo)').count() === 2,
    'cargos=' + await pg.locator('.mz-row:not(.novo)').count());
  check('rodapé da matriz soma o ano',
    (await pg.locator('.mz-foot .mz-total').textContent()).includes('32.000'),
    await pg.locator('.mz-foot .mz-total').textContent());
  check('cadência do Gerente Sênior é 4 por polo',
    await pg.locator('[data-viagens="gerente-senior|recife"]').inputValue() === '4');
  check('cadência do Gerente é 2 por polo',
    await pg.locator('[data-viagens="gerente|curitiba"]').inputValue() === '2');

  /* ═══ O RAIL SOMA AS DUAS METADES ═══ */
  check('rail separa internacional de nacional',
    (await pg.locator('#railNac').textContent()).includes('32.000'),
    await pg.locator('#railNac').textContent());
  check('sem evento selecionado, o total é só o nacional',
    (await pg.locator('#railTotal').textContent()).includes('32.000'),
    await pg.locator('#railTotal').textContent());

  await pg.locator('.tab[data-tab="catalogo"]').click();
  await pg.waitForTimeout(300);
  await pg.locator('.event-card[data-id="websummit"] .card-body').click();
  await pg.waitForTimeout(900);

  const intl = A.brlParaNumero(await pg.locator('#railIntl').textContent());
  const total = A.brlParaNumero(await pg.locator('#railTotal').textContent());
  check('total = internacional + nacional', total === intl + 32000,
    `${intl} + 32000 = ${intl + 32000} · rail=${total}`);
  check('a barra de limite considera o total geral',
    (await pg.locator('#railPct').textContent()).includes(
      Math.round((intl + 32000) / 300000 * 100) + '%'),
    await pg.locator('#railPct').textContent());

  /* ═══ MUDAR A POLÍTICA MUDA O ORÇAMENTO ═══ */
  await pg.locator('.tab[data-tab="nacional"]').click();
  await pg.waitForTimeout(300);

  // Gerente Sênior passa a ir 6x a Recife: +2 viagens × R$ 2.000
  await pg.fill('[data-viagens="gerente-senior|recife"]', '6');
  await pg.locator('[data-viagens="gerente-senior|recife"]').blur();
  await pg.waitForTimeout(1100);
  check('mudar a cadência recalcula na hora',
    (await pg.locator('.mz-foot .mz-total').textContent()).includes('36.000'),
    await pg.locator('.mz-foot .mz-total').textContent());

  const pol1 = await politica();
  const cadencia = pol1.cargos.find(c => c.id === 'gerente-senior').viagens.recife;
  check('a política chegou ao banco', cadencia === 6, 'recife=' + cadencia);

  // Curitiba fica mais cara
  await pg.fill('[data-custo="curitiba"]', '3.000');
  await pg.locator('[data-custo="curitiba"]').blur();
  await pg.waitForTimeout(1100);
  // Recife: (1×6 + 2×2) = 10 viagens × 2.000 = 20.000
  // Curitiba: (1×4 + 2×2) = 8 viagens × 3.000 = 24.000
  check('custo por viagem recalcula o polo',
    (await pg.locator('.mz-foot .mz-total').textContent()).includes('44.000'),
    await pg.locator('.mz-foot .mz-total').textContent());

  // O time de gerentes cresce
  await pg.fill('[data-pessoas="gerente"]', '4');
  await pg.locator('[data-pessoas="gerente"]').blur();
  await pg.waitForTimeout(1100);
  // Recife: (6 + 4×2)=14 × 2.000 = 28.000 · Curitiba: (4 + 4×2)=12 × 3.000 = 36.000
  check('mais gente no cargo, mais orçamento',
    (await pg.locator('.mz-foot .mz-total').textContent()).includes('64.000'),
    await pg.locator('.mz-foot .mz-total').textContent());

  const pol2 = await politica();
  check('pessoas e custo persistidos',
    pol2.cargos.find(c => c.id === 'gerente').pessoas === 4 &&
    pol2.polos.find(p => p.id === 'curitiba').custo === 3000,
    JSON.stringify({ pessoas: pol2.cargos.find(c => c.id === 'gerente').pessoas,
                     custo: pol2.polos.find(p => p.id === 'curitiba').custo }));

  /* ═══ CARGO NOVO ═══ */
  await pg.locator('#btnNovoCargo').click();
  await pg.waitForTimeout(250);
  await pg.fill('#cargoNome', 'Especialista');
  await pg.fill('#cargoPessoas', '3');
  await pg.locator('#btnSalvarCargo').click();
  await pg.waitForTimeout(1100);
  check('cargo novo entra na matriz', await pg.locator('.mz-row:not(.novo)').count() === 3,
    'linhas=' + await pg.locator('.mz-row:not(.novo)').count());
  check('cargo novo NÃO viaja até alguém decidir',
    (await pg.locator('.mz-foot .mz-total').textContent()).includes('64.000'),
    await pg.locator('.mz-foot .mz-total').textContent());

  await pg.fill('[data-viagens="especialista|recife"]', '1');
  await pg.locator('[data-viagens="especialista|recife"]').blur();
  await pg.waitForTimeout(1100);
  // +3 pessoas × 1 viagem × 2.000 = 6.000
  check('a cadência do cargo novo entra no total',
    (await pg.locator('.mz-foot .mz-total').textContent()).includes('70.000'),
    await pg.locator('.mz-foot .mz-total').textContent());

  /* ═══ POLO NOVO, COM COORDENADA ═══ */
  await pg.locator('#btnNovoPolo').click();
  await pg.waitForTimeout(300);
  await pg.fill('#poloCidade', 'São Paulo');
  await pg.waitForTimeout(900);
  check('autocomplete só sugere cidade brasileira',
    await pg.locator('#poloLista .ac-item').count() > 0,
    'sugestões=' + await pg.locator('#poloLista .ac-item').count());
  await pg.locator('#poloLista .ac-item').first().click();
  await pg.fill('#poloCusto', '900');
  await pg.locator('#btnSalvarPolo').click();
  await pg.waitForTimeout(1200);

  check('polo novo aparece', await pg.locator('.polo-card:not(.novo)').count() === 3,
    'polos=' + await pg.locator('.polo-card:not(.novo)').count());
  check('polo novo nasce com coordenada',
    !(await pg.locator('.polo-card').nth(2).textContent()).includes('sem coordenada'));
  check('polo novo entra zerado — ninguém viaja por acidente de cadastro',
    (await pg.locator('.mz-foot .mz-total').textContent()).includes('70.000'),
    await pg.locator('.mz-foot .mz-total').textContent());

  const pol3 = await politica();
  const sp = pol3.polos.find(x => /paulo/i.test(x.nome));
  check('coordenada de São Paulo persistida',
    !!sp && typeof sp.lat === 'number' && Math.abs(sp.lat + 23.5) < 1,
    sp && JSON.stringify({ lat: sp.lat, lng: sp.lng, custo: sp.custo }));
  check('cadência do polo novo nasce zerada em todos os cargos',
    pol3.cargos.every(c => (c.viagens[sp.id] || 0) === 0));

  /* ═══ O POLO APARECE NO MAPA ═══ */
  await pg.locator('.tab[data-tab="mapa"]').click();
  await pg.waitForTimeout(1400);
  const verdes = await pg.evaluate(() =>
    [...document.querySelectorAll('#map path')].filter(el =>
      (el.getAttribute('stroke') || '').toLowerCase() === '#4fc79a').length);
  check('os três polos entram no mapa com linguagem própria', verdes === 3, 'marcadores=' + verdes);
  await pg.screenshot({ path: OUT + '/v8-mapa-polos.png' });

  /* ═══ REMOÇÃO ═══ */
  await pg.locator('.tab[data-tab="nacional"]').click();
  await pg.waitForTimeout(400);
  pg.once('dialog', d => d.accept());
  await pg.locator('[data-rm-polo="curitiba"]').click();
  await pg.waitForTimeout(1200);
  check('remover o polo tira o custo dele', await pg.locator('.polo-card:not(.novo)').count() === 2,
    'polos=' + await pg.locator('.polo-card:not(.novo)').count());
  // sobra Recife: (6 + 4×2 + 3×1) = 17 viagens × 2.000 = 34.000
  check('total cai para o que sobrou',
    (await pg.locator('.mz-foot .mz-total').textContent()).includes('34.000'),
    await pg.locator('.mz-foot .mz-total').textContent());
  const pol4 = await politica();
  check('a cadência para o polo removido some junto',
    pol4.cargos.every(c => c.viagens.curitiba === undefined),
    JSON.stringify(pol4.cargos.map(c => c.viagens)));

  /* ═══ EXPORTAÇÕES ═══ */
  const baixar = async botao => {
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.locator(botao).click()]);
    const fs = require('fs');
    const destino = OUT + '/' + dl.suggestedFilename();
    await dl.saveAs(destino);
    return fs.readFileSync(destino, 'utf8');
  };
  const csv = await baixar('#btnCSV');
  check('CSV traz linha por cargo e polo', /Visita a Recife — Gerente/.test(csv),
    (csv.split('\n').find(l => /Visita a/.test(l)) || '').slice(0, 70));
  check('CSV separa subtotais', /SUBTOTAL INTERNACIONAL/.test(csv) && /SUBTOTAL NACIONAL/.test(csv));
  check('CSV fecha no total geral', /TOTAL GERAL/.test(csv));

  const txt = await baixar('#btnTXT');
  check('TXT explica a política, não só o valor', /VIAGENS NACIONAIS/.test(txt) && /Recife 6x/.test(txt),
    (txt.split('\n').find(l => /Gerente Sênior/.test(l)) || '').trim());
  check('TXT separa as duas metades',
    /INTERNACIONAL \.+ /.test(txt) && /^NACIONAL \.+ /m.test(txt),
    (txt.split('\n').filter(l => /^(INTER)?NACIONAL/.test(l)).join(' | ')));

  /* ═══ A CAPA MOSTRA O MESMO NÚMERO ═══ */
  const totalApp = A.brlParaNumero(await pg.locator('#railTotal').textContent());
  const capa = await ctx.newPage();
  await capa.route('**/assets/js/config.js', r => r.fulfill({
    contentType: 'application/javascript', body: A.CONFIG_MOCK }));
  await capa.goto(`${A.WEB}/`, { waitUntil: 'domcontentloaded' });
  await capa.waitForTimeout(2000);
  const totalCapa = A.brlParaNumero(await capa.locator('#heroNumero').textContent());
  check('capa e ferramenta mostram o MESMO total', totalCapa === totalApp,
    `capa=${totalCapa} | app=${totalApp}`);
  check('capa cita as viagens nacionais no subtítulo',
    /viagens nacionais/i.test(await capa.locator('#heroSub').textContent()),
    await capa.locator('#heroSub').textContent());
  check('cartão de viagens nacionais na capa',
    (await capa.locator('.capa-num').allTextContents()).join(' ').includes('34.000'));
  await capa.screenshot({ path: OUT + '/v8-capa.png' });
  await capa.close();

  /* ═══ SOMENTE LEITURA NÃO EDITA A POLÍTICA ═══ */
  const leitor = await ctx.newPage();
  await leitor.route('**/assets/js/config.js', r => r.fulfill({
    contentType: 'application/javascript', body: A.CONFIG_MOCK }));
  await leitor.addInitScript(() => { try { localStorage.removeItem('ev2027_sessao'); } catch (e) {} });
  await leitor.goto(`${A.WEB}/app.html`, { waitUntil: 'domcontentloaded' });
  await leitor.waitForTimeout(1600);
  await leitor.locator('.tab[data-tab="nacional"]').click();
  await leitor.waitForTimeout(500);
  check('deslogado LÊ a política', await leitor.locator('.polo-card').count() === 2);
  check('deslogado não edita a cadência',
    await leitor.locator('[data-viagens="gerente-senior|recife"]').isDisabled());
  check('deslogado não inclui polo', await leitor.locator('#btnNovoPolo').isDisabled());

  const antes = await politica();
  await leitor.evaluate(() => {
    Store.setViagens('gerente-senior', 'recife', 40);
    Store.setPoloCusto('recife', 99999);
  });
  await leitor.waitForTimeout(900);
  const depois = await politica();
  check('nem chamando o store direto', JSON.stringify(antes) === JSON.stringify(depois),
    JSON.stringify(depois.polos.map(p => p.custo)));
  await leitor.close();

  await pg.screenshot({ path: OUT + '/v8-nacional.png', fullPage: true });
  check('nenhum erro de JavaScript', errs.length === 0, errs.slice(0, 2).join(' | '));

  await b.close();
  p9.fechar();
})();
