# PROJECT_STATUS.md — Tania Joias / Sofia

> **Atualização de 2026-09-26:** nova **seção 9 (Programa Embaixadoras, E1 a E3.4)** e novas notas de publicação na **seção 8**, verificadas nesta data. **As seções 1 a 7 continuam descrevendo o estado de 2026-08-04 e NÃO foram revalidadas** — em especial o status da FEATURE-005 e do WhatsApp automático, e a lista de Edge Functions da seção 5 (hoje há mais funções, ver seção 9).

> Atualizado em 2026-08-04. A própria Tania LIGOU as duas flags de IA (`sofia_ia_ativa` e `sofia_perguntas_ia_ativa`) em produção — confirmado direto no banco. Landing e Admin redeployados com o código do FEATURE-004. Além disso: texto da mensagem manual de WhatsApp (Admin) atualizado, e "Ganhe até 40% de comissão!" adicionado em 2 lugares na Landing Page (Hero + card de benefício). **FEATURE-005** (classificação contextual + "condução natural" da Sofia, modo Shadow) foi construída em 5 partes incrementais, cada uma testada isoladamente — código pronto e commitado, mas **migration ainda não aplicada e nada ainda publicado** — ver seção 6. A ideia do WhatsApp automático segue desenhada mas não implementada. Mantido a cada mudança importante para não perder histórico entre sessões. Este arquivo descreve o estado real do código e da infraestrutura — não é um roadmap nem uma proposta.

---

## 1. O que existe e funciona (produção real)

### Landing Page + wizard Sofia
- `apps/landing` (Vite + React 19 + TypeScript), deploy Vercel (`tania-joias-landing`).
- Sofia é um **wizard determinístico**, não um agente de IA em tempo real: `apps/landing/src/data/sofia-script.ts` define cada pergunta/validação (Zod) como dado; `useSofiaFlow.ts` percorre o array e decide a próxima etapa.
- Coleta: nome, cidade, idade, telefone, "trabalha atualmente?" (regra hardcoded, nunca gerada por IA), profissão, empresa atual, experiência com vendas, WhatsApp, Instagram, tempo disponível, objetivo.
- Grava em tempo real (fire-and-forget) em `conversations`/`answers`; finaliza via Edge Function `finalize-candidate`.
- Copy da página (2026-08-04): "Ganhe até 40% de comissão!" adicionado em destaque no Hero (`Hero.tsx`, logo abaixo do título) e no card "Excelente Margem de Lucro" (`QuemSomos.tsx`).

### Motor de decisão (100% determinístico, produção)
- `finalize-candidate` é o único ponto de escrita de `leads`. Calcula IPR (soma ponderada: trabalha/experiência/whatsapp/instagram/cidade atendida, pesos em `settings.ipr_pesos`), decide `status` (aprovada/em_analise/reprovada) e `perfil_comercial` (baixo/medio/alto) contra `settings.ipr_thresholds`. **Nunca a IA decide isso.**
- Dispara evento `Lead` ao Meta Conversions API quando aprovada (`send-meta-lead-event`).

### Enriquecimento por IA (produção, ATIVO hoje — `settings.sofia_ia_ativa = {ativa: true}`)
- `finalize-candidate` chama `_shared/ai-analysis.ts` (Claude Haiku, tool-use forçado) para gerar resumo executivo/comercial/comportamental/motivacional, ICP score, sentimento etc. — grava em `ai_analysis`. **Consultivo, nunca influencia `status`/`perfil_comercial`.** Se falhar ou a flag estiver off, cai no texto determinístico.
- `sofia-reagir` gera reações contextuais em só 2 pontos da conversa (depois de "profissão" e de "objetivo") para a Sofia soar menos formulário. Sempre `{mensagem: string | null}`; `null` cai no texto estático do roteiro.

