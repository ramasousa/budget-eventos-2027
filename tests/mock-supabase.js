/* ──────────────────────────────────────────────────────────────────────────
   Mock do Supabase: PostgREST + Auth.

   Existe porque supabase.co é inalcançável do ambiente onde este projeto foi
   construído. Valida o CONTRATO que o cliente usa — verbos, filtros,
   cabeçalhos Prefer, /auth/v1 — e reproduz as policies: anon lê, authenticated
   escreve, snapshots somente-leitura.

   Um mock mais permissivo que a realidade esconde bug: este já pegou um DELETE
   que ignorava o filtro id=eq. e teria apagado a tabela inteira.

   RLS_FECHADA=1 liga o modo com escrita restrita (o estado de produção).
   ────────────────────────────────────────────────────────────────────────── */
const http = require('http');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const { EVENTS_SEED } = require(path.join(RAIZ, 'assets/js/data.js'));

const db = {
  events: EVENTS_SEED.map(e => ({
    id: e.id, name: e.name, edition: e.edition, category: e.category,
    month_num: e.monthNum, date_label: e.dateLabel, city: e.city, country: e.country,
    region: e.region, lat: e.lat, lng: e.lng, ticket: e.ticket, currency: e.currency,
    passagem: e.passagem, hotel: e.hotel, nights: e.nights, per_diem: e.perDiem,
    days: e.days, transfer: e.transfer, priority: e.priority, confidence: e.confidence,
    url: e.url, benefit: e.benefit, audience: e.audience, outcome: e.outcome, active: true,
  })),
  plan: [],
  settings: [{ id: 1, budget_limit: 300000, fx: { USD: 6.20, EUR: 6.70, GBP: 7.90 }, updated_by: 'setup' }],
  scenarios: [],
  snapshots: [],
};
let proxSnap = 1;

/* Simula o trigger do banco: guarda o plano ANTES de qualquer exclusão. */
function tirarSnapshot(motivo) {
  if (!db.plan.length) return;
  const plano = {};
  db.plan.forEach(p => { plano[p.event_id] = { people: p.people, courtesy: p.courtesy || 0 }; });
  db.snapshots.unshift({
    id: proxSnap++, taken_at: new Date().toISOString(), motivo, plano,
    budget_limit: db.settings[0].budget_limit, fx: db.settings[0].fx,
    eventos: db.plan.length,
    participacoes: db.plan.reduce((a, p) => a + p.people, 0),
  });
  db.snapshots = db.snapshots.slice(0, 60);
}
const log = [];

/* ─── Auth simulada ────────────────────────────────────────────────────────
   Contas fixas, como as que um administrador cria no painel. Sem cadastro
   aberto — igual ao que vamos configurar em produção. */
const CONTAS = {
  'raul@bradesco.com.br': 'senha-correta',
  'superintendente@bradesco.com.br': 'senha-correta',
};
const sessoes = new Map();          // access_token -> { email, exp }
let seqToken = 1;

function novaSessao(email, segundos = 3600) {
  const access = 'tok-' + (seqToken++);
  const refresh = 'ref-' + seqToken;
  sessoes.set(access, { email, exp: Math.floor(Date.now() / 1000) + segundos, refresh });
  return {
    access_token: access, refresh_token: refresh, token_type: 'bearer',
    expires_in: segundos, expires_at: Math.floor(Date.now() / 1000) + segundos,
    user: { id: 'u-' + email, email },
  };
}

/* Quem é o portador do Authorization? A chave publishable vale como anon. */
function papel(req) {
  const h = req.headers.authorization || '';
  const tok = h.replace(/^Bearer\s+/i, '');
  if (!tok || tok === req.headers.apikey) return { role: 'anon' };
  const s = sessoes.get(tok);
  if (!s) return { role: 'invalido' };
  if (s.exp * 1000 < Date.now()) return { role: 'expirado' };
  return { role: 'authenticated', email: s.email };
}

