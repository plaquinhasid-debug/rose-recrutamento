insert into settings (chave, valor, descricao)
values (
  'sofia_perguntas_ia_ativa',
  '{"ativa": false}'::jsonb,
  'Liga/desliga a Sofia respondendo perguntas de negocio reais da candidata (via IA + base de conhecimento) durante a conversa (FEATURE-004). Quando desativado, comportamento identico ao roteiro fixo de hoje.'
)
on conflict (chave) do nothing;