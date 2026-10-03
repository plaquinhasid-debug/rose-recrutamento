-- Seed the feature-flag row that toggles Sofia's AI-assisted qualification
-- sub-flow. Defaults to OFF (safe default for a brand-new capability on a
-- live lead-gen funnel) until the business owner explicitly enables it from
-- the Admin > Configurações page.
insert into public.settings (chave, valor, descricao)
values (
  'sofia_ia_ativa',
  jsonb_build_object('ativa', false),
  'Liga/desliga a qualificação por IA (Claude) na conversa da Sofia. Quando desativado, usa o roteiro fixo de perguntas.'
)
on conflict (chave) do nothing;

-- Narrow, additive RLS policy: allow anonymous (unauthenticated) readers —
-- i.e. the public Landing Page client, which never logs in — to read ONLY
-- this one feature-flag row, so the frontend can check it before attempting
-- the AI sub-flow (avoids a wasted round trip when the flag is off). This
-- does NOT expose ipr_pesos / ipr_thresholds / cidades_atendidas (those stay
-- admin-only, as today) and does NOT change the existing
-- `authenticated_all_settings` policy.
create policy "anon_select_sofia_ia_ativa"
on public.settings
for select
to anon
using (chave = 'sofia_ia_ativa');
