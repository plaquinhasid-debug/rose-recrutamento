import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { FunctionsHttpError } from "@supabase/functions-js"

import { resolveLoginNavigationTarget, resolveRoleAfterLogin } from "../apps/admin/src/lib/roleResolution.ts"
import { resolveEmbaixadoraRouteState } from "../apps/admin/src/lib/embaixadoraRouteState.ts"
import { resolveProtectedRouteState } from "../apps/admin/src/lib/protectedRouteState.ts"
import { fetchMinhaEmbaixadora } from "../apps/admin/src/lib/myEmbaixadora.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.7-B. Testes de todo o lado Admin do
// Portal Mínimo: resolução de papel pós-login, guard dedicado da
// Embaixadora, hook de busca, e isolamento estrutural em relação ao guard
// de equipe (que continua intocado). Mesmo padrão dos outros testes
// puros/estáticos do projeto — sem montar React/DOM.
// -----------------------------------------------------------------------

// =========================================================================
// resolveRoleAfterLogin — REGRA DE OURO: equipe primeiro, embaixadora só
// por confirmação positiva, nunca por fallback.
// =========================================================================

test("PAPEL: equipe=true -> 'equipe', SEM chamar fetchMinhaEmbaixadora (nunca gasta a segunda checagem à toa)", async () => {
  let fetchCalls = 0
  const role = await resolveRoleAfterLogin({
    checkIsEquipe: async () => true,
    fetchMinhaEmbaixadora: async () => { fetchCalls++; return { status: "ativa" } },
  })
  assert.equal(role, "equipe")
  assert.equal(fetchCalls, 0, "fetchMinhaEmbaixadora nunca deveria ser chamada quando checkIsEquipe já resolveu true")
})

test("PAPEL: equipe=false + Embaixadora ativa -> 'embaixadora' (só depois de checkIsEquipe resolver false)", async () => {
  const calls = []
  const role = await resolveRoleAfterLogin({
    checkIsEquipe: async () => { calls.push("is_equipe"); return false },
    fetchMinhaEmbaixadora: async () => { calls.push("my_embaixadora"); return { status: "ativa" } },
  })
  assert.equal(role, "embaixadora")
  assert.deepEqual(calls, ["is_equipe", "my_embaixadora"], "ordem estritamente sequencial: is_equipe sempre primeiro")
})

test("PAPEL: equipe=false + sem Embaixadora vinculada (null) -> 'none', NUNCA 'embaixadora' por fallback", async () => {
  const role = await resolveRoleAfterLogin({
    checkIsEquipe: async () => false,
    fetchMinhaEmbaixadora: async () => null,
  })
  assert.equal(role, "none")
})

for (const status of ["convidada", "inativa", "rejeitada"]) {
  test(`PAPEL: equipe=false + Embaixadora status '${status}' -> 'none' (só 'ativa' vira 'embaixadora')`, async () => {
    const role = await resolveRoleAfterLogin({
      checkIsEquipe: async () => false,
      fetchMinhaEmbaixadora: async () => ({ status }),
    })
    assert.equal(role, "none")
  })
}

test("PAPEL: checkIsEquipe rejeita -> propaga (throw), nunca vira 'none' silencioso", async () => {
  await assert.rejects(
    resolveRoleAfterLogin({
      checkIsEquipe: async () => { throw new Error("rede caiu") },
      fetchMinhaEmbaixadora: async () => ({ status: "ativa" }),
    }),
    { message: "rede caiu" },
  )
})

test("PAPEL: fetchMinhaEmbaixadora rejeita (depois de equipe=false) -> propaga (throw)", async () => {
  await assert.rejects(
    resolveRoleAfterLogin({
      checkIsEquipe: async () => false,
      fetchMinhaEmbaixadora: async () => { throw new Error("servidor fora") },
    }),
    { message: "servidor fora" },
  )
})

// =========================================================================
// resolveLoginNavigationTarget
// =========================================================================

test("NAVEGAÇÃO: role 'equipe' sem 'from' -> '/'", () => {
  assert.equal(resolveLoginNavigationTarget("equipe", undefined), "/")
})

test("NAVEGAÇÃO: role 'equipe' com 'from' -> preserva pathname+search (mesmo comportamento de resolveLoginRedirectTarget)", () => {
  assert.equal(
    resolveLoginNavigationTarget("equipe", { pathname: "/crm", search: "?lead=abc123" }),
    "/crm?lead=abc123",
  )
})

test("NAVEGAÇÃO: role 'embaixadora' -> sempre '/portal-embaixadora', mesmo com 'from' de uma rota de equipe", () => {
  assert.equal(resolveLoginNavigationTarget("embaixadora", undefined), "/portal-embaixadora")
  assert.equal(resolveLoginNavigationTarget("embaixadora", { pathname: "/crm", search: "?lead=abc123" }), "/portal-embaixadora")
})

