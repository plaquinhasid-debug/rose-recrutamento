-- M0-B.1 — RECONCILIAÇÃO FINAL: leva um banco reconstruído do zero ao
-- estado estrutural observado em PRODUÇÃO (consulta somente leitura,
-- 2026-10-03), corrigindo dois desvios causados por alterações MANUAIS em
-- produção que nenhuma migration registrou. As migrations históricas
-- continuam intactas; esta migration só descreve o "depois".
--
-- Idempotente e segura num banco que já está no estado final (como
-- produção): cada passo verifica antes de agir. Mesmo assim, NÃO aplicar em
-- produção — ver docs/m0/M0-B-reprodutibilidade-banco.md.

-- 1) ai_analysis.perfil_sugerido_ia --------------------------------------------
-- Replay histórico: 20260801001942 cria a coluna como `perfil_comercial_enum`;
-- 20260801191540 tenta `add column if not exists ... text check(...)`, que é
-- ignorado porque a coluna já existe → termina enum (baixo/medio/alto), SEM
-- check, e rejeitaria 'excelente' (valor que o código grava:
-- supabase/functions/_shared/ai-analysis.ts).
-- Produção: text, nullable, sem default, com
--   ai_analysis_perfil_sugerido_ia_check
--   CHECK (perfil_sugerido_ia IS NULL OR perfil_sugerido_ia IN ('baixo','medio','alto','excelente'))
-- O comentário da coluna em produção já é o de 20260801191540 (mesmo md5),
-- então não precisa ser reescrito.
-- Banco novo não tem linhas; a conversão enum→text (`using ...::text`) é
-- sempre válida e não depende de dados.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_analysis'
      and column_name = 'perfil_sugerido_ia' and data_type <> 'text'
  ) then
    alter table public.ai_analysis
      alter column perfil_sugerido_ia type text using perfil_sugerido_ia::text;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_analysis'::regclass
      and conname = 'ai_analysis_perfil_sugerido_ia_check'
  ) then
    alter table public.ai_analysis
      add constraint ai_analysis_perfil_sugerido_ia_check
      check (perfil_sugerido_ia is null or perfil_sugerido_ia in ('baixo','medio','alto','excelente'));
  end if;
end
$$;

-- 2) policy anon_select_sofia_ia_ativa -----------------------------------------
-- Criada por 20260801001931 e nunca removida por migration; em produção ela
-- NÃO existe (removida manualmente). Nenhum código atual depende dela (a
-- Landing não lê `settings` diretamente). Estado final desejado: ausente.
drop policy if exists anon_select_sofia_ia_ativa on public.settings;
