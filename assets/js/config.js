/* ──────────────────────────────────────────────────────────────────────────
   Conexão com o Supabase.

   A chave abaixo é a PUBLISHABLE (anon) key — ela é feita para ficar no
   front-end e está protegida por Row Level Security. Não é a service_role
   key; essa nunca deve entrar neste repositório.

   Modelo de acesso: leitura pública, escrita só para quem entra com conta.
   O portão real é a RLS — ver supabase/migracoes/01-fechar-escrita.sql.

   Se este arquivo não carregar, as páginas caem em modo local em vez de
   quebrar: o `const SUPABASE` fica na zona morta e nem `typeof` pode ler,
   então store.js, auth.js e capa.js acessam a config por dentro de um
   try/catch.
   ────────────────────────────────────────────────────────────────────────── */

const SUPABASE = {
  url: 'https://gqrhwsynpmuqqzieestc.supabase.co',
  key: 'sb_publishable_kizxNUC-OjhU6BTlvR6Qaw_W7f2QKx9',
  prefix: 'eventos2027_',
};

if (typeof module !== 'undefined' && module.exports) module.exports = { SUPABASE };