test("NAVEGAÇÃO: role 'none' -> null (chamador nunca navega, faz signOut + mostra erro)", () => {
  assert.equal(resolveLoginNavigationTarget("none", undefined), null)
  assert.equal(resolveLoginNavigationTarget("none", { pathname: "/crm" }), null)
})

// =========================================================================
// resolveEmbaixadoraRouteState — fail-closed exaustivo (mesmo espírito do
// teste equivalente de protected-route-state.test.mjs)
// =========================================================================

test("GUARD EMBAIXADORA: sessão carregando -> session-loading, manda sobre qualquer outro campo", () => {
  assert.equal(
    resolveEmbaixadoraRouteState({ sessionLoading: true, hasSession: false, lookupLoading: false, lookupError: null, minhaEmbaixadora: { status: "ativa" } }),
    "session-loading",
  )
})

test("GUARD EMBAIXADORA: sem sessão -> unauthenticated", () => {
  assert.equal(
    resolveEmbaixadoraRouteState({ sessionLoading: false, hasSession: false, lookupLoading: false, lookupError: null, minhaEmbaixadora: undefined }),
    "unauthenticated",
  )
})

test("GUARD EMBAIXADORA: erro na consulta -> lookup-error, mesmo com dado 'sobrando'", () => {
  assert.equal(
    resolveEmbaixadoraRouteState({ sessionLoading: false, hasSession: true, lookupLoading: false, lookupError: new Error("x"), minhaEmbaixadora: { status: "ativa" } }),
    "lookup-error",
  )
})

test("GUARD EMBAIXADORA: consulta carregando (sem erro) -> lookup-loading", () => {
  assert.equal(
    resolveEmbaixadoraRouteState({ sessionLoading: false, hasSession: true, lookupLoading: true, lookupError: null, minhaEmbaixadora: undefined }),
    "lookup-loading",
  )
})

test("GUARD EMBAIXADORA: minhaEmbaixadora === null -> forbidden (equipe ou conta sem vínculo)", () => {
  assert.equal(
    resolveEmbaixadoraRouteState({ sessionLoading: false, hasSession: true, lookupLoading: false, lookupError: null, minhaEmbaixadora: null }),
    "forbidden",
  )
})

test("GUARD EMBAIXADORA: minhaEmbaixadora com status !== 'ativa' -> forbidden (defesa em profundidade, mesmo o backend já garantindo isso)", () => {
  for (const status of ["convidada", "inativa", "rejeitada"]) {
    assert.equal(
      resolveEmbaixadoraRouteState({ sessionLoading: false, hasSession: true, lookupLoading: false, lookupError: null, minhaEmbaixadora: { status } }),
      "forbidden",
    )
  }
})

test("GUARD EMBAIXADORA: minhaEmbaixadora com status 'ativa' -> authorized", () => {
  assert.equal(
    resolveEmbaixadoraRouteState({ sessionLoading: false, hasSession: true, lookupLoading: false, lookupError: null, minhaEmbaixadora: { status: "ativa" } }),
    "authorized",
  )
})

test("GUARD EMBAIXADORA: fail-closed exaustivo — 'authorized' só quando sessão presente, sem loading, sem erro, e minhaEmbaixadora.status==='ativa'", () => {
  const boolValues = [true, false]
  const errorValues = [null, undefined, new Error("x")]
  const embaixadoraValues = [undefined, null, { status: "ativa" }, { status: "convidada" }, { status: "inativa" }]

  for (const sessionLoading of boolValues) {
    for (const hasSession of boolValues) {
      for (const lookupLoading of boolValues) {
        for (const lookupError of errorValues) {
          for (const minhaEmbaixadora of embaixadoraValues) {
            const result = resolveEmbaixadoraRouteState({ sessionLoading, hasSession, lookupLoading, lookupError, minhaEmbaixadora })
            const shouldBeAuthorized =
              !sessionLoading && hasSession && !lookupLoading && !lookupError &&
              !!minhaEmbaixadora && minhaEmbaixadora.status === "ativa"
            if (result === "authorized") {
              assert.ok(shouldBeAuthorized, `authorized indevido para: ${JSON.stringify({ sessionLoading, hasSession, lookupLoading, lookupError: !!lookupError, minhaEmbaixadora })}`)
            }
          }
        }
      }
    }
  }
})

// =========================================================================
// fetchMinhaEmbaixadora (hook de dados)
// =========================================================================

