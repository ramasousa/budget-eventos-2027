const A = require('./ambiente');
const { chromium } = A.carregarPlaywright();
const OUT = A.SAIDA;
const res = [];
const check = (n, c, e = '') => { res.push(!!c); console.log((c ? '  PASS  ' : '  FALHA ') + n + (e ? '  → ' + e : '')); };
const CFG = "const SUPABASE={url:`${A.API}`,key:'k',prefix:'eventos2027_'};";

(async () => {
  const H = { apikey: 'x', 'Content-Type': 'application/json' };

  /* O setup também escreve, e escrever agora exige sessão. Um DELETE que
     leva 401 e é ignorado deixa o estado da suíte anterior de pé — foi
     exatamente assim que este teste passou a falhar sem motivo aparente.
     Por isso o setup confere a resposta e o estado final. */
  const rSetup = await fetch(`${A.API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: 'k', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'raul@bradesco.com.br', password: 'senha-correta' }),
  });
  const dSetup = await rSetup.json();
  const HA = { ...H, Authorization: 'Bearer ' + dSetup.access_token };

  const limpeza = await fetch(`${A.API}/rest/v1/eventos2027_plan?event_id=neq.x`,
    { method: 'DELETE', headers: HA });
  if (!limpeza.ok) throw new Error('setup: limpeza do plano falhou com HTTP ' + limpeza.status);
  const sobrou = await (await fetch(`${A.API}/rest/v1/eventos2027_plan?select=event_id`,
    { headers: H })).json();
  if (sobrou.length) throw new Error('setup: plano não ficou vazio → ' + JSON.stringify(sobrou));

  const b = await chromium.launch(A.opcoesDoNavegador());
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: CFG }));

  await p.goto(`${A.WEB}/app.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);

  /* ═══ DESLOGADO: lê tudo, não altera nada ═══ */
  check('deslogado ainda LÊ o catálogo', await p.locator('.event-card').count() === 24);
  check('modo somente-leitura ativo', await p.evaluate(() => document.body.classList.contains('somente-leitura')));
  check('faixa de aviso visível', await p.locator('#faixaLeitura').isVisible());
  check('botão Entrar visível', await p.locator('#btnEntrar').isVisible());
  check('botão Sair escondido', !(await p.locator('#btnSair').isVisible()));
  check('adicionar evento desabilitado', await p.locator('#btnNovoEvento').isDisabled());
  check('salvar cenário desabilitado', await p.locator('#btnSaveScenario').isDisabled());
  check('exportar CONTINUA valendo para quem só lê', await p.locator('#btnCSV').isEnabled());

  const antes = await p.locator('#railEvents').textContent();
  // clique direto no card, contornando o CSS, para provar que o portão do store segura
  await p.locator('.event-card[data-id="websummit"] .card-body').dispatchEvent('click');
  await p.waitForTimeout(700);
  check('clique no card NÃO altera o plano',
    (await p.locator('#railEvents').textContent()) === antes,
    antes + ' → ' + await p.locator('#railEvents').textContent());
  check('modal de login abre ao tentar editar', await p.locator('#modalLogin.open').count() === 1);
  check('toast explica o motivo', /Somente leitura/.test(await p.locator('#toast').textContent()));

  /* mesmo chamando o store direto, nada passa */
  const viaStore = await p.evaluate(async () => {
    Store.toggle('aws-reinvent'); Store.setBudget(999999); Store.setPeople('sff', 5);
    await new Promise(r => setTimeout(r, 600));
    return { eventos: Object.keys(Store.state.plan).length, limite: Store.state.budgetLimit };
  });
  check('portão do store bloqueia mutação programática',
    viaStore.eventos === 0 && viaStore.limite !== 999999, JSON.stringify(viaStore));

  /* ═══ LOGIN ═══ */
  await p.fill('#loginEmail', 'raul@bradesco.com.br');
  await p.fill('#loginSenha', 'errada');
  await p.locator('#btnFazerLogin').click();
  await p.waitForTimeout(800);
  check('senha errada é recusada', await p.locator('#loginErro').isVisible());
  check('mensagem não revela se o e-mail existe',
    /incorretos/.test(await p.locator('#loginErro').textContent()),
    (await p.locator('#loginErro').textContent()).trim());
  check('continua somente-leitura após falha',
    await p.evaluate(() => document.body.classList.contains('somente-leitura')));

  await p.fill('#loginSenha', 'senha-correta');
  await p.locator('#btnFazerLogin').click();
  await p.waitForTimeout(1200);
  check('login bem-sucedido fecha o modal', await p.locator('#modalLogin.open').count() === 0);
  check('modo somente-leitura desligado',
    !(await p.evaluate(() => document.body.classList.contains('somente-leitura'))));
  check('faixa some', !(await p.locator('#faixaLeitura').isVisible()));
  check('e-mail da sessão exibido',
    (await p.locator('#sessaoEmail').textContent()).includes('raul@bradesco.com.br'));
  check('botões de edição liberados',
    await p.locator('#btnNovoEvento').isEnabled() && await p.locator('#btnSaveScenario').isEnabled());

  /* ═══ AUTENTICADO: edita e a escrita chega ═══ */
  await p.locator('.event-card[data-id="websummit"] .card-body').click();
  await p.waitForTimeout(1200);
  check('agora a seleção funciona', (await p.locator('#railEvents').textContent()) === '1',
    await p.locator('#railEvents').textContent());
  const linhas = await (await fetch(`${A.API}/rest/v1/eventos2027_plan?select=*`, { headers: H })).json();
  check('escrita chegou ao banco', linhas.length === 1, JSON.stringify(linhas.map(l => l.event_id)));
  check('autoria vem da sessão, não de texto digitado',
    linhas[0] && linhas[0].updated_by === 'raul@bradesco.com.br', linhas[0] && linhas[0].updated_by);

  await p.screenshot({ path: OUT + '/v7-autenticado.png' });

  /* ═══ SESSÃO PERSISTE ENTRE RECARGAS ═══ */
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  check('sessão sobrevive ao reload',
    !(await p.evaluate(() => document.body.classList.contains('somente-leitura'))));
  check('e-mail ainda exibido após reload',
    (await p.locator('#sessaoEmail').textContent()).includes('raul@bradesco.com.br'));

  /* ═══ SAIR ═══ */
  await p.locator('#btnSair').click();
  await p.waitForTimeout(900);
  check('sair volta para somente-leitura',
    await p.evaluate(() => document.body.classList.contains('somente-leitura')));
  check('faixa reaparece', await p.locator('#faixaLeitura').isVisible());
  const depoisSair = await p.locator('#railEvents').textContent();
  await p.locator('.event-card[data-id="sff"] .card-body').dispatchEvent('click');
  await p.waitForTimeout(700);
  check('deslogado não edita de novo',
    (await p.locator('#railEvents').textContent()) === depoisSair);

  /* ═══ DEEP LINK DA CAPA ═══ */
  const p2 = await ctx.newPage();
  await p2.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: CFG }));
  await p2.goto(`${A.WEB}/app.html?entrar=1`, { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(1500);
  check('link "Entrar para editar" da capa abre o modal',
    await p2.locator('#modalLogin.open').count() === 1);
  await p2.close();

  /* ═══ SESSÃO EXPIRADA ═══
     Token de 1h: quem deixa a página aberta cai aqui. Precisa dizer
     "sua sessão expirou", não "sem conexão". */
  const p3 = await ctx.newPage();
  await p3.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: CFG }));
  // sessão com token que o servidor não conhece e refresh inválido
  await p3.addInitScript(() => {
    try {
      localStorage.setItem('ev2027_sessao', JSON.stringify({
        access_token: 'tok-revogado', refresh_token: 'ref-revogado',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        email: 'raul@bradesco.com.br', id: 'u1',
      }));
    } catch (e) {}
  });
  await p3.goto(`${A.WEB}/app.html`, { waitUntil: 'domcontentloaded' });
  await p3.waitForTimeout(1500);
  check('token revogado começa como se estivesse logado',
    !(await p3.evaluate(() => document.body.classList.contains('somente-leitura'))));

  await p3.locator('.event-card[data-id="dtx"] .card-body').click();
  await p3.waitForTimeout(2000);
  const aviso = await p3.locator('#toast').textContent();
  check('avisa que a sessão expirou (não "sem conexão")',
    /sess[ãa]o expirou/i.test(aviso), aviso.trim());
  check('volta para somente-leitura ao perder a sessão',
    await p3.evaluate(() => document.body.classList.contains('somente-leitura')));
  check('reabre o login para a pessoa continuar',
    await p3.locator('#modalLogin.open').count() === 1);
  await p3.close();

  check('nenhum erro de JavaScript', errs.length === 0, errs.slice(0, 3).join(' | '));

  await b.close();
  const f = res.filter(x => !x).length;
  console.log(`\n${res.length - f}/${res.length} verificações passaram`);
  process.exit(f ? 1 : 0);
})();
