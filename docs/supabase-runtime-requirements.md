# Variáveis e segredos necessários para rodar o Recrutamento

> Este documento lista **só os NOMES** das variáveis. Nenhum valor, token, chave,
> senha ou connection string pode ser escrito aqui ou em qualquer arquivo do
> repositório.

Levantado na M0-B (2026-10-03) a partir do código do repositório (`Deno.env.get`,
`process.env`, `import.meta.env` e `.env.example`). A presença e o valor de cada
segredo **em produção não foram consultados**. Os segredos de Edge Function não
podem ser listados pelas ferramentas de leitura usadas, então "configurada em
produção" fica **NÃO DETERMINADO** para todos.

## 1. Edge Functions (Supabase → Project Settings → Edge Functions → Secrets)

| Nome | Consumidor (Edge Functions) | Obrigatória? | Finalidade |
|---|---|---|---|
| `SUPABASE_URL` | 22 funções (todas exceto `knowledge-service`) | Sim | URL do próprio projeto. Injetada automaticamente pelo Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | 22 funções (todas exceto `knowledge-service`) | Sim | Acesso server-side que ignora RLS. Injetada automaticamente pelo Supabase. |
| `AGENT_ALLOWED_ORIGINS` | agent-ai-gateway, get-ficha, knowledge-service, funções de Embaixadoras (14 no total) | Sim (CORS) | Origens (domínios da Landing/Admin) autorizadas a chamar as funções. |
| `EMBAIXADORAS_ALLOWED_ORIGINS` | 9 funções de Embaixadoras (Admin/Portal) | Sim, para Embaixadoras | CORS específico do módulo Embaixadoras. |
| `EMBAIXADORAS_REDEMPTION_ALLOWED_ORIGINS` | redeem-ambassador-invite, validate-ambassador-invite | Sim, para Embaixadoras | CORS da página pública de convite. |
| `EMBAIXADORAS_MIN_PASSWORD_LENGTH` | redeem-ambassador-invite | Não (tem default seguro) | Tamanho mínimo da senha da Embaixadora. |
| `GET_FICHA_ALLOWED_ORIGINS` | get-ficha | Sim, para a Ficha | CORS da página da Ficha. |
| `KNOWLEDGE_ALLOWED_ORIGINS` | knowledge-service | Não (cai em `AGENT_ALLOWED_ORIGINS`) | CORS do knowledge-service. |
| `ANTHROPIC_API_KEY` | agent-ai-gateway, finalize-candidate, sofia-reagir | Sim, para a Sofia com IA | Chave da API Claude. Sem ela, a análise por IA é pulada. |
| `CONSIGGOLD_SUPABASE_URL` | knowledge-service | Sim, para o knowledge-service | URL do Supabase do **ConsigGold** (conhecimento da Tania). **Não reutilizar para outra empresa.** |
| `CONSIGGOLD_SUPABASE_ANON_KEY` | knowledge-service | Sim, para o knowledge-service | Chave **pública/anon** do ConsigGold. Nunca service_role. |
| `META_PIXEL_ID` | finalize-candidate, send-meta-lead-event | Sim, para a Meta CAPI | ID do Pixel da Meta. |
| `META_CONVERSIONS_API_TOKEN` | finalize-candidate, send-meta-lead-event | Sim, para a Meta CAPI | Token da Conversions API. |
| `RESEND_API_KEY` | daily-leads-report | Sim, para o relatório diário | Envio de e-mail via Resend. |
| `WHATSAPP_CLOUD_API_TOKEN` | finalize-candidate, send-lembretes-ficha, send-whatsapp-approval, send-whatsapp-ficha, submit-ficha | Sim, para WhatsApp | Token da WhatsApp Cloud API. |
| `WHATSAPP_PHONE_NUMBER_ID` | as mesmas 5 acima | Sim, para WhatsApp | Número de envio (um só, hoje o da Tania). |
| `WHATSAPP_FICHA_TEMPLATE_NAME` | finalize-candidate, send-lembretes-ficha, send-whatsapp-ficha | Sim, para envio da Ficha | Nome do template aprovado na Meta. |
| `WHATSAPP_APPROVAL_TEMPLATE_NAME` | finalize-candidate, send-whatsapp-approval | Sim, para aprovação automática | Nome do template de aprovação. |
| `WHATSAPP_TANIA_NOTIFICATION_TEMPLATE_NAME` | submit-ficha | Sim, para aviso à Tania | Template que avisa a Tania de nova Ficha. |
| `TANIA_WHATSAPP_NOTIFICATION_NUMBER` | `_shared/tania-whatsapp-numero.ts` | Não (fallback) | Usado só se `settings.tania_whatsapp_numero` faltar. Dado de contato da Tania. |

