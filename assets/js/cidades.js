/* ──────────────────────────────────────────────────────────────────────────
   Autocomplete de cidades.

   Ninguém vai digitar latitude e longitude num formulário de orçamento, então
   a cidade é escolhida numa lista e traz coordenada, país e região junto.

   A base (3.7 mil cidades, ~197 KB) só é baixada quando o formulário abre —
   quem nunca adiciona um evento não paga por ela.

   Formato de cada linha: [nome, país, região, lat, lng, nomeOriginal?]
   ────────────────────────────────────────────────────────────────────────── */

const Cidades = (() => {
  let lista = null;
  let carregando = null;

  const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  async function carregar() {
    if (lista) return lista;
    if (carregando) return carregando;
    carregando = fetch('assets/vendor/cidades/cidades.json')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(dados => {
        lista = dados.map(c => ({
          nome: c[0], pais: c[1], regiao: c[2], lat: c[3], lng: c[4],
          busca: semAcento(c[0] + ' ' + (c[5] || '') + ' ' + c[1]),
        }));
        return lista;
      })
      .catch(e => { carregando = null; throw e; });
    return carregando;
  }

  /* Prioriza quem começa com o termo — "par" deve trazer Paris antes de
     Valparaíso. A base já vem ordenada por população, o que resolve o
     desempate entre homônimas. */
  function buscar(termo, limite = 8) {
    if (!lista) return [];
    const q = semAcento(termo.trim());
    if (q.length < 2) return [];
    const comeca = [], contem = [];
    for (const c of lista) {
      const i = c.busca.indexOf(q);
      if (i === 0) comeca.push(c);
      else if (i > 0) contem.push(c);
      if (comeca.length >= limite) break;
    }
    return comeca.concat(contem).slice(0, limite);
  }

  return { carregar, buscar, get pronto() { return !!lista; } };
})();
