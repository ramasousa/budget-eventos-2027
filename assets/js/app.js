/* ──────────────────────────────────────────────────────────────────────────
   Aplicação: cálculo de custos, views e exportações.
   ────────────────────────────────────────────────────────────────────────── */

const ui = {
  tab: 'catalogo',
  cat: 'all',
  priority: 'all',
  search: '',
  onlySelected: false,
};

const PRIORITY_LABEL = { alta: 'Prioridade alta', media: 'Prioridade média', baixa: 'Prioridade baixa' };
const CONFIDENCE_LABEL = {
  confirmado: 'Data confirmada',
  estimado: 'Data estimada',
  a_confirmar: 'Sede/data a confirmar',
};

/* ─── FORMATAÇÃO ─────────────────────────────────────────────────────────── */
const brl = n => 'R$ ' + Math.round(n || 0).toLocaleString('pt-BR');
const brlShort = n => {
  const v = Math.round(n || 0);
  if (v >= 1000000) return 'R$ ' + (v / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (v >= 1000) return 'R$ ' + Math.round(v / 1000) + 'k';
  return 'R$ ' + v;
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseNum = s => Number(String(s).replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;

/* ─── CÁLCULO ────────────────────────────────────────────────────────────── */
function fxRate(cur) {
  const r = Store.state.fx[cur];
  return typeof r === 'number' && r > 0 ? r : 6.20;
}

function costOf(ev, people = 1) {
  const p = Math.max(1, people);
  const inscricoes = ev.ticket * fxRate(ev.currency) * p;
  const passagens  = ev.passagem * p;
  const hospedagem = ev.hotel * ev.nights * p;
  const perdiem    = ev.perDiem * ev.days * p;
  const traslado   = ev.transfer * p;
  return {
    inscricoes, passagens, hospedagem, perdiem, traslado,
    total: inscricoes + passagens + hospedagem + perdiem + traslado,
  };
}

function selectedEvents() {
  return Store.state.events
    .filter(e => Store.state.plan[e.id])
    .map(e => ({ ev: e, people: Store.state.plan[e.id].people }));
}

function totals() {
  const acc = {
    total: 0, inscricoes: 0, passagens: 0, hospedagem: 0, perdiem: 0, traslado: 0,
    events: 0, people: 0, nights: 0, days: 0,
  };
  selectedEvents().forEach(({ ev, people }) => {
    const c = costOf(ev, people);
    acc.total += c.total; acc.inscricoes += c.inscricoes; acc.passagens += c.passagens;
    acc.hospedagem += c.hospedagem; acc.perdiem += c.perdiem; acc.traslado += c.traslado;
    acc.events += 1; acc.people += people;
    acc.nights += ev.nights * people; acc.days += ev.days * people;
  });
  return acc;
}

function groupSum(keyFn) {
  const map = new Map();
  selectedEvents().forEach(({ ev, people }) => {
    const k = keyFn(ev);
    map.set(k, (map.get(k) || 0) + costOf(ev, people).total);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

/* ─── CATÁLOGO ───────────────────────────────────────────────────────────── */
function visibleEvents() {
  const q = ui.search.trim().toLowerCase();
  return Store.state.events.filter(e => {
    if (ui.cat !== 'all' && e.category !== ui.cat) return false;
    if (ui.priority !== 'all' && e.priority !== ui.priority) return false;
    if (ui.onlySelected && !Store.state.plan[e.id]) return false;
    if (q) {
      const hay = (e.name + ' ' + e.city + ' ' + e.country + ' ' + e.benefit + ' ' +
                   (CATEGORIES[e.category] || {}).label).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderFilters() {
  const counts = { all: Store.state.events.length };
  Store.state.events.forEach(e => { counts[e.category] = (counts[e.category] || 0) + 1; });

  const catBar = document.getElementById('catFilters');
  const cats = [['all', 'Todos']].concat(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label]));
  catBar.innerHTML = cats.map(([k, label]) =>
    `<button class="chip ${ui.cat === k ? 'active' : ''}" data-cat="${k}">${esc(label)}<span class="n">${counts[k] || 0}</span></button>`
  ).join('');
  catBar.querySelectorAll('[data-cat]').forEach(b =>
    b.onclick = () => { ui.cat = b.dataset.cat; render(); });

  const prioBar = document.getElementById('prioFilters');
  prioBar.innerHTML = [['all', 'Todas'], ['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']]
    .map(([k, label]) =>
      `<button class="chip ${ui.priority === k ? 'active' : ''}" data-prio="${k}">${label}</button>`
    ).join('');
  prioBar.querySelectorAll('[data-prio]').forEach(b =>
    b.onclick = () => { ui.priority = b.dataset.prio; render(); });
}

function renderCatalog() {
  const grid = document.getElementById('eventsGrid');
  const list = visibleEvents();

  if (!list.length) {
    grid.innerHTML = `<div class="empty-note" style="grid-column:1/-1">
      Nenhum evento corresponde a esses filtros.</div>`;
    return;
  }

  grid.innerHTML = list.map(ev => {
    const sel = Store.state.plan[ev.id];
    const people = sel ? sel.people : 1;
    const c = costOf(ev, 1);
    const cat = CATEGORIES[ev.category] || { label: ev.category, color: '#888' };
    const cur = ev.ticket.toLocaleString('pt-BR') + ' ' + ev.currency;
    return `
    <article class="event-card ${sel ? 'selected' : ''}" data-id="${esc(ev.id)}">
      <div class="card-bar" style="background:${cat.color}"></div>
      <div class="card-body" data-toggle="${esc(ev.id)}">
        <div class="card-top">
          <div>
            <div class="card-cat" style="color:${cat.color}">${esc(cat.label)}</div>
            <div class="card-when">${MONTHS[ev.monthNum]} 2027 · ${esc(ev.dateLabel || '')}</div>
          </div>
          <div class="card-check">✓</div>
        </div>
        <h3 class="card-name">${esc(ev.name)} ${esc(ev.edition || '')}</h3>
        <div class="card-place">
          <span>${esc(ev.city)}${ev.country ? ', ' + esc(ev.country) : ''}</span>
          <span class="tag tag-${ev.priority}">${esc((PRIORITY_LABEL[ev.priority] || '').replace('Prioridade ', ''))}</span>
          ${ev.confidence !== 'confirmado'
            ? `<span class="tag tag-conf">${esc(CONFIDENCE_LABEL[ev.confidence] || '')}</span>` : ''}
        </div>
        <p class="card-benefit">${esc(ev.benefit)}</p>
        <div class="card-meta-line"><b>Quem deve ir:</b> ${esc(ev.audience)}</div>
        <div class="card-costs">
          <div><div class="cost-k">Passagem</div><div class="cost-v">${brl(ev.passagem)}</div></div>
          <div><div class="cost-k">Inscrição (${esc(cur)})</div><div class="cost-v">${brl(c.inscricoes)}</div></div>
          <div><div class="cost-k">Hospedagem (${ev.nights}n)</div><div class="cost-v">${brl(ev.hotel * ev.nights)}</div></div>
          <div><div class="cost-k">Diárias + traslado</div><div class="cost-v">${brl(c.perdiem + c.traslado)}</div></div>
          <div class="cost-total" style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:baseline;padding-top:0.4rem;border-top:1px solid var(--line-soft)">
            <div class="cost-k">Total estimado por pessoa</div><div class="cost-v">${brl(c.total)}</div>
          </div>
        </div>
        <div class="people-row">
          <span class="people-label">Participantes</span>
          <button class="step-btn" data-step="-1" data-id="${esc(ev.id)}" aria-label="Menos um participante">−</button>
          <span class="people-n">${people}</span>
          <button class="step-btn" data-step="1" data-id="${esc(ev.id)}" aria-label="Mais um participante">+</button>
          <span class="people-label" style="flex:0;white-space:nowrap;text-align:right;font-weight:600;color:var(--red)">${brl(costOf(ev, people).total)}</span>
        </div>
      </div>
    </article>`;
  }).join('');

  grid.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.step-btn')) return;
      Store.toggle(el.dataset.toggle);
    });
  });
  grid.querySelectorAll('.step-btn').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      const cur = (Store.state.plan[b.dataset.id] || { people: 1 }).people;
      Store.setPeople(b.dataset.id, cur + Number(b.dataset.step));
    });
  });
}

