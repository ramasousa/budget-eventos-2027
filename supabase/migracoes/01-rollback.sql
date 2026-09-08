-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — devolve a escrita aberta
--
-- Use se a autenticação travar e a área precisar continuar editando. Custa
-- 30 segundos e reabre o risco descrito no README (qualquer pessoa com o
-- link pode alterar). A rede de segurança dos snapshots continua valendo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table eventos2027_plan   alter column updated_by drop default;
alter table eventos2027_events alter column created_by drop default;

do $$
declare t text;
begin
  foreach t in array array[
    'eventos2027_events', 'eventos2027_plan',
    'eventos2027_settings', 'eventos2027_scenarios'
  ] loop
    execute format('drop policy if exists "leitura publica"     on %I', t);
    execute format('drop policy if exists "escrita autenticada" on %I', t);
    execute format('create policy "anon read"  on %I for select using (true)', t);
    execute format('create policy "anon write" on %I for all using (true) with check (true)', t);
  end loop;
end $$;

select tablename, policyname, cmd from pg_policies
 where tablename like 'eventos2027%' order by tablename, cmd;
