/* ──────────────────────────────────────────────────────────────────────────
   Cálculo de custo — fonte única.

   Usado pela ferramenta e pela landing page. Fica separado de propósito: se a
   fórmula viver em dois lugares, um dia as duas telas mostram números
   diferentes e ninguém percebe até a reunião.

   Modelo, por pessoa:
     passagem + inscrição + (hotel × noites) + (diária × dias) + traslado

   Ingressos de cortesia obtidos com fornecedores zeram a inscrição das
   pessoas cobertas; as demais rubricas continuam valendo.
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

  return { evento, plano, taxa, FX_PADRAO };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Custo };
