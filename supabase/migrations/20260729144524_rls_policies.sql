
alter table public.leads enable row level security;
alter table public.answers enable row level security;
alter table public.campaigns enable row level security;
alter table public.conversations enable row level security;
alter table public.ai_analysis enable row level security;
alter table public.settings enable row level security;
alter table public.logs enable row level security;
alter table public.profiles enable row level security;

-- LEADS: nenhum acesso anon (tudo via edge function com service role). Equipe autenticada tem CRUD total.
create policy "authenticated_select_leads" on public.leads for select to authenticated using (true);
create policy "authenticated_update_leads" on public.leads for update to authenticated using (true) with check (true);
create policy "authenticated_insert_leads" on public.leads for insert to authenticated with check (true);
create policy "authenticated_delete_leads" on public.leads for delete to authenticated using (true);

-- ANSWERS: anon pode inserir (trilha de respostas, sem campos sensíveis). Equipe autenticada lê.
create policy "anon_insert_answers" on public.answers for insert to anon with check (true);
create policy "authenticated_select_answers" on public.answers for select to authenticated using (true);

-- CAMPAIGNS: leitura pública (para taggear origem na landing), escrita só autenticado.
create policy "public_select_campaigns" on public.campaigns for select to anon, authenticated using (ativa = true);
create policy "authenticated_all_campaigns" on public.campaigns for all to authenticated using (true) with check (true);

-- CONVERSATIONS: anon pode criar/iniciar sua própria sessão. Update só autenticado (edge function usa service role, que ignora RLS).
create policy "anon_insert_conversations" on public.conversations for insert to anon with check (true);
create policy "authenticated_select_conversations" on public.conversations for select to authenticated using (true);
create policy "authenticated_update_conversations" on public.conversations for update to authenticated using (true) with check (true);

-- AI_ANALYSIS: sem acesso anon (só via service role na edge function). Autenticado lê.
create policy "authenticated_select_ai_analysis" on public.ai_analysis for select to authenticated using (true);

-- SETTINGS: só equipe autenticada.
create policy "authenticated_all_settings" on public.settings for all to authenticated using (true) with check (true);

-- LOGS: anon pode inserir eventos de funil. Autenticado lê (Radar da Sofia).
create policy "anon_insert_logs" on public.logs for insert to anon with check (true);
create policy "authenticated_select_logs" on public.logs for select to authenticated using (true);

-- PROFILES: usuário vê e edita o próprio perfil; equipe autenticada pode ver todos (diretório da equipe).
create policy "authenticated_select_profiles" on public.profiles for select to authenticated using (true);
create policy "self_update_profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
