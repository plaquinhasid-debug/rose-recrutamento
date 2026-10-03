-- Advisory-only column: Claude's own (non-authoritative) impression of the
-- candidate's commercial profile, captured separately from the authoritative
-- `perfil_comercial` column (which is always derived purely by the
-- deterministic rules engine in the `finalize-candidate` Edge Function and
-- never overridden by AI output). Nullable — populated only when the AI
-- qualification sub-flow ran for a given lead.
alter table public.ai_analysis
  add column if not exists perfil_sugerido_ia public.perfil_comercial_enum null;

comment on column public.ai_analysis.perfil_sugerido_ia is
  'Impressão consultiva e NÃO-VINCULANTE do Claude sobre o potencial comercial da candidata, com base na conversa de qualificação por IA. O perfil oficial permanece em perfil_comercial, decidido apenas pelo motor de regras determinístico.';
