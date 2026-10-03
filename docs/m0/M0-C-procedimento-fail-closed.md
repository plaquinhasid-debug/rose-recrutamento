# M0-C: procedimento fail-closed para reconstruir o banco

**Executado e APROVADO em 2026-10-03.** As 36 migrations foram aplicadas do
zero em `supabase/postgres:17.6.1.147`, a mesma versão de produção, num
container `--network none`. A comparação de catálogo com produção (somente
SELECT) deu hash idêntico em 23 de 23 categorias estruturais. Não houve
chamada externa e o container foi destruído no fim.

## ⛔ Regras que valem durante toda a M0-C

- **NÃO** usar o Supabase CLI para o replay (`supabase start`, `db reset`,
  `db push`, `migration up/repair`, `functions serve`). O `supabase start`
  aplica migrations num container **com acesso à internet**.
- **NÃO** vincular o CLI (`supabase link`). Ele fica **desvinculado** de propósito:
  isso reduz o risco de um `db push` acidental.
- **NÃO** rodar Edge Functions, `npm run dev`, Landing, Admin ou o webhook da Vercel.
  `apps/*/.env` apontam para produção.
- **NÃO** exportar nenhuma credencial no terminal (WhatsApp, Meta, Resend,
  Anthropic, ConsigGold, service role, access token).
- Produção continua **somente leitura**: só `SELECT` em catálogo e metadados, para comparar.

## Por que é fail-closed

| Risco | Barreira | Por que fecha mesmo se esquecermos algo |
|---|---|---|
| Crons históricos (`daily-leads-report` 0 11 * * *, `lembrete-ficha-pendente` 0 13 * * *) com URL das Edge Functions de produção | **Principal:** o banco roda num container com **`--network none`** | Sem interface além de `lo`, sem rota default e sem DNS: o `pg_net` não consegue abrir nenhuma conexão, **qualquer que seja a URL** |
| Janela entre o `cron.schedule` e a desativação | A rede já está ausente **antes** da primeira migration. **Defesa adicional:** neutralização verificada após cada migration (ver abaixo) | A camada adicional não é a proteção principal |
| Edge Functions (WhatsApp/Graph API, Resend, Meta CAPI, Anthropic, ConsigGold) | **Nenhuma** função roda na M0-C (sem edge runtime). O guard bloqueia credenciais no ambiente e em `supabase/.env*` | Sem execução e sem token, nada sai |
| Webhook da Vercel (`apps/admin/api/webhooks/whatsapp.mjs`) | Não é executado | Só roda na Vercel |
| CLI vinculado a projeto remoto | O guard (G2) falha com qualquer vínculo ou cache. O runner não usa o CLI e o guard rejeita comandos do CLI no runner (G6) | O replay não depende do CLI |
| URL de produção esquecida numa migration nova | O guard (G5) só aceita o ref de produção nas 2 migrations históricas de cron | E o `--network none` impediria o acesso de qualquer forma |

Isolamento **limitado ao container descartável**. Nada muda no Windows
Firewall, no DNS do Windows, na rede da máquina ou nas outras redes do Docker.

### Neutralização após cada migration (defesa adicional)

Mecanismo investigado num container `--network none` com a imagem 17.6.1.147:

- **Cron:** `cron.job` pertence a `supabase_admin`, e `postgres` só tem SELECT nela.
  Um `update cron.job` direto falha com `permission denied for table job`. O
  runner usa **`select cron.alter_job(jobid, active := false) from cron.job where active`**,
  executado como `postgres`, que é o dono dos jobs, porque as migrations rodam como `postgres`.
- **pg_net:** **`delete from net.http_request_queue`** como `postgres` (PUBLIC tem DELETE).
- **Verificação obrigatória após cada migration:** um SELECT prova **0 jobs ativos**
  e **fila = 0**. O runner também exige que o role atual tenha **BYPASSRLS** (`cron.job`
  tem RLS por `username`), para garantir que a leitura de validação enxerga
  **todos** os jobs.
- Falha de permissão, job ainda ativo, request pendente ou estado indeterminado
  **abortam o replay** antes da migration seguinte. Um job de outro dono não pode
  ser desativado por `postgres`, gera erro e também aborta.

Como confirmado na M0-C, o resultado em `net._http_response` foi 0: o pg_net
não chegou a tentar nenhuma requisição.

## Arquivos

- `scripts/m0c/m0c-safety-check.mjs`: **guard**, só leitura. `exit 1` em qualquer falha.
- `scripts/m0c/m0c-replay-isolated.mjs`: **runner** do replay. Exige `--confirm-m0c` e `--image`.
- Testes offline:
  - `tests/m0c-safety-check.test.mjs` (46; inclui os 12 testes de falha de leitura da M0-D);
  - `tests/m0c-replay-neutralize.test.mjs` (14);
  - `tests/m0b1-migration-chain.test.mjs` (7).

### O que o guard verifica (falha fechado)

