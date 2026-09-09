/* ──────────────────────────────────────────────────────────────────────────
   Cálculo de custo — fonte única.

   Usado pela ferramenta e pela landing page. Fica separado de propósito: se a
   fórmula viver em dois lugares, um dia as duas telas mostram números
   diferentes e ninguém percebe até a reunião.

   Modelo, por pessoa:
     passagem + inscrição + (hotel × noites) + (diária × dias) + traslado

   Ingressos de cortesia obtidos com fornecedores zeram a inscrição das
   pessoas cobertas; as demais rubricas continuam valendo.

   VIAGENS NACIONAIS seguem outro modelo, de propósito. Evento internacional
   é decisão caso a caso: escolhe-se o evento, o número de participantes, e
   cada rubrica tem valor próprio. Visita a polo é rotina: o que se decide é
   a POLÍTICA — quantas vezes por ano cada cargo vai a cada escritório — e o
   custo é um valor fechado por viagem, em real, sem câmbio nem inscrição.

     total = Σ_polo Σ_cargo (pessoas × viagens/ano no polo) × custo do polo

   Modelar isso como 30 linhas de "pessoa × destino" seria copiar a planilha
   junto com o problema dela: cada admissão ou promoção viraria retrabalho
   manual, e o número deixaria de ter regra visível.
   ────────────────────────────────────────────────────────────────────────── */