### Perguntas de negócio por IA na conversa (produção, ATIVO hoje — `settings.sofia_perguntas_ia_ativa = {ativa: true}`, ligado por ela em 2026-08-04)
- FEATURE-004: quando a candidata digita uma pergunta de negócio real (ex.: "quanto eu ganho de comissão?") num campo de texto livre do roteiro em vez de responder, a Sofia busca a resposta na base de conhecimento oficial (`KnowledgeEngine.searchByQuestion()`), responde via `agent-ai-gateway` (documentos como base exclusiva, `ResponseComposer` valida a mensagem) e retoma a MESMA pergunta numa bolha separada — nunca grava a pergunta como resposta, nunca pula a etapa.
- Trava dupla: o cliente busca a flag uma vez por conversa (`sofia-config`, `useSofiaFlow.ts`/`beginIntro`) e só tenta o pipeline se ela estiver ligada; o próprio `agent-ai-gateway` confere a mesma flag de novo no servidor antes de gastar uma chamada de IA (defesa em profundidade — nunca confia só no cliente).
- Toggle em Admin → Configurações → "Sofia — Responder perguntas por IA" (`useSofiaPerguntasIaAtiva`/`useSaveSofiaPerguntasIaAtiva`, mesmo padrão do `sofia_ia_ativa`).
- Testado ao vivo, fluxo completo no navegador: com a flag ligada, pergunta real respondida corretamente (fiel ao documento oficial) e a mesma pergunta do roteiro retomada em seguida; com a flag desligada, o texto digitado é tratado como resposta normal — comportamento idêntico ao que existia antes da FEATURE-004.
- **Bug corrigido no teste ao vivo**: a primeira versão anexava a pergunta do roteiro na MESMA mensagem da IA (via `currentQuestion`) — como a IA quase sempre fecha a própria resposta com uma pergunta de engajamento (parte do PLAYBOOK-001), isso colidia com a política "nunca duas perguntas na mesma mensagem" (FEATURE-002.1) e descartava a resposta boa pro fallback quase sempre. Corrigido separando em duas bolhas.

### Admin
- `apps/admin` (Vite + React + TanStack Query/Table), deploy Vercel (`tania-joias-recrutamento`). Auth via Supabase Auth (email/senha, sem cadastro público).
- Páginas: Dashboard, Leads, CRM (kanban dnd-kit), Radar (eventos de funil), Reports, Settings (inclui os toggles `sofia_ia_ativa` e `sofia_perguntas_ia_ativa`).
- `SofiaAnalysisCard` exibe a análise de IA no drawer de detalhe do lead.
- Mensagem manual de WhatsApp (`LeadDetailDrawer.tsx`, botão "Enviar WhatsApp" — só abre um rascunho no `wa.me`, ainda não é automático, ver seção 6) — texto padrão atualizado em 2026-08-04 pra abrir com "Bacana! Você passou pela primeira fase."

### Relatório diário
- `daily-leads-report` (Resend + pg_cron) envia resumo diário de leads por e-mail.

### Ponte segura com a Anthropic
- `agent-ai-gateway`: Edge Function, contrato fechado (só aceita `GENERATE_CONVERSATIONAL_RESPONSE`, allowlist de origem, limites de tamanho, tool-use forçado, sem proxy genérico de prompt) + trava da flag `sofia_perguntas_ia_ativa` (hoje ligada — a trava do servidor continua ativa e voltaria a barrar tudo se a flag fosse desligada de novo).
- `sofia-config`: Edge Function nova (FEATURE-004), só devolve `{ perguntas_ia_ativa: boolean }` — existe porque `settings` não tem RLS para o papel `anon` da Landing (mesmo motivo do `sofia-reagir` checar a flag `sofia_ia_ativa` no servidor).

---

## 2. O que existe mas é "shadow" — construído, testado isoladamente, NUNCA visto pela candidata

**Atualização FEATURE-004**: `KnowledgeEngine`, `AIGateway`/`SupabaseAIProvider`, `ResponseComposer` e o pipeline `answerCandidateQuestion()` **deixaram de ser shadow** — desde a FEATURE-004 eles são código real, alcançável em produção (confirmado pelo aumento do bundle e grep dos símbolos), só que **condicionados à flag `sofia_perguntas_ia_ativa`** (ver seção 1). Continuam listados abaixo pelo histórico de como foram construídos/testados isoladamente antes de serem conectados; o restante da árvore (pipeline determinístico, AgentProfile, Simulator) continua 100% shadow de verdade — nunca chamado nem alcançável pelo fluxo real, com ou sem flag.

