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
  -- true = evento incluído pela equipe pela própria página. A flag separa o
  -- catálogo curado, que ninguém deve apagar por engano, do que o time inclui.
  custom        boolean not null default false,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists eventos2027_events_custom_idx on eventos2027_events (custom);

-- Migração para bases criadas antes destas colunas existirem.
alter table eventos2027_events add column if not exists custom boolean not null default false;
alter table eventos2027_events add column if not exists created_by text;
alter table eventos2027_events add column if not exists created_at timestamptz not null default now();
comment on table eventos2027_events is
  'Catálogo de eventos internacionais candidatos ao orçamento 2027. Custos por pessoa; passagem/hotel em BRL, inscrição na moeda de origem.';

-- ─── Plano vigente (estado compartilhado — todos veem o mesmo) ─────────────
create table if not exists eventos2027_plan (
  event_id      text primary key references eventos2027_events(id) on delete cascade,
  people        int  not null default 1 check (people between 1 and 50),
  -- Ingressos obtidos com fornecedores. Guardamos a QUANTIDADE e não um
  -- booleano: conseguir 2 passes para uma equipe de 4 é o caso comum, e um
  -- sim/não subestimaria o orçamento.
  courtesy      int  not null default 0,
  courtesy_note text,
  note          text,
  updated_by    text,
  updated_at    timestamptz not null default now(),
  constraint eventos2027_plan_courtesy_ck check (courtesy >= 0 and courtesy <= people)
);
comment on table eventos2027_plan is
  'Seleção viva e compartilhada. Uma linha por evento selecionado. É o que o superintendente e os pares enxergam ao abrir a página.';
comment on column eventos2027_plan.courtesy is
  'Quantos participantes já têm ingresso garantido via fornecedor. A inscrição só é cobrada de (people - courtesy).';

-- Migração para bases criadas antes da coluna existir.
alter table eventos2027_plan add column if not exists courtesy int not null default 0;
alter table eventos2027_plan add column if not exists courtesy_note text;

-- ─── Parâmetros do orçamento (linha única) ─────────────────────────────────
create table if not exists eventos2027_settings (
  id            int primary key default 1,
  budget_limit  numeric not null default 300000,
  fx            jsonb   not null default '{"USD":6.20,"EUR":6.70,"GBP":7.90}'::jsonb,
  -- Política de visita aos polos nacionais. Mora aqui, e não em tabelas
  -- próprias, porque é configuração singleton de meia dúzia de linhas: assim
  -- herda leitura, escrita, espelho local e RLS que já existem.
  nacional      jsonb   not null default '{"polos":[],"cargos":[]}'::jsonb,
  updated_by    text,
  updated_at    timestamptz not null default now(),
  constraint eventos2027_settings_singleton check (id = 1)
);
alter table eventos2027_settings
  add column if not exists nacional jsonb not null default '{"polos":[],"cargos":[]}'::jsonb;

-- ─── Cenários salvos (snapshots nomeados para comparação) ──────────────────
create table if not exists eventos2027_scenarios (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  author        text,
  selections    jsonb not null,
  budget_limit  numeric,
  fx            jsonb,
  nacional      jsonb,
  total         numeric,
  created_at    timestamptz not null default now()
);
create index if not exists eventos2027_scenarios_created_idx
  on eventos2027_scenarios (created_at desc);
alter table eventos2027_scenarios add column if not exists nacional jsonb;

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

-- Polos nacionais: Recife e Curitiba, cadência por cargo. Só semeia se ainda
-- estiver vazio — reaplicar o schema não desfaz o que a equipe ajustou.
update eventos2027_settings
   set nacional = jsonb_build_object(
     'polos', jsonb_build_array(
       jsonb_build_object('id','recife','nome','Recife','uf','PE',
                          'lat',-8.0476,'lng',-34.8770,'custo',2000),
       jsonb_build_object('id','curitiba','nome','Curitiba','uf','PR',
                          'lat',-25.4284,'lng',-49.2733,'custo',2000)
     ),
     'cargos', jsonb_build_array(
       jsonb_build_object('id','gerente-senior','nome','Gerente Sênior','pessoas',1,
                          'viagens', jsonb_build_object('recife',4,'curitiba',4)),
       jsonb_build_object('id','gerente','nome','Gerente','pessoas',2,
                          'viagens', jsonb_build_object('recife',2,'curitiba',2))
     )
   )
 where id = 1
   and coalesce(jsonb_array_length(nacional -> 'polos'), 0) = 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- REDE DE SEGURANÇA CONTRA APAGAMENTO
