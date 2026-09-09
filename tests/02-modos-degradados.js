const A = require('./ambiente');
const { chromium } = A.carregarPlaywright();
const OUT = A.SAIDA;
const results = [];
const check = (n, c, e = '') => { results.push({ n, c: !!c }); console.log((c ? '  PASS  ' : '  FALHA ') + n + (e ? '  → ' + e : '')); };

const CFG_MOCK = A.CONFIG_MOCK;


async function autenticar(pg, s) {
  await pg.addInitScript(sess => {
    try { localStorage.setItem('ev2027_sessao', JSON.stringify(sess)); } catch (e) {}
  }, s);
}

(async () => {
  const SESSAO = await A.sessaoDe();
  await A.semViagensNacionais(SESSAO);
  const H0 = { apikey: 'x', Authorization: 'Bearer ' + SESSAO.access_token };
  const ev0 = await (await fetch(`${A.API}/rest/v1/eventos2027_events?select=*`, { headers: H0 })).json();
  for (const e of ev0.filter(e => e.custom)) {
    await fetch(`${A.API}/rest/v1/eventos2027_events?id=eq.${encodeURIComponent(e.id)}`, { method: 'DELETE', headers: H0 });
  }
  const browser = await chromium.launch(A.opcoesDoNavegador());

  const zerarPlano = () => fetch(`${A.API}/rest/v1/eventos2027_plan?event_id=neq.x`,
    { method: 'DELETE', headers: { apikey: 'x', Authorization: 'Bearer ' + SESSAO.access_token } });

  /* ══ CENÁRIO A — rede corporativa bloqueia o CDN do mapa ══════════════ */
  console.log('\nA) Geometria do mapa indisponível');
  await zerarPlano();
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ctxA.newPage();
  const errA = [];
  const externas = [];
  a.on('pageerror', e => errA.push(e.message));
  a.on('request', r => {
    const u = r.url();
    if (!u.startsWith('http://127.0.0.1:') && !u.startsWith('data:') && !u.startsWith('blob:')) externas.push(u);
  });
  await a.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: CFG_MOCK }));
  await a.route('**/countries-110m.geo.json', r => r.abort());   // geometria morta
  await A.autenticar(a, SESSAO);
  await a.goto(`${A.WEB}/app.html`, { waitUntil: 'domcontentloaded' });
  await a.waitForTimeout(1200);

  check('app carrega sem a geometria', await a.locator('.event-card').count() === 24);
  await a.locator('.event-card[data-id="sff"] .card-body').click();
  await a.locator('.event-card[data-id="money2020-eu"] .card-body').click();
  await a.waitForTimeout(200);
  await a.locator('.tab[data-tab="mapa"]').click();
  await a.waitForTimeout(600);
  check('degrada para o modo autônomo', await a.locator('#mapFallback.show').count() === 1);
  check('explica que foi a geometria',
    /geometria do mapa/.test(await a.locator('.fb-sub').textContent()));
  check('Leaflet local carregou (a lib não é o problema)',
    await a.evaluate(() => typeof L !== 'undefined' && typeof L.heatLayer === 'function'));
  check('nenhuma chamada a CDN ou servidor de tiles', externas.length === 0, JSON.stringify(externas));
  check('fallback lista praças', await a.locator('.fb-city').count() === 13, 'praças=' + await a.locator('.fb-city').count());
  check('fallback agrupa por região', await a.locator('.fb-region').count() === 4, 'regiões=' + await a.locator('.fb-region').count());
  check('praças selecionadas destacadas', await a.locator('.fb-city.on').count() === 2, 'on=' + await a.locator('.fb-city.on').count());
  await a.locator('.fb-city.on').first().click();
  await a.waitForTimeout(250);
  check('detalhe da praça abre', await a.locator('.fb-ev').count() >= 1);
  const antes = Number(await a.locator('#railEvents').textContent());
  await a.locator('.fb-ev-btn.on').first().click();
  await a.waitForTimeout(350);
  const depois = Number(await a.locator('#railEvents').textContent());
  check('dá para desselecionar pelo fallback', depois === antes - 1, `${antes} → ${depois}`);
  await a.locator('#mapFallback [data-mapmode="mercado"]').click();
  await a.waitForTimeout(300);
  check('alternar modo funciona no fallback', await a.locator('.fb-city').count() === 13);
  check('sem erro de JS no modo degradado', errA.length === 0, errA.slice(0, 2).join(' | '));

  /* ══ CENÁRIO A2 — a própria biblioteca não carrega ════════════════════ */
  console.log('\nA2) Biblioteca local indisponível (defensivo)');
  await zerarPlano();
  const ctxA2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const a2 = await ctxA2.newPage();
  const errA2 = [];
  a2.on('pageerror', e => errA2.push(e.message));
  await a2.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: CFG_MOCK }));
  await a2.route('**/assets/vendor/leaflet/leaflet.js', r => r.abort());
  await a2.route('**/assets/vendor/leaflet/leaflet-heat.js', r => r.abort());
  await A.autenticar(a2, SESSAO);
  await a2.goto(`${A.WEB}/app.html`, { waitUntil: 'domcontentloaded' });
  await a2.waitForTimeout(1200);
  await a2.locator('.tab[data-tab="mapa"]').click();
  await a2.waitForTimeout(500);
  check('degrada quando a lib falta', await a2.locator('#mapFallback.show').count() === 1);
  check('mensagem aponta a biblioteca',
    /biblioteca de mapas/.test(await a2.locator('.fb-sub').textContent()));
  check('resto do app intacto sem a lib', await a2.locator('.fb-city').count() === 13);
  check('sem erro de JS sem a lib', errA2.length === 0, errA2.slice(0, 2).join(' | '));
  await a.screenshot({ path: OUT + '/05-mapa-fallback.png' });

  /* ══ CENÁRIO B — Supabase fora do ar (modo local) ═════════════════════ */
  console.log('\nB) Supabase inacessível');
  await zerarPlano();
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const b = await ctxB.newPage();
  const errB = [];
  b.on('pageerror', e => errB.push(e.message));
  await b.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: CFG_MOCK }));
  await b.route('**/127.0.0.1:8788/**', r => r.abort());

  await A.autenticar(b, SESSAO);

  await b.goto(`${A.WEB}/app.html`, { waitUntil: 'domcontentloaded' });
  await b.waitForTimeout(1500);
  check('catálogo embarcado assume', await b.locator('.event-card').count() === 24);
  check('status avisa que está offline', /Sem conexão/.test(await b.locator('#syncText').textContent()));
  check('indicador vermelho', (await b.locator('#syncDot').getAttribute('class')).includes('err'));
  await b.locator('.event-card[data-id="websummit"] .card-body').click();
  await b.waitForTimeout(200);
  check('seleção ainda funciona offline', (await b.locator('#railTotal').textContent()).includes('15.735'));
  // recarrega: o espelho local deve reter o estado
  await b.reload({ waitUntil: 'domcontentloaded' });
  await b.waitForTimeout(1200);
  check('espelho local sobrevive ao reload', (await b.locator('#railTotal').textContent()).includes('15.735'),
    await b.locator('#railTotal').textContent());
  check('sem erro de JS offline', errB.length === 0, errB.slice(0, 2).join(' | '));

  /* ══ CENÁRIO C — duas pessoas, mesma página ═══════════════════════════ */
  console.log('\nC) Duas pessoas editando (superintendente + par)');
  // Cada pessoa com a SUA conta: é assim que a autoria passa a ser prova.
  const sessaoDe = async email => {
    const r = await fetch(`${A.API}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: 'k', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'senha-correta' }),
    });
    const d = await r.json();
    return { access_token: d.access_token, refresh_token: d.refresh_token,
             expires_at: d.expires_at, email: d.user.email, id: d.user.id };
  };
  const mk = async email => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    await p.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: CFG_MOCK }));
    await A.autenticar(p, await sessaoDe(email));
    await p.goto(`${A.WEB}/app.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);
    return p;
  };
  await zerarPlano();

  const raul = await mk('raul@bradesco.com.br');
  await raul.waitForTimeout(13000);              // deixa o poll limpar
  const par = await mk('superintendente@bradesco.com.br');

  check('ambos começam iguais',
    (await raul.locator('#railTotal').textContent()) === (await par.locator('#railTotal').textContent()),
    await raul.locator('#railTotal').textContent());

  await raul.locator('.event-card[data-id="aws-reinvent"] .card-body').click();
  await raul.waitForTimeout(200);
  const raulTotal = await raul.locator('#railTotal').textContent();

  // o poll roda a cada 12s
  await par.waitForTimeout(14000);
  const parTotal = await par.locator('#railTotal').textContent();
  check('a alteração de um aparece no outro', parTotal === raulTotal, `Raul=${raulTotal} | Par=${parTotal}`);
  check('autoria vem da sessão de quem editou',
    /raul/.test(await par.locator('#syncText').textContent()),
    (await par.locator('#syncText').textContent()).slice(0, 90));
  const autoriaNoBanco = await (await fetch(
    `${A.API}/rest/v1/eventos2027_plan?select=event_id,updated_by`,
    { headers: { apikey: 'k' } })).json();
  check('banco registra o e-mail, não um nome digitado',
    autoriaNoBanco.every(l => String(l.updated_by).includes('@bradesco.com.br')),
    JSON.stringify(autoriaNoBanco));

  // o par muda o número de pessoas; Raul deve ver
  await par.locator('.event-card[data-id="aws-reinvent"] [data-step="1"]').click();
  await par.waitForTimeout(200);
  const parTotal2 = await par.locator('#railTotal').textContent();
  await raul.waitForTimeout(14000);
  check('cada pessoa assina o que alterou',
    (await raul.locator('#sessaoEmail').textContent()).startsWith('raul') &&
    (await par.locator('#sessaoEmail').textContent()).startsWith('superintendente'),
    await raul.locator('#sessaoEmail').textContent() + ' / ' + await par.locator('#sessaoEmail').textContent());
  check('mudança de participantes propaga de volta',
    (await raul.locator('#railTotal').textContent()) === parTotal2,
    `Par=${parTotal2} | Raul=${await raul.locator('#railTotal').textContent()}`);

  /* ══ CENÁRIO D — config.js não carrega ════════════════════════════════
     Proxy corporativo, 404 num deploy pela metade, erro de sintaxe: o
     config é o primeiro script da página. Ele quebrou de verdade durante o
     desenvolvimento e a página inteira ficou em branco — porque `const
     SUPABASE` fica na zona morta e até `typeof SUPABASE` lança. A partir
     daqui, config quebrado significa modo local, não tela vazia. */
  console.log('\nD) config.js quebrado');
  const ctxD = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const d = await ctxD.newPage();
  const errD = [];
  d.on('pageerror', e => errD.push(e.message));
  await d.route('**/assets/js/config.js', r => r.fulfill({
    contentType: 'application/javascript',
    body: 'const SUPABASE = { url: NAO_EXISTE, key: 1 };',   // lança na avaliação
  }));
  await d.goto(`${A.WEB}/app.html`, { waitUntil: 'domcontentloaded' });
  await d.waitForTimeout(1200);
  check('catálogo continua de pé com config quebrado',
    await d.locator('.event-card').count() === 24,
    'cards=' + await d.locator('.event-card').count());
  check('diz que está em modo local',
    /Modo local/.test(await d.locator('#syncText').textContent()),
    (await d.locator('#syncText').textContent()).slice(0, 60));
  check('seleção ainda funciona sem banco',
    await (async () => {
      await d.locator('.event-card[data-id="sff"] .card-body').click();
      await d.waitForTimeout(300);
      return (await d.locator('#railEvents').textContent()) === '1';
    })(), await d.locator('#railEvents').textContent());
  check('o único erro é o do próprio config, e ele não se propaga',
    errD.every(m => /NAO_EXISTE/.test(m)), errD.join(' | '));

  // a capa também é porta de entrada: não pode ficar em branco
  const dc = await ctxD.newPage();
  const errDC = [];
  dc.on('pageerror', e => errDC.push(e.message));
  await dc.route('**/assets/js/config.js', r => r.fulfill({
    contentType: 'application/javascript',
    body: 'const SUPABASE = { url: NAO_EXISTE, key: 1 };',
  }));
  await dc.goto(`${A.WEB}/`, { waitUntil: 'domcontentloaded' });
  await dc.waitForTimeout(1500);
  check('capa continua de pé com config quebrado',
    await dc.locator('#heroNumero').count() === 1 &&
    (await dc.locator('#heroNumero').textContent()).trim().length > 0,
    (await dc.locator('#heroNumero').textContent()).trim());
  check('capa não propaga o erro do config',
    errDC.every(m => /NAO_EXISTE/.test(m)), errDC.join(' | '));

  await browser.close();
  const f = results.filter(r => !r.c);
  console.log(`\n${results.length - f.length}/${results.length} verificações passaram`);
  process.exit(f.length ? 1 : 0);
})();