/* ─── CALENDÁRIO / CARGA DE VIAGEM ───────────────────────────────────────── */
function renderTimeline() {
  const host = document.getElementById('timeline');
  const byMonth = {};
  Store.state.events.forEach(e => (byMonth[e.monthNum] = byMonth[e.monthNum] || []).push(e));

  host.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
    const evs = (byMonth[m] || []).sort((a, b) => a.name.localeCompare(b.name));
    const sel = evs.filter(e => Store.state.plan[e.id]);
    const cost = sel.reduce((s, e) => s + costOf(e, Store.state.plan[e.id].people).total, 0);
    const people = sel.reduce((s, e) => s + Store.state.plan[e.id].people, 0);
    const daysAway = sel.reduce((s, e) => s + (e.nights + 2), 0);

    const warn = sel.length >= 3
      ? `<div class="tl-warn"><b>${sel.length} viagens no mesmo mês</b> — cerca de ${daysAway} dias de ausência somados. Vale checar conflito com fechamento e PI Planning.</div>`
      : (daysAway >= 12
        ? `<div class="tl-warn"><b>${daysAway} dias de ausência</b> concentrados neste mês.</div>` : '');

    return `
    <div class="tl-month ${sel.length ? 'has-load' : (evs.length ? '' : 'empty')}">
      <div class="tl-m-name">${MONTHS[m]}<span class="q">T${Math.ceil(m / 3)} · 2027</span></div>
      <div class="tl-m-events">
        ${evs.length ? evs.map(e => {
          const on = !!Store.state.plan[e.id];
          const color = (CATEGORIES[e.category] || {}).color || '#888';
          return `<button class="tl-pill ${on ? 'on' : ''}" data-tl="${esc(e.id)}" title="${esc(e.city)}">
            <span class="dot" style="background:${color}"></span>${esc(e.name)}</button>`;
        }).join('') : '<span style="font-size:0.68rem;color:#bbb">sem eventos mapeados</span>'}
      </div>
      <div class="tl-m-cost">
        <div class="tl-m-total ${cost ? '' : 'zero'}">${cost ? brl(cost) : '—'}</div>
        <div class="tl-m-sub">${sel.length ? `${sel.length} evento${sel.length > 1 ? 's' : ''} · ${people} pessoa${people > 1 ? 's' : ''}` : `${evs.length} disponíve${evs.length === 1 ? 'l' : 'is'}`}</div>
      </div>
      ${warn}
    </div>`;
  }).join('');

  host.querySelectorAll('[data-tl]').forEach(b =>
    b.onclick = () => Store.toggle(b.dataset.tl));
}