Essa árvore vive em `apps/landing/src/orchestrator/`; as partes ainda-shadow são 100% tree-shaken do bundle de produção (confirmado por grep no JS final a cada mudança) — a única conexão real delas com `useSofiaFlow.ts` é o `SofiaOrchestrator`, que roda em paralelo ao roteiro só OBSERVANDO (seu retorno nunca é usado para decidir nada visível):

- **Pipeline determinístico** *(shadow de verdade)*: WorkingMemory → Context → ConversationState → Objectives → Planner → IntentClassifier → DecisionEngine → ActionEngine. Classifica intenção (pergunta/dúvida/objeção/resposta/etc.) e "decidiria" o que fazer — mas ninguém age sobre essa decisão hoje (a FEATURE-004 reage à Ação `ANSWER_WITH_TOOL` em `useSofiaFlow.ts`, fora do Orchestrator).
- **AgentProfile / AgentRegistry / AgentFactory / AgentRuntime** *(shadow de verdade)*: identidade formal da Sofia (missão, tom, princípios, capabilities/limitations estruturadas), injetada de verdade no `SofiaOrchestrator` via `createSofiaRuntime()` — mas só usada para os logs de observação, não para gerar nada visível.
- **KnowledgeEngine / KnowledgeTool** *(agora alcançável em produção via FEATURE-004, atrás de flag)*: **8 documentos OFICIAIS** revisados por Antonio (proprietário) — comissão (30-40% por faixa de venda), consignação (ciclo de 30 dias), garantia (3 meses anéis / 6 meses demais peças + exclusões), troca por defeito (1ª grátis, 2ª com frete), elegibilidade (idade/cidade/WhatsApp+Instagram/trabalha — 5 cidades, já batendo com produção), processo de candidatura, primeiro mostruário. Fonte arquivada em `docs/knowledge/COM-001` a `COM-004` (COM-002 na v1.1). `searchByQuestion()` extrai palavras-chave + stemming leve + desempate por título/id — 6/6 perguntas de teste corretas em 1º lugar. `KnowledgeDocument.visibility: "public" | "internal"` com trava default-deny em todo método de leitura — testado ao vivo simulando vazamento, zero vazamento confirmado. Todos os 8 documentos oficiais hoje são `visibility: "public"`. `KnowledgeTool` (bridge pro `ToolEngine`) continua não registrada em nada — só o `KnowledgeEngine` direto é usado pela FEATURE-004.
- **AIGateway / AIProvider / AnthropicProvider (stub) / SupabaseAIProvider** *(agora alcançável em produção via FEATURE-004, atrás de flag)*: `createDefaultAIGateway()` (stub que lança erro) continua sem uso; `useSofiaFlow.ts` monta um `AIGateway` real com `SupabaseAIProvider` na hora, com timeout de 6s.
- **ResponseComposer / AcknowledgmentLibrary / TransitionLibrary / ResponsePolicies** *(agora alcançável em produção via FEATURE-004, atrás de flag)*: monta a mensagem final (reconhecimento + conteúdo validado + transição) seguindo o `PLAYBOOK-001`, com políticas anti-promessa/anti-duas-perguntas e fallback seguro.
- **Agent Simulator** *(shadow de verdade, dev-only)*: laboratório que roda o `SofiaOrchestrator` real turno a turno contra 6 cenários (incluindo `PERGUNTAS_CONHECIMENTO`, FEATURE-003), fora do bundle.
- **Pipeline FEATURE-003 (`orchestrator/pipeline/answerCandidateQuestion.ts`)** *(agora alcançável em produção via FEATURE-004, atrás de flag)*: liga as 4 peças acima — `KnowledgeEngine.searchByQuestion()` → `AIGateway.request()` (documentos como base exclusiva) → `ResponseComposer.composeResponse()`. Sem documento relevante, a IA nunca é chamada; erro/timeout cai no mesmo fallback seguro do Composer. Testado em 3 camadas (exemplos locais, cenário no Simulator, 6/6 perguntas ao vivo contra a Anthropic real) antes de ser conectado — ver seção 1 pra como a conexão em si (FEATURE-004) foi testada.

