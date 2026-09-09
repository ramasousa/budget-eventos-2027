-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGENS NACIONAIS: visita recorrente aos polos
--
-- Recife e Curitiba são escritórios que o time visita por rotina, não por
-- decisão caso a caso. O que se orça é a POLÍTICA — quantas vezes por ano
-- cada cargo vai a cada polo — e não uma lista de viagens pessoa a pessoa.
--
--   total = Σ_polo Σ_cargo (pessoas × viagens/ano no polo) × custo do polo
--
-- Mora em `settings` e não em tabelas próprias de propósito: é configuração
-- singleton de meia dúzia de linhas, e assim herda o caminho de leitura,
-- escrita, espelho local e RLS que já existe — sem novo modo de falha.
--
-- Para voltar atrás: supabase/migracoes/02-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

alter table eventos2027_settings
  add column if not exists nacional jsonb not null default '{"polos":[],"cargos":[]}'::jsonb;

comment on column eventos2027_settings.nacional is
  'Política de visita aos polos nacionais: polos (com custo por viagem em BRL) e cargos (pessoas e cadência anual por polo).';

-- Cenários salvos precisam guardar a política junto, senão a comparação mente.
alter table eventos2027_scenarios add column if not exists nacional jsonb;

-- A rede de segurança também: restaurar um ponto no tempo tem que devolver
-- o orçamento inteiro, não só a metade internacional.
alter table eventos2027_snapshots add column if not exists nacional jsonb;

-- ─── Semente ──────────────────────────────────────────────────────────────
-- Só preenche se ainda estiver vazio: rodar de novo não sobrescreve o que a
-- equipe já ajustou na página.
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

-- ─── Snapshot passa a guardar a política ──────────────────────────────────
create or replace function eventos2027_tirar_snapshot(p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_plano jsonb; v_ultimo jsonb; v_limit numeric; v_fx jsonb; v_nac jsonb;
begin
  select coalesce(jsonb_object_agg(event_id,
           jsonb_build_object('people', people, 'courtesy', courtesy)), '{}'::jsonb)
    into v_plano from eventos2027_plan;
  if v_plano = '{}'::jsonb then return; end if;

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

-- O PostgREST expõe função do schema public como RPC. Sem o revoke, dá para
-- chamá-la em laço e expulsar os snapshots que importam da janela de 60.
revoke all on function eventos2027_tirar_snapshot(text) from public, anon, authenticated;

select tablename, policyname, cmd from pg_policies
 where tablename like 'eventos2027%' order by tablename, cmd;