test("HOOK: 200 com dado válido -> objeto projetado", async () => {
  const result = await fetchMinhaEmbaixadora(async () => ({ data: { nome: "Carol", status: "ativa", codigo_referral: "7E9NH4VD" }, error: null }))
  assert.deepEqual(result, { nome: "Carol", status: "ativa", codigo_referral: "7E9NH4VD" })
})

test("HOOK: 404 (embaixadora_nao_encontrada) -> null, NUNCA lançado como erro", async () => {
  const result = await fetchMinhaEmbaixadora(async () => ({
    data: null,
    error: new FunctionsHttpError(new Response(JSON.stringify({ error: "embaixadora_nao_encontrada" }), { status: 404 })),
  }))
  assert.equal(result, null)
})

for (const status of [401, 403, 500]) {
  test(`HOOK: HTTP ${status} propaga (throw) — nunca vira null silencioso`, async () => {
    await assert.rejects(
      fetchMinhaEmbaixadora(async () => ({
        data: null,
        error: new FunctionsHttpError(new Response(JSON.stringify({ error: "x" }), { status })),
      })),
    )
  })
}

test("HOOK: falha de rede/rejeição -> propaga (throw)", async () => {
  await assert.rejects(fetchMinhaEmbaixadora(async () => { throw new Error("network down") }), { message: "network down" })
})

test("HOOK: resposta malformada (200 mas sem os campos certos) -> null, não lança", async () => {
  for (const data of [null, {}, { nome: "Carol" }, { nome: "", status: "ativa", codigo_referral: "X" }, { nome: "Carol", status: "algo-invalido", codigo_referral: "X" }]) {
    const result = await fetchMinhaEmbaixadora(async () => ({ data, error: null }))
    assert.equal(result, null, `esperava null para data=${JSON.stringify(data)}`)
  }
})

test("HOOK: projeta só os 3 campos, descarta extras da resposta", async () => {
  const result = await fetchMinhaEmbaixadora(async () => ({
    data: { nome: "Carol", status: "ativa", codigo_referral: "7E9NH4VD", user_id: "vazar", invite_token_hash: "vazar" },
    error: null,
  }))
  assert.deepEqual(Object.keys(result).sort(), ["codigo_referral", "nome", "status"])
})

// =========================================================================
// ISOLAMENTO ESTRUTURAL — equipe × Embaixadora nunca se misturam
// =========================================================================

test("ISOLAMENTO: ProtectedRoute.tsx (equipe) permanece usando SÓ useIsEquipe/is_equipe — nunca importa nada do lado da Embaixadora", () => {
  const source = readFileSync(new URL("../apps/admin/src/routes/ProtectedRoute.tsx", import.meta.url), "utf8")
  assert.match(source, /useIsEquipe/)
  assert.doesNotMatch(source, /useMyEmbaixadora|embaixadoraRouteState|EmbaixadoraProtectedRoute|get-my-embaixadora/)
})