**Em resumo**: a arquitetura de agente (perfil, memória, classificação de intenção, decisão) continua rodando em paralelo sem nenhum fio ligado à experiência real — mas a partir da FEATURE-004, o caminho específico "candidata pergunta algo → Sofia responde com IA" deixou de ser shadow e passou a ser **produção real atrás de uma flag desligada por padrão**, exatamente como o `sofia_ia_ativa` já funcionava.

## 3. O que está incompleto, quebrado ou é só placeholder

- **Pasta `landing/` na raiz do repo** (fora de `apps/`) — um scaffold antigo, órfão, de um único commit ("Add landing page project", 29/07), fora do workspace npm (`package.json` raiz só inclui `apps/*` e `packages/*`). Não é usado por nada, mas está versionado — vale decidir se remove.
- **`supabase/vercel.json.txt`** — arquivo solto na raiz de `supabase/`, extensão `.txt` (não `.json`), conteúdo de configuração de build Vercel. Parece um rascunho esquecido, não tracked ainda.
- **Busca do `KnowledgeEngine` por palavra-chave (v1, sem busca semântica)** — `searchByQuestion()` agora usa stemming leve + desempate por título/id (corrigido nesta rodada); 6/6 perguntas de teste retornam o documento certo em 1º lugar. Ainda não é busca semântica de verdade — limitação aceita para esta fase.
- **Base de conhecimento oficial** — as duas divergências da v1.0 do COM-002 (filhos/estado civil e 4 vs. 5 cidades) foram resolvidas pelo Antonio na v1.1; a mensagem exata de reprovação por "desempregada" foi definida e já está em produção em `SOFIA_REJECTION_LINES` (`sofia-script.ts`); e o `KnowledgeDocument` já tem o campo `visibility` como trava estrutural (ver seção 2). Nenhuma pendência conhecida restante nesta frente.
- **Migrations locais**: até o FEATURE-005, toda alteração de schema foi via `apply_migration` direto no remoto, sem arquivo local. A primeira migration versionada do projeto existe agora (`supabase/migrations/20260804121129_add_sofia_conducao_natural_setting.sql`, FEATURE-005 Parte 5) — criada mas **ainda não aplicada** ao banco remoto.
- **Nenhum test runner** (Vitest/Jest) instalado no monorepo — toda a verificação de RFC-007 em diante foi feita com "cenários executáveis" rodados manualmente via browser, não testes automatizados de verdade.
- **Analytics/métricas de conversas reais** (taxa de abandono, perguntas mais frequentes sem resposta) não existe nenhuma automação — só o que dá pra ver manualmente via `logs`/`conversations`/`answers` no Supabase Studio ou no Radar do Admin.

## 4. Decisões técnicas já tomadas e por quê

- **IA nunca decide aprovação/reprovação/IPR** — decisão de negócio deliberada da Tania desde o início; reforçada em toda RFC subsequente (inclusive no PLAYBOOK-001 e no system prompt do `agent-ai-gateway`).
- **Chave da Anthropic nunca no browser** — todo acesso à IA passa por Edge Function; o `AnthropicProvider` client-side é um stub que lança erro de propósito (RFC-004), substituído pelo `SupabaseAIProvider` (RFC-011) que fala com `agent-ai-gateway`.
- **Toda integração de IA nova nasce desconectada, atrás de flag/observação, e só é ligada com autorização explícita** — padrão seguido rigorosamente do RFC-002 até a FEATURE-002.1: cada peça nova (Orchestrator, AIGateway, KnowledgeEngine, ResponseComposer) foi construída, testada isoladamente e comprovada com zero footprint no bundle de produção antes de sequer se cogitar conectar.
- **`agent-ai-gateway` usa `verify_jwt: false`**, igual a `finalize-candidate`/`sofia-reagir` — a Landing é pública, sem usuário autenticado; a proteção vem de contrato fechado (uma única operação aceita), allowlist de origem, limites de tamanho e validação estrita, não de autenticação.
- **Nenhuma pergunta do roteiro pode ser removida ou substituída por IA** — coleta de nome/telefone/cidade/"trabalha atualmente" continua 100% determinística; a FEATURE-004 só deixa a IA responder dúvidas pontuais no meio do caminho, sempre retomando a mesma etapa depois — nunca decide o que é perguntado nem pula nada.
- **`git push` não confiável para deploy** — Vercel às vezes não dispara build automático; o fluxo confiável é `vercel --prod` manual (ver histórico de sessões anteriores).

