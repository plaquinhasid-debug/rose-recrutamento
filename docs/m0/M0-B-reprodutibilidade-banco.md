# M0-B: reprodutibilidade do banco a partir do repositório

**Data:** 2026-10-03 · **Produção:** Supabase `iaqzbernshmhkqznleye`, somente leitura · **Status:** M0 fechada. O replay isolado da M0-C foi **aprovado** (36/36 migrations, catálogo idêntico ao de produção; ver [M0-C-procedimento-fail-closed.md](M0-C-procedimento-fail-closed.md)). Nada foi aplicado em produção.

---

## ⛔ REGRA OPERACIONAL: NUNCA rodar `supabase db push` contra produção

Nenhuma versão das migrations do repositório coincide com o histórico de produção
(`supabase_migrations.schema_migrations`). Um `db push`, `migration up` ou
`db reset` apontado para produção trataria as migrations do repositório como
novas e tentaria reaplicá-las sobre objetos que já existem. Várias não são
idempotentes. O resultado seria falha no meio do caminho e/ou alterações
indevidas.

**Esta proibição continua valendo até haver uma decisão explícita sobre o
alinhamento do histórico** (renomear arquivos × `migration repair`). Nenhuma
das duas opções foi executada na M0-B.

Desde a M0-C o CLI está **desvinculado** de propósito: não existe
`supabase/.temp/project-ref`, que é o vínculo real no CLI 2.119.0, e o cache
`linked-project.json` foi removido. **Não** vincular de novo sem uma decisão
explícita: com o CLI vinculado, qualquer comando com `--linked` atinge produção.

---

## 1. O que a M0-B fez (somente arquivos locais)

| Arquivo | O que é |
|---|---|
| 9 migrations `20260729144506` … `20260803174930` | SQL recuperado **byte a byte** de `supabase_migrations.schema_migrations` de produção. MD5 de cada arquivo = `md5(statements[1])` em produção. Nenhuma alteração, inclusive a falta de quebra de linha final em `20260803174930`. |
| `20261003193541_capture_prod_only_objects.sql` | Realtime (`leads`, `whatsapp_messages` na publication `supabase_realtime`) + seed `whatsapp_notificacao_tania_ativa = {"ativa": false}`. Idempotente. |
| `supabase/config.toml` | Configuração **local** da CLI (portas padrão, Postgres 17, `verify_jwt` por função espelhando produção). Sem segredos, sem ref de produção. |
| `docs/supabase-runtime-requirements.md` | Inventário dos **nomes** de variáveis/segredos. |
| este documento | Pendências e achados. |

As 24 migrations que já existiam **não foram alteradas nem renomeadas**.

## 2. Divergência de histórico (registrada, não corrigida)

- **22 migrations** existem nos dois lados com SQL idêntico (comparado por hash,
  sem comentários e espaços), mas **todas com timestamp diferente**. No grupo de
  15/09, a ordem local difere da de produção (`invite_hardening` roda antes de
  `harden_staff`/`revoke`). A análise estática não encontrou dependência entre
  essas migrations.
- **2 migrations só no repositório**, com objetos já presentes em produção (aplicadas
  fora do mecanismo de migrations):
  - `20260813233000_add_whatsapp_conversations`
  - `20260817020000_add_sofia_knowledge_source_setting`. Aplicá-la em produção
    **falharia**, porque `add constraint sofia_knowledge_source_modo_check` já existe.
- **9 migrations só em produção**: agora recuperadas no repositório, com a mesma versão.
- **Não foi feito** `migration repair`, nem renomeação, nem alteração do histórico de produção.

## 3. Pendências que bloqueiam ou afetam a reconstrução (para a M0-C)

### 3.1 🔴 BLOQUEANTE: política `authenticated_select_whatsapp_messages` sem origem

`20260915200000_harden_authenticated_staff_authorization.sql` (linha 132) executa
`drop policy authenticated_select_whatsapp_messages on whatsapp_messages;`
**sem `if exists`**. Nenhuma migration, nem do repositório nem do histórico de
produção, cria essa política antes disso. Em produção ela foi criada
manualmente. Num banco novo, **a cadeia deve falhar na migration nº 29**.
Correção possível, a decidir na M0-C: uma migration nova com timestamp anterior a
`20260915200000` que crie a política original. Não foi feita na M0-B porque está
fora do escopo autorizado.

> ✅ **Resolvido no repositório na M0-B.1:**
> `20260915195959_compat_create_authenticated_select_whatsapp_messages.sql`,
> imediatamente antes do harden, cria a política na forma pré-harden
> (`using (true)`) só se ela não existir. O harden não foi modificado e continua
> fazendo o drop e a recriação com `is_equipe()`, que é o estado de produção.

### 3.2 🟠 Diferenças estruturais previstas no replay

| Objeto | Replay do repositório | Produção | Causa provável |
|---|---|---|---|
| `ai_analysis.perfil_sugerido_ia` | tipo `perfil_comercial_enum`, **sem** check | `text` + `ai_analysis_perfil_sugerido_ia_check` (`baixo/medio/alto/excelente`) | `20260801001942` cria a coluna como enum. `20260801191540` usa `add column if not exists ... text check(...)`, que é ignorado se a coluna existe. Em produção a coluna foi trocada manualmente. |
| política `anon_select_sofia_ia_ativa` em `settings` | **existe** (criada em `20260801001931`) | não existe | Removida manualmente em produção. Nenhuma migration faz o `drop`. |

A comparação completa de schema na M0-C pode revelar outras. Esta lista é só o
que a análise estática encontrou.

