/* ──────────────────────────────────────────────────────────────────────────
   Aplicação: cálculo de custos, views e exportações.
   Design System: Velo.ai
   ────────────────────────────────────────────────────────────────────────── */

const ui = {
  tab: 'catalogo',
  cat: 'all',
  priority: 'all',
  search: '',
  onlySelected: false,
  openAcc: {},          // itens do accordion do consolidado abertos
};

const PRIORITY_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const PRIORITY_BADGE = { alta: 'flag', media: 'badge badge-amber', baixa: 'badge badge-gray' };
const CONFIDENCE_LABEL = {
  confirmado: 'Data confirmada',
  estimado: 'Data estimada',
  a_confirmar: 'Sede a confirmar',
};

/* ─── FORMATAÇÃO ─────────────────────────────────────────────────────────── */
const brl = n => 'R$ ' + Math.round(n || 0).toLocaleString('pt-BR');
/* Em números grandes o símbolo compete com o valor: reduzimos o "R$". */
const brlBig = n => '<span class="cur">R$</span> ' + Math.round(n || 0).toLocaleString('pt-BR');
const brlShort = n => {
  const v = Math.round(n || 0);
  if (v >= 1000000) return 'R$ ' + (v / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (v >= 1000) return 'R$ ' + Math.round(v / 1000) + 'k';
  return 'R$ ' + v;
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseNum = s => Number(String(s).replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
const plural = (n, sing, plur) => n === 1 ? sing : plur;

/* ─── CÁLCULO ────────────────────────────────────────────────────────────── */
/*  A fórmula vive em assets/js/custo.js, compartilhada com a landing page.
    Aqui ficam só os atalhos que injetam o câmbio vigente do Store.  */
const fxRate = cur => Custo.taxa(Store.state.fx, cur);
const costOf = (ev, people = 1, courtesy = 0) =>
  Custo.evento(ev, people, courtesy, Store.state.fx);

function planOf(id) {
  const r = Store.state.plan[id];
  return r ? { people: r.people, courtesy: r.courtesy || 0 } : null;
}

function selectedEvents() {
  return Store.state.events
    .filter(e => Store.state.plan[e.id])
    .map(e => ({ ev: e, ...planOf(e.id) }));
}

function totals() {
  const acc = {
    total: 0, inscricoes: 0, economia: 0, passagens: 0, hospedagem: 0,
    perdiem: 0, traslado: 0, events: 0, people: 0, courtesy: 0, nights: 0,
  };
  selectedEvents().forEach(({ ev, people, courtesy }) => {
    const c = costOf(ev, people, courtesy);
    acc.total += c.total; acc.inscricoes += c.inscricoes; acc.economia += c.economia;
    acc.passagens += c.passagens; acc.hospedagem += c.hospedagem;
    acc.perdiem += c.perdiem; acc.traslado += c.traslado;
    acc.events += 1; acc.people += people; acc.courtesy += courtesy;
    acc.nights += ev.nights * people;
  });
  return acc;
}

function groupSum(keyFn) {
  const map = new Map();
  selectedEvents().forEach(({ ev, people, courtesy }) => {
    const k = keyFn(ev);
    map.set(k, (map.get(k) || 0) + costOf(ev, people, courtesy).total);
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
    const sel = planOf(ev.id);
    const people = sel ? sel.people : 1;
    const courtesy = sel ? sel.courtesy : 0;
    const cat = CATEGORIES[ev.category] || { label: ev.category, color: '#98a8b6' };
    const unit = costOf(ev, 1, 0);
    const atual = costOf(ev, people, courtesy);
    const temCortesia = courtesy > 0;

    return `
    <article class="event-card ${sel ? 'selected' : ''}" data-id="${esc(ev.id)}"
             style="--catcolor:${cat.color}">
      <div class="card-body" data-toggle="${esc(ev.id)}">
        <div class="card-top">
          <div>
            <div class="card-cat">${esc(cat.label)}</div>
            <div class="card-when">${MONTHS[ev.monthNum]} 2027 · ${esc(ev.dateLabel || '')}</div>
          </div>
          <div class="card-check">✓</div>
        </div>

        <h3 class="card-name">${esc(ev.name)} ${esc(ev.edition || '')}</h3>

        <div class="card-place">
          <span>${esc(ev.city)}${ev.country ? ', ' + esc(ev.country) : ''}</span>
          <span class="${PRIORITY_BADGE[ev.priority] || 'badge badge-gray'}">${esc(PRIORITY_LABEL[ev.priority] || '')}</span>
          ${ev.confidence !== 'confirmado'
            ? `<span class="badge badge-gray">${esc(CONFIDENCE_LABEL[ev.confidence] || '')}</span>` : ''}
          ${temCortesia ? `<span class="badge badge-green">✓ ${courtesy} ingresso${courtesy > 1 ? 's' : ''}</span>` : ''}
        </div>

        <p class="card-benefit">${esc(ev.benefit)}</p>
        <div class="card-meta-line"><b>Quem deve ir:</b> ${esc(ev.audience)}</div>

        <div class="card-costs">
          <div><div class="cost-k">Passagem</div><div class="cost-v">${brl(ev.passagem)}</div></div>
          <div>
            <div class="cost-k">Inscrição · ${esc(ev.ticket.toLocaleString('pt-BR'))} ${esc(ev.currency)}</div>
            <div class="cost-v">${temCortesia && courtesy >= people
              ? `<span class="cost-v struck">${brl(unit.inscricoes)}</span><span style="color:var(--green-d)">cortesia</span>`
              : brl(unit.inscricoes)}</div>
          </div>
          <div><div class="cost-k">Hospedagem · ${ev.nights}n</div><div class="cost-v">${brl(ev.hotel * ev.nights)}</div></div>
          <div><div class="cost-k">Diárias + traslado</div><div class="cost-v">${brl(unit.perdiem + unit.traslado)}</div></div>
          <div class="cost-total">
            <div class="cost-k">Total por pessoa</div>
            <div class="cost-v">${brl(unit.total)}</div>
          </div>
        </div>

        <div class="people-row">
          <span class="people-label">Participantes</span>
          <button class="step-btn" data-step="-1" data-id="${esc(ev.id)}" aria-label="Menos um participante">−</button>
          <span class="people-n">${people}</span>
          <button class="step-btn" data-step="1" data-id="${esc(ev.id)}" aria-label="Mais um participante">+</button>
          <span class="people-cost">${brl(atual.total)}</span>
        </div>

        <div class="courtesy-row ${temCortesia ? '' : 'off'}">
          <button class="courtesy-toggle" data-courtesy-toggle="${esc(ev.id)}"
                  title="Ingressos já garantidos com fornecedor">
            <span class="courtesy-box">✓</span>
            <span>Ingresso cortesia</span>
          </button>
          <span class="courtesy-count">
            <button class="step-btn" data-cort="-1" data-id="${esc(ev.id)}" aria-label="Menos uma cortesia">−</button>
            <span class="courtesy-n">${courtesy}/${people}</span>
            <button class="step-btn" data-cort="1" data-id="${esc(ev.id)}" aria-label="Mais uma cortesia">+</button>
          </span>
          ${temCortesia ? `<span class="courtesy-save">Economia de ${brl(atual.economia)} em inscrições</span>` : ''}
        </div>

        ${ev.custom ? `
        <div class="card-custom-bar">
          <span class="badge badge-blue">Incluído pela equipe</span>
          ${ev.createdBy && ev.createdBy !== 'anônimo'
            ? `<span style="font-family:var(--mono);font-size:9.5px;color:var(--ink-4)">por ${esc(ev.createdBy)}</span>` : ''}
          <button class="btn-remover" data-remover="${esc(ev.id)}">Remover</button>
        </div>` : ''}
      </div>
    </article>`;
  }).join('');

  grid.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.step-btn') || e.target.closest('[data-courtesy-toggle]')
          || e.target.closest('[data-remover]')) return;
      Store.toggle(el.dataset.toggle);
    });
  });
  grid.querySelectorAll('[data-step]').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      const cur = (planOf(b.dataset.id) || { people: 1 }).people;
      Store.setPeople(b.dataset.id, cur + Number(b.dataset.step));
    });
  });
  grid.querySelectorAll('[data-cort]').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      const cur = (planOf(b.dataset.id) || { courtesy: 0 }).courtesy;
      Store.setCourtesy(b.dataset.id, cur + Number(b.dataset.cort));
    });
  });
  grid.querySelectorAll('[data-remover]').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      removerEventoPersonalizado(b.dataset.remover);
    });
  });
  grid.querySelectorAll('[data-courtesy-toggle]').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      const id = b.dataset.courtesyToggle;
      const p = planOf(id);
      if (!p) return;
      // Liga cobrindo todo mundo; desliga zerando. O ajuste fino fica no stepper.
      Store.setCourtesy(id, p.courtesy > 0 ? 0 : p.people);
    });
  });
}