--
-- A chave publishable está num repositório público e a policy de escrita é
-- aberta: qualquer pessoa com o link pode apagar o plano inteiro com uma
-- chamada. Não dá para impedir pela RLS sem quebrar a desseleção de um evento
-- (que também é DELETE). A defesa é garantir recuperação.
--
-- O snapshot é tirado por TRIGGER no banco, não pelo cliente — um atacante não
-- usa o nosso JavaScript. E a tabela é somente-leitura para anon, então a
-- trilha não pode ser destruída junto com o plano.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists eventos2027_snapshots (
  id             bigserial primary key,
  taken_at       timestamptz not null default now(),
  motivo         text not null,          -- 'antes_de_apagar' | 'checkpoint'
  plano          jsonb not null,
  budget_limit   numeric,
  fx             jsonb,
  nacional       jsonb,
  eventos        int,
  participacoes  int
);
alter table eventos2027_snapshots add column if not exists nacional jsonb;
create index if not exists eventos2027_snapshots_taken_idx
  on eventos2027_snapshots (taken_at desc);

create or replace function eventos2027_tirar_snapshot(p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_plano jsonb; v_ultimo jsonb; v_limit numeric; v_fx jsonb; v_nac jsonb;
begin
  select coalesce(jsonb_object_agg(event_id,
           jsonb_build_object('people', people, 'courtesy', courtesy)), '{}'::jsonb)
    into v_plano from eventos2027_plan;
  if v_plano = '{}'::jsonb then return; end if;   -- plano vazio: nada a proteger

  -- Sem deduplicar, uma sequência de desseleções enche a janela de 60 com
  -- estados repetidos e expulsa os pontos de retorno que importam.
  select plano into v_ultimo from eventos2027_snapshots order by taken_at desc limit 1;
  if v_ultimo is not null and v_ultimo = v_plano then return; end if;

  select budget_limit, fx, nacional into v_limit, v_fx, v_nac
    from eventos2027_settings where id = 1;

  insert into eventos2027_snapshots (motivo, plano, budget_limit, fx, nacional, eventos, participacoes)
  values (p_motivo, v_plano, v_limit, v_fx, v_nac,
          (select count(*) from eventos2027_plan),
          (select coalesce(sum(people), 0) from eventos2027_plan));

  delete from eventos2027_snapshots
   where id not in (select id from eventos2027_snapshots order by taken_at desc limit 60);
end $$;

-- BEFORE DELETE: a tabela ainda tem as linhas, então guarda exatamente o que
-- estava prestes a ser perdido.
create or replace function eventos2027_trg_antes_de_apagar()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform eventos2027_tirar_snapshot('antes_de_apagar'); return null; end $$;

-- Checkpoint do estado bom, no máximo um a cada 10 min.
create or replace function eventos2027_trg_checkpoint()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ultimo timestamptz;
begin
  select max(taken_at) into v_ultimo from eventos2027_snapshots;
  if v_ultimo is null or v_ultimo < now() - interval '10 minutes' then
    perform eventos2027_tirar_snapshot('checkpoint');
  end if;
  return null;
end $$;

drop trigger if exists eventos2027_plan_antes_de_apagar on eventos2027_plan;
create trigger eventos2027_plan_antes_de_apagar
  before delete on eventos2027_plan
  for each statement execute function eventos2027_trg_antes_de_apagar();

drop trigger if exists eventos2027_plan_checkpoint on eventos2027_plan;
create trigger eventos2027_plan_checkpoint
  after insert or update on eventos2027_plan
  for each statement execute function eventos2027_trg_checkpoint();

-- anon LÊ (para restaurar), mas não escreve nem apaga.
alter table eventos2027_snapshots enable row level security;
drop policy if exists "anon read"  on eventos2027_snapshots;
drop policy if exists "anon write" on eventos2027_snapshots;
create policy "anon read" on eventos2027_snapshots for select using (true);

-- OBRIGATÓRIO: o PostgREST expõe toda função do schema public como
-- /rest/v1/rpc/<nome>. Sem este revoke, um atacante chamaria a função em loop
-- e expulsaria os pontos legítimos da janela de 60 — apagando a trilha sem
-- executar um único DELETE. Os gatilhos continuam funcionando: o Postgres não
-- exige EXECUTE do usuário para rodar a função de um trigger.
revoke all on function eventos2027_tirar_snapshot(text)  from public, anon, authenticated;
revoke all on function eventos2027_trg_antes_de_apagar() from public, anon, authenticated;
revoke all on function eventos2027_trg_checkpoint()      from public, anon, authenticated;