## 5. Stack e ferramentas em uso

| Camada | Tecnologia |
|---|---|
| Monorepo | npm workspaces (`apps/*`, `packages/*`) |
| Landing | Vite 8 + React 19 + TypeScript 6, Tailwind 4, Radix UI, React Hook Form + Zod |
| Admin | Vite 8 + React 19 + TypeScript, TanStack Query/Table, React Router, dnd-kit, Recharts |
| Shared | `packages/shared` — tipos gerados do Supabase, schemas Zod, constantes |
| Backend | Supabase (Postgres 17, projeto `tania-joias-crm`, ref `iaqzbernshmhkqznleye`, região `sa-east-1`) |
| Edge Functions | Deno, funções ativas incluem: `finalize-candidate`, `sofia-reagir`, `send-meta-lead-event`, `daily-leads-report`, `agent-ai-gateway`, `sofia-config` (as duas últimas, FEATURE-004, atrás da flag `sofia_perguntas_ia_ativa` — hoje ligada), `send-whatsapp-approval` (nova, ver seção 7, atrás da flag `whatsapp_aprovacao_automatica_ativa` — hoje desligada) |
| IA | Anthropic Claude (`claude-haiku-4-5-20251001`), sempre via tool-use forçado, sempre server-side |
| Hospedagem | Vercel — 2 projetos separados (`tania-joias-landing`, `tania-joias-recrutamento`) |
| E-mail | Resend (relatório diário via pg_cron) |
| Rastreamento | Meta Pixel + Conversions API |

**Como a Sofia recebe/envia mensagens hoje**: não existe canal de mensageria real (nada de WhatsApp/Telegram/webhook) — é inteiramente um widget de chat embutido na Landing Page, com roteiro fixo client-side. Textos gerados por IA em produção hoje (ambas as flags ligadas): as reações de `sofia-reagir` (2 pontos da conversa: pós-"profissão" e pós-"objetivo"), o resumo final de `ai-analysis.ts` (visível só no Admin, nunca para a candidata), e as respostas a perguntas de negócio via `agent-ai-gateway` (FEATURE-004, quando a candidata digita algo que "parece pergunta" — ver regra do `IntentClassifier` abaixo).

**Regra exata de quando a IA responde uma pergunta da candidata** (`apps/landing/src/orchestrator/IntentClassifier.ts`): só é possível em campos de **texto livre** do roteiro (nunca nos de sim/não com botão, que não têm caixa de texto). E só é reconhecido como pergunta se o texto contém `?` OU começa com uma das palavras `quanto/como/quando/onde/por que/porque/qual/quais/o que/quem` E tem 6 palavras ou menos — é uma regra de palavras-chave determinística, não é a IA que decide isso. Se a candidata perguntar algo sem esses marcadores, o sistema não reconhece como pergunta e trata o texto como se fosse a resposta da etapa (provavelmente cai em erro de validação).

## 6. FEATURE-005 — classificação contextual + "condução natural" (código pronto, shadow, NADA publicado ainda)

Construída em 5 partes incrementais (cada uma com testes próprios rodados antes de avançar pra próxima), pra eventualmente deixar a Sofia reagir de forma mais natural em todo o roteiro (hoje só reage em 2 pontos: profissão/objetivo). **Todo o código está pronto e verificado, mas nada foi deployado/aplicado — o comportamento real de hoje é 100% idêntico ao de antes desta feature.**