/* ─── CALENDÁRIO ─────────────────────────────────────────────────────────── */
function renderTimeline() {
  const host = document.getElementById('timeline');
  const byMonth = {};
  Store.state.events.forEach(e => (byMonth[e.monthNum] = byMonth[e.monthNum] || []).push(e));

  host.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
    const evs = (byMonth[m] || []).sort((a, b) => a.name.localeCompare(b.name));
    const sel = evs.filter(e => Store.state.plan[e.id]);
    const cost = sel.reduce((s, e) => { const p = planOf(e.id); return s + costOf(e, p.people, p.courtesy).total; }, 0);
    const people = sel.reduce((s, e) => s + planOf(e.id).people, 0);
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
          const color = (CATEGORIES[e.category] || {}).color || '#98a8b6';
          return `<button class="tl-pill ${on ? 'on' : ''}" data-tl="${esc(e.id)}" title="${esc(e.city)}">
            <span class="dot" style="background:${color}"></span>${esc(e.name)}</button>`;
        }).join('') : '<span style="font-size:11.5px;color:var(--ink-4)">sem eventos mapeados</span>'}
      </div>
      <div class="tl-m-cost">
        <div class="tl-m-total ${cost ? '' : 'zero'}">${cost ? brl(cost) : '—'}</div>
        <div class="tl-m-sub">${sel.length
          ? `${sel.length} ${plural(sel.length, 'evento', 'eventos')} · ${people} ${plural(people, 'pessoa', 'pessoas')}`
          : `${evs.length} ${plural(evs.length, 'disponível', 'disponíveis')}`}</div>
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
      Escolha no catálogo, no mapa ou no calendário — o consolidado se monta sozinho.</div>`;
    return;
  }

  const bars = (rows, colorFn) => {
    const max = Math.max(...rows.map(r => r[1]), 1);
    return rows.map(([k, v], i) => `
      <div class="bar-row">
        <div class="bar-top"><span class="bar-k">${esc(k)}</span><span class="bar-v">${brl(v)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${(v / max * 100).toFixed(1)}%${colorFn ? ';background:' + colorFn(k, i) : ''}"></div></div>
      </div>`).join('');
  };

  const byCat = groupSum(e => (CATEGORIES[e.category] || {}).label || e.category);
  const byRegion = groupSum(e => e.region || '—');
  const byQuarter = [1, 2, 3, 4].map(q => ['T' + q,
    sel.filter(({ ev }) => Math.ceil(ev.monthNum / 3) === q)
       .reduce((s, { ev, people, courtesy }) => s + costOf(ev, people, courtesy).total, 0)]);

  const catColor = label => {
    const hit = Object.values(CATEGORIES).find(c => c.label === label);
    return hit ? hit.color : 'var(--red)';
  };

  const composition = [
    ['Passagens', t.passagens], ['Inscrições', t.inscricoes],
    ['Hospedagem', t.hospedagem], ['Diárias (per diem)', t.perdiem], ['Traslados', t.traslado],
  ].filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);

  /* Accordion — o DS não admite tabela plana. */
  const itens = sel.sort((a, b) => a.ev.monthNum - b.ev.monthNum)
    .map(({ ev, people, courtesy }) => {
      const c = costOf(ev, people, courtesy);
      const cat = CATEGORIES[ev.category] || {};
      const aberto = !!ui.openAcc[ev.id];
      return `
      <div class="acc-item ${aberto ? 'open' : ''}" data-acc="${esc(ev.id)}">
        <button class="acc-head">
          <span class="acc-month">${MONTHS[ev.monthNum]}</span>
          <span>
            <span class="acc-name">${esc(ev.name)}</span>
            <span class="acc-sub">
              ${esc(ev.city)} · ${people} ${plural(people, 'pessoa', 'pessoas')}
              <span class="badge badge-gray" style="border-color:${cat.color}33;color:${cat.color}">${esc(cat.label || '')}</span>
              ${courtesy > 0 ? `<span class="badge badge-green">✓ ${courtesy} cortesia${courtesy > 1 ? 's' : ''}</span>` : ''}
            </span>
          </span>
          <span class="acc-total">${brl(c.total)}</span>
          <span class="acc-caret">▶</span>
        </button>
        <div class="acc-body"><div class="acc-inner">
          <div class="acc-costs">
            <div><div class="acc-cost-k">Passagens</div><div class="acc-cost-v">${brl(c.passagens)}</div></div>
            <div><div class="acc-cost-k">Inscrições</div><div class="acc-cost-v">${brl(c.inscricoes)}${
              c.economia > 0 ? ` <span style="color:var(--green-d);font-size:11px">(−${brl(c.economia)})</span>` : ''}</div></div>
            <div><div class="acc-cost-k">Hospedagem</div><div class="acc-cost-v">${brl(c.hospedagem)}</div></div>
            <div><div class="acc-cost-k">Diárias</div><div class="acc-cost-v">${brl(c.perdiem)}</div></div>
            <div><div class="acc-cost-k">Traslados</div><div class="acc-cost-v">${brl(c.traslado)}</div></div>
          </div>
          <div class="acc-note"><b>O que esperamos trazer:</b> ${esc(ev.outcome)}</div>
        </div></div>
      </div>`;
    }).join('');

  const pct = limit > 0 ? (t.total / limit * 100) : 0;
  const saldo = limit - t.total;

  host.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-k">Investimento total</div>
        <div class="kpi-v red">${brlBig(t.total)}</div>
        <div class="kpi-s">${t.events} eventos · ${t.people} participações</div></div>
      <div class="kpi"><div class="kpi-k">Limite definido</div>
        <div class="kpi-v">${brlBig(limit)}</div>
        <div class="kpi-s">${pct.toFixed(0)}% comprometido</div></div>
      <div class="kpi"><div class="kpi-k">${saldo >= 0 ? 'Saldo disponível' : 'Excedente'}</div>
        <div class="kpi-v ${saldo < 0 ? 'red' : ''}">${brlBig(Math.abs(saldo))}</div>
        <div class="kpi-s">${saldo >= 0 ? 'ainda alocável' : 'acima do limite'}</div></div>
      <div class="kpi"><div class="kpi-k">Economia com cortesias</div>
        <div class="kpi-v ${t.economia > 0 ? 'green' : ''}">${brlBig(t.economia)}</div>
        <div class="kpi-s">${t.courtesy} de ${t.people} ingressos garantidos</div></div>
    </div>

    <div class="block-grid">
      <div class="block">
        <div class="block-h"><span class="eyebrow">Frente temática</span></div>
        ${bars(byCat, catColor)}
      </div>
      <div class="block">
        <div class="block-h"><span class="eyebrow">Composição do custo</span></div>
        ${bars(composition)}
      </div>
      <div class="block">
        <div class="block-h"><span class="eyebrow">Distribuição geográfica</span></div>
        ${bars(byRegion)}
      </div>
      <div class="block">
        <div class="block-h"><span class="eyebrow">Distribuição no ano</span></div>
        ${bars(byQuarter)}
      </div>
    </div>

    <div style="margin:26px 0 14px"><span class="eyebrow">Detalhamento por evento</span></div>
    ${itens}
    <div class="acc-foot">
      <span class="noise"></span>
      <span class="acc-foot-k">Total geral · ${t.people} participações</span>
      <span></span>
      <span class="acc-foot-v">${brlBig(t.total)}</span>
    </div>

    <div style="margin:32px 0 14px"><span class="eyebrow">Premissas</span></div>
    <div class="note-box">
      <ul>
        <li>Câmbio aplicado: USD ${Store.state.fx.USD.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · EUR ${Store.state.fx.EUR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · GBP ${Store.state.fx.GBP.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — ajustável em <b>Premissas</b>.</li>
        <li>Passagens e hospedagem estimadas em BRL; inscrições convertidas da moeda de origem.</li>
        <li><b>Ingressos de cortesia</b> obtidos com fornecedores zeram a inscrição das pessoas cobertas — as demais rubricas (passagem, hospedagem, diárias, traslado) continuam valendo.</li>
        <li>Cada evento inclui passagem, inscrição, hospedagem, diárias e traslado por pessoa. Não inclui visto, seguro-viagem nem excesso de bagagem.</li>
        <li>Datas e sedes de 2027 marcadas como <b>estimadas</b> ou <b>a confirmar</b> seguem o calendário histórico de cada evento e devem ser revalidadas na abertura das inscrições.</li>
        <li>Valores sujeitos à política de viagens vigente do banco.</li>
      </ul>
    </div>`;

  host.querySelectorAll('.acc-head').forEach(b => {
    b.onclick = () => {
      const id = b.closest('[data-acc]').dataset.acc;
      ui.openAcc[id] = !ui.openAcc[id];
      b.closest('.acc-item').classList.toggle('open', ui.openAcc[id]);
    };
  });
}

