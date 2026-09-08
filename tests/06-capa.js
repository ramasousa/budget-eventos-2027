const A = require('./ambiente');
const { chromium } = A.carregarPlaywright();
const OUT = A.SAIDA;
const res = [];
const check = (n, c, e = '') => { res.push(!!c); console.log((c ? '  PASS  ' : '  FALHA ') + n + (e ? '  → ' + e : '')); };
const CFG = "const SUPABASE={url:`${A.API}`,key:'k',prefix:'eventos2027_'};";


async function autenticar(pg, s) {
  await pg.addInitScript(sess => {
    try { localStorage.setItem('ev2027_sessao', JSON.stringify(sess)); } catch (e) {}
  }, s);
}

(async () => {
  const SESSAO = await A.sessaoDe();
  const H = { apikey: 'x', Authorization: 'Bearer ' + SESSAO.access_token, 'Content-Type': 'application/json' };
  await fetch(`${A.API}/rest/v1/eventos2027_plan?event_id=neq.x`, { method: 'DELETE', headers: H });
  // eventos personalizados de outras suítes mudariam a contagem do catálogo
  const todos = await (await fetch(`${A.API}/rest/v1/eventos2027_events?select=*`, { headers: H })).json();
  for (const e of todos.filter(e => e.custom)) {
    await fetch(`${A.API}/rest/v1/eventos2027_events?id=eq.${encodeURIComponent(e.id)}`,
      { method: 'DELETE', headers: H });
  }
  // plano conhecido: Web Summit 2p com 2 cortesias + AWS 2p + Singapura 1p
  await fetch(`${A.API}/rest/v1/eventos2027_plan?on_conflict=event_id`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([
      { event_id: 'websummit', people: 2, courtesy: 2, updated_by: 'Raul', updated_at: new Date().toISOString() },
      { event_id: 'aws-reinvent', people: 2, courtesy: 0, updated_by: 'Raul', updated_at: new Date().toISOString() },
      { event_id: 'sff', people: 1, courtesy: 0, updated_by: 'Raul', updated_at: new Date().toISOString() },
    ]),
  });
  await fetch(`${A.API}/rest/v1/eventos2027_settings?on_conflict=id`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id: 1, budget_limit: 300000, fx: { USD: 6.20, EUR: 6.70, GBP: 7.90 } }]),
  });

  const b = await chromium.launch(A.opcoesDoNavegador());
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  const errs = [], externas = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('request', r => { const u = r.url();
    if (!u.startsWith('http://127.0.0.1:') && !u.startsWith('data:') && !u.startsWith('blob:')) externas.push(u); });
  await p.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: CFG }));

  await p.goto(`${A.WEB}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);

  /* ─── decorativos não podem entrar no fluxo ───
     Uma regra "container > *" já redefiniu o position do noise/glow/svg e
     empurrou o conteúdo 1.540px para baixo. Aqui isso falha na hora. */
  const decor = await p.evaluate(() => {
    const fora = [];
    document.querySelectorAll('.noise, .glow, .hero-mundo').forEach(el => {
      const pos = getComputedStyle(el).position;
      if (pos !== 'absolute') fora.push((el.className.baseVal ?? el.className) + ':' + pos);
    });
    const hero = document.querySelector('.hero').getBoundingClientRect();
    const nav = document.querySelector('.hero-nav').getBoundingClientRect();
    return { fora, alturaHero: Math.round(hero.height), topoNav: Math.round(nav.top), vh: window.innerHeight };
  });
  check('noise, glow e mapa continuam absolutos', decor.fora.length === 0, JSON.stringify(decor.fora));
  check('hero cabe na tela (não é empurrado pelos decorativos)',
    decor.alturaHero <= decor.vh + 4, decor.alturaHero + 'px vs ' + decor.vh + 'px de viewport');
  check('navegação no topo', decor.topoNav < 120, 'top=' + decor.topoNav);
  check('título visível sem rolar',
    (await p.locator('.hero-titulo').boundingBox()).y < decor.vh,
    'y=' + Math.round((await p.locator('.hero-titulo').boundingBox()).y));

  /* ─── números ao vivo ─── */
  const numero = (await p.locator('#heroNumero').textContent()).trim();
  // 2p Web Summit c/ 2 cortesias = 24.100 ; AWS 2p = 52.720 ; SFF 1p = 26.390
  check('hero mostra o total do plano', numero.includes('103.210'), numero);
  const sub = await p.locator('#heroSub').textContent();
  check('subtítulo resume o plano', /3 eventos/.test(sub) && /5 participações/.test(sub), sub.trim());
  check('barra de limite preenchida',
    parseFloat(await p.locator('#heroBarraFill').evaluate(el => el.style.width)) > 30,
    await p.locator('#heroBarraFill').evaluate(el => el.style.width));
  check('texto do limite',
    /34% do limite/.test(await p.locator('#heroBarraTxt').textContent()),
    (await p.locator('#heroBarraTxt').textContent()).trim());

  /* o número tem que bater com o da ferramenta — fórmula compartilhada */
  const p2 = await b.newPage({ viewport: { width: 1440, height: 950 } });
  await p2.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: CFG }));
  await A.autenticar(p2, SESSAO);
  await p2.goto(`${A.WEB}/app.html`, { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(1500);
  const naFerramenta = (await p2.locator('#railTotal').textContent()).trim();
  check('capa e ferramenta mostram o MESMO total',
    numero.replace(/\s+/g, '') === naFerramenta.replace(/\s+/g, ''),
    'capa=' + numero + ' | app=' + naFerramenta);
  await p2.close();

  /* ─── números de apoio ─── */
  check('quatro cartões de apoio', await p.locator('.capa-num').count() === 4);
  const cartoes = await p.locator('.capa-num-v').allTextContents();
  check('cartão reflete o catálogo do banco', cartoes[0] === '24', cartoes.join(' | '));
  check('6 frentes temáticas', cartoes[1] === '6', cartoes[1]);
  check('economia com cortesias no cartão', /7.370/.test(cartoes[3]), cartoes[3]);

  /* ─── estado ─── */
  const estado = await p.locator('#capaEstado').textContent();
  check('mostra quem atualizou e quando', /Raul/.test(estado) && /Atualizado/.test(estado), estado.trim());
  check('indicador verde', await p.locator('#capaEstado .ponto.live').count() === 1);

  /* ─── mundo em pontos ─── */
  const pontos = await p.locator('#heroMundo .matriz circle').count();
  check('mundo desenhado em matriz de pontos', pontos > 1500, 'pontos=' + pontos);
  const pracas = await p.locator('#heroMundo .praca').count();
  check('praças do plano acesas', pracas === 3, 'praças=' + pracas);
  // Lisboa fica no hemisfério norte, à esquerda do centro; Singapura à direita
  const xs = await p.locator('#heroMundo .praca-nucleo').evaluateAll(
    els => els.map(e => Number(e.getAttribute('cx'))).sort((a, b) => a - b));
  check('praças posicionadas em longitudes distintas',
    new Set(xs).size === 3 && xs[2] - xs[0] > 400, JSON.stringify(xs));

  /* ─── navegação ─── */
  await A.autenticar(p, SESSAO);
  await p.locator('.hero-acoes .btn-primario').click();
  await p.waitForTimeout(1500);
  check('botão principal abre a ferramenta', p.url().endsWith('/app.html'), p.url());
  check('ferramenta carregou', await p.locator('.event-card').count() === 24);
  await p.locator('.brand-voltar').click();
  await p.waitForTimeout(1200);
  check('marca volta para a capa', await p.locator('#heroNumero').count() === 1, p.url());

  /* ─── seções ─── */
  check('quatro cards de leitura', await p.locator('.capa-card').count() === 4);
  check('quatro premissas', await p.locator('.premissa').count() === 4);

  check('nenhuma requisição externa', externas.length === 0, JSON.stringify(externas.slice(0, 3)));
  check('nenhum erro de JavaScript', errs.length === 0, errs.slice(0, 2).join(' | '));

  await p.screenshot({ path: OUT + '/v6-capa.png' });
  await p.screenshot({ path: OUT + '/v6-capa-full.png', fullPage: true });

  await b.close();
  const f = res.filter(x => !x).length;
  console.log(`\n${res.length - f}/${res.length} verificações passaram`);
  process.exit(f ? 1 : 0);
})();
