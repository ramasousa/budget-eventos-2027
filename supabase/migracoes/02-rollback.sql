-- Desfaz 02-viagens-nacionais.sql. A política some do orçamento; o plano
-- internacional não é tocado.
alter table eventos2027_snapshots drop column if exists nacional;
alter table eventos2027_scenarios drop column if exists nacional;
alter table eventos2027_settings  drop column if exists nacional;

create or replace function eventos2027_tirar_snapshot(p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_plano jsonb; v_ultimo jsonb; v_limit numeric; v_fx jsonb;
begin
  select coalesce(jsonb_object_agg(event_id,
           jsonb_build_object('people', people, 'courtesy', courtesy)), '{}'::jsonb)
    into v_plano from eventos2027_plan;
  if v_plano = '{}'::jsonb then return; end if;
  select plano into v_ultimo from eventos2027_snapshots order by taken_at desc limit 1;
  if v_ultimo is not null and v_ultimo = v_plano then return; end if;
  select budget_limit, fx into v_limit, v_fx from eventos2027_settings where id = 1;
  insert into eventos2027_snapshots (motivo, plano, budget_limit, fx, eventos, participacoes)
  values (p_motivo, v_plano, v_limit, v_fx,
          (select count(*) from eventos2027_plan),
          (select coalesce(sum(people), 0) from eventos2027_plan));
  delete from eventos2027_snapshots
   where id not in (select id from eventos2027_snapshots order by taken_at desc limit 60);
end $$;
revoke all on function eventos2027_tirar_snapshot(text) from public, anon, authenticated;