/* ─── RAIL ───────────────────────────────────────────────────────────────── */
function renderRail() {
  const t = totals();
  const limit = Store.state.budgetLimit;

  document.getElementById('railTotal').innerHTML = brlBig(t.total);
  document.getElementById('railEvents').textContent = t.events;
  document.getElementById('railPeople').textContent = t.people;
  document.getElementById('railPassagens').textContent = brl(t.passagens);
  document.getElementById('railEconomia').textContent = brl(t.economia);

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
      <p>Nenhum evento selecionado.<br>Escolha no catálogo, no mapa<br>ou no calendário.</p></div>`;
  } else {
    list.innerHTML = sel.map(({ ev, people, courtesy }) => `
      <div class="sel-item">
        <div class="sel-top">
          <div class="sel-name">${esc(ev.name)}</div>
          <div class="sel-total">${brl(costOf(ev, people, courtesy).total)}</div>
        </div>
        <div class="sel-meta">
          <span>${esc(ev.city)} · ${MONTHS[ev.monthNum]} · ${people}p</span>
          ${courtesy > 0 ? `<span class="badge badge-green">✓ ${courtesy}</span>` : ''}
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

/* ─── STATUS ─────────────────────────────────────────────────────────────── */
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
    // A barra ganhou os controles de sessão; o texto precisa caber numa linha.
    // Que o orçamento é compartilhado já está dito na faixa e na capa.
    const quem = s.lastEditor && s.lastEditor !== 'anônimo'
      ? ` · última edição por ${esc(s.lastEditor.split('@')[0])}` : '';
    txt.innerHTML = `<b>Compartilhado</b>` + (hhmm ? ` · sincronizado às ${hhmm}` : '') + quem;
  } else {
    dot.className = 'sync-dot err';
    txt.innerHTML = 'Sem conexão com o banco — trabalhando localmente. Reconecta sozinho.';
  }
}

