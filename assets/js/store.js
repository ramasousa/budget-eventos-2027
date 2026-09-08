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
    plan: {},                                    // { [eventId]: { people } }
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
    const headers = {
      apikey: SUPABASE.key,
      Authorization: 'Bearer ' + SUPABASE.key,
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
      if (!res.ok) throw new Error(method + ' ' + path + ' → ' + res.status);
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
      state.online = false;
      console.warn('[store] falha ao gravar:', e.message);
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
      rest('GET', 'eventos2027_plan?select=event_id,people,updated_by,updated_at'),
      rest('GET', 'eventos2027_settings?select=*&id=eq.1'),
    ]);

    const fresh = Date.now() - lastLocalWrite < LOCAL_GRACE_MS;
    if (fresh) return false;                     // não sobrescreve edição em curso

    const plan = {};
    let editor = null, editorAt = 0;
    (planRows || []).forEach(r => {
      plan[r.event_id] = { people: r.people };
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

  function toggle(id) {
    if (state.plan[id]) {
      delete state.plan[id];
      queue('plan:' + id, () =>
        rest('DELETE', `eventos2027_plan?event_id=eq.${encodeURIComponent(id)}`));
    } else {
      state.plan[id] = { people: 1 };
      queue('plan:' + id, () =>
        rest('POST', 'eventos2027_plan?on_conflict=event_id',
          [{ event_id: id, people: 1, updated_by: author(), updated_at: new Date().toISOString() }],
          'resolution=merge-duplicates'));
    }
    lastLocalWrite = Date.now();
    mirrorSave(); emit();
  }

  function setPeople(id, n) {
    const people = Math.max(1, Math.min(50, n | 0));
    if (!state.plan[id]) state.plan[id] = { people };
    else state.plan[id].people = people;
    queue('plan:' + id, () =>
      rest('POST', 'eventos2027_plan?on_conflict=event_id',
        [{ event_id: id, people, updated_by: author(), updated_at: new Date().toISOString() }],
        'resolution=merge-duplicates'));
    lastLocalWrite = Date.now();
    mirrorSave(); emit();
  }

  function clearPlan() {
    state.plan = {};
    queue('plan:*', () => rest('DELETE', 'eventos2027_plan?event_id=neq.__nada__'));
    lastLocalWrite = Date.now();
    mirrorSave(); emit();
  }

  function setBudget(limit) {
    state.budgetLimit = Number(limit) || 0;
    queueSettings();
    lastLocalWrite = Date.now();
    mirrorSave(); emit();
  }

  function setFx(fx) {
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

  /* ─── cenários (snapshots nomeados) ────────────────────────────────────── */
  async function saveScenario(name, total) {
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
    state.plan = s.selections || {};
    state.budgetLimit = Number(s.budget_limit) || state.budgetLimit;
    if (s.fx) state.fx = s.fx;
    lastLocalWrite = Date.now();
    mirrorSave(); emit();

    if (!configured()) return;
    // Reescreve o plano compartilhado inteiro: apaga e regrava.
    await rest('DELETE', 'eventos2027_plan?event_id=neq.__nada__');
    const rows = Object.entries(state.plan).map(([event_id, v]) => ({
      event_id, people: v.people, updated_by: author(), updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      await rest('POST', 'eventos2027_plan?on_conflict=event_id', rows, 'resolution=merge-duplicates');
    }
    queueSettings();
  }

  async function deleteScenario(id) {
    if (!configured()) return;
    await rest('DELETE', `eventos2027_scenarios?id=eq.${encodeURIComponent(id)}`);
  }

  return {
    state,
    init, poll, flush,
    toggle, setPeople, clearPlan, setBudget, setFx,
    saveScenario, listScenarios, applyScenario, deleteScenario,
    author, setAuthor, configured,
    onChange: fn => listeners.push(fn),
    onStatus: fn => statusListeners.push(fn),
  };
})();
