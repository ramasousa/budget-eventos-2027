-- ═══════════════════════════════════════════════════════════════════════════
-- PÚBLICO LÊ, AUTENTICADO EDITA
--
-- ⚠  ORDEM DE APLICAÇÃO IMPORTA
--    Rode isto DEPOIS que a versão com login estiver publicada no GitHub
--    Pages. Se rodar antes, a edição para de funcionar imediatamente para
--    quem estiver usando a versão antiga.
--
--    1. Criar as contas (Authentication → Users → Add user), com
--       "Auto Confirm User" ligado
--    2. Desligar o cadastro aberto (Authentication → Providers → Email →
--       "Allow new users to sign up" = off)
--    3. Publicar o site com login
--    4. Rodar este arquivo
--
--    Para voltar atrás: supabase/migracoes/01-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Catálogo, plano, premissas e cenários ────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'eventos2027_events', 'eventos2027_plan',
    'eventos2027_settings', 'eventos2027_scenarios'
  ] loop
    -- Fora a policy aberta que valia até aqui.
    execute format('drop policy if exists "anon write" on %I', t);
    execute format('drop policy if exists "anon read"  on %I', t);

    -- Ler continua público: o superintendente abre o link e vê, sem senha.
    execute format('create policy "leitura publica" on %I for select using (true)', t);

    -- Escrever exige sessão. auth.role() vem do JWT que o PostgREST valida;
    -- a chave publishable sozinha resolve para anon e não passa.
    execute format($f$create policy "escrita autenticada" on %I
                     for all to authenticated
                     using (auth.role() = 'authenticated')
                     with check (auth.role() = 'authenticated')$f$, t);
  end loop;
end $$;

-- ─── Autoria que não pode ser forjada ─────────────────────────────────────
-- updated_by era texto livre digitado na página: orientava, não provava nada.
-- Agora o banco recusa gravação em nome de outra pessoa.
alter table eventos2027_plan
  alter column updated_by set default (auth.jwt() ->> 'email');

drop policy if exists "escrita autenticada" on eventos2027_plan;
create policy "escrita autenticada" on eventos2027_plan
  for all to authenticated
  using (auth.role() = 'authenticated')
  with check (
    auth.role() = 'authenticated'
    and (updated_by is null or updated_by = auth.jwt() ->> 'email')
  );

alter table eventos2027_events
  alter column created_by set default (auth.jwt() ->> 'email');

-- ─── Histórico: continua somente-leitura para todos ───────────────────────
-- Nada muda aqui. É escrito por trigger (security definer) e ninguém, nem
-- autenticado, pode apagar ou forjar a trilha.

-- ─── Conferência ──────────────────────────────────────────────────────────
select tablename, policyname, cmd, roles::text
  from pg_policies
 where tablename like 'eventos2027%'
 order by tablename, cmd;
