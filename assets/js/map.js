/* ──────────────────────────────────────────────────────────────────────────
   Mapa de calor dos eventos.

   Dois modos de leitura:
     · MERCADO  — onde o ecossistema acontece. Calor por densidade e relevância
                  de todos os eventos do catálogo, selecionados ou não.
     · PLANO    — onde nós vamos. Calor ponderado pelo investimento efetivo,
                  ou seja, pelo dinheiro que sai do orçamento por praça.

   Eventos são agregados por cidade: Las Vegas com quatro eventos vira um
   único ponto quente, que é como o orçamento realmente enxerga a praça.

   Degrada com elegância: sem Leaflet o painel avisa e o resto do app segue
   funcionando normalmente.
   ────────────────────────────────────────────────────────────────────────── */

const EventMap = (() => {
  let map = null;
  let heat = null;
  let markerLayer = null;
  let mode = 'plano';
  let booted = false;
  let failed = false;
  let motivo = 'lib';          // 'lib' | 'tiles'
  let pendente = false;        // redesenho adiado por aba oculta
  let tilesOk = false;
  let tileErros = 0;

  const PESO_PRIORIDADE = { alta: 1.0, media: 0.62, baixa: 0.34 };

  function available() {
    return typeof L !== 'undefined' && typeof L.map === 'function';
  }

  /* ─── agregação por cidade ───────────────────────────────────────────── */
  function cities() {
    const map_ = new Map();
    Store.state.events.forEach(ev => {
      if (typeof ev.lat !== 'number' || typeof ev.lng !== 'number') return;
      const key = ev.lat.toFixed(3) + ',' + ev.lng.toFixed(3);
      if (!map_.has(key)) {
        map_.set(key, {
          key, city: ev.city, country: ev.country, region: ev.region,
          lat: ev.lat, lng: ev.lng, events: [],
          investimento: 0, selecionados: 0, peso: 0, people: 0,
        });
      }
      const c = map_.get(key);
      c.events.push(ev);
      c.peso += PESO_PRIORIDADE[ev.priority] || 0.5;
      const sel = Store.state.plan[ev.id];
      if (sel) {
        c.selecionados += 1;
        c.people += sel.people;
        c.investimento += costOf(ev, sel.people).total;
      }
    });
    return [...map_.values()];
  }

  /* ─── construção ─────────────────────────────────────────────────────── */
  function degradar(porque) {
    if (failed) return;
    failed = true;
    motivo = porque;
    if (map) { map.remove(); map = null; booted = false; }
    document.getElementById('mapFallback').classList.add('show');
    document.querySelectorAll('.map-overlay').forEach(o => o.style.display = 'none');
    renderFallback();
  }

  function ensure() {
    if (failed) { renderFallback(); return; }
    if (booted) {
      if (map) map.invalidateSize();
      refresh();
      return;
    }
    if (!available()) { degradar('lib'); return; }
    booted = true;

    map = L.map('map', {
      worldCopyJump: true,
      minZoom: 1.4,
      maxZoom: 8,
      zoomControl: false,      // reposicionado abaixo: no topo colide com o
      attributionControl: true, // painel "Leitura do mapa"
      scrollWheelZoom: true,
    }).setView([28, -15], 2.2);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 18,
    });
    tiles.on('tileload', () => { tilesOk = true; });
    tiles.on('tileerror', () => {
      tileErros += 1;
      // Marcadores sobre um fundo vazio não dizem nada a quem lê. Se o
      // servidor de tiles não responder, o modo autônomo informa mais.
      if (!tilesOk && tileErros >= 4) degradar('tiles');
    });
    tiles.addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    // O mapa nasce escondido dentro da aba; precisa remedir ao aparecer.
    // A falha de tiles pode derrubar o mapa antes deste timer disparar.
    setTimeout(() => { if (map) map.invalidateSize(); }, 60);
    refresh();
  }

  /* ─── desenho ────────────────────────────────────────────────────────── */
  function visivel() {
    const el = document.getElementById('map');
    return !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
  }

  function refresh() {
    if (failed) { renderFallback(); return; }
    if (!booted || !map) return;
    // Aba oculta: o contêiner tem tamanho zero e a camada de calor quebra ao
    // redesenhar. Adiamos para quando a aba voltar a aparecer.
    if (!visivel()) { pendente = true; return; }
    pendente = false;
    const list = cities();

    const valorDe = c => mode === 'plano' ? c.investimento : c.peso;
    const maxVal = Math.max(...list.map(valorDe), 1);

    /* camada de calor */
    if (heat) { map.removeLayer(heat); heat = null; }
    const pontos = list
      .filter(c => valorDe(c) > 0)
      .map(c => [c.lat, c.lng, Math.max(0.12, valorDe(c) / maxVal)]);

    if (typeof L.heatLayer === 'function' && pontos.length) {
      heat = L.heatLayer(pontos, {
        radius: 46, blur: 34, maxZoom: 6, minOpacity: 0.28,
        gradient: { 0.0: '#1a4a8a', 0.3: '#2d6a4f', 0.55: '#b8973a', 0.78: '#c0392b', 1.0: '#ff3b30' },
      }).addTo(map);
    }

    /* marcadores por cidade */
    markerLayer.clearLayers();
    list.forEach(c => {
      const v = valorDe(c);
      const ratio = maxVal > 0 ? v / maxVal : 0;
      const ativo = c.selecionados > 0;
      const r = 5 + Math.sqrt(Math.max(ratio, 0)) * 17;

      const cor = ativo ? '#ff3b30' : 'rgba(255,255,255,0.42)';
      const marker = L.circleMarker([c.lat, c.lng], {
        radius: mode === 'plano' && !ativo ? 4.5 : r,
        color: cor,
        weight: ativo ? 2 : 1,
        opacity: ativo ? 0.95 : 0.5,
        fillColor: ativo ? '#ff3b30' : '#8fa3b8',
        fillOpacity: ativo ? 0.28 : 0.14,
      });

      marker.bindTooltip(
        `<b>${esc(c.city)}</b> · ${c.events.length} evento${c.events.length > 1 ? 's' : ''}` +
        (c.investimento ? `<br>${brl(c.investimento)} alocados` : ''),
        { direction: 'top', offset: [0, -4], className: 'evt-tip' }
      );

      marker.bindPopup(() => {
        const items = c.events.map(ev => {
          const on = !!Store.state.plan[ev.id];
          const people = on ? Store.state.plan[ev.id].people : 1;
          const cat = CATEGORIES[ev.category] || {};
          return `<div style="margin-bottom:0.5rem">
            <div style="font-size:0.7rem;font-weight:600;color:${cat.color || '#666'}">${esc(cat.label || '')}</div>
            <div style="font-size:0.8rem;font-weight:600;margin-bottom:0.15rem">${esc(ev.name)}</div>
            <div class="p-meta">${MONTHS[ev.monthNum]}/2027 · ${brl(costOf(ev, people).total)}${on ? ` · ${people}p` : '/pessoa'}</div>
            <button class="${on ? 'on' : ''}" data-map-toggle="${esc(ev.id)}">${on ? '✓ No orçamento — remover' : 'Adicionar ao orçamento'}</button>
          </div>`;
        }).join('<hr style="border:none;border-top:1px solid #eee;margin:0.6rem 0">');

        return `<div class="evt-popup">
          <h4>${esc(c.city)}</h4>
          <div class="p-meta">${esc(c.country || '')} · ${esc(c.region || '')}</div>
          ${c.investimento ? `<div class="p-cost">${brl(c.investimento)} · ${c.people} participaç${c.people > 1 ? 'ões' : 'ão'}</div>` : ''}
          ${items}</div>`;
      }, { maxWidth: 280, minWidth: 230 });

      markerLayer.addLayer(marker);
    });

    renderRanking(list, valorDe);
  }

  /* ─── ranking lateral ────────────────────────────────────────────────── */
  function renderRanking(list, valorDe) {
    const host = document.getElementById('mapRanking');
    if (!host) return;
    const ordenado = [...list].sort((a, b) => valorDe(b) - valorDe(a)).slice(0, 8);

    host.innerHTML = ordenado.map((c, i) => `
      <div class="rank-row">
        <span class="rank-i">${i + 1}</span>
        <span class="rank-city">${esc(c.city)}</span>
        <span class="rank-v ${c.investimento ? '' : 'dim'}">${
          mode === 'plano'
            ? (c.investimento ? brlShort(c.investimento) : '—')
            : c.events.length + ' ev'
        }</span>
      </div>`).join('');

    const t = totals();
    const praças = list.filter(c => c.selecionados > 0).length;
    const regioes = new Set(list.filter(c => c.selecionados > 0).map(c => c.region)).size;
    const resumo = document.getElementById('mapResumo');
    if (resumo) {
      resumo.innerHTML = t.events
        ? `<b>${brl(t.total)}</b> distribuídos em <b>${praças}</b> praça${praças > 1 ? 's' : ''} e <b>${regioes}</b> ${regioes > 1 ? 'regiões' : 'região'}. Clique num ponto para incluir ou remover eventos do orçamento.`
        : 'Nenhum evento no orçamento ainda. No modo <b>Mercado</b> o calor mostra onde o ecossistema se concentra; clique num ponto para começar a montar o plano.';
    }
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('[data-mapmode]').forEach(b =>
      b.classList.toggle('active', b.dataset.mapmode === m));
    refresh();
  }

  /* ─── fallback sem dependência externa ───────────────────────────────────
     Redes corporativas costumam bloquear CDN e servidor de tiles. Quando isso
     acontece, entregamos a mesma leitura — concentração por região e praça,
     com intensidade proporcional — em HTML puro, e seguimos permitindo
     selecionar eventos. Nada de tela de erro.
     ─────────────────────────────────────────────────────────────────────── */
  function heatColor(ratio) {
    const stops = [
      [0.00, [26, 74, 138]], [0.30, [45, 106, 79]], [0.55, [184, 151, 58]],
      [0.78, [192, 57, 43]], [1.00, [255, 59, 48]],
    ];
    const r = Math.max(0, Math.min(1, ratio));
    for (let i = 1; i < stops.length; i++) {
      if (r <= stops[i][0]) {
        const [p0, c0] = stops[i - 1], [p1, c1] = stops[i];
        const t = (r - p0) / (p1 - p0 || 1);
        const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * t));
        return `rgb(${c[0]},${c[1]},${c[2]})`;
      }
    }
    return 'rgb(255,59,48)';
  }

  function renderFallback() {
    const host = document.getElementById('mapFallback');
    if (!host) return;

    const list = cities();
    const valorDe = c => mode === 'plano' ? c.investimento : c.peso;
    const maxVal = Math.max(...list.map(valorDe), 1);
    const t = totals();

    const regioes = {};
    list.forEach(c => (regioes[c.region || '—'] = regioes[c.region || '—'] || []).push(c));

    const blocos = Object.entries(regioes)
      .map(([reg, cs]) => [reg, cs, cs.reduce((s, c) => s + valorDe(c), 0)])
      .sort((a, b) => b[2] - a[2])
      .map(([reg, cs]) => {
        const linhas = cs.sort((a, b) => valorDe(b) - valorDe(a)).map(c => {
          const ratio = valorDe(c) / maxVal;
          const on = c.selecionados > 0;
          return `
          <button class="fb-city ${on ? 'on' : ''}" data-fbcity="${esc(c.key)}">
            <span class="fb-swatch" style="background:${valorDe(c) > 0 ? heatColor(ratio) : 'rgba(255,255,255,0.09)'};
                  box-shadow:0 0 ${Math.round(ratio * 16)}px ${heatColor(ratio)}"></span>
            <span class="fb-city-name">${esc(c.city)}</span>
            <span class="fb-city-n">${mode === 'plano' ? `${c.events.length} ev` : ''}</span>
            <span class="fb-city-v">${mode === 'plano'
              ? (c.investimento ? brlShort(c.investimento) : '—')
              : `${c.events.length} ev`}</span>
          </button>`;
        }).join('');
        return `<div class="fb-region"><div class="fb-region-h">${esc(reg)}</div>${linhas}</div>`;
      }).join('');

    host.innerHTML = `
      <div class="fb-wrap">
        <div class="fb-head">
          <div class="fb-title">Concentração geográfica</div>
          <div class="fb-sub">${motivo === 'tiles'
            ? 'O servidor de mapas (CARTO) não respondeu — provavelmente bloqueado por esta rede. Sobre um fundo vazio os pontos não diriam nada, então abaixo vai a mesma leitura em modo autônomo.'
            : 'A biblioteca de mapas não pôde ser carregada. Abaixo, a mesma leitura em modo autônomo.'}
            Clique numa praça para ver e selecionar os eventos dela.</div>
        </div>
        <div class="fb-modes">
          <button class="map-mode ${mode === 'plano' ? 'active' : ''}" data-mapmode="plano">Nosso plano</button>
          <button class="map-mode ${mode === 'mercado' ? 'active' : ''}" data-mapmode="mercado">Mercado</button>
          <span class="fb-legend"><span class="legend-t">baixo</span><span class="legend-grad"></span><span class="legend-t">alto</span></span>
        </div>
        <div class="fb-summary">${(() => {
          if (!t.events) return 'Nenhum evento no orçamento ainda — o modo <b>Mercado</b> mostra onde o ecossistema se concentra.';
          const n = list.filter(c => c.selecionados).length;
          return `<b>${brl(t.total)}</b> distribuídos em <b>${n}</b> praça${n > 1 ? 's' : ''}`;
        })()}</div>
        <div class="fb-grid">${blocos}</div>
        <div class="fb-detail" id="fbDetail"></div>
      </div>`;

    host.querySelectorAll('[data-mapmode]').forEach(b =>
      b.onclick = () => setMode(b.dataset.mapmode));

    host.querySelectorAll('[data-fbcity]').forEach(b => b.onclick = () => {
      const c = list.find(x => x.key === b.dataset.fbcity);
      if (!c) return;
      const det = document.getElementById('fbDetail');
      det.innerHTML = `<div class="fb-detail-h">${esc(c.city)}, ${esc(c.country || '')}</div>` +
        c.events.map(ev => {
          const on = !!Store.state.plan[ev.id];
          const people = on ? Store.state.plan[ev.id].people : 1;
          const cat = CATEGORIES[ev.category] || {};
          return `<div class="fb-ev">
            <span class="legend-swatch" style="background:${cat.color || '#888'}"></span>
            <span class="fb-ev-name">${esc(ev.name)}<span class="fb-ev-sub">${MONTHS[ev.monthNum]}/2027 · ${brl(costOf(ev, people).total)}${on ? ` · ${people}p` : '/pessoa'}</span></span>
            <button class="fb-ev-btn ${on ? 'on' : ''}" data-map-toggle="${esc(ev.id)}">${on ? 'Remover' : 'Adicionar'}</button>
          </div>`;
        }).join('');
    });
  }

  /* Delegação: os popups são recriados a cada abertura. */
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-map-toggle]');
    if (!btn) return;
    Store.toggle(btn.dataset.mapToggle);
    if (map) map.closePopup();
  });

  return { ensure, refresh, setMode, renderFallback, degradar,
           get mode() { return mode; }, get degradado() { return failed; } };
})();
