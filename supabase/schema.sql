-- ═══════════════════════════════════════════════════════════════════════════
-- Budget Eventos Internacionais 2027
-- Open Platform & BaaS — BU AI First | Banco Bradesco
--
-- Projeto Supabase: mcp-bradesco-plano (sa-east-1)
-- Tabelas com prefixo eventos2027_ para não colidir com as tabelas do BaaS
-- Registry que já existem no mesmo projeto.
--
-- Modelo de acesso escolhido: qualquer pessoa com o link lê e edita.
-- Não há dado sensível — apenas estimativas de custo de eventos públicos.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Catálogo de eventos ───────────────────────────────────────────────────
create table if not exists eventos2027_events (
  id            text primary key,
  name          text not null,
  edition       text,
  category      text not null,
  month_num     int  not null check (month_num between 1 and 12),
  date_label    text,
  city          text,
  country       text,
  region        text,
  lat           double precision,
  lng           double precision,
  ticket        numeric not null default 0,
  currency      text    not null default 'USD',
  passagem      numeric not null default 0,
  hotel         numeric not null default 0,
  nights        int     not null default 0,
  per_diem      numeric not null default 0,
  days          int     not null default 0,
  transfer      numeric not null default 0,
  priority      text default 'media',
  confidence    text default 'estimado',
  url           text,
  benefit       text,
  audience      text,
  outcome       text,
  active        boolean not null default true,
  updated_at    timestamptz not null default now()
);
comment on table eventos2027_events is
  'Catálogo de eventos internacionais candidatos ao orçamento 2027. Custos por pessoa; passagem/hotel em BRL, inscrição na moeda de origem.';

-- ─── Plano vigente (estado compartilhado — todos veem o mesmo) ─────────────
create table if not exists eventos2027_plan (
  event_id    text primary key references eventos2027_events(id) on delete cascade,
  people      int  not null default 1 check (people between 1 and 50),
  note        text,
  updated_by  text,
  updated_at  timestamptz not null default now()
);
comment on table eventos2027_plan is
  'Seleção viva e compartilhada. Uma linha por evento selecionado. É o que o superintendente e os pares enxergam ao abrir a página.';

-- ─── Parâmetros do orçamento (linha única) ─────────────────────────────────
create table if not exists eventos2027_settings (
  id            int primary key default 1,
  budget_limit  numeric not null default 300000,
  fx            jsonb   not null default '{"USD":6.20,"EUR":6.70,"GBP":7.90}'::jsonb,
  updated_by    text,
  updated_at    timestamptz not null default now(),
  constraint eventos2027_settings_singleton check (id = 1)
);

-- ─── Cenários salvos (snapshots nomeados para comparação) ──────────────────
create table if not exists eventos2027_scenarios (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  author        text,
  selections    jsonb not null,
  budget_limit  numeric,
  fx            jsonb,
  total         numeric,
  created_at    timestamptz not null default now()
);
create index if not exists eventos2027_scenarios_created_idx
  on eventos2027_scenarios (created_at desc);

-- ─── RLS: leitura e escrita abertas para anon (modelo escolhido) ───────────
alter table eventos2027_events    enable row level security;
alter table eventos2027_plan      enable row level security;
alter table eventos2027_settings  enable row level security;
alter table eventos2027_scenarios enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'eventos2027_events','eventos2027_plan',
    'eventos2027_settings','eventos2027_scenarios'
  ] loop
    execute format('drop policy if exists "anon read" on %I', t);
    execute format('drop policy if exists "anon write" on %I', t);
    execute format('create policy "anon read"  on %I for select using (true)', t);
    execute format('create policy "anon write" on %I for all using (true) with check (true)', t);
  end loop;
end $$;

-- ─── Parâmetros iniciais ───────────────────────────────────────────────────
insert into eventos2027_settings (id, budget_limit, updated_by)
values (1, 300000, 'setup')
on conflict (id) do nothing;