/* Espelha as policies que vamos aplicar: anon lê, authenticated escreve. */
let RLS_FECHADA = process.env.RLS_FECHADA === '1';

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const table = u.pathname.replace('/rest/v1/', '');
    log.push(`${req.method} ${req.url} prefer=${req.headers.prefer || '-'} apikey=${req.headers.apikey ? 'sim' : 'NAO'}`);

    // ─── endpoints de autenticação ───
    if (u.pathname.startsWith('/auth/v1/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Content-Type', 'application/json');
      const acao = u.pathname.replace('/auth/v1/', '');
      const corpo = (() => { try { return JSON.parse(body); } catch (e) { return {}; } })();

      if (acao === 'token' && u.searchParams.get('grant_type') === 'password') {
        if (CONTAS[corpo.email] && CONTAS[corpo.email] === corpo.password) {
          return res.end(JSON.stringify(novaSessao(corpo.email)));
        }
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }));
      }
      if (acao === 'token' && u.searchParams.get('grant_type') === 'refresh_token') {
        const achou = [...sessoes.entries()].find(([, v]) => v.refresh === corpo.refresh_token);
        if (!achou) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'invalid_grant' })); }
        sessoes.delete(achou[0]);
        return res.end(JSON.stringify(novaSessao(achou[1].email)));
      }
      if (acao === 'logout') {
        const h = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        sessoes.delete(h);
        res.statusCode = 204; return res.end();
      }
      res.statusCode = 404; return res.end('{}');
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.end();
    if (!req.headers.apikey) { res.statusCode = 401; return res.end('{"message":"sem apikey"}'); }

    // Com a RLS fechada, escrever exige sessão válida.
    if (RLS_FECHADA && req.method !== 'GET' && req.method !== 'OPTIONS') {
      const p = papel(req);
      if (p.role !== 'authenticated') {
        res.statusCode = p.role === 'anon' ? 401 : 403;
        return res.end(JSON.stringify({ message: 'RLS: escrita exige authenticated', role: p.role }));
      }
    }

    const json = () => { try { return JSON.parse(body); } catch (e) { return null; } };
    const ok = (payload) => {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = payload === undefined ? 204 : 200;
      res.end(payload === undefined ? '' : JSON.stringify(payload));
    };

    if (req.method === 'GET') {
      if (table.startsWith('eventos2027_events')) return ok(db.events);
      if (table.startsWith('eventos2027_plan')) return ok(db.plan);
      if (table.startsWith('eventos2027_settings')) return ok(db.settings);
      if (table.startsWith('eventos2027_scenarios')) return ok(db.scenarios);
      if (table.startsWith('eventos2027_snapshots')) return ok(db.snapshots);
      res.statusCode = 404; return res.end('{}');
    }
    if (req.method === 'POST') {
      const rows = json();
      if (!Array.isArray(rows)) { res.statusCode = 400; return res.end('{"message":"esperava array"}'); }
      if (table.startsWith('eventos2027_plan')) {
        if (!u.searchParams.has('on_conflict')) { res.statusCode = 409; return res.end('{"message":"upsert sem on_conflict"}'); }
        rows.forEach(r => {
          const i = db.plan.findIndex(p => p.event_id === r.event_id);
          const row = { courtesy: 0, ...r, updated_at: r.updated_at || new Date().toISOString() };
          if (i >= 0) db.plan[i] = row; else db.plan.push(row);
        });
        return ok();
      }
      if (table.startsWith('eventos2027_settings')) {
        rows.forEach(r => { db.settings[0] = { ...db.settings[0], ...r }; });
        return ok();
      }
      if (table.startsWith('eventos2027_scenarios')) {
        rows.forEach(r => db.scenarios.unshift({ ...r, id: 'scn-' + (db.scenarios.length + 1), created_at: new Date().toISOString() }));
        return ok();
      }
      if (table.startsWith('eventos2027_snapshots')) { res.statusCode = 403; return res.end('{"message":"RLS: sem policy de insert"}'); }
      if (table.startsWith('eventos2027_events')) {
        for (const r of rows) {
          if (db.events.some(e => e.id === r.id)) { res.statusCode = 409; return res.end('{"message":"id duplicado"}'); }
          db.events.push({ active: true, custom: false, ...r });
        }
        return ok();
      }
    }
    if (req.method === 'DELETE') {
      if (table.startsWith('eventos2027_plan')) {
        tirarSnapshot('antes_de_apagar');       // trigger BEFORE DELETE
        const q = u.searchParams.get('event_id') || '';
        if (q.startsWith('eq.')) db.plan = db.plan.filter(p => p.event_id !== decodeURIComponent(q.slice(3)));
        else if (q.startsWith('neq.')) db.plan = [];
        return ok();
      }
      if (table.startsWith('eventos2027_snapshots')) { res.statusCode = 403; return res.end('{"message":"RLS: sem policy de delete"}'); }
      if (table.startsWith('eventos2027_scenarios')) {
        // Respeita o filtro como o PostgREST real: eq. remove uma linha,
        // neq. remove o resto. Um mock permissivo demais esconde bug.
        const q = u.searchParams.get('id') || '';
        if (q.startsWith('eq.')) {
          const id = decodeURIComponent(q.slice(3));
          db.scenarios = db.scenarios.filter(s => s.id !== id);
        } else if (q.startsWith('neq.')) {
          db.scenarios = [];
        }
        return ok();
      }
      if (table.startsWith('eventos2027_events')) {
        const q = u.searchParams.get('id') || '';
        if (q.startsWith('eq.')) {
          const id = decodeURIComponent(q.slice(3));
          db.events = db.events.filter(e => e.id !== id);
          db.plan = db.plan.filter(p => p.event_id !== id);   // ON DELETE CASCADE
        }
        return ok();
      }
    }
    res.statusCode = 405; res.end('{}');
  });
});

const PORTA = Number(process.env.PORTA_API || 8788);
require('fs').mkdirSync(path.join(__dirname, '.saida'), { recursive: true });
server.listen(PORTA, () => console.log('mock supabase :' + PORTA));
process.on('SIGTERM', () => { console.log('LOG:\n' + log.join('\n')); process.exit(0); });
/* Alterna a RLS em tempo de execução, para o teste cobrir os dois estados. */
server.on('request', () => {});
process.on('SIGUSR2', () => { RLS_FECHADA = !RLS_FECHADA; console.log('RLS_FECHADA =', RLS_FECHADA); });

setInterval(() => {
  require('fs').writeFileSync(path.join(__dirname, '.saida', 'estado-mock.json'),
    JSON.stringify({ plan: db.plan, settings: db.settings, scenarios: db.scenarios, snapshots: db.snapshots.map(x=>({id:x.id,motivo:x.motivo,eventos:x.eventos,participacoes:x.participacoes})), eventos: db.events.length, custom: db.events.filter(e=>e.custom).map(e=>({id:e.id,name:e.name,city:e.city,lat:e.lat})), log }, null, 2));
}, 400);
