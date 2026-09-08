#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   Bateria completa.

     node tests/rodar.js            todas as suítes
     node tests/rodar.js 07         só a que começa com "07"
     node tests/rodar.js login      só a que casa com "login"

   Sobe o mock do Supabase e o servidor estático, roda as suítes em SÉRIE —
   elas compartilham o mesmo banco simulado e se atrapalham em paralelo — e
   derruba tudo no fim.
   ────────────────────────────────────────────────────────────────────────── */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const AQUI = __dirname;
const PORTA_WEB = process.env.PORTA_WEB || '8080';
const PORTA_API = process.env.PORTA_API || '8788';
const filtro = process.argv[2];

const suites = fs.readdirSync(AQUI)
  .filter(f => /^\d\d-.*\.js$/.test(f))
  .filter(f => !filtro || f.includes(filtro))
  .sort();

if (!suites.length) {
  console.error(filtro ? `Nenhuma suíte casa com "${filtro}".` : 'Nenhuma suíte encontrada.');
  process.exit(1);
}

const processos = [];
function subir(script, env, rotulo) {
  const p = spawn(process.execPath, [path.join(AQUI, script)],
    { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stderr.on('data', d => process.stderr.write(`[${rotulo}] ${d}`));
  processos.push(p);
  return p;
}
const derrubar = () => processos.forEach(p => { try { p.kill(); } catch (e) {} });
process.on('exit', derrubar);
process.on('SIGINT', () => { derrubar(); process.exit(130); });

const esperar = ms => new Promise(r => setTimeout(r, ms));

async function noAr(url, tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: { apikey: 'chave-de-teste' } });
      if (r.status < 500) return true;
    } catch (e) { /* ainda subindo */ }
    await esperar(250);
  }
  return false;
}

function rodar(suite) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [path.join(AQUI, suite)], {
      env: { ...process.env,
             URL_WEB: `http://127.0.0.1:${PORTA_WEB}`,
             URL_API: `http://127.0.0.1:${PORTA_API}` },
      stdio: 'inherit',
    });
    p.on('close', code => resolve(code));
  });
}

(async () => {
  // RLS fechada: é o estado de produção depois da migração de login.
  subir('mock-supabase.js', { PORTA_API, RLS_FECHADA: '1' }, 'mock');
  subir('servidor-estatico.js', { PORTA_WEB }, 'web');

  const ok = await Promise.all([
    noAr(`http://127.0.0.1:${PORTA_API}/rest/v1/eventos2027_events?select=id`),
    noAr(`http://127.0.0.1:${PORTA_WEB}/app.html`),
  ]);
  if (!ok.every(Boolean)) {
    console.error('Os servidores de teste não subiram.');
    process.exit(1);
  }

  const resultados = [];
  for (const s of suites) {
    console.log(`\n\x1b[1m── ${s} ──\x1b[0m`);
    const code = await rodar(s);
    resultados.push({ suite: s, ok: code === 0 });
  }

  const falharam = resultados.filter(r => !r.ok);
  console.log('\n' + '═'.repeat(52));
  resultados.forEach(r => console.log(`  ${r.ok ? '✓' : '✗'}  ${r.suite}`));
  console.log('═'.repeat(52));
  console.log(falharam.length
    ? `\n${falharam.length} suíte(s) com falha: ${falharam.map(r => r.suite).join(', ')}`
    : `\n${resultados.length} suítes passaram.`);

  derrubar();
  process.exit(falharam.length ? 1 : 0);
})();