test("ISOLAMENTO: EmbaixadoraProtectedRoute.tsx nunca importa useIsEquipe nem checa is_equipe — guard totalmente independente", () => {
  const source = readFileSync(new URL("../apps/admin/src/routes/EmbaixadoraProtectedRoute.tsx", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.doesNotMatch(codeOnly, /useIsEquipe|is_equipe/)
  assert.doesNotMatch(codeOnly, /from ["']@\/routes\/ProtectedRoute["']/, "não deveria importar o componente ProtectedRoute (equipe)")
  assert.match(source, /useMyEmbaixadora/)
  assert.match(source, /resolveEmbaixadoraRouteState/)
})

test("ISOLAMENTO: protectedRouteState.ts (equipe) e embaixadoraRouteState.ts (Embaixadora) são módulos totalmente separados, nenhum importa/reaproveita o outro", () => {
  // protectedRouteState.ts é PRÉ-EXISTENTE (cabeçalho cita a rodada
  // "IMPLEMENTATION-EMBAIXADORAS-E2.2-D.0-B" em que nasceu — a string
  // "embaixadora" aparece só nesse rótulo histórico, não porque referencia
  // o guard novo). O que importa de verdade é: nenhum import cruzado, nenhum
  // símbolo do guard da Embaixadora reaproveitado.
  const equipeSource = readFileSync(new URL("../apps/admin/src/lib/protectedRouteState.ts", import.meta.url), "utf8")
  const embaixadoraSource = readFileSync(new URL("../apps/admin/src/lib/embaixadoraRouteState.ts", import.meta.url), "utf8")
  assert.doesNotMatch(equipeSource, /import[^\n]*embaixadoraRouteState/i)
  assert.doesNotMatch(equipeSource, /resolveEmbaixadoraRouteState|EmbaixadoraRouteState/)
  assert.doesNotMatch(embaixadoraSource, /import[^\n]*protectedRouteState/i)
  assert.doesNotMatch(embaixadoraSource, /resolveProtectedRouteState|ProtectedRouteState/)
})

test("ISOLAMENTO: App.tsx tem duas árvores de rota SEPARADAS (<ProtectedRoute /> e <EmbaixadoraProtectedRoute />), nunca uma aninhada dentro da outra", () => {
  const source = readFileSync(new URL("../apps/admin/src/App.tsx", import.meta.url), "utf8")
  assert.match(source, /<Route element=\{<ProtectedRoute \/>\}>/)
  assert.match(source, /<Route element=\{<EmbaixadoraProtectedRoute \/>\}>/)
  assert.match(source, /<Route path="\/portal-embaixadora" element=\{<EmbaixadoraPortalPage \/>\}\s*\/>/)
  // a rota do portal não pode estar dentro do mesmo bloco <AppLayout /> da equipe
  const appLayoutBlockMatch = source.match(/<Route element=\{<AppLayout \/>\}>[\s\S]*?<\/Route>/)
  assert.ok(appLayoutBlockMatch, "deveria existir o bloco <AppLayout /> da equipe")
  assert.doesNotMatch(appLayoutBlockMatch[0], /portal-embaixadora/)
})

test("ISOLAMENTO: EmbaixadoraPortalPage nunca importa componentes/rotas exclusivos da equipe (AppLayout, Sidebar, is_equipe)", () => {
  const source = readFileSync(new URL("../apps/admin/src/pages/EmbaixadoraPortalPage.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(source, /AppLayout|Sidebar|is_equipe|useIsEquipe/)
})

test("PORTAL: EmbaixadoraPortalPage mostra saudação com nome, status, código de indicação, e um botão que chama signOut()", () => {
  const source = readFileSync(new URL("../apps/admin/src/pages/EmbaixadoraPortalPage.tsx", import.meta.url), "utf8")
  assert.match(source, /Olá, \{nome\}/)
  assert.match(source, /codigo_referral/)
  assert.match(source, /onClick=\{\(\) => void signOut\(\)\}/)
})

test("PORTAL: EmbaixadoraPortalPage não RENDERIZA/IMPLEMENTA recompensas/saldo/ConsigGold/R$40 (ainda fora de escopo) — indicações (E2.9) passou a ser escopo real, então deixou de ser proibida aqui", () => {
  const source = readFileSync(new URL("../apps/admin/src/pages/EmbaixadoraPortalPage.tsx", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  // E2.8: "indicações" (plural) era proibido — a feature ainda não existia.
  // E2.9: "Minhas indicações" é a própria feature desta etapa, então a
  // palavra passou a ser esperada. O que continua proibido é qualquer
  // rastro de recompensa/saldo/ConsigGold/R$40, e nomes de tabela crus
  // (nunca deveriam aparecer no frontend de qualquer forma).
  // E3.4: prêmio/totais passaram a ser escopo real (vindos de get-my-indicacoes).
  // Continua proibido: ConsigGold, motivo de cancelamento, valor fixo no
  // código e nomes de tabela crus.
  assert.doesNotMatch(codeOnly, /consiggold|motivo|r\$\s*40|4000|indicacoes_embaixadoras|recompensas_embaixadoras/i)
})

// =========================================================================
// REGRESSÃO — equipe continua funcionando exatamente como antes
// =========================================================================

test("REGRESSÃO: resolveProtectedRouteState (equipe) continua com o mesmo comportamento fail-closed de sempre", () => {
  assert.equal(resolveProtectedRouteState({ sessionLoading: false, hasSession: true, isEquipeLoading: false, isEquipeError: null, isEquipe: true }), "authorized")
  assert.equal(resolveProtectedRouteState({ sessionLoading: false, hasSession: true, isEquipeLoading: false, isEquipeError: null, isEquipe: false }), "forbidden")
})

// =========================================================================
// SEGURANÇA ESTÁTICA COMPLEMENTAR
// =========================================================================

test("segurança estática: sem credenciais manuais, armazenamento ou logs no código novo do frontend", () => {
  for (const path of [
    "../apps/admin/src/lib/myEmbaixadora.ts",
    "../apps/admin/src/hooks/useMyEmbaixadora.ts",
    "../apps/admin/src/lib/roleResolution.ts",
    "../apps/admin/src/lib/embaixadoraRouteState.ts",
    "../apps/admin/src/routes/EmbaixadoraProtectedRoute.tsx",
    "../apps/admin/src/pages/EmbaixadoraPortalPage.tsx",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8")
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|localStorage|sessionStorage|console\.(log|error)|setQueryData/)
  }
})