/* ─── RENDER MESTRE ──────────────────────────────────────────────────────── */
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
  // Sair da aba do mapa solta a camada de calor: com o contêiner oculto,
  // um resize da janela a faria redesenhar num canvas de tamanho zero.
  if (ui.tab === 'mapa' && tab !== 'mapa' && typeof EventMap !== 'undefined') EventMap.suspend();
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
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3800);
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
    'Ingressos cortesia', 'Economia cortesia', 'Passagens', 'Inscrições', 'Hospedagem',
    'Diárias', 'Traslados', 'Total', 'Prioridade', 'Confiança da data'];
  const lines = sel.sort((a, b) => a.ev.monthNum - b.ev.monthNum).map(({ ev, people, courtesy }) => {
    const c = costOf(ev, people, courtesy);
    return [
      `${ev.name} ${ev.edition || ''}`.trim(), (CATEGORIES[ev.category] || {}).label || ev.category,
      ev.city, ev.country, ev.region, `${MONTHS[ev.monthNum]}/2027`, people,
      courtesy, Math.round(c.economia),
      Math.round(c.passagens), Math.round(c.inscricoes), Math.round(c.hospedagem),
      Math.round(c.perdiem), Math.round(c.traslado), Math.round(c.total),
      PRIORITY_LABEL[ev.priority] || '', CONFIDENCE_LABEL[ev.confidence] || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';');
  });
  const t = totals();
  lines.push(['TOTAL GERAL', '', '', '', '', '', t.people, t.courtesy, Math.round(t.economia),
    Math.round(t.passagens), Math.round(t.inscricoes), Math.round(t.hospedagem),
    Math.round(t.perdiem), Math.round(t.traslado), Math.round(t.total), '', '']
    .map(v => `"${v}"`).join(';'));
  download('orcamento-eventos-2027.csv',
    [head.map(h => `"${h}"`).join(';')].concat(lines).join('\n'), 'text/csv');
  toast('CSV exportado.');
}

