-- M0-B — captura de objetos que existem em PRODUÇÃO
-- mas que nunca foram criados por nenhuma migration (nem do repositório, nem
-- do histórico supabase_migrations.schema_migrations de produção). Ver
-- docs/m0/M0-B-reprodutibilidade-banco.md.
--
-- Objetivo: permitir que um banco NOVO e DESCARTÁVEL, criado só a partir do
-- repositório, termine estruturalmente equivalente à produção. Esta migration
-- NÃO deve ser aplicada em produção (lá os objetos já existem) — ver a regra
-- "NUNCA supabase db push contra produção" no documento acima.
--
-- Idempotente de propósito: rodar duas vezes (ou num banco onde os objetos já
-- existem) não muda nada.

-- 1) Realtime -----------------------------------------------------------------
-- Estado confirmado em produção (somente leitura, 2026-10-03):
--   publication `supabase_realtime` (insert/update/delete/truncate, sem
--   all_tables) contém `public.leads` e `public.whatsapp_messages`, sem lista
--   de colunas nem row filter; replica identity default nas duas tabelas.
-- Consumido pelo Admin (atualização ao vivo do CRM/Kanban e das mensagens de
-- WhatsApp — ver tests/realtime-leads-whatsapp-messages.test.mjs).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_messages'
  ) then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
end
$$;

-- 2) Setting órfão `whatsapp_notificacao_tania_ativa` -------------------------
-- Em produção a linha foi criada pelo próprio Admin (upsert em
-- apps/admin/src/hooks/useSettings.ts → useSaveWhatsappNotificacaoTaniaAtiva),
-- nunca por migration. Formato esperado pelo código: {"ativa": boolean}.
-- Ausente ou false → submit-ficha NÃO notifica a Tania (Boolean(valor?.ativa)).
-- Seed técnico com o default seguro (false), mesmo padrão das outras flags de
-- WhatsApp (ex.: 20260815000000_add_whatsapp_ficha_automatica.sql). O VALOR
-- atual de produção não é copiado; `on conflict do nothing` preserva qualquer
-- valor já existente.
insert into settings (chave, valor, descricao)
values (
  'whatsapp_notificacao_tania_ativa',
  '{"ativa": false}'::jsonb,
  'Liga/desliga o aviso automático pra Tania via WhatsApp Cloud API (número oficial) assim que uma candidata preenche a Ficha de Aprovação. Se o envio falhar (ex.: fora da janela de 24h de atendimento), a lead fica em ''Confirmada'' e o botão manual ''Enviar pra Tania'' continua disponível. Default false — só liga depois de testar.'
)
on conflict (chave) do nothing;
