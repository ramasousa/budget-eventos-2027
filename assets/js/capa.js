/* ──────────────────────────────────────────────────────────────────────────
   Capa: números ao vivo e o mundo em matriz de pontos.

   O fundo do hero não é foto de banco de imagens — é a própria geometria que
   o mapa da ferramenta usa, amostrada numa grade. As praças do plano ficam
   acesas. É bonito e é verdade.

   Tudo degrada: sem Supabase, mostra o catálogo embarcado e avisa; sem a
   geometria, o hero fica só com o gradiente e a tipografia, que já se
   sustentam sozinhos.
   ────────────────────────────────────────────────────────────────────────── */

const Capa = (() => {
  const brl = n => 'R$ ' + Math.round(n || 0).toLocaleString('pt-BR');
  const brlBig = n => '<span class="cur">R$</span> ' + Math.round(n || 0).toLocaleString('pt-BR');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, s1, s2) => `${n} ${n === 1 ? s1 : s2}`;

  const configurado = () =>
    typeof SUPABASE !== 'undefined' && SUPABASE.url && SUPABASE.key;

  async function rest(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(SUPABASE.url + '/rest/v1/' + path, {
        headers: { apikey: SUPABASE.key, Authorization: 'Bearer ' + SUPABASE.key },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    } finally { clearTimeout(timer); }
  }

  function daLinha(r) {
    return {
      id: r.id, name: r.name, category: r.category, monthNum: r.month_num,
      city: r.city, country: r.country, region: r.region, lat: r.lat, lng: r.lng,
      ticket: Number(r.ticket), currency: r.currency, passagem: Number(r.passagem),
      hotel: Number(r.hotel), nights: r.nights, perDiem: Number(r.per_diem),
      days: r.days, transfer: Number(r.transfer), priority: r.priority,
    };
  }

  /* ─── números ──────────────────────────────────────────────────────────── */
  async function carregar() {
    let eventos = typeof EVENTS_SEED !== 'undefined' ? EVENTS_SEED.slice() : [];
    let plan = {}, fx = Custo.FX_PADRAO, limite = 300000, autor = null, quando = null;
    let online = false;

    if (configurado()) {
      try {
        const [evRows, planRows, cfgRows] = await Promise.all([
          rest('eventos2027_events?select=*&active=is.true'),
          rest('eventos2027_plan?select=event_id,people,courtesy,updated_by,updated_at'),
          rest('eventos2027_settings?select=*&id=eq.1'),
        ]);
        if (Array.isArray(evRows) && evRows.length) eventos = evRows.map(daLinha);
        let maisRecente = 0;
        (planRows || []).forEach(r => {
          plan[r.event_id] = { people: r.people, courtesy: r.courtesy || 0 };
          const t = new Date(r.updated_at).getTime();
          if (t > maisRecente) { maisRecente = t; autor = r.updated_by; quando = r.updated_at; }
        });
        const cfg = (cfgRows || [])[0];
        if (cfg) { limite = Number(cfg.budget_limit) || limite; if (cfg.fx) fx = cfg.fx; }
        online = true;
      } catch (e) {
        console.warn('[capa] sem conexão com o banco:', e.message);
      }
    }
    return { eventos, plan, fx, limite, autor, quando, online };
  }

  function render(d) {
    const t = Custo.plano(d.eventos, d.plan, d.fx);
    const pct = d.limite > 0 ? (t.total / d.limite) * 100 : 0;
    const acima = d.limite > 0 && t.total > d.limite;

    const heroNum = document.getElementById('heroNumero');
    const heroSub = document.getElementById('heroSub');

    if (t.eventos === 0) {
      // Sem plano montado, o número seria zero e não diria nada.
      heroNum.innerHTML = `${d.eventos.length}<span class="hero-unidade">eventos mapeados</span>`;
      heroSub.textContent = 'O plano de 2027 ainda não foi montado. '
        + 'Abra o orçamento para escolher os eventos e ver o consolidado.';
      document.getElementById('heroBarra').style.display = 'none';
    } else {
      heroNum.innerHTML = brlBig(t.total);
      heroSub.innerHTML = `${plural(t.eventos, 'evento', 'eventos')} · `
        + `${plural(t.pessoas, 'participação', 'participações')} · `
        + `${plural(t.cidades.size, 'praça', 'praças')} em `
        + `${t.regioes.size === 1 ? '1 região' : t.regioes.size + ' regiões'}`;
      document.getElementById('heroBarraFill').style.width = Math.min(pct, 100).toFixed(1) + '%';
      document.getElementById('heroBarraFill').className = 'hero-barra-fill' + (acima ? ' over' : '');
      document.getElementById('heroBarraTxt').textContent = acima
        ? `${Math.round(pct)}% do limite de ${brl(d.limite)} — ${brl(t.total - d.limite)} acima`
        : `${Math.round(pct)}% do limite de ${brl(d.limite)} · ${brl(d.limite - t.total)} disponíveis`;
    }

    /* números de apoio */
    const cartoes = [
      ['Eventos no catálogo', d.eventos.length, 'candidatos avaliados'],
      ['Frentes temáticas', new Set(d.eventos.map(e => e.category)).size, 'de API Economy a IA & Dados'],
      ['No plano', t.eventos, t.eventos ? plural(t.pessoas, 'participação', 'participações') : 'nada selecionado ainda'],
      ['Economia com cortesias', t.economia > 0 ? brl(t.economia) : '—',
        t.cortesias ? plural(t.cortesias, 'ingresso garantido', 'ingressos garantidos') : 'nenhuma cortesia marcada'],
    ];
    document.getElementById('capaNumeros').innerHTML = cartoes.map(([k, v, s]) => `
      <div class="capa-num">
        <div class="capa-num-k">${esc(k)}</div>
        <div class="capa-num-v">${typeof v === 'number' ? v : esc(String(v))}</div>
        <div class="capa-num-s">${esc(s)}</div>
      </div>`).join('');

    /* rodapé de estado */
    const estado = document.getElementById('capaEstado');
    if (!d.online) {
      estado.innerHTML = '<span class="ponto err"></span> Sem conexão com o banco — '
        + 'os números acima vêm do catálogo embarcado.';
    } else if (d.quando) {
      const dt = new Date(d.quando);
      estado.innerHTML = `<span class="ponto live"></span> Atualizado em `
        + `${dt.toLocaleDateString('pt-BR')} às ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        + (d.autor && d.autor !== 'anônimo' ? ` por ${esc(d.autor)}` : '');
    } else {
      estado.innerHTML = '<span class="ponto live"></span> Conectado — plano ainda não montado.';
    }

    return { eventos: d.eventos, plan: d.plan };
  }

  /* ─── mundo em matriz de pontos ────────────────────────────────────────── */
  async function desenharMundo(eventos, plan) {
    const svg = document.getElementById('heroMundo');
    if (!svg) return;

    let mundo;
    try {
      const res = await fetch('assets/vendor/world/countries-110m.geo.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      mundo = await res.json();
    } catch (e) {
      console.warn('[capa] geometria indisponível — hero fica só com o gradiente');
      return;
    }

    const W = 1600, H = 800, PASSO = 9;
    const proj = (lng, lat) => [ (lng + 180) / 360 * W, (90 - lat) / 180 * H ];

    /* Um ponto do mundo cai em terra? Ray casting sobre os anéis externos. */
    const aneis = [];
    mundo.features.forEach(f => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polys.forEach(poly => aneis.push(poly[0].map(([lng, lat]) => proj(lng, lat))));
    });
    const caixas = aneis.map(r => {
      const xs = r.map(p => p[0]), ys = r.map(p => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    });
    function emTerra(x, y) {
      for (let i = 0; i < aneis.length; i++) {
        const b = caixas[i];
        if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
        const r = aneis[i];
        let dentro = false;
        for (let j = 0, k = r.length - 1; j < r.length; k = j++) {
          const [xj, yj] = r[j], [xk, yk] = r[k];
          if ((yj > y) !== (yk > y) && x < (xk - xj) * (y - yj) / (yk - yj) + xj) dentro = !dentro;
        }
        if (dentro) return true;
      }
      return false;
    }

    const pontos = [];
    // Abaixo de -60° é só Antártida; cortar limpa o visual e acelera.
    for (let y = PASSO; y < H * 0.84; y += PASSO) {
      for (let x = PASSO; x < W; x += PASSO) {
        if (emTerra(x, y)) pontos.push(`<circle cx="${x}" cy="${y}" r="1.5"/>`);
      }
    }

    /* Praças do plano: pulsam por cima da matriz. */
    const praças = new Map();
    (eventos || []).forEach(ev => {
      if (typeof ev.lat !== 'number' || typeof ev.lng !== 'number') return;
      if (!plan[ev.id]) return;
      const chave = ev.lat.toFixed(2) + ',' + ev.lng.toFixed(2);
      if (!praças.has(chave)) praças.set(chave, proj(ev.lng, ev.lat));
    });
    const acesas = [...praças.values()].map(([x, y], i) => `
      <g class="praca" style="animation-delay:${(i * 0.35).toFixed(2)}s">
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" class="praca-halo"/>
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" class="praca-nucleo"/>
      </g>`).join('');

    svg.setAttribute('viewBox', `0 0 ${W} ${H * 0.86}`);
    svg.innerHTML = `<g class="matriz">${pontos.join('')}</g>${acesas}`;
  }

  async function iniciar() {
    const dados = await carregar();
    const { eventos, plan } = render(dados);
    desenharMundo(eventos, plan);
  }

  return { iniciar };
})();
