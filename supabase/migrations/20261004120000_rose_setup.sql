-- =========================================================================
-- ROSE SEMI JÓIAS — ajustes do sistema enxuto (sobre a base herdada).
-- =========================================================================

-- 1) Ficha da Rose: campos novos pedidos pela Carol + documentos enviados.
alter table public.leads_ficha
  add column if not exists casa_propria text null
    check (casa_propria in ('propria', 'alugada', 'familia')),
  add column if not exists trabalho_horario text null,
  add column if not exists filhos_quantidade integer null
    check (filhos_quantidade between 0 and 20),
  add column if not exists instagram_profissional text null,
  add column if not exists restricao_cpf text null
    check (restricao_cpf in ('nao', 'sim', 'nao_sei')),
  add column if not exists documentos jsonb not null default '[]'::jsonb;

comment on column public.leads_ficha.documentos is
  'Lista [{tipo, path}] dos arquivos no bucket privado fichas-documentos. Só a equipe lê (URL assinada).';
comment on column public.leads_ficha.filhos_quantidade is
  'Informativo para a decisão da dona. NUNCA usado em reprovação automática.';
comment on column public.leads_ficha.restricao_cpf is
  'Autodeclarado pela candidata. Informativo; nunca usado em reprovação automática.';

-- 2) Bucket privado dos documentos. Upload só via link assinado gerado pela
--    Edge Function submit-ficha (service role); leitura só pela equipe.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fichas-documentos',
  'fichas-documentos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "equipe le documentos das fichas" on storage.objects;
create policy "equipe le documentos das fichas"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'fichas-documentos' and public.is_equipe());

-- 3) Regras da Rose (podem ser ajustadas depois em Configurações).
--    IPR: trabalha 40 + experiência 15 + WhatsApp 10 + Instagram 10
--         + cidade atendida 10 + profissão preferida 15 = 100.
--    Pré-aprova com 75+ (e Instagram informado); análise manual com 55+.
update public.settings
   set valor = '{"trabalha": 40, "experiencia_vendas": 15, "whatsapp": 10, "instagram": 10, "cidade_atendida": 10, "profissao_preferida": 15}'::jsonb
 where chave = 'ipr_pesos';

update public.settings
   set valor = '{"aprovar": 75, "analise_min": 55}'::jsonb
 where chave = 'ipr_thresholds';

update public.settings
   set valor = '{"restringir": true, "lista": ["Mauá", "Santo André", "São Bernardo do Campo", "São Caetano do Sul", "Diadema", "Ribeirão Pires", "Rio Grande da Serra"]}'::jsonb
 where chave = 'cidades_atendidas';

-- IA e WhatsApp automático desligados no sistema enxuto.
update public.settings set valor = '{"ativa": false}'::jsonb
 where chave in (
   'sofia_ia_ativa',
   'sofia_perguntas_ia_ativa',
   'whatsapp_aprovacao_automatica_ativa',
   'whatsapp_ficha_automatica_ativa',
   'whatsapp_lembrete_ficha_automatico_ativa',
   'whatsapp_notificacao_tania_ativa'
 );

-- Nada da Tania no banco da Rose.
delete from public.settings where chave = 'tania_whatsapp_numero';

-- 4) Garantia extra: nenhum agendamento herdado chamando servidor de fora.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job
     where jobname in ('daily-leads-report', 'lembrete-ficha-pendente');
  end if;
end
$$;