- **Parte 1** (`orchestrator/classifyCandidateMessage.ts`): classificador determinístico de mensagem (`ANSWER/QUESTION/DOUBT/OBJECTION/SMALL_TALK/END_CONVERSATION/AMBIGUOUS`), sem contexto de campo. Mantido só por compatibilidade — não é o recomendado pra uso novo.
- **Parte 2** (`classifyCandidateMessageContextual.ts`): versão CONTEXTUAL — considera o campo atual pra resolver casos como "Tenho pouco tempo" (resposta válida em `tempo_disponivel`, mas objeção em outro campo) ou "Trabalho como professora" (não deve virar QUESTION só por causa do "como").
- **Parte 3** (`orchestrator/naturalConversation/`): `NaturalConversationEngine` — monta uma possível reação (`NONE`/`DETERMINISTIC`/`AI`) por campo, mas nunca chama IA de verdade ainda.
- **Parte 4**: conectada em modo SHADOW a `useSofiaFlow.ts` (`shadowObserver.ts`) — observa cada resposta, loga em dev, nunca exibe nada nem altera o fluxo. Modo controlado por injeção (não por Supabase ainda nesta parte).
- **Parte 5**: modo passou a vir de um setting real (`settings.sofia_conducao_natural`, migration criada mas **NÃO aplicada**), lido via `sofia-config` (Edge Function atualizada, código pronto mas **NÃO deployado**) e com toggle no Admin (`SettingsPage.tsx`, "Sofia — Condução Natural" — OFF/SHADOW selecionáveis, ACTIVE desabilitado). `ACTIVE` existe no contrato mas sempre roda como `SHADOW` (`resolveNaturalConversationMode`, `sourceTag: "ACTIVE_AS_SHADOW"` no log).
- **Bug crítico achado e corrigido durante a verificação da Parte 5**: o campo novo (`conducao_natural_modo`) tinha sido feito obrigatório no schema Zod da resposta de `sofia-config` — como a function publicada hoje ainda não tem esse campo, isso quebrava a validação da resposta INTEIRA e derrubava `perguntas_ia_ativa` (FEATURE-004) junto. Corrigido tornando o campo opcional; testado ao vivo contra a function real publicada, confirmando FEATURE-004 intacto.
- **O que falta pra isso valer pra candidatas de verdade**: aplicar a migration, publicar a `sofia-config` nova, publicar Admin e Landing, e só então ligar `SHADOW` (nunca `ACTIVE`, que não tem comportamento implementado) — nenhum desses passos foi feito ainda.
- 62 testes automatizados (rodados via browser, sem test runner instalado) cobrindo as 5 partes + 6 cenários do Simulator, todos passando.

## 7. WhatsApp automático na aprovação — código pronto e no ar, ATRÁS de flag desligada (aguardando cadastro dela na Meta)

Assim que uma candidata é aprovada (pela IPR na hora, ou manualmente pela equipe depois), o sistema tenta mandar automaticamente uma mensagem de aprovação via **WhatsApp Cloud API** (API oficial da Meta), pelo mesmo número que a equipe já usa. O botão manual "Enviar WhatsApp" (`LeadDetailDrawer.tsx`) continua existindo do jeito que é hoje — a automática só adianta o primeiro contato, não substitui.

