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
  await fetch(`${A.API}/rest/v1/eventos2027_plan?event_id=neq.x`, { method: 'DELETE', headers: H });
  await fetch(`${A.API}/rest/v1/eventos2027_scenarios?id=neq.x`, { method: 'DELETE', headers: H });

  const b = await chromium.launch(A.opcoesDoNavegador());
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript',
    body: A.CONFIG_MOCK }));

  let respostaPrompt = '';
  p.on('dialog', d => d.type() === 'prompt' ? d.accept(respostaPrompt) : d.accept());

  await A.autenticar(p, SESSAO);

  await p.goto(`${A.WEB}/app.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);

  // dois cenários distintos
  await p.locator('.event-card[data-id="websummit"] .card-body').click();
  await p.waitForTimeout(250);
  respostaPrompt = 'Plano enxuto';
  await p.locator('#btnSaveScenario').click();
  await p.waitForTimeout(800);

  await p.locator('.event-card[data-id="aws-reinvent"] .card-body').click();
  await p.waitForTimeout(250);
  respostaPrompt = 'Plano cheio';
  await p.locator('#btnSaveScenario').click();
  await p.waitForTimeout(900);

  const totalAntes = await p.locator('#railTotal').textContent();

  await p.locator('#btnScenarios').click();
  await p.waitForTimeout(800);
  check('modal lista os dois cenários', await p.locator('#scenarioList .scn-row').count() === 2,
    'linhas=' + await p.locator('#scenarioList .scn-row').count());
  check('cada linha tem botão de excluir', await p.locator('#scenarioList .scn-del').count() === 2);
  await p.screenshot({ path: OUT + '/v4-cenarios.png' });

  // exclui o mais recente (Plano cheio aparece primeiro, ordenado por data desc)
  const nomeAlvo = (await p.locator('#scenarioList .scn-name').first().textContent()).trim().split('\n')[0];
  await p.locator('#scenarioList .scn-del').first().click();
  await p.waitForTimeout(1200);

  check('lista sobra com um cenário', await p.locator('#scenarioList .scn-row').count() === 1,
    'linhas=' + await p.locator('#scenarioList .scn-row').count());
  const restante = (await p.locator('#scenarioList .scn-name').first().textContent()).trim();
  check('o cenário certo foi removido', !restante.startsWith(nomeAlvo), 'restou: ' + restante.split('\n')[0]);

  const st = JSON.parse(fs.readFileSync(OUT + '/estado-mock.json', 'utf8'));
  check('removido do banco', st.scenarios.length === 1, JSON.stringify(st.scenarios.map(s => s.name)));

  check('modal continua aberto', await p.locator('#modalScenarios.open').count() === 1);
  check('orçamento em uso não foi afetado',
    (await p.locator('#railTotal').textContent()) === totalAntes,
    totalAntes + ' → ' + await p.locator('#railTotal').textContent());

  // excluir o último deixa a lista vazia com mensagem
  await p.locator('#scenarioList .scn-del').first().click();
  await p.waitForTimeout(1200);
  check('lista vazia mostra mensagem', /Nenhum cenário salvo/.test(await p.locator('#scenarioList').textContent()),
    (await p.locator('#scenarioList').textContent()).trim().slice(0, 40));
  check('banco sem cenários',
    JSON.parse(fs.readFileSync(OUT + '/estado-mock.json', 'utf8')).scenarios.length === 0);

  // carregar continua funcionando após o refactor
  respostaPrompt = 'Cenário de volta';
  await p.locator('#modalScenarios [data-close]').click();
  await p.waitForTimeout(300);
  await p.locator('#btnSaveScenario').click();
  await p.waitForTimeout(800);
  await p.locator('.event-card[data-id="aws-reinvent"] .card-body').click();  // muda o plano
  await p.waitForTimeout(300);
  const mudado = await p.locator('#railTotal').textContent();
  await p.locator('#btnScenarios').click();
  await p.waitForTimeout(800);
  await p.locator('#scenarioList .scn-load').first().click();
  await p.waitForTimeout(1400);
  check('carregar cenário ainda funciona',
    (await p.locator('#railTotal').textContent()) !== mudado &&
    (await p.locator('#railTotal').textContent()) === totalAntes,
    mudado + ' → ' + await p.locator('#railTotal').textContent());

  check('nenhum erro de JavaScript', errs.length === 0, errs.slice(0, 2).join(' | '));

  await b.close();
  const f = res.filter(x => !x).length;
  console.log(`\n${res.length - f}/${res.length} verificações passaram`);
  process.exit(f ? 1 : 0);
})();