/* ─── CONSOLIDADO ────────────────────────────────────────────────────────── */
function renderConsolidado() {
  const host = document.getElementById('consolidado');
  const t = totals();
  const sel = selectedEvents();
  const limit = Store.state.budgetLimit;

  if (!sel.length) {
    host.innerHTML = `<div class="empty-note">
      Nenhum evento selecionado ainda.<br>
      Escolha eventos no catálogo ou no mapa — o consolidado se monta sozinho.</div>`;
    return;
  }

  const bars = (rows, palette) => {
    const max = Math.max(...rows.map(r => r[1]), 1);
    return rows.map(([k, v], i) => `
      <div class="bar-row">
        <div class="bar-top"><span class="bar-k">${esc(k)}</span><span class="bar-v">${brl(v)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${(v / max * 100).toFixed(1)}%;background:${palette ? palette(k, i) : 'var(--red)'}"></div></div>
      </div>`).join('');
  };

  const byCat = groupSum(e => (CATEGORIES[e.category] || {}).label || e.category);
  const byRegion = groupSum(e => e.region || '—');
  const byCity = groupSum(e => e.city);
  const byQuarter = [1, 2, 3, 4].map(q => {
    const v = sel.filter(({ ev }) => Math.ceil(ev.monthNum / 3) === q)
      .reduce((s, { ev, people }) => s + costOf(ev, people).total, 0);
    return ['T' + q, v];
  });

  const catColor = label => {
    const hit = Object.values(CATEGORIES).find(c => c.label === label);
    return hit ? hit.color : 'var(--red)';
  };

  const composition = [
    ['Passagens', t.passagens], ['Inscrições', t.inscricoes],
    ['Hospedagem', t.hospedagem], ['Diárias (per diem)', t.perdiem], ['Traslados', t.traslado],
  ].sort((a, b) => b[1] - a[1]);

  const rows = sel
    .sort((a, b) => a.ev.monthNum - b.ev.monthNum)
    .map(({ ev, people }) => {
      const c = costOf(ev, people);
      return `<tr>
        <td><div class="ev-name">${esc(ev.name)}</div>
            <div class="ev-sub">${esc(ev.city)} · ${MONTHS[ev.monthNum]} · ${esc((CATEGORIES[ev.category] || {}).label || '')}</div></td>
        <td class="num">${people}</td>
        <td class="num">${brl(c.passagens)}</td>
        <td class="num">${brl(c.inscricoes)}</td>
        <td class="num">${brl(c.hospedagem)}</td>
        <td class="num">${brl(c.perdiem + c.traslado)}</td>
        <td class="num" style="font-weight:700;color:var(--red)">${brl(c.total)}</td>
      </tr>`;
    }).join('');

  const pct = limit > 0 ? (t.total / limit * 100) : 0;
  const saldo = limit - t.total;

  host.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-k">Investimento total</div>
        <div class="kpi-v red">${brl(t.total)}</div>
        <div class="kpi-s">${t.events} eventos · ${t.people} participações</div></div>
      <div class="kpi"><div class="kpi-k">Limite definido</div>
        <div class="kpi-v">${brl(limit)}</div>
        <div class="kpi-s">${pct.toFixed(0)}% comprometido</div></div>
      <div class="kpi"><div class="kpi-k">${saldo >= 0 ? 'Saldo disponível' : 'Excedente'}</div>
        <div class="kpi-v ${saldo < 0 ? 'red' : ''}">${brl(Math.abs(saldo))}</div>
        <div class="kpi-s">${saldo >= 0 ? 'ainda alocável' : 'acima do limite'}</div></div>
      <div class="kpi"><div class="kpi-k">Custo médio por participação</div>
        <div class="kpi-v">${brl(t.people ? t.total / t.people : 0)}</div>
        <div class="kpi-s">${t.nights} diárias de hotel somadas</div></div>
    </div>

    <div class="block-grid">
      <div class="block"><div class="block-h">Investimento por frente temática</div>${bars(byCat, catColor)}</div>
      <div class="block"><div class="block-h">Composição do custo</div>${bars(composition)}</div>
      <div class="block"><div class="block-h">Distribuição geográfica</div>${bars(byRegion)}</div>
      <div class="block"><div class="block-h">Distribuição no ano</div>${bars(byQuarter)}</div>
    </div>

    <div class="block">
      <div class="block-h">Detalhamento por evento</div>
      <div class="tbl-scroll">
      <table class="tbl">
        <thead><tr>
          <th>Evento</th><th class="num">Pes.</th><th class="num">Passagens</th>
          <th class="num">Inscrições</th><th class="num">Hospedagem</th>
          <th class="num">Diárias + traslado</th><th class="num">Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td>Total geral</td><td class="num">${t.people}</td>
          <td class="num">${brl(t.passagens)}</td><td class="num">${brl(t.inscricoes)}</td>
          <td class="num">${brl(t.hospedagem)}</td><td class="num">${brl(t.perdiem + t.traslado)}</td>
          <td class="num" style="color:var(--red)">${brl(t.total)}</td>
        </tr></tfoot>
      </table></div>
    </div>

    <div class="note-box">
      <b>Premissas do orçamento</b>
      <ul>
        <li>Câmbio aplicado: USD ${Store.state.fx.USD.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · EUR ${Store.state.fx.EUR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · GBP ${Store.state.fx.GBP.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — ajustável em <b>Premissas</b>.</li>
        <li>Passagens e hospedagem estimadas em BRL; inscrições convertidas da moeda de origem.</li>
        <li>Cada evento inclui passagem, inscrição, hospedagem, diárias e traslado por pessoa. Não inclui visto, seguro-viagem nem excesso de bagagem.</li>
        <li>Datas e sedes de 2027 marcadas como <b>estimadas</b> ou <b>a confirmar</b> seguem o calendário histórico de cada evento e devem ser revalidadas na abertura das inscrições.</li>
        <li>Valores sujeitos à política de viagens vigente do banco.</li>
      </ul>
    </div>`;
}

/* ─── RAIL (ORÇAMENTO CONSOLIDADO) ───────────────────────────────────────── */
function renderRail() {
  const t = totals();
  const limit = Store.state.budgetLimit;

  document.getElementById('railTotal').textContent = brl(t.total);
  document.getElementById('railEvents').textContent = t.events;
  document.getElementById('railPeople').textContent = t.people;
  document.getElementById('railPassagens').textContent = brl(t.passagens);
  document.getElementById('railInscricoes').textContent = brl(t.inscricoes);

  const pct = limit > 0 ? (t.total / limit) * 100 : 0;
  const over = limit > 0 && t.total > limit;
  const warn = !over && pct >= 85;

  const bar = document.getElementById('railBar');
  bar.style.width = Math.min(pct, 100).toFixed(1) + '%';
  bar.className = 'bar-used' + (over ? ' over' : warn ? ' warn' : '');
  document.getElementById('railTotal').className = 'rail-total-v' + (over ? ' over' : '');

  const pctEl = document.getElementById('railPct');
  pctEl.className = 'bar-pct' + (over ? ' over' : '');
  pctEl.textContent = limit > 0
    ? (over
      ? `${Math.round(pct)}% — ${brl(t.total - limit)} acima do limite`
      : `${Math.round(pct)}% do limite · ${brl(limit - t.total)} disponíveis`)
    : 'Defina um limite acima';

  const list = document.getElementById('railList');
  const sel = selectedEvents().sort((a, b) => a.ev.monthNum - b.ev.monthNum);
  if (!sel.length) {
    list.innerHTML = `<div class="rail-empty">
      <div style="font-size:1.4rem;opacity:0.35">◷</div>
      <p>Nenhum evento selecionado.<br>Escolha no catálogo, no mapa<br>ou no calendário.</p></div>`;
  } else {
    list.innerHTML = sel.map(({ ev, people }) => `
      <div class="sel-item">
        <div class="sel-top">
          <div class="sel-name">${esc(ev.name)}</div>
          <div class="sel-total">${brl(costOf(ev, people).total)}</div>
        </div>
        <div class="sel-meta">
          <span>${esc(ev.city)} · ${MONTHS[ev.monthNum]} · ${people} pessoa${people > 1 ? 's' : ''}</span>
          <button class="sel-x" data-rm="${esc(ev.id)}" title="Remover">✕</button>
        </div>
      </div>`).join('');
    list.querySelectorAll('[data-rm]').forEach(b =>
      b.onclick = () => Store.toggle(b.dataset.rm));
  }

  const budgetInput = document.getElementById('budgetInput');
  if (document.activeElement !== budgetInput) {
    budgetInput.value = limit.toLocaleString('pt-BR');
  }

  document.getElementById('tabCountCatalogo').textContent = Store.state.events.length;
  const badge = document.getElementById('tabCountSel');
  badge.textContent = t.events;
  badge.style.display = t.events ? '' : 'none';
}

/* ─── STATUS DE SINCRONIZAÇÃO ────────────────────────────────────────────── */
function renderStatus() {
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncText');
  const s = Store.state;

  if (!Store.configured()) {
    dot.className = 'sync-dot local';
    txt.innerHTML = 'Modo local — Supabase não configurado. As alterações ficam só neste navegador.';
    return;
  }
  if (s.online) {
    dot.className = 'sync-dot live';
    const hhmm = s.lastSync ? s.lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    txt.innerHTML = `<b>Compartilhado</b> — todos com o link veem este mesmo orçamento` +
      (hhmm ? ` · sincronizado às ${hhmm}` : '') +
      (s.lastEditor && s.lastEditor !== 'anônimo' ? ` · última edição por ${esc(s.lastEditor)}` : '');
  } else {
    dot.className = 'sync-dot err';
    txt.innerHTML = 'Sem conexão com o banco — trabalhando localmente. Reconecta sozinho.';
  }
}

/* ─── RENDER MESTRE ──────────────────────────────────────────────────────── */
let mapDirty = true;
function render() {
  renderFilters();
  renderCatalog();
  renderTimeline();
  renderConsolidado();
  renderRail();
  renderStatus();
  if (typeof EventMap !== 'undefined') EventMap.refresh();
}

function switchTab(tab) {
  ui.tab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + tab));
  if (tab === 'mapa' && typeof EventMap !== 'undefined') EventMap.ensure();
  document.querySelector('.main').scrollTop = 0;
}

/* ─── TOAST ──────────────────────────────────────────────────────────────── */
let toastTimer = null;
function toast(msg, isError) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3600);
}

/* ─── EXPORTAÇÕES ────────────────────────────────────────────────────────── */
function download(filename, content, mime) {
  const blob = new Blob(['﻿' + content], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function exportCSV() {
  const sel = selectedEvents();
  if (!sel.length) return toast('Selecione ao menos um evento.', true);
  const head = ['Evento', 'Categoria', 'Cidade', 'País', 'Região', 'Mês', 'Pessoas',
    'Passagens', 'Inscrições', 'Hospedagem', 'Diárias', 'Traslados', 'Total', 'Prioridade', 'Confiança da data'];
  const lines = sel.sort((a, b) => a.ev.monthNum - b.ev.monthNum).map(({ ev, people }) => {
    const c = costOf(ev, people);
    return [
      `${ev.name} ${ev.edition || ''}`.trim(), (CATEGORIES[ev.category] || {}).label || ev.category,
      ev.city, ev.country, ev.region, `${MONTHS[ev.monthNum]}/2027`, people,
      Math.round(c.passagens), Math.round(c.inscricoes), Math.round(c.hospedagem),
      Math.round(c.perdiem), Math.round(c.traslado), Math.round(c.total),
      PRIORITY_LABEL[ev.priority] || '', CONFIDENCE_LABEL[ev.confidence] || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';');
  });
  const t = totals();
  lines.push(['TOTAL GERAL', '', '', '', '', '', t.people,
    Math.round(t.passagens), Math.round(t.inscricoes), Math.round(t.hospedagem),
    Math.round(t.perdiem), Math.round(t.traslado), Math.round(t.total), '', '']
    .map(v => `"${v}"`).join(';'));
  download('orcamento-eventos-2027.csv', [head.map(h => `"${h}"`).join(';')].concat(lines).join('\n'), 'text/csv');
  toast('CSV exportado.');
}

function exportTXT() {
  const sel = selectedEvents();
  if (!sel.length) return toast('Selecione ao menos um evento.', true);
  const t = totals();
  const limit = Store.state.budgetLimit;
  const line = '─'.repeat(72);
  const rows = sel.sort((a, b) => a.ev.monthNum - b.ev.monthNum).map(({ ev, people }) => {
    const c = costOf(ev, people);
    return `${MONTHS[ev.monthNum].padEnd(4)} │ ${(ev.name + ' ' + (ev.edition || '')).trim().padEnd(38).slice(0, 38)} │ ` +
           `${String(people).padStart(2)}p │ ${brl(c.total).padStart(12)}\n` +
           `     │ ${ev.city}, ${ev.country}\n` +
           `     │ ${ev.outcome}\n`;
  }).join('\n');

  const txt =
`ORÇAMENTO DE EVENTOS INTERNACIONAIS — 2027
Open Platform & BaaS · BU AI First — Banco Bradesco
Gerado em ${new Date().toLocaleDateString('pt-BR')} por ${Store.author()}
${line}

${rows}
${line}
TOTAL ESTIMADO ......... ${brl(t.total)}
LIMITE DEFINIDO ........ ${brl(limit)}
${limit > 0 ? (t.total > limit
  ? `EXCEDENTE .............. ${brl(t.total - limit)}  (${Math.round(t.total / limit * 100)}% do limite)`
  : `SALDO DISPONÍVEL ....... ${brl(limit - t.total)}  (${Math.round(t.total / limit * 100)}% do limite)`) : ''}

COMPOSIÇÃO
  Passagens ............ ${brl(t.passagens)}
  Inscrições ........... ${brl(t.inscricoes)}
  Hospedagem ........... ${brl(t.hospedagem)}
  Diárias (per diem) ... ${brl(t.perdiem)}
  Traslados ............ ${brl(t.traslado)}

${t.events} eventos · ${t.people} participações · ${t.nights} diárias de hotel

PREMISSAS
  Câmbio: USD ${Store.state.fx.USD} · EUR ${Store.state.fx.EUR} · GBP ${Store.state.fx.GBP}
  Não inclui visto, seguro-viagem nem excesso de bagagem.
  Datas de 2027 estimadas pelo calendário histórico; revalidar na abertura das inscrições.
  Valores sujeitos à política de viagens vigente.
`;
  download('orcamento-eventos-2027.txt', txt, 'text/plain');
  toast('Resumo exportado.');
}
