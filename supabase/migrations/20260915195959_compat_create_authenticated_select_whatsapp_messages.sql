-- M0-B.1 — migration de COMPATIBILIDADE para reconstrução (replay) do banco.
--
-- POR QUE EXISTE
-- A migration seguinte, 20260915200000_harden_authenticated_staff_authorization.sql,
-- executa `drop policy authenticated_select_whatsapp_messages on whatsapp_messages;`
-- SEM `if exists`. Nenhuma migration — nem do repositório, nem do histórico
-- de produção (supabase_migrations.schema_migrations) — cria essa policy antes
-- disso: em produção ela foi criada MANUALMENTE (fora do mecanismo de
-- migrations), junto com as tabelas de WhatsApp. Num banco novo, sem esta
-- migration, a cadeia quebra no harden.
--
-- PROVA DE QUE ELA EXISTIA NAQUELE PONTO DA HISTÓRIA
-- O harden está registrado como APLICADO em produção (versão 20260915193027)
-- e contém o DROP sem `if exists` — se a policy não existisse, a migration
-- teria falhado. Hoje produção tem a versão PÓS-harden
-- (`for select to authenticated using (is_equipe())`).
--
-- DEFINIÇÃO USADA AQUI
-- A definição exata anterior ao harden não é recuperável (o harden a
-- sobrescreveu). Usa-se a forma pré-harden documentada pelo commit 82dd5ca
-- ("contas authenticated tinham acesso amplo") e idêntica às policies
-- irmãs de 20260729144524_rls_policies.sql:
--   for select to authenticated using (true)
-- Para o estado FINAL isso é indiferente: o harden, logo em seguida, faz
-- DROP desta policy e a recria com `using (is_equipe())` — que é exatamente
-- o estado de produção.
--
-- NÃO APLICAR MANUALMENTE EM PRODUÇÃO. Produção já tem o estado final. Por
-- segurança, a criação é condicional: se a policy já existir (ex.: produção),
-- nada acontece.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'whatsapp_messages'
      and policyname = 'authenticated_select_whatsapp_messages'
  ) then
    create policy authenticated_select_whatsapp_messages on public.whatsapp_messages
      for select to authenticated using (true);
  end if;
end
$$;
