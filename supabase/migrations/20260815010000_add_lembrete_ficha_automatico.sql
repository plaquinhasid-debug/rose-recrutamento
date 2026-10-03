-- Lembrete automático da Ficha de Aprovação — a Sofia passa a "apertar o
-- botão Lembrar" sozinha, 1x por dia, pra quem está há mais de 2 dias com o
-- link da Ficha gerado e não preenchido. Reaproveita o mesmo template
-- aprovado `ficha_aprovacao_link` (mesmo texto do primeiro envio) em vez de
-- esperar a Meta aprovar um modelo novo de cobrança — decisão da Tania,
-- 15/08/2026.
--
-- Mesma disciplina de sempre: flag default `false`, coluna própria de
-- idempotência (não mistura com `whatsapp_enviado_em`, que marca o envio
-- ORIGINAL do link — assim dá pra saber separadamente quando foi mandado e
-- quando foi lembrado, se algum dia precisar auditar).

alter table leads_ficha
  add column lembrete_enviado_em timestamptz null;

comment on column leads_ficha.lembrete_enviado_em is
  'Timestamp de quando o lembrete automático (reenvio do link, template ficha_aprovacao_link) foi enviado via WhatsApp Cloud API. NULL = ainda não enviado. Só dispara 1x — não é um lembrete recorrente.';

insert into settings (chave, valor, descricao)
values (
  'whatsapp_lembrete_ficha_automatico_ativa',
  '{"ativa": false}'::jsonb,
  'Controla se o lembrete da Ficha de Aprovação (reenvio do link, mesmo template ficha_aprovacao_link) é enviado automaticamente 1x, para quem está há mais de 2 dias sem preencher. Default false — só liga depois de testar.'
)
on conflict (chave) do nothing;

-- Roda 1x por dia às 10:00 America/Sao_Paulo (13:00 UTC) — depois do
-- relatório diário (08:00), dando tempo dela ver o painel antes. A própria
-- Edge Function checa a flag e não faz nada se estiver desligada.
-- ROSE: agendamento removido — apontava para o servidor da Tania
-- (iaqzbernshmhkqznleye) e a função não existe no sistema da Rose.