> ✅ **Reconciliado no repositório na M0-B.1:** `20261003194618_reconcile_prod_final_state.sql`
> é a última migration e é idempotente. Ela converte `perfil_sugerido_ia` para
> `text`, adiciona `ai_analysis_perfil_sugerido_ia_check` e executa
> `drop policy if exists anon_select_sofia_ia_ativa`. As migrations históricas
> não foram tocadas.

### 3.3 🔴 Cron com URL fixa da produção da Tania

`20260730190153_schedule_daily_leads_report.sql` e
`20260815010000_add_lembrete_ficha_automatico.sql` agendam `net.http_post` para
`https://iaqzbernshmhkqznleye.supabase.co/functions/v1/...`.

- **Risco na M0-C:** um banco local recriado com essas migrations **chamaria as
  Edge Functions de PRODUÇÃO** às 11:00 e às 13:00 UTC (relatório diário por
  e-mail e lembretes reais de Ficha por WhatsApp). Antes ou imediatamente depois
  de recriar o banco descartável, é obrigatório desagendar os jobs
  (`cron.unschedule`) **no banco local** ou isolar a rede.
- **Para a Rose/M1:** a URL precisa ser parametrizada. Isso não foi feito na M0-B
  por decisão explícita.

> ✅ **Barreira técnica preparada na M0-B.1 e validada na M0-C (2026-10-03):** o replay da M0-C roda
> num container com `--network none`, sem Supabase CLI e sem Edge Functions,
> protegido por um guard que falha fechado. Ver
> [M0-C-procedimento-fail-closed.md](M0-C-procedimento-fail-closed.md). As URLs
> históricas **não foram alteradas**. A parametrização continua pendente para a Rose/M1.

### 3.4 Edge Function `swift-action`

Publicada em produção (verify_jwt = true, criada em 2026-08-03), **não existe no
repositório** e nenhuma referência a ela foi encontrada no código. Não foi
recriada. Decidir depois se ela deve ser removida ou versionada. Correção da
M0-A: produção tem **24** Edge Functions publicadas, 23 no repositório mais
`swift-action`.

### 3.5 Auth

A configuração de Auth de produção (signup habilitado ou não, Site URL, Redirect
URLs, templates de e-mail, SMTP, política de senha) **não está versionada** e
**não foi lida**. As ferramentas de leitura usadas não a expõem. É **NÃO
DETERMINADA**. O `config.toml` usa defaults locais, não um espelho de produção.
Nenhum segredo foi copiado.

### 3.6 Outros pontos não versionados

- Valores atuais de `settings` (pesos de IPR, cidades, chaves ligadas) são
  **dados**, não estrutura. As migrations trazem só os defaults.
- Variáveis e segredos: ver `docs/supabase-runtime-requirements.md`.
- Webhook do WhatsApp fora deste repositório (pasta BrilhoFlow): **NÃO DETERMINADO**.

## 4. Cadeia final de migrations

> **Atualização M0-B.1:** agora são **36** migrations. Entraram
> `20260915195959_compat_…` (nº 29, logo antes do harden, que passou a ser o nº 30)
> e `20261003194618_reconcile_prod_final_state` (nº 36, a última). A varredura
> estática sistemática (tabelas, FKs, `alter`, políticas, enums, extensões,
> triggers) **não encontra mais nenhuma quebra**, e `tests/m0b1-migration-chain.test.mjs`
> fixa esses invariantes. A numeração abaixo é a da M0-B (34).

Primeira: `20260729144506_initial_schema`. Última (M0-B): `20261003193541_capture_prod_only_objects`.

Dependências conferidas estaticamente:

- `initial_schema` (nº 1) cria `settings`, `leads`, `profiles`, `conversations`,
  `answers`, `logs`, `ai_analysis`, `campaigns`, os enums base, `handle_new_user`
  e `set_updated_at`. Vem antes de todo uso desses objetos.
- `pg_cron`/`pg_net` (nº 5) vêm antes do segundo cron (nº 20).
- `leads_ficha` (nº 14) vem antes de nº 15, 16 e 23. As tabelas WhatsApp (nº 18) vêm antes de nº 22 e 24.
- Embaixadoras (nº 27 a 33) vêm depois de `leads` e `profiles`.
- `is_equipe()` é criada em nº 29 (`create or replace`). Nenhuma migration
  anterior a referencia.
- A captura de Realtime (nº 34) vem depois de `leads` e `whatsapp_messages`.
- **Quebra conhecida:** nº 29 (ver 3.1).

## 5. Próximo passo (M0-C, não executado)

> ⚠️ **SUBSTITUÍDO na M0-B.1.** Os passos abaixo, que usavam `supabase start` e
> `db reset`, **não devem ser usados**: na época o CLI estava vinculado à produção, e o
> `supabase start` sobe containers com internet. O procedimento válido é
> [M0-C-procedimento-fail-closed.md](M0-C-procedimento-fail-closed.md).

1. Ambiente **descartável e local**: `npx supabase start` com este `config.toml`. Nunca `--linked`.
2. Resolver a 3.1 antes do replay, com autorização.
3. Aplicar só o repositório (`npx supabase db reset`, **local**).
4. Desagendar os crons locais imediatamente (3.3).
5. Comparar o schema local com o de produção (consultas ao catálogo, somente leitura em produção): tabelas, colunas, tipos, defaults, constraints, índices, enums, funções (definição, `SECURITY DEFINER`, ACL), triggers, políticas, extensões, publicações, jobs do cron e chaves de `settings`.
6. Classificar cada diferença (as esperadas estão em 3.2 e 3.3).
7. Rodar `npm run test:*`, só os testes locais.
8. `npx supabase stop --no-backup` para destruir o ambiente.
