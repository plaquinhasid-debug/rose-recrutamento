-- As colunas abaixo já existiam como boolean (herdadas) quando o rose_setup
-- rodou "add column if not exists ... text", então ficaram com o tipo errado
-- e o envio da ficha falhava ("invalid input syntax for type boolean").
-- Estavam vazias (nenhuma ficha preenchida), então a conversão não perde nada.
alter table public.leads_ficha
  alter column casa_propria type text using null,
  alter column instagram_profissional type text using null,
  alter column restricao_cpf type text using null;

alter table public.leads_ficha
  add constraint leads_ficha_casa_propria_check
    check (casa_propria is null or casa_propria in ('propria', 'alugada', 'familia')),
  add constraint leads_ficha_restricao_cpf_check
    check (restricao_cpf is null or restricao_cpf in ('nao', 'sim', 'nao_sei'));
