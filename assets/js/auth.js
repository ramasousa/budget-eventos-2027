/* ──────────────────────────────────────────────────────────────────────────
   Sessão — público lê, autenticado edita.

   Ler continua usando a chave publishable: o superintendente abre o link e vê
   tudo, sem senha. Escrever passa a exigir um token de sessão.

   As contas são criadas por um administrador no painel do Supabase, com o
   cadastro público desligado. Não há registro nem recuperação de senha aqui de
   propósito: são cinco pessoas, e cada porta a mais é superfície de ataque.

   O token vive no localStorage. É um alvo de XSS — mitigado por escaparmos
   todo texto renderizado — e o custo de perdê-lo é edição indevida num
   orçamento interno, não movimentação financeira.
   ────────────────────────────────────────────────────────────────────────── */

const Auth = (() => {
  const CHAVE = 'ev2027_sessao';
  const MARGEM_S = 90;                 // renova antes de expirar de fato

  let sessao = null;
  let ouvintes = [];

  /* Se config.js não carregou, `const SUPABASE` fica na zona morta e o próprio
     `typeof` lança. Sem isso um erro de rede no config derruba a página toda. */
  function cfg() {
    try { return typeof SUPABASE !== 'undefined' ? SUPABASE : null; }
    catch (e) { return null; }
  }
  const configurado = () => { const c = cfg(); return !!(c && c.url && c.key); };

  const avisar = () => ouvintes.forEach(fn => {
    try { fn(estado()); } catch (e) { console.error('[auth] ouvinte falhou:', e); }
  });

  function guardar(s) {
    sessao = s;
    try {
      if (s) localStorage.setItem(CHAVE, JSON.stringify(s));
      else localStorage.removeItem(CHAVE);
    } catch (e) { /* modo privado: a sessão vale só para esta aba */ }
    avisar();
  }

  function recuperar() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      sessao = bruto ? JSON.parse(bruto) : null;
    } catch (e) { sessao = null; }
    return sessao;
  }

  const expirado = s => !s || !s.expires_at || (s.expires_at - MARGEM_S) * 1000 < Date.now();

  async function chamar(caminho, corpo, cabecalhosExtra) {
    const c = cfg();
    if (!c) throw new Error('auth-nao-configurado');
    const res = await fetch(c.url + '/auth/v1/' + caminho, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: c.key,
        ...(cabecalhosExtra || {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    let dados = null;
    try { dados = await res.json(); } catch (e) { /* logout devolve corpo vazio */ }
    if (!res.ok) {
      const e = new Error((dados && (dados.error_description || dados.msg || dados.message))
        || 'HTTP ' + res.status);
      e.status = res.status;
      throw e;
    }
    return dados;
  }

  function normalizar(d) {
    if (!d || !d.access_token) throw new Error('resposta sem token');
    return {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      // expires_at nem sempre vem; derivamos de expires_in.
      expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
      email: (d.user && d.user.email) || null,
      id: (d.user && d.user.id) || null,
    };
  }

  /* ─── API ──────────────────────────────────────────────────────────────── */
  async function entrar(email, senha) {
    if (!configurado()) throw new Error('Supabase não configurado.');
    const d = await chamar('token?grant_type=password',
      { email: String(email || '').trim(), password: String(senha || '') });
    guardar(normalizar(d));
    return estado();
  }

  async function renovar() {
    if (!sessao || !sessao.refresh_token) return null;
    try {
      const d = await chamar('token?grant_type=refresh_token',
        { refresh_token: sessao.refresh_token });
      guardar(normalizar(d));
      return sessao;
    } catch (e) {
      // Refresh token inválido ou revogado: a sessão acabou de verdade.
      console.warn('[auth] sessão expirada:', e.message);
      guardar(null);
      return null;
    }
  }

  async function sair() {
    const atual = sessao;
    guardar(null);
    if (atual && configurado()) {
      try { await chamar('logout', null, { Authorization: 'Bearer ' + atual.access_token }); }
      catch (e) { /* já saímos localmente; o token expira sozinho */ }
    }
  }

  /* Token válido para uma escrita, renovando se estiver perto de expirar. */
  async function token() {
    if (!sessao) return null;
    if (expirado(sessao)) await renovar();
    return sessao ? sessao.access_token : null;
  }

  function estado() {
    return {
      autenticado: !!sessao && !!sessao.access_token,
      email: sessao ? sessao.email : null,
    };
  }

  const autenticado = () => estado().autenticado;
  const email = () => estado().email;

  async function iniciar() {
    recuperar();
    if (sessao && expirado(sessao)) await renovar();
    avisar();
    return estado();
  }

  return {
    iniciar, entrar, sair, renovar, token, estado, autenticado, email,
    onMudanca: fn => { ouvintes.push(fn); },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Auth };