| ID | Verificação | Falha quando |
|---|---|---|
| G1 | `supabase/config.toml` local | ausente, `project_id` ≠ `tania-joias-recrutamento-local`, ou menciona produção |
| G2 | vínculo do CLI (semântica do CLI 2.119.0) | existe `supabase/.temp/project-ref` (o **vínculo real**), mesmo vazio; existe **qualquer** cache `supabase/.temp/linked-project.json` (ele só é escrito ao vincular a um projeto remoto); `SUPABASE_PROJECT_ID` ou `SUPABASE_WORKDIR` definidos; ou o estado de algum desses arquivos é indeterminado |
| G3 | ambiente do processo | qualquer credencial proibida com valor; `SUPABASE_URL`/`DATABASE_URL`/`PGHOST` não local; qualquer variável mencionando produção |
| G4 | `supabase/.env`, `supabase/.env.local`, `supabase/functions/.env`, `supabase/functions/.env.local` | contêm credencial, URL não local ou referência à produção; ou **existem mas não podem ser lidos** (só `ENOENT` conta como ausente; corrigido na M0-D) |
| G5 | migrations | o ref/domínio de produção aparece fora das 2 migrations históricas de cron; nenhuma migration pôde ser lida; ou alguma migration **existe mas não pode ser lida** (corrigido na M0-D) |
| G6 | runner | ausente, sem `--network none`, com comando do Supabase CLI ou mencionando produção |
| G7 | container (com `--container`) | o container não existe, `NetworkMode` ≠ `none` ou está ligado a alguma rede |
| W1 | `apps/*/.env` | aviso apenas: apontam para produção, **não rodar frontends** |

## Procedimento da M0-C (usado em 2026-10-03)

**PASSO 0: pré-requisitos**
- O CLI precisa estar desvinculado: sem `project-ref` e sem `linked-project.json`.
  O `supabase unlink` (CLI 2.119.0) só age se `project-ref` existir e não faz chamadas de API.
- O Docker Desktop precisa estar ligado. Ao subir, ele pode religar containers de
  outros projetos (por exemplo, `consiggold-v3`). Esses containers não devem ser tocados.
- A imagem `supabase/postgres:17.6.1.147` deve ser baixada à parte (`docker pull`).

**PASSO 1: guard estático**
`node scripts/m0c/m0c-safety-check.mjs` precisa terminar com `exit 0`.

**PASSO 2: isolamento (Gate 3 e Gate 4)**
O runner cria `m0c-recrutamento-db` com `--network none` e **prova**, antes de
qualquer migration:
- `NetworkMode=none`;
- só a interface `lo`;
- nenhuma rota default em `/proc/net/route`;
- `getent hosts supabase.com` falhando.

Depois roda o guard com `--container` (G7). Se qualquer prova falhar, o
container é removido e o runner aborta.

**PASSO 3: segredos**
Coberto por G3 e G4. O container recebe só uma `POSTGRES_PASSWORD` aleatória,
descartável e nunca impressa.

**PASSO 4 e PASSO 5: banco local e replay**
`node scripts/m0c/m0c-replay-isolated.mjs --image supabase/postgres:17.6.1.147 --confirm-m0c`
- O runner espera `pg_isready -h 127.0.0.1`. Durante o init, a imagem sobe um
  servidor temporário só em socket; o TCP no loopback garante que o replay só
  conversa com o servidor final.
- Aplica as 36 migrations em ordem, com `psql -h 127.0.0.1 -v ON_ERROR_STOP=1`, como `postgres`.
- Após cada migration, roda a neutralização verificada. Para no primeiro erro.

**PASSO 6: comparar schema**
A mesma consulta de catálogo roda nos dois lados: em produção pelo SELECT; no
local via `docker exec m0c-recrutamento-db psql`. Compara-se um hash por categoria:
- tabelas e RLS, colunas, constraints, índices, enums;
- funções (corpo, `SECURITY DEFINER`, config, ACL, dono);
- triggers, políticas, ACL de tabela e de coluna, donos, replica identity, ACL do schema;
- extensões e versões, publicação, cron (nome, agenda, dono, comando);
- chaves de `settings`, comentários e `auth.users.raw_user_meta_data`.

Diferenças esperadas e aceitáveis:
- `active=false` nos jobs locais;
- **valores** de `settings` (não são comparados; são dados operacionais).

**PASSO 7: testes locais seguros**
Só testes offline que leem arquivos ou usam executor simulado. Nenhum teste contra o banco remoto.

**PASSO 8: destruir**
`docker rm -f m0c-recrutamento-db`. **Não** vincular o CLI de novo.

## Pontos confirmados na M0-C

1. A imagem cria `auth.users` com `raw_user_meta_data` (jsonb), e o role `postgres`
   conseguiu criar o trigger `on_auth_user_created`.
2. `pg_net` fica no schema `public`, como em produção.
3. As 7 migrations versionadas com CRLF na working copy (`core.autocrlf`) não
   deixaram nenhum `\r` em comentários nem em `settings.descricao`.
