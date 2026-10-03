alter table public.leads
  add column if not exists fbp text,
  add column if not exists fbc text,
  add column if not exists fbclid text,
  add column if not exists client_ip text,
  add column if not exists client_user_agent text,
  add column if not exists meta_lead_sent_at timestamptz;

comment on column public.leads.fbp is 'Cookie _fbp do Meta Pixel, capturado no navegador no momento do cadastro.';
comment on column public.leads.fbc is 'Cookie _fbc do Meta Pixel (ou derivado do fbclid), capturado no momento do cadastro.';
comment on column public.leads.fbclid is 'Parâmetro fbclid da URL, se o clique veio de um anúncio do Meta.';
comment on column public.leads.client_ip is 'IP do navegador da candidata no momento do cadastro, usado para casar o evento com o Meta Conversions API.';
comment on column public.leads.client_user_agent is 'User-Agent do navegador da candidata no momento do cadastro.';
comment on column public.leads.meta_lead_sent_at is 'Quando o evento Lead foi enviado ao Meta Conversions API para este lead (evita duplicar envio).';
