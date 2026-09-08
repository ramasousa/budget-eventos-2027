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

  /* ─── higiene de indexação ─── */
  const robots = await fetch(`${A.WEB}/robots.txt`);
  const txtRobots = await robots.text();
  check('robots.txt servido', robots.status === 200);
  check('robots.txt bloqueia tudo', /User-agent:\s*\*/.test(txtRobots) && /Disallow:\s*\//.test(txtRobots));

  const b = await chromium.launch(A.opcoesDoNavegador());
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript',
    body: "const SUPABASE={url:`${A.API}`,key:'k',prefix:'eventos2027_'};" }));
  p.on('dialog', d => d.accept());

  await A.autenticar(p, SESSAO);

  await p.goto(`${A.WEB}/app.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);

  const meta = await p.getAttribute('meta[name="robots"]', 'content');
  check('meta noindex presente', /noindex/.test(meta || '') && /nofollow/.test(meta || ''), meta);
  check('meta referrer no-referrer',
    (await p.getAttribute('meta[name="referrer"]', 'content')) === 'no-referrer');

  /* ─── monta um plano ─── */
  for (const id of ['websummit', 'aws-reinvent', 'sff']) {
    await p.locator(`.event-card[data-id="${id}"] .card-body`).click();
    await p.waitForTimeout(150);
  }
  await p.locator('.event-card[data-id="websummit"] [data-step="1"]').click();
  await p.waitForTimeout(200);
  await p.locator('.event-card[data-id="websummit"] [data-courtesy-toggle]').click();
  await p.waitForTimeout(900);
  const totalOriginal = await p.locator('#railTotal').textContent();
  const eventosOriginal = await p.locator('#railEvents').textContent();
  check('plano montado', eventosOriginal === '3', totalOriginal + ' / ' + eventosOriginal + ' eventos');

  /* ─── O ATAQUE: apagar tudo, exatamente como qualquer um pode ─── */
  await fetch(`${A.API}/rest/v1/eventos2027_plan?event_id=neq.__nada__`, { method: 'DELETE', headers: H });
  const leia = async tabela =>
    (await fetch(`${A.API}/rest/v1/${tabela}?select=*`, { headers: H })).json();

  const planoDepois = await leia('eventos2027_plan');
  const snapsDepois = await leia('eventos2027_snapshots');
  check('ataque destruiu o plano', planoDepois.length === 0, 'linhas=' + planoDepois.length);
  check('trigger capturou antes de apagar',
    snapsDepois.some(s => s.motivo === 'antes_de_apagar' && s.eventos === 3),
    JSON.stringify(snapsDepois.map(s => ({ motivo: s.motivo, eventos: s.eventos }))));

  /* ─── o atacante consegue destruir a trilha? ─── */
  const rDel = await fetch(`${A.API}/rest/v1/eventos2027_snapshots?id=neq.0`, { method: 'DELETE', headers: H });
  check('atacante NÃO apaga o histórico', rDel.status === 403, 'HTTP ' + rDel.status);
  const rIns = await fetch(`${A.API}/rest/v1/eventos2027_snapshots`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ motivo: 'forjado', plano: {} }]),
  });
  check('atacante NÃO forja snapshot', rIns.status === 403, 'HTTP ' + rIns.status);

  /* ─── recuperação pela interface ─── */
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1400);
  check('página reflete o plano destruído', (await p.locator('#railEvents').textContent()) === '0');

  await p.locator('#btnScenarios').click();
  await p.waitForTimeout(900);
  const pontos = await p.locator('#snapshotList .scn-row').count();
  check('histórico listado na interface', pontos >= 1, 'pontos=' + pontos);
  check('ponto pré-exclusão identificado',
    await p.locator('#snapshotList .badge-amber').count() >= 1);
  await p.screenshot({ path: OUT + '/v5-historico.png' });

  await p.locator('#snapshotList [data-snap]').first().click();
  await p.waitForTimeout(1600);
  check('restauração devolve os eventos',
    (await p.locator('#railEvents').textContent()) === eventosOriginal,
    eventosOriginal + ' → ' + await p.locator('#railEvents').textContent());
  check('restauração devolve o total exato',
    (await p.locator('#railTotal').textContent()) === totalOriginal,
    totalOriginal + ' → ' + await p.locator('#railTotal').textContent());
  check('cortesia preservada na restauração',
    (await p.locator('#railEconomia').textContent()).trim() !== 'R$ 0',
    await p.locator('#railEconomia').textContent());

  /* ─── restaurar também é reversível ─── */
  // Restaurar sobre plano VAZIO não gera ponto — não há o que proteger.
  // A reversibilidade que importa é restaurar sobre um plano existente.
  const antesDaSegunda = (await leia('eventos2027_snapshots')).length;
  await p.locator('#btnScenarios').click();
  await p.waitForTimeout(900);
  await p.locator('#snapshotList [data-snap]').first().click();
  await p.waitForTimeout(1600);
  const depoisDaSegunda = (await leia('eventos2027_snapshots')).length;
  check('restaurar sobre plano existente gera ponto de retorno',
    depoisDaSegunda > antesDaSegunda, antesDaSegunda + ' → ' + depoisDaSegunda);
  check('plano continua íntegro após a segunda restauração',
    (await p.locator('#railTotal').textContent()) === totalOriginal,
    await p.locator('#railTotal').textContent());

  check('nenhum erro de JavaScript', errs.length === 0, errs.slice(0, 2).join(' | '));

  await b.close();
  const f = res.filter(x => !x).length;
  console.log(`\n${res.length - f}/${res.length} verificações passaram`);
  process.exit(f ? 1 : 0);
})();