function exportTXT() {
  const sel = selectedEvents();
  if (!sel.length) return toast('Selecione ao menos um evento.', true);
  const t = totals();
  const limit = Store.state.budgetLimit;
  const line = '─'.repeat(72);
  const rows = sel.sort((a, b) => a.ev.monthNum - b.ev.monthNum).map(({ ev, people, courtesy }) => {
    const c = costOf(ev, people, courtesy);
    return `${MONTHS[ev.monthNum].padEnd(4)} │ ${(ev.name + ' ' + (ev.edition || '')).trim().padEnd(38).slice(0, 38)} │ ` +
           `${String(people).padStart(2)}p │ ${brl(c.total).padStart(12)}\n` +
           `     │ ${ev.city}, ${ev.country}\n` +
           (courtesy > 0 ? `     │ ${courtesy} ingresso(s) de cortesia — economia de ${brl(c.economia)}\n` : '') +
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

INGRESSOS DE CORTESIA
  ${t.courtesy} de ${t.people} participações com ingresso garantido via fornecedor
  Economia em inscrições: ${brl(t.economia)}

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

/* ─── FORMULÁRIO DE NOVO EVENTO ──────────────────────────────────────────── */
const FormEvento = (() => {
  let cidadeEscolhida = null;
  let sugestoes = [];
  let indiceSel = -1;

  const $ = id => document.getElementById(id);
  const form = () => $('formEvento');

  function abrir() {
    const f = form();
    f.reset();
    cidadeEscolhida = null;
    $('fCidade').value = '';
    $('fSemSede').checked = false;
    nota('');
    fecharLista();

    $('fCategoria').innerHTML = Object.entries(CATEGORIES)
      .map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
    $('fMes').innerHTML = Array.from({ length: 12 }, (_, i) => i + 1)
      .map(m => `<option value="${m}">${MONTHS[m]} · T${Math.ceil(m / 3)}</option>`).join('');

    previa();
    document.getElementById('modalEvento').classList.add('open');
    setTimeout(() => f.elements.name.focus(), 60);

    // A base de cidades só é baixada quando o formulário abre de fato.
    Cidades.carregar().catch(() => nota('Não foi possível carregar a lista de cidades.', 'err'));
  }

  function nota(txt, tipo) {
    const el = $('fCidadeNota');
    el.textContent = txt;
    el.className = 'campo-nota' + (tipo ? ' ' + tipo : '');
  }

  function fecharLista() {
    $('acLista').classList.remove('open');
    indiceSel = -1;
  }

  function renderLista() {
    const el = $('acLista');
    if (!sugestoes.length) {
      el.innerHTML = Cidades.pronto
        ? '<div class="ac-vazio">Nenhuma cidade encontrada. Se a sede ainda não está definida, marque a opção abaixo.</div>'
        : '<div class="ac-vazio">Carregando cidades…</div>';
      el.classList.add('open');
      return;
    }
    el.innerHTML = sugestoes.map((c, i) => `
      <button type="button" class="ac-item ${i === indiceSel ? 'sel' : ''}" data-ac="${i}">
        <span class="ac-cidade">${esc(c.nome)}</span>
        <span class="ac-pais">${esc(c.pais)} · ${esc(c.regiao)}</span>
      </button>`).join('');
    el.classList.add('open');
    el.querySelectorAll('[data-ac]').forEach(b =>
      b.onclick = () => escolher(sugestoes[Number(b.dataset.ac)]));
  }

  function escolher(c) {
    cidadeEscolhida = c;
    $('fCidade').value = c.nome;
    $('fSemSede').checked = false;
    nota(`${c.pais} · ${c.regiao} · ${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}`, 'ok');
    fecharLista();
  }

  function buscar() {
    const termo = $('fCidade').value;
    if (cidadeEscolhida && termo !== cidadeEscolhida.nome) { cidadeEscolhida = null; nota(''); }
    if (termo.trim().length < 2) { fecharLista(); return; }
    sugestoes = Cidades.buscar(termo);
    indiceSel = -1;
    renderLista();
  }

  const num = v => Number(String(v ?? '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0;

  function valores() {
    const d = Object.fromEntries(new FormData(form()).entries());
    return {
      name: (d.name || '').trim(),
      edition: (d.edition || '').trim(),
      category: d.category,
      monthNum: Number(d.monthNum),
      dateLabel: (d.dateLabel || '').trim(),
      url: (d.url || '').trim(),
      ticket: num(d.ticket), currency: d.currency,
      passagem: num(d.passagem), hotel: num(d.hotel), nights: num(d.nights),
      perDiem: num(d.perDiem), days: num(d.days), transfer: num(d.transfer),
      priority: d.priority, confidence: d.confidence,
      benefit: (d.benefit || '').trim(),
      audience: (d.audience || '').trim(),
      outcome: (d.outcome || '').trim(),
    };
  }

  function previa() {
    const v = valores();
    // BRL não passa por câmbio; as demais usam a taxa das Premissas.
    const taxa = v.currency === 'BRL' ? 1 : fxRate(v.currency);
    const total = v.passagem + v.ticket * taxa + v.hotel * v.nights
                + v.perDiem * v.days + v.transfer;
    $('fPreviaValor').innerHTML = brlBig(total);
  }

  async function salvar(e) {
    e.preventDefault();
    const v = valores();
    const btn = $('btnSalvarEvento');

    const falta = (campo, msg) => {
      const el = form().elements[campo];
      if (el) { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      toast(msg, true);
    };
    if (!v.name) return falta('name', 'Dê um nome ao evento.');
    if (!v.benefit) return falta('benefit', 'Descreva o benefício — é o que sustenta a decisão de gastar.');

    const semSede = $('fSemSede').checked;
    if (!semSede && !cidadeEscolhida) {
      nota('Escolha uma cidade na lista, ou marque "sede ainda não definida".', 'err');
      return toast('Escolha a cidade na lista.', true);
    }
    if (!v.passagem && !semSede) {
      return falta('passagem', 'Informe ao menos o custo da passagem.');
    }

    // Inscrição em BRL entra como valor já convertido, com câmbio 1.
    if (v.currency === 'BRL') { v.currency = 'USD'; v.ticket = v.ticket / (fxRate('USD') || 1); }

    Object.assign(v, semSede
      ? { city: 'Sede a confirmar', country: '—', region: '—', lat: null, lng: null,
          confidence: 'a_confirmar' }
      : { city: cidadeEscolhida.nome, country: cidadeEscolhida.pais,
          region: cidadeEscolhida.regiao, lat: cidadeEscolhida.lat, lng: cidadeEscolhida.lng });

    btn.disabled = true;
    btn.textContent = 'Adicionando…';
    try {
      const id = await Store.criarEvento(v);
      document.getElementById('modalEvento').classList.remove('open');
      toast(`"${v.name}" entrou no catálogo — visível para todo mundo.`);
      // Leva o usuário até o card recém-criado.
      ui.cat = 'all'; ui.priority = 'all'; ui.search = ''; ui.onlySelected = false;
      document.getElementById('searchInput').value = '';
      switchTab('catalogo');
      render();
      setTimeout(() => {
        const card = document.querySelector(`.event-card[data-id="${id}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('recem-criado');
          setTimeout(() => card.classList.remove('recem-criado'), 2400);
        }
      }, 120);
    } catch (err) {
      toast(err.message === 'offline'
        ? 'Sem conexão com o banco — o evento não pôde ser compartilhado.'
        : 'Não foi possível adicionar o evento.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Adicionar ao catálogo';
    }
  }

  function ligar() {
    const f = form();
    f.addEventListener('submit', salvar);
    f.addEventListener('input', previa);

    const inp = $('fCidade');
    inp.addEventListener('input', buscar);
    inp.addEventListener('focus', () => { if (inp.value.trim().length >= 2) buscar(); });
    inp.addEventListener('keydown', e => {
      const lista = $('acLista');
      if (!lista.classList.contains('open') || !sugestoes.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        indiceSel = (indiceSel + (e.key === 'ArrowDown' ? 1 : -1) + sugestoes.length) % sugestoes.length;
        renderLista();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        escolher(sugestoes[Math.max(0, indiceSel)]);
      } else if (e.key === 'Escape') {
        fecharLista();
      }
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.cidade-wrap')) fecharLista();
    });

    $('fSemSede').addEventListener('change', e => {
      if (e.target.checked) {
        cidadeEscolhida = null;
        inp.value = '';
        nota('O evento entra no orçamento e no calendário, mas não no mapa.');
        fecharLista();
      } else nota('');
    });
  }

  return { abrir, ligar };
})();

/* Remoção — só vale para eventos incluídos pela equipe. */
async function removerEventoPersonalizado(id) {
  const ev = Store.state.events.find(e => e.id === id);
  if (!ev) return;
  if (!confirm(`Remover "${ev.name}" do catálogo? Isso vale para todos que abrirem a página.`)) return;
  try {
    await Store.removerEvento(id);
    toast(`"${ev.name}" removido do catálogo.`);
  } catch (e) {
    toast('Não foi possível remover o evento.', true);
  }
}
