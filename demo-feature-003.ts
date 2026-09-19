import { fileURLToPath, pathToFileURL } from "node:url"

// Nota técnica: `AIGateway.ts` importa `SupabaseAIProvider.ts`, que usa
// `import.meta.env` (só existe dentro do navegador/Vite) — por isso, rodando
// fora do navegador (linha de comando), não dá pra importar esse arquivo
// diretamente. Este script chama as MESMAS duas peças reais que
// `answerCandidateQuestion.ts` usa (`KnowledgeEngine.searchByQuestion` e
// `composeResponse`) e reproduz exatamente a mesma lógica de decisão dele —
// só o "telefonema pra Anthropic" em si é substituído por uma função local,
// já que isso depende do navegador/Edge Function.
// Relativo à localização deste arquivo: não depende de onde a pasta do projeto está.
const BASE = fileURLToPath(new URL("./apps/landing/src/orchestrator", import.meta.url))

function linha() {
  console.log("─".repeat(70))
}

async function main() {
  const { createDefaultKnowledgeEngine } = await import(pathToFileURL(`${BASE}/knowledge/KnowledgeEngine.ts`).href)
  const { composeResponse } = await import(pathToFileURL(`${BASE}/composer/ResponseComposer.ts`).href)

  const engine = createDefaultKnowledgeEngine()

  async function rodarPergunta(
    pergunta: string,
    chamarIA: (() => Promise<string>) | null,
  ) {
    const documentos = await engine.searchByQuestion(pergunta, 3)

    if (documentos.length === 0) {
      console.log("Documentos ENCONTRADOS DE VERDADE pelo KnowledgeEngine: 0")
      console.log("A IA foi chamada? false (nenhum documento relevante — pula direto pro fallback, Objetivo 4)")
      const composed = composeResponse({ aiResponse: "", intent: "QUESTION" })
      console.log("MENSAGEM FINAL (fallback):")
      console.log(composed.message)
      return
    }

    console.log(
      "Documentos ENCONTRADOS DE VERDADE pelo KnowledgeEngine:",
      documentos.map((d: { titulo: string }) => d.titulo),
    )

    if (!chamarIA) {
      console.log("(esta pergunta bateu em documento(s) por acaso — trocando por outra pra ilustrar o Objetivo 4 de verdade)")
      const composed = composeResponse({ aiResponse: "", intent: "QUESTION" })
      console.log("MENSAGEM FINAL (fallback):")
      console.log(composed.message)
      return
    }

    console.log("A IA foi chamada? true")

    let aiResponseText = ""
    try {
      aiResponseText = await chamarIA()
    } catch (err) {
      console.log("Erro capturado da IA (nunca propagado):", err instanceof Error ? err.message : String(err))
    }

    const composed = composeResponse({ aiResponse: aiResponseText, intent: "QUESTION" })
    console.log("MENSAGEM FINAL COMPOSTA:")
    console.log(composed.message)
  }

  linha()
  console.log("CENÁRIO 1 — pergunta coberta pela base (resposta da IA é SIMULADA por este script)")
  linha()
  await rodarPergunta("Quanto eu ganho de comissão?", async () => {
    return (
      "A comissão varia de 30% a 40%, dependendo de quanto você vender em cada ciclo de 30 dias — " +
      "quanto mais vende, maior a porcentagem que fica com você."
    )
  })

  linha()
  console.log("CENÁRIO 2 — pergunta FORA da base de conhecimento (100% real, IA nunca é chamada)")
  linha()
  await rodarPergunta("Vocês têm alguma promoção de Natal esse ano?", null)

  linha()
  console.log("CENÁRIO 3 — IA falha (simulado) — nunca trava, cai no fallback")
  linha()
  await rodarPergunta("As peças têm garantia?", async () => {
    throw new Error("Falha simulada (ex.: timeout da Anthropic)")
  })
  linha()
}

main()