const Custo = (() => {
  const FX_PADRAO = { USD: 6.20, EUR: 6.70, GBP: 7.90 };

  function taxa(fx, moeda) {
    const r = (fx || {})[moeda];
    return typeof r === 'number' && r > 0 ? r : (FX_PADRAO[moeda] || 6.20);
  }

  function evento(ev, people = 1, courtesy = 0, fx = FX_PADRAO) {
    const p = Math.max(1, people);
    const cort = Math.max(0, Math.min(p, courtesy || 0));
    const unit = ev.ticket * taxa(fx, ev.currency);

    const inscricoes = unit * (p - cort);
    const economia   = unit * cort;
    const passagens  = ev.passagem * p;
    const hospedagem = ev.hotel * ev.nights * p;
    const perdiem    = ev.perDiem * ev.days * p;
    const traslado   = ev.transfer * p;

    return {
      inscricoes, economia, passagens, hospedagem, perdiem, traslado,
      inscricoesCheias: unit * p,
      total: inscricoes + passagens + hospedagem + perdiem + traslado,
    };
  }

  /* Soma um plano inteiro. `plano` é { [eventId]: { people, courtesy } }. */
  function plano(eventos, plan, fx = FX_PADRAO) {
    const acc = {
      total: 0, inscricoes: 0, economia: 0, passagens: 0, hospedagem: 0,
      perdiem: 0, traslado: 0, eventos: 0, pessoas: 0, cortesias: 0,
      cidades: new Set(), regioes: new Set(),
    };
    (eventos || []).forEach(ev => {
      const sel = (plan || {})[ev.id];
      if (!sel) return;
      const c = evento(ev, sel.people, sel.courtesy || 0, fx);
      acc.total += c.total; acc.inscricoes += c.inscricoes; acc.economia += c.economia;
      acc.passagens += c.passagens; acc.hospedagem += c.hospedagem;
      acc.perdiem += c.perdiem; acc.traslado += c.traslado;
      acc.eventos += 1; acc.pessoas += sel.people; acc.cortesias += (sel.courtesy || 0);
      if (ev.city) acc.cidades.add(ev.city);
      if (ev.region && ev.region !== '—') acc.regioes.add(ev.region);
    });
    return acc;
  }

  /* ─── viagens nacionais ────────────────────────────────────────────────
     Configuração vinda do banco. Tudo aqui é editável na página: os polos,
     o custo de cada um, os cargos, quantas pessoas há em cada cargo e a
     cadência de visita cargo a cargo, polo a polo.
     ─────────────────────────────────────────────────────────────────────── */
  /* Espelho da semente que vive em supabase/migracoes/02-viagens-nacionais.sql.
     A configuração de verdade é a do banco: o cliente NÃO semeia isto sozinho
     quando está offline, porque seria mostrar dinheiro que talvez não exista.
     Serve de documentação e de referência para a bateria de testes. */
  const NACIONAL_PADRAO = {
    polos: [
      { id: 'recife',   nome: 'Recife',   uf: 'PE', lat:  -8.0476, lng: -34.8770, custo: 2000 },
      { id: 'curitiba', nome: 'Curitiba', uf: 'PR', lat: -25.4284, lng: -49.2733, custo: 2000 },
    ],
    cargos: [
      { id: 'gerente-senior', nome: 'Gerente Sênior', pessoas: 1, viagens: { recife: 4, curitiba: 4 } },
      { id: 'gerente',        nome: 'Gerente',        pessoas: 2, viagens: { recife: 2, curitiba: 2 } },
    ],
  };

  const num = (v, min, max) => {
    const n = Number(v);
    if (!isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  };

  /* O que vem do banco é jsonb: pode estar ausente, truncado ou com lixo.
     Uma tela de orçamento não pode ficar em branco por causa disso. */
  function normalizarNacional(cfg) {
    const bruto = cfg && typeof cfg === 'object' ? cfg : {};
    const polos = (Array.isArray(bruto.polos) ? bruto.polos : [])
      .filter(p => p && p.id)
      .map(p => ({
        id: String(p.id),
        nome: String(p.nome || p.id),
        uf: p.uf ? String(p.uf) : '',
        lat: typeof p.lat === 'number' ? p.lat : null,
        lng: typeof p.lng === 'number' ? p.lng : null,
        custo: num(p.custo, 0, 1e7),
      }));
    const cargos = (Array.isArray(bruto.cargos) ? bruto.cargos : [])
      .filter(c => c && c.id)
      .map(c => {
        const viagens = {};
        polos.forEach(p => {
          viagens[p.id] = num((c.viagens || {})[p.id], 0, 52) | 0;
        });
        return {
          id: String(c.id),
          nome: String(c.nome || c.id),
          pessoas: num(c.pessoas, 0, 999) | 0,
          viagens,
        };
      });
    return { polos, cargos };
  }

  function nacional(cfg) {
    const c = normalizarNacional(cfg);

    const polos = c.polos.map(p => {
      const viagens = c.cargos.reduce((a, g) => a + g.pessoas * (g.viagens[p.id] || 0), 0);
      return { ...p, viagens, total: viagens * p.custo };
    });

    /* `viagens` num cargo é o MAPA por polo — a política em si. O total de
       deslocamentos vai em `viagensTotal`, separado: sobrescrever o mapa com
       o número fazia a matriz mostrar cadência zero em toda célula enquanto
       o rodapé somava certo. */
    const cargos = c.cargos.map(g => {
      let viagensTotal = 0, total = 0;
      c.polos.forEach(p => {
        const v = g.pessoas * (g.viagens[p.id] || 0);
        viagensTotal += v;
        total += v * p.custo;
      });
      return { ...g, viagensTotal, total };
    });

    return {
      polos, cargos,
      viagens: polos.reduce((a, p) => a + p.viagens, 0),
      pessoas: cargos.reduce((a, g) => a + g.pessoas, 0),
      total: polos.reduce((a, p) => a + p.total, 0),
      config: c,
    };
  }

  /* ─── o número que vale ────────────────────────────────────────────────
     Depois que a viagem nacional entrou, "o total" ficou ambíguo. Quem
     precisa do número do orçamento chama isto, não `plano().total`. */
  function geral(eventos, plan, fx, cfgNacional) {
    const i = plano(eventos, plan, fx);
    const n = nacional(cfgNacional);
    return { internacional: i, nacional: n, total: i.total + n.total };
  }

  return { evento, plano, nacional, normalizarNacional, geral, taxa,
           FX_PADRAO, NACIONAL_PADRAO };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Custo };
