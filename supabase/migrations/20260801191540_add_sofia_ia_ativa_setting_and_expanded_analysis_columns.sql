-- Feature flag que liga/desliga as camadas de IA da Sofia (análise final
-- expandida e reações contextuais na conversa). Default OFF: numa landing
-- page com tráfego pago ao vivo, comportamento novo só deve rodar quando a
-- Tania decidir testar/ativar pela tela de Configurações.
insert into public.settings (chave, valor, descricao)
values (
  'sofia_ia_ativa',
  jsonb_build_object('ativa', false),
  'Liga/desliga as camadas de IA (Claude) da Sofia: análise final expandida e reações contextuais na conversa. Quando desativado, comportamento idêntico ao atual (roteiro fixo + resumo simples).'
)
on conflict (chave) do nothing;

-- Colunas consultivas/aditivas em ai_analysis. Nenhuma delas participa da
-- decisão de status/aprovação — isso continua 100% do motor de regras (IPR)
-- em finalize-candidate. `perfil_sugerido_ia` é deliberadamente separada de
-- `perfil_comercial` (a oficial, calculada pelas regras) para nunca haver
-- ambiguidade entre opinião da IA e decisão do sistema.
alter table public.ai_analysis
  add column if not exists icp_score integer null check (icp_score is null or (icp_score between 0 and 100)),
  add column if not exists probabilidade_sucesso integer null check (probabilidade_sucesso is null or (probabilidade_sucesso between 0 and 100)),
  add column if not exists grau_confianca_ia integer null check (grau_confianca_ia is null or (grau_confianca_ia between 0 and 100)),
  add column if not exists grau_confianca_explicacao text null,
  add column if not exists perfil_sugerido_ia text null check (perfil_sugerido_ia is null or perfil_sugerido_ia in ('baixo','medio','alto','excelente')),
  add column if not exists potencial_empreendedor text null check (potencial_empreendedor is null or potencial_empreendedor in ('baixo','medio','alto','muito_alto')),
  add column if not exists proxima_acao text null check (proxima_acao is null or proxima_acao in ('ligar_imediatamente','enviar_whatsapp','analise_manual','aguardar')),
  add column if not exists sentimento text null check (sentimento is null or sentimento in ('muito_motivada','motivada','neutra','insegura','desmotivada')),
  add column if not exists motivacao_principal text null check (motivacao_principal is null or motivacao_principal in ('renda_extra','independencia_financeira','sonho_pessoal','flexibilidade','empreender','outro')),
  add column if not exists resumo_executivo text null,
  add column if not exists resumo_comercial text null,
  add column if not exists resumo_comportamental text null,
  add column if not exists resumo_motivacional text null,
  add column if not exists pontos_fortes text[] null,
  add column if not exists pontos_atencao text[] null;

comment on column public.ai_analysis.perfil_sugerido_ia is
  'Impressão consultiva e NÃO-VINCULANTE do Claude sobre o potencial comercial da candidata. O perfil oficial permanece em perfil_comercial, decidido apenas pelo motor de regras determinístico (IPR).';