## 2. Webhook do WhatsApp na Vercel (`apps/admin/api/webhooks/whatsapp.mjs`)

Configuradas em Vercel → projeto `tania-joias-recrutamento` (Admin) → Settings → Environment Variables.

| Nome | Obrigatória? | Finalidade |
|---|---|---|
| `META_APP_SECRET` | Sim | Valida a assinatura HMAC dos webhooks da Meta. |
| `WHATSAPP_VERIFY_TOKEN` | Sim | Handshake de verificação do webhook. |
| `SUPABASE_URL` (ou `VITE_SUPABASE_URL` como fallback) | Sim | Banco onde as mensagens são gravadas. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Escrita server-side (ignora RLS). |
| `TANIA_WHATSAPP_NUMBER` | Não (fallback) | Número da Tania quando `settings` não responder. |
| `WHATSAPP_AUTO_REPLY_ENABLED` | Não (default desligado) | Liga a resposta automática. |
| `WHATSAPP_AUTO_REPLY_TEXT` | Não | Texto da resposta automática. |
| `WHATSAPP_ACCESS_TOKEN` | Só com auto-reply ligado | Token de envio da Cloud API. **O nome é diferente** do usado nas Edge Functions (`WHATSAPP_CLOUD_API_TOKEN`). |
| `WHATSAPP_PHONE_NUMBER_ID` | Só com auto-reply ligado | Número de envio. |

Os registros do projeto indicam que existe outro código de webhook do WhatsApp
(pasta BrilhoFlow `production-app`) fora deste repositório. As variáveis dele são
**NÃO DETERMINADAS** aqui.

## 3. Frontends Vite (Landing e Admin)

| Nome | Consumidor | Obrigatória? | Finalidade |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Landing, Admin | Sim | URL pública do projeto Supabase. |
| `VITE_SUPABASE_ANON_KEY` | Landing, Admin | Sim | Chave pública (anon/publishable). |

Configuradas em `apps/<app>/.env` (local, ignorado pelo Git) e nas Environment
Variables de cada projeto da Vercel. Existe também um `VERCEL_OIDC_TOKEN` em
`.env.local` na raiz, gerado pelo `vercel env pull`. Ele não é consumido pelo
código.

## 4. O que NÃO é variável, mas está fixo no código ou no banco

Esses pontos não ficam em variáveis, mas precisam ser revistos antes de qualquer
instalação nova (ex.: Rose Semijoias):

- **URLs dos crons fixas no projeto da Tania**, dentro das migrations
  `20260730190153_schedule_daily_leads_report.sql` e
  `20260815010000_add_lembrete_ficha_automatico.sql`
  (`https://iaqzbernshmhkqznleye.supabase.co/functions/v1/...`).
- Pixel da Meta fixo em `apps/landing/index.html`.
- `LANDING_BASE_URL` fixo em `apps/admin/src/lib/referralLink.ts`.
- Remetente e destinatário fixos em `supabase/functions/daily-leads-report/index.ts`.
- Seed `settings.tania_whatsapp_numero`, com o número da Tania, na migration
  `20260818181000_add_setting_tania_whatsapp_numero.sql`.