- **Migration aplicada**: `leads.whatsapp_automatico_enviado_em timestamptz null` (idempotência, espelha `meta_lead_sent_at`) + `settings.whatsapp_aprovacao_automatica_ativa = {ativa: false}` (flag mestre, default OFF).
- **`supabase/functions/_shared/whatsapp-cloud-api.ts`** (novo): `normalizeBrazilPhone()` + `sendWhatsappApprovalTemplate({token, phoneNumberId, templateName, telefone, nome})` — `POST` pro Graph API (`/messages`), template com 1 variável (primeiro nome). Lança em erro; quem chama trata como best-effort.
- **`send-whatsapp-approval`** (Edge Function nova, deployada): recebe `{lead_id}`, checa flag ligada → lead aprovada → `whatsapp === true` → ainda não enviada (nessa ordem) → chama o helper → grava `whatsapp_automatico_enviado_em`. Testado isolado via `curl` com a flag desligada: `{"skipped":true,"reason":"flag_off"}`.
- **Dois pontos de disparo**: `finalize-candidate` (aprovação automática pela IPR, inline, mesmo bloco do Meta Pixel) e `useLeadDetail.ts`/`useUpdateLead` (aprovação manual pela equipe, mesmo bloco que já chama `send-meta-lead-event`). Ambos fire-and-forget, nunca travam a resposta pra candidata nem a UI do Admin.
- **Toggle no Admin** → Configurações → "WhatsApp — Mensagem automática na aprovação" (`useWhatsappAprovacaoAutomaticaAtiva`/`useSaveWhatsappAprovacaoAutomaticaAtiva`, mesmo padrão dos outros 3 toggles).
- **O que falta pra funcionar de verdade**: ela precisa completar o cadastro na Meta (Business Manager + WhatsApp Cloud API + modelo de mensagem submetido e aprovado — ela já iniciou esse processo, aguardando aprovação do template pela Meta) e colar `WHATSAPP_CLOUD_API_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_APPROVAL_TEMPLATE_NAME` nos Secrets do Supabase Studio. Sem essas credenciais configuradas, o envio falha silenciosamente (`whatsapp_credentials_not_configured`, best-effort) mesmo com a flag ligada. **Nunca testado com credenciais reais/número real ainda.**

## 8. Como as mudanças são publicadas (fluxo manual, sem CI/CD automático)

- **Edge Functions (Supabase)**: não há deploy automático por git push. O caminho usado nesta sessão é manual, via Supabase Studio → Edge Functions → a função → aba **Code** → colar o(s) arquivo(s) → **Deploy updates**. Sempre conferir o fim do arquivo colado (Ctrl+End) antes de publicar — um paste truncado no meio já causou erro de build uma vez.
- **Vercel (Landing e Admin)**: `git push` também não dispara build de forma confiável — o fluxo confiável é `vercel --prod --yes` rodado manualmente no terminal, na raiz do repo. `.vercel/project.json` fica normalmente linkado no projeto `tania-joias-landing`; pra publicar o Admin (`tania-joias-recrutamento`) é preciso relinkar antes (`vercel link --yes --project tania-joias-recrutamento`), publicar, e depois relinkar de volta pro `tania-joias-landing` (`vercel link --yes --project tania-joias-landing`) — senão o próximo deploy da Landing vai pro projeto errado.
- **Verificação pós-deploy**: depois de publicar, sempre vale conferir se o bundle JS realmente mudou (buscar a página, extrair os `<script src>`, checar se contém algum texto/símbolo novo) — já aconteceu de um app ser redeployado e o outro não, e a mudança "sumir" sem erro nenhum.
- Projeto Supabase: `tania-joias-crm`, ref `iaqzbernshmhkqznleye`, região `sa-east-1`. Projetos Vercel: `tania-joias-landing` e `tania-joias-recrutamento`, time `plaquinhasid-8956s-projects`.
- **Atualização 2026-09-26 (fluxo usado nas etapas E3.x, funcionou):**
  - Edge Functions: `npx supabase functions deploy <nome> --project-ref iaqzbernshmhkqznleye` (CLI já logado na máquina). Conferência rápida: `curl` sem login deve devolver **401**.
  - Admin: `npx vercel --prod --cwd apps/admin`, rodado da raiz do repo. O `.vercel/repo.json` mapeia `apps/admin` → `tania-joias-recrutamento`, então **não precisa relinkar**. ⚠️ Rodar `vercel --prod` na **raiz sem `--cwd`** publica a **Landing** (aconteceu em 2026-09-26, sem dano, código idêntico).
  - Verificação: baixar o bundle público de `recrutamento.taniajoiasmaua.com.br` e procurar um texto novo.

## 9. Programa Embaixadoras (atualizado em 2026-09-26)

Programa de indicação: uma Embaixadora convidada indica candidatas pelo link pessoal; quando a indicada recebe o **primeiro mostruário**, a Embaixadora ganha **R$ 40,00 via Pix**. Vive inteiro dentro deste repositório (Admin, Landing e Supabase) — não é um projeto separado.

