
-- Extensions
create extension if not exists pgcrypto;

-- ============ ENUMS ============
create type lead_status as enum ('novo', 'em_analise', 'aprovada', 'reprovada');
create type perfil_comercial_enum as enum ('baixo', 'medio', 'alto');
create type recomendacao_enum as enum ('aprovar', 'reprovar', 'analise_manual');
create type evento_funil as enum (
  'landing_view', 'ad_click', 'chat_iniciado', 'chat_abandonado',
  'respondeu_trabalha_sim', 'respondeu_trabalha_nao',
  'aprovada', 'reprovada', 'analise_manual'
);

-- ============ CAMPAIGNS ============
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  origem text not null default 'meta_ads',
  utm_campaign text unique,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ CONVERSATIONS ============
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  lead_id uuid,
  status text not null default 'em_andamento',
  current_step text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ============ LEADS ============
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  cidade text,
  idade int,
  trabalha boolean,
  empresa_atual text,
  profissao text,
  experiencia_vendas boolean,
  instagram text,
  whatsapp boolean,
  tempo_disponivel text,
  objetivo text,
  ipr int not null default 0,
  perfil_comercial perfil_comercial_enum,
  resumo_ia text,
  status lead_status not null default 'novo',
  origem text default 'organico',
  campanha text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  observacoes text,
  conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations
  add constraint conversations_lead_id_fkey foreign key (lead_id) references public.leads(id) on delete set null;

create index leads_status_idx on public.leads(status);
create index leads_created_at_idx on public.leads(created_at);
create index leads_campanha_idx on public.leads(campanha);

-- ============ ANSWERS ============
create table public.answers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  session_id text not null,
  question_key text not null,
  question_label text not null,
  answer_value text,
  created_at timestamptz not null default now()
);

create index answers_lead_id_idx on public.answers(lead_id);
create index answers_session_id_idx on public.answers(session_id);

-- ============ AI ANALYSIS ============
create table public.ai_analysis (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  resumo text,
  perfil_comercial perfil_comercial_enum,
  perfil_motivo text,
  ipr_score int,
  ipr_breakdown jsonb,
  recomendacao recomendacao_enum,
  model text not null default 'rules-engine-v1',
  created_at timestamptz not null default now()
);

create index ai_analysis_lead_id_idx on public.ai_analysis(lead_id);

-- ============ SETTINGS ============
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  chave text unique not null,
  valor jsonb not null,
  descricao text,
  updated_at timestamptz not null default now()
);

-- ============ LOGS (funil / Radar da Sofia) ============
create table public.logs (
  id uuid primary key default gen_random_uuid(),
  tipo_evento evento_funil not null,
  lead_id uuid references public.leads(id) on delete set null,
  session_id text,
  campanha text,
  origem text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index logs_tipo_evento_idx on public.logs(tipo_evento);
create index logs_created_at_idx on public.logs(created_at);
create index logs_session_id_idx on public.logs(session_id);

-- ============ PROFILES (equipe / auth) ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  papel text not null default 'equipe',
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- updated_at trigger for leads
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute procedure public.set_updated_at();

-- ============ SEED SETTINGS ============
insert into public.settings (chave, valor, descricao) values
  ('cidades_atendidas', '{"restringir": false, "lista": []}', 'Lista de cidades atendidas pela equipe comercial. Se restringir=false, todas as cidades pontuam no IPR.'),
  ('ipr_pesos', '{"trabalha": 50, "experiencia_vendas": 20, "whatsapp": 10, "instagram": 10, "cidade_atendida": 10}', 'Pesos fixos do Índice de Potencial da Revendedora.'),
  ('ipr_thresholds', '{"aprovar": 80, "analise_min": 60}', 'Limiares de decisão automática do IPR.');

insert into public.campaigns (nome, origem, utm_campaign, ativa) values
  ('Tráfego Direto / Orgânico', 'organico', 'organico', true);
