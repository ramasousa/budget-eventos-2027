/* ──────────────────────────────────────────────────────────────────────────
   Ambiente compartilhado das suítes.

   Resolve Playwright e o Chromium sem caminho absoluto, para a bateria rodar
   em qualquer máquina — não só na que a escreveu.
   ────────────────────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const SAIDA = path.join(__dirname, '.saida');
fs.mkdirSync(SAIDA, { recursive: true });

const WEB = process.env.URL_WEB || 'http://127.0.0.1:8080';
const API = process.env.URL_API || 'http://127.0.0.1:8788';

/* Playwright: local, global, ou o do npx. */
function carregarPlaywright() {
  const tentativas = ['playwright', 'playwright-core'];
  for (const nome of tentativas) {
    try { return require(nome); } catch (e) { /* segue */ }
  }
  try {
    const globais = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(globais, 'playwright'));
  } catch (e) {
    throw new Error(
      'Playwright não encontrado. Instale com:  npm i -D playwright\n' +
      'ou defina PLAYWRIGHT_DIR apontando para a instalação.');
  }
}

/* O Chromium do Playwright, se ele souber onde está; senão o do sistema. */
function opcoesDoNavegador() {
  const opts = { args: ['--no-sandbox'] };
  if (process.env.CHROMIUM_PATH) { opts.executablePath = process.env.CHROMIUM_PATH; return opts; }
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && fs.existsSync(base)) {
    const dir = fs.readdirSync(base).find(d => /^chromium-\d+$/.test(d));
    if (dir) {
      const bin = path.join(base, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(bin)) opts.executablePath = bin;
    }
  }
  return opts;   // sem executablePath, o Playwright resolve sozinho
}

/* Config do Supabase apontada para o mock, injetada no lugar da real. */
const CONFIG_MOCK =
  `const SUPABASE={url:'${API}',key:'chave-de-teste',prefix:'eventos2027_'};`;

const CONTA = { email: 'raul@bradesco.com.br', senha: 'senha-correta' };
const CONTA2 = { email: 'superintendente@bradesco.com.br', senha: 'senha-correta' };

/* Sessão real obtida do mock — usada tanto pelo setup quanto pelas páginas. */
async function sessaoDe(email = CONTA.email, senha = CONTA.senha) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: 'chave-de-teste', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  if (!r.ok) throw new Error('não consegui autenticar no mock: HTTP ' + r.status);
  const d = await r.json();
  return { access_token: d.access_token, refresh_token: d.refresh_token,
           expires_at: d.expires_at, email: d.user.email, id: d.user.id };
}

/* Injeta a sessão antes da página carregar. Funciona inclusive quando a rede
   da página está bloqueada pelo teste. */
async function autenticar(pagina, sessao) {
  await pagina.addInitScript(s => {
    try { localStorage.setItem('ev2027_sessao', JSON.stringify(s)); } catch (e) {}
  }, sessao);
}

/* Cabeçalhos para o setup escrever direto na API. */
function cabecalhos(sessao) {
  return {
    apikey: 'chave-de-teste',
    'Content-Type': 'application/json',
    ...(sessao ? { Authorization: 'Bearer ' + sessao.access_token } : {}),
  };
}

/* Zera o plano e CONFERE. Um setup que falha calado deixa o estado da suíte
   anterior de pé — foi assim que uma suíte passou a falhar sem motivo. */
async function limparPlano(sessao) {
  const r = await fetch(`${API}/rest/v1/eventos2027_plan?event_id=neq.__nada__`,
    { method: 'DELETE', headers: cabecalhos(sessao) });
  if (!r.ok) throw new Error('setup: limpeza do plano falhou (HTTP ' + r.status + ')');
  const sobrou = await (await fetch(`${API}/rest/v1/eventos2027_plan?select=event_id`,
    { headers: cabecalhos() })).json();
  if (sobrou.length) throw new Error('setup: plano não ficou vazio → ' + JSON.stringify(sobrou));
}

/* Remove eventos criados por outra suíte, que mudariam a contagem do catálogo. */
async function limparEventosPersonalizados(sessao) {
  const todos = await (await fetch(`${API}/rest/v1/eventos2027_events?select=*`,
    { headers: cabecalhos() })).json();
  for (const e of todos.filter(x => x.custom)) {
    const r = await fetch(`${API}/rest/v1/eventos2027_events?id=eq.${encodeURIComponent(e.id)}`,
      { method: 'DELETE', headers: cabecalhos(sessao) });
    if (!r.ok) throw new Error('setup: não removi o evento ' + e.id + ' (HTTP ' + r.status + ')');
  }
}

/* Premissas padrão: vários testes dependem do câmbio vigente. */
async function premissasPadrao(sessao) {
  const r = await fetch(`${API}/rest/v1/eventos2027_settings?on_conflict=id`, {
    method: 'POST',
    headers: { ...cabecalhos(sessao), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id: 1, budget_limit: 300000, fx: { USD: 6.20, EUR: 6.70, GBP: 7.90 } }]),
  });
  if (!r.ok) throw new Error('setup: premissas não aplicadas (HTTP ' + r.status + ')');
}

/* Placar de uma suíte. */
function placar(nome) {
  const itens = [];
  return {
    check(titulo, condicao, extra = '') {
      itens.push(!!condicao);
      console.log((condicao ? '  PASS  ' : '  FALHA ') + titulo + (extra ? '  → ' + extra : ''));
    },
    fechar() {
      const falhas = itens.filter(x => !x).length;
      console.log(`\n${itens.length - falhas}/${itens.length} verificações passaram`);
      process.exit(falhas ? 1 : 0);
    },
  };
}

module.exports = {
  RAIZ, SAIDA, WEB, API, CONFIG_MOCK, CONTA, CONTA2,
  carregarPlaywright, opcoesDoNavegador, sessaoDe, autenticar, cabecalhos,
  limparPlano, limparEventosPersonalizados, premissasPadrao, placar,
};