### Regras de negócio (decididas pelo dono em 2026-09-26)
- "Primeiro mostruário" = quando o mostruário é **entregue** à vendedora indicada; a equipe informa a data.
- Só a Tania confirma — na prática, a **conta da equipe** (`is_equipe()`), que hoje é **uma só e compartilhada** entre o dono e a Tania; o sistema não distingue a pessoa.
- Pagamento é por **Pix, feito fora do sistema**; o sistema só registra "pago".
- O valor (R$ 40,00 = 4000 centavos) vem do **DEFAULT da coluna** `recompensas_embaixadoras.valor_centavos`; nenhum cliente envia nem calcula valor.

### Etapas e o que está no ar

| Etapa | O que faz | Onde |
|---|---|---|
| E1-A / E2.1–E2.2 | Tabelas `embaixadoras`, `indicacoes_embaixadoras`, `recompensas_embaixadoras` (RLS sem policies + REVOKE — acesso só via Edge Function); hardening de convite (hash SHA-256, expiração) e `is_equipe()` | migrations 2026-09-15 a 2026-09-17 |
| E2.3–E2.6 | Admin: listar, convidar, resgatar e reenviar convite | `list-ambassadors-admin`, `create-ambassador-invite`, `validate-ambassador-invite`, `redeem-ambassador-invite`, `resend-ambassador-invite` |
| E2.7-B | Portal da Embaixadora (`/portal-embaixadora`), separado da área da equipe | `get-my-embaixadora` |
| E2.8 | Link `?ref=CODIGO` na Landing; `finalize-candidate` registra a indicação (primeira indicação vence, por telefone) | `finalize-candidate` |
| E2.9 | Portal: "Minhas indicações" | `get-my-indicacoes` |
| **E3.1** | Admin: aba **Indicações** (Embaixadoras → Indicações), somente leitura | `list-indicacoes-admin` |
| **E3.2** | Admin: botão **"Confirmar entrega"** → cria a recompensa `disponivel` (a pagar). Bloqueia candidata não aprovada/desistente, data futura ou anterior à indicação; UNIQUE impede duplicidade (409) | `confirm-primeiro-mostruario` |
| **E3.3** | Admin: **"Marcar como paga"** (data do Pix) ou **"Cancelar"** (motivo obrigatório). Só a partir de `disponivel`; pago/cancelada são finais; UPDATE com `status='disponivel'` evita corrida | `update-recompensa-status` |
| **E3.4** | Portal: totais **"A receber" / "Já recebido"** e o prêmio de cada indicação. Cancelada e motivo **nunca** aparecem para a Embaixadora | `get-my-indicacoes` (atualizada) |

Commits das E3.x: `3b35e1e` (E3.1), `66c9883` (E3.2), `7f8bafe` (E3.3), `17afc2a` (E3.4), `e755f2b` (ajuste visual do Portal). Todos publicados e conferidos em 2026-09-26. Testes: 1068/1068 passando (`node --import ./tests/register-ts-loader.mjs --test tests/*.test.mjs`).

### Estado dos dados em produção (2026-09-26)
- 1 Embaixadora ativa (Carol, código `7E9NH4VD`).
- 2 indicações, **ambas de TESTE** ("TESTE E28 INDICACAO CAROL" — aprovada; "TESTE E28 NAO CONTATAR" — reprovada). **Não confirmar entrega na de teste**: geraria R$ 40 "a pagar" falsos (se acontecer, cancelar com motivo).
- 0 recompensas.

### Ainda não existe
- Invalidar indicação pelo Admin (colunas `invalidada_*` existem, sem função) — necessário para limpar as indicações de teste.
- Inativar/rejeitar Embaixadora pelo Admin (status existem no enum, sem função).
- Integração com o ConsigGold para confirmar a entrega automaticamente (`evento_origem_id` já existe para idempotência). Envolve dois sistemas: decidir antes, em ADR no Cérebro, como ligar a candidata do Recrutamento à vendedora do ConsigGold.
- Formulário público "quero ser Embaixadora" (fora da V1; hoje só por convite).
