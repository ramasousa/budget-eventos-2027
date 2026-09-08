/* ──────────────────────────────────────────────────────────────────────────
   Camada de dados.

   Estratégia: escrita otimista + sincronização por polling.
     · O estado vive em memória e é espelhado no localStorage.
     · Toda alteração aplica na hora na tela e é enviada ao Supabase em
       seguida (debounce). Se o envio falhar, a tela continua funcionando e
       o indicador de status avisa que está em modo local.
     · A cada 12s buscamos o estado remoto. Alterações feitas por outra
       pessoa aparecem sozinhas — é isso que dá ao superintendente e aos
       pares a mesma visão sem ninguém precisar recarregar.
     · Um write local recente (< 4s) tem precedência sobre o que vem do
       servidor, para o número não "pular" enquanto alguém digita.
   ────────────────────────────────────────────────────────────────────────── */

const Store = (() => {
  const LS_MIRROR = 'ev2027_mirror';
  const LS_AUTHOR = 'ev2027_author';
  const POLL_MS = 12000;
  const WRITE_DEBOUNCE_MS = 550;
  const LOCAL_GRACE_MS = 4000;

  const state = {
    events: [],
    plan: {},                  // { [eventId]: { people, courtesy } }
    budgetLimit: 300000,
    fx: { USD: 6.20, EUR: 6.70, GBP: 7.90 },
    online: false,
    lastSync: null,
    lastEditor: null,
    ready: false,
  };

  let listeners = [];
  let statusListeners = [];
  let lastLocalWrite = 0;
  let pendingTimer = null;
  let pendingOps = new Map();                    // dedupe por chave

  /* ─── portão de escrita ────────────────────────────────────────────────
     Um único ponto: se alguém adicionar um mutador novo e esquecer de
     protegê-lo, o portão continua sendo o lugar certo para descobrir.
     A interface também desabilita os controles, mas isso é afordância —
     a garantia real é a RLS no banco. Aqui é só para não deixar a pessoa
     montar um plano inteiro e descobrir no fim que não podia salvar.
     ─────────────────────────────────────────────────────────────────────── */
  let aoNegar = null;
  let aoPerderSessao = null;
  function podeEscrever() {
    if (typeof Auth === 'undefined' || Auth.autenticado()) return true;
    if (aoNegar) aoNegar();
    return false;
  }

  /* ─── util ─────────────────────────────────────────────────────────────── */
  // Um listener que falhe não pode derrubar quem disparou a mudança: o
  // estado já mudou e o resto da operação (fechar um modal, avisar o
  // usuário) precisa acontecer de qualquer jeito.
  const notify = (fns) => fns.forEach(fn => {
    try { fn(state); } catch (e) { console.error('[store] listener falhou:', e); }
  });
  const emit = () => notify(listeners);
  const emitStatus = () => notify(statusListeners);
  const configured = () =>
    typeof SUPABASE !== 'undefined' && SUPABASE.url && SUPABASE.key &&
    !SUPABASE.url.includes('SUA_URL');

  function author() {
    // Autenticado: a autoria é o e-mail da sessão — e o banco recusa gravar
    // em nome de outra pessoa. O nome digitado só sobrevive como legado.
    if (typeof Auth !== 'undefined' && Auth.autenticado()) return Auth.email() || 'autenticado';
    let a = '';
    try { a = localStorage.getItem(LS_AUTHOR) || ''; } catch (e) { /* modo privado */ }
    return a || 'anônimo';
  }
  function setAuthor(name) {
    try { localStorage.setItem(LS_AUTHOR, name); } catch (e) { /* ignora */ }
  }

  function mirrorSave() {
    try {
      localStorage.setItem(LS_MIRROR, JSON.stringify({
        plan: state.plan, budgetLimit: state.budgetLimit, fx: state.fx,
        events: state.events, at: Date.now(),
      }));
    } catch (e) { /* cota estourada ou modo privado — segue sem espelho */ }
  }
  function mirrorLoad() {
    try { return JSON.parse(localStorage.getItem(LS_MIRROR) || 'null'); }
    catch (e) { return null; }
  }

  /* ─── REST ─────────────────────────────────────────────────────────────── */
  async function rest(method, path, body, extraPrefer) {
    if (!configured()) throw new Error('supabase-nao-configurado');
    // Ler é público (chave publishable). Escrever usa o token da sessão —
    // é o token que a RLS enxerga como authenticated.
    let bearer = SUPABASE.key;
    if (method !== 'GET' && typeof Auth !== 'undefined') {
      const t = await Auth.token();
      if (t) bearer = t;
    }
    const headers = {
      apikey: SUPABASE.key,
      Authorization: 'Bearer ' + bearer,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const prefer = [method === 'GET' ? '' : 'return=minimal', extraPrefer]
      .filter(Boolean).join(',');
    if (prefer) headers.Prefer = prefer;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(SUPABASE.url + '/rest/v1/' + path, {
        method, headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const e = new Error(method + ' ' + path + ' → ' + res.status);
        e.status = res.status;
        throw e;
      }
      if (method === 'GET') return res.json();
      return null;
    } finally { clearTimeout(timeout); }
  }

  /* ─── normalização ─────────────────────────────────────────────────────── */
  function fromRow(r) {
    return {
      id: r.id, name: r.name, edition: r.edition, category: r.category,
      monthNum: r.month_num, dateLabel: r.date_label,
      city: r.city, country: r.country, region: r.region,
      lat: r.lat, lng: r.lng,
      ticket: Number(r.ticket), currency: r.currency,
      passagem: Number(r.passagem), hotel: Number(r.hotel), nights: r.nights,
      perDiem: Number(r.per_diem), days: r.days, transfer: Number(r.transfer),
      priority: r.priority, confidence: r.confidence, url: r.url,
      benefit: r.benefit, audience: r.audience, outcome: r.outcome,
      custom: !!r.custom, createdBy: r.created_by,
    };
  }

  /* ─── escrita com debounce ─────────────────────────────────────────────── */
  function queue(key, fn) {
    lastLocalWrite = Date.now();
    pendingOps.set(key, fn);
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(flush, WRITE_DEBOUNCE_MS);
  }

  async function flush() {
    if (!configured() || pendingOps.size === 0) return;
    const ops = [...pendingOps.values()];
    pendingOps.clear();
    try {
      for (const op of ops) await op();
      state.online = true;
      state.lastSync = new Date();
    } catch (e) {
      // 401/403 numa escrita não é falta de rede: é sessão expirada ou
      // revogada. Dizer "sem conexão" mandaria a pessoa procurar o problema
      // no lugar errado.
      if ((e.status === 401 || e.status === 403) && typeof Auth !== 'undefined') {
        console.warn('[store] escrita recusada — sessão inválida');
        await Auth.sair();
        if (aoPerderSessao) aoPerderSessao();
      } else {
        state.online = false;
        console.warn('[store] falha ao gravar:', e.message);
      }
    }
    emitStatus();
  }

  /* ─── leitura remota ───────────────────────────────────────────────────── */
  async function pullEvents() {
    const rows = await rest('GET',
      'eventos2027_events?select=*&active=is.true&order=month_num.asc,name.asc');
    if (Array.isArray(rows) && rows.length) state.events = rows.map(fromRow);
  }

  async function pullPlanAndSettings() {
    const [planRows, cfgRows] = await Promise.all([
      rest('GET', 'eventos2027_plan?select=event_id,people,courtesy,updated_by,updated_at'),
      rest('GET', 'eventos2027_settings?select=*&id=eq.1'),
    ]);

    const fresh = Date.now() - lastLocalWrite < LOCAL_GRACE_MS;
    if (fresh) return false;                     // não sobrescreve edição em curso

    const plan = {};
    let editor = null, editorAt = 0;
    (planRows || []).forEach(r => {
      plan[r.event_id] = { people: r.people, courtesy: r.courtesy || 0 };
      const t = new Date(r.updated_at).getTime();
      if (t > editorAt) { editorAt = t; editor = r.updated_by; }
    });

    const cfg = (cfgRows || [])[0];
    const nextLimit = cfg ? Number(cfg.budget_limit) : state.budgetLimit;
    const nextFx = cfg && cfg.fx ? cfg.fx : state.fx;

    const changed =
      JSON.stringify(plan) !== JSON.stringify(state.plan) ||
      nextLimit !== state.budgetLimit ||
      JSON.stringify(nextFx) !== JSON.stringify(state.fx);

    state.plan = plan;
    state.budgetLimit = nextLimit;
    state.fx = nextFx;
    state.lastEditor = editor;
    return changed;
  }

  /* ─── API pública ──────────────────────────────────────────────────────── */
  async function init() {
    // 1. Ponto de partida imediato: espelho local, senão catálogo embarcado.
    const mirror = mirrorLoad();
    state.events = (mirror && mirror.events && mirror.events.length)
      ? mirror.events
      : (typeof EVENTS_SEED !== 'undefined' ? EVENTS_SEED.slice() : []);
    if (mirror) {
      state.plan = mirror.plan || {};
      state.budgetLimit = mirror.budgetLimit ?? 300000;
      state.fx = mirror.fx || state.fx;
    }
    state.ready = true;
    emit();

    // 2. Substitui pelo estado compartilhado assim que o banco responder.
    try {
      await pullEvents();
      await pullPlanAndSettings();
      state.online = true;
      state.lastSync = new Date();
      mirrorSave();
    } catch (e) {
      state.online = false;
      console.warn('[store] sem conexão com o Supabase — modo local:', e.message);
    }
    emit(); emitStatus();

    setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') poll();
    });
  }

  async function poll() {
    if (!configured() || document.visibilityState === 'hidden') return;
    try {
      const changed = await pullPlanAndSettings();
      state.online = true;
      state.lastSync = new Date();
      if (changed) { mirrorSave(); emit(); }
      emitStatus();
    } catch (e) {
      if (state.online) { state.online = false; emitStatus(); }
    }
  }

  function upsertPlan(id) {
    const row = state.plan[id];
    queue('plan:' + id, () =>
      rest('POST', 'eventos2027_plan?on_conflict=event_id',
        [{ event_id: id, people: row.people, courtesy: row.courtesy,
           updated_by: author(), updated_at: new Date().toISOString() }],
        'resolution=merge-duplicates'));
    lastLocalWrite = Date.now();
    mirrorSave(); emit();
  }

  function toggle(id) {
    if (!podeEscrever()) return;
    if (state.plan[id]) {
      delete state.plan[id];
      queue('plan:' + id, () =>
        rest('DELETE', `eventos2027_plan?event_id=eq.${encodeURIComponent(id)}`));
      lastLocalWrite = Date.now();
      mirrorSave(); emit();
    } else {
      state.plan[id] = { people: 1, courtesy: 0 };
      upsertPlan(id);
    }
  }

  function setPeople(id, n) {
    if (!podeEscrever()) return;
    const people = Math.max(1, Math.min(50, n | 0));
    if (!state.plan[id]) state.plan[id] = { people, courtesy: 0 };
    else {
      state.plan[id].people = people;
      // O banco exige courtesy <= people; menos gente não pode deixar
      // cortesias órfãs para trás.
      if (state.plan[id].courtesy > people) state.plan[id].courtesy = people;
    }
    upsertPlan(id);
  }

  /* Ingressos já garantidos com fornecedores: não entram na inscrição. */
  function setCourtesy(id, n) {
    if (!podeEscrever()) return;
    const row = state.plan[id];
    if (!row) return;
    row.courtesy = Math.max(0, Math.min(row.people, n | 0));
    upsertPlan(id);
  }

  function clearPlan() {
    if (!podeEscrever()) return;
    state.plan = {};
    queue('plan:*', () => rest('DELETE', 'eventos2027_plan?event_id=neq.__nada__'));
    lastLocalWrite = Date.now();
    mirrorSave(); emit();
  }

  function setBudget(limit) {
    if (!podeEscrever()) return;
    state.budgetLimit = Number(limit) || 0;
    queueSettings();
    lastLocalWrite = Date.now();
    mirrorSave(); emit();
  }

  function setFx(fx) {
    if (!podeEscrever()) return;
    state.fx = { ...state.fx, ...fx };
    queueSettings();
    lastLocalWrite = Date.now();
    mirrorSave(); emit();
  }

  function queueSettings() {
    queue('settings', () =>
      rest('POST', 'eventos2027_settings?on_conflict=id',
        [{ id: 1, budget_limit: state.budgetLimit, fx: state.fx,
           updated_by: author(), updated_at: new Date().toISOString() }],
        'resolution=merge-duplicates'));
  }

  /* ─── eventos incluídos pela equipe ────────────────────────────────────── */
  function novoId(nome) {
    const base = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'evento';
    let id = base, n = 2;
    while (state.events.some(e => e.id === id)) id = base + '-' + (n++);
    return id;
  }

  async function criarEvento(dados) {
    if (!podeEscrever()) throw new Error('sem-permissao');
    if (!configured()) throw new Error('offline');
    const id = novoId(dados.name);
    const linha = {
      id, name: dados.name, edition: dados.edition || '2027',
      category: dados.category, month_num: dados.monthNum, date_label: dados.dateLabel,
      city: dados.city, country: dados.country, region: dados.region,
      lat: dados.lat, lng: dados.lng,
      ticket: dados.ticket, currency: dados.currency, passagem: dados.passagem,
      hotel: dados.hotel, nights: dados.nights, per_diem: dados.perDiem,
      days: dados.days, transfer: dados.transfer,
      priority: dados.priority, confidence: dados.confidence, url: dados.url || null,
      benefit: dados.benefit, audience: dados.audience, outcome: dados.outcome,
      active: true, custom: true, created_by: author(),
    };
    await rest('POST', 'eventos2027_events', [linha]);
    await pullEvents();
    mirrorSave(); emit();
    return id;
  }

  async function removerEvento(id) {
    if (!podeEscrever()) throw new Error('sem-permissao');
    const ev = state.events.find(e => e.id === id);
    // O catálogo curado não pode ser apagado pela interface.
    if (!ev || !ev.custom) throw new Error('nao-e-personalizado');
    if (!configured()) throw new Error('offline');
    delete state.plan[id];
    await rest('DELETE', `eventos2027_events?id=eq.${encodeURIComponent(id)}`);
    await pullEvents();
    mirrorSave(); emit();
  }

  /* ─── histórico automático ─────────────────────────────────────────────
     Escrito por trigger no banco, não pelo cliente — um atacante não usa o
     nosso código. Aqui só lemos e restauramos.
     ─────────────────────────────────────────────────────────────────────── */
  async function listSnapshots() {
    if (!configured()) return [];
    return rest('GET', 'eventos2027_snapshots?select=*&order=taken_at.desc&limit=20');
  }

  async function restoreSnapshot(snap) {
    if (!podeEscrever()) throw new Error('sem-permissao');
    const plano = snap.plano || {};
    if (!configured()) throw new Error('offline');

    // O DELETE abaixo dispara o trigger, que guarda o estado atual antes de
    // sumir: restaurar por engano também é reversível.
    await rest('DELETE', 'eventos2027_plan?event_id=neq.__nada__');
    const rows = Object.entries(plano).map(([event_id, v]) => ({
      event_id, people: v.people, courtesy: v.courtesy || 0,
      updated_by: author(), updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      await rest('POST', 'eventos2027_plan?on_conflict=event_id', rows, 'resolution=merge-duplicates');
    }
    if (snap.budget_limit != null) state.budgetLimit = Number(snap.budget_limit);
    if (snap.fx) state.fx = snap.fx;
    state.plan = {};
    Object.entries(plano).forEach(([id, v]) => {
      state.plan[id] = { people: v.people, courtesy: v.courtesy || 0 };
    });
    queueSettings();
    lastLocalWrite = Date.now();
    mirrorSave(); emit();
  }

  /* ─── cenários (snapshots nomeados) ────────────────────────────────────── */
  async function saveScenario(name, total) {
    if (!podeEscrever()) throw new Error('sem-permissao');
    const payload = {
      name, author: author(), selections: state.plan,
      budget_limit: state.budgetLimit, fx: state.fx, total,
    };
    if (!configured()) throw new Error('offline');
    await rest('POST', 'eventos2027_scenarios', [payload]);
  }

  async function listScenarios() {
    if (!configured()) return [];
    return rest('GET', 'eventos2027_scenarios?select=*&order=created_at.desc&limit=25');
  }

  async function applyScenario(s) {
    if (!podeEscrever()) throw new Error('sem-permissao');
    state.plan = s.selections || {};
    state.budgetLimit = Number(s.budget_limit) || state.budgetLimit;
    if (s.fx) state.fx = s.fx;
    lastLocalWrite = Date.now();
    mirrorSave(); emit();

    if (!configured()) return;
    // Reescreve o plano compartilhado inteiro: apaga e regrava.
    await rest('DELETE', 'eventos2027_plan?event_id=neq.__nada__');
    const rows = Object.entries(state.plan).map(([event_id, v]) => ({
      event_id, people: v.people, courtesy: v.courtesy || 0,
      updated_by: author(), updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      await rest('POST', 'eventos2027_plan?on_conflict=event_id', rows, 'resolution=merge-duplicates');
    }
    queueSettings();
  }

  async function deleteScenario(id) {
    if (!podeEscrever()) throw new Error('sem-permissao');
    if (!configured()) return;
    await rest('DELETE', `eventos2027_scenarios?id=eq.${encodeURIComponent(id)}`);
  }

  return {
    state,
    init, poll, flush,
    toggle, setPeople, setCourtesy, clearPlan, setBudget, setFx,
    criarEvento, removerEvento,
    listSnapshots, restoreSnapshot,
    saveScenario, listScenarios, applyScenario, deleteScenario,
    author, setAuthor, configured, podeEscrever,
    aoNegarEscrita: fn => { aoNegar = fn; },
    aoPerderSessao: fn => { aoPerderSessao = fn; },
    onChange: fn => listeners.push(fn),
    onStatus: fn => statusListeners.push(fn),
  };
})();
