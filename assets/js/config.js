/* ──────────────────────────────────────────────────────────────────────────
   Conexão com o Supabase.

   A chave abaixo é a PUBLISHABLE (anon) key — ela é feita para ficar no
   front-end e está protegida por Row Level Security. Não é a service_role
   key; essa nunca deve entrar neste repositório.

   Modelo de acesso vigente: leitura e escrita liberadas para quem tem o link.
   Para restringir depois, basta trocar as policies em supabase/schema.sql.
   ────────────────────────────────────────────────────────────────────────── */

const SUPABASE = {
  url: 'https://gqrhwsynpmuqqzieestc.supabase.co',
  key: 'sb_publishable_kizxNUC-OjhU6BTlvR6Qaw_W7f2QKx9',
  prefix: 'eventos2027_',
};

if (typeof module !== 'undefined' && module.exports) module.exports = { SUPABASE };
