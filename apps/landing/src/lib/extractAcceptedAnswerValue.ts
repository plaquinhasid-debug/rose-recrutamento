/**
 * extractAcceptedAnswerValue (IMPLEMENTATION-012F).
 *
 * Separado DELIBERADAMENTE de `classifyCandidateMessageContextual.ts`
 * (IMPLEMENTATION-012E): aquele módulo só decide "isto pode preencher o
 * objetivo atual?" (sim/não) — nunca transforma o texto. Este módulo só
 * decide, DEPOIS que a resposta já foi aceita (`canFillCurrentField ===
 * true`), "qual é o valor limpo que deve ser gravado?". Nunca decide se
 * algo é ou não uma resposta válida — quem chama só deve usar isto quando
 * já sabe que a resposta foi aceita.
 *
 * Bug real que motivou isto: "Moro em Mauá" já era (e continua sendo,
 * corretamente) uma resposta válida para `cidade` — mas era GRAVADA
 * literalmente como "Moro em Mauá". `isCidadeAtendida`
 * (`supabase/functions/finalize-candidate/logic.ts`) compara por
 * IGUALDADE EXATA de string após uma normalização deliberadamente
 * conservadora (RFC-INTELLIGENCE-007, só maiúsculas/acentos/espaços/sufixo
 * UF) — "moro em maua" nunca bate com "maua". Resultado confirmado ao
 * vivo: candidatas que moram numa cidade atendida perdiam os 10 pontos de
 * `cidade_atendida` no IPR só por escrever a resposta como frase, em vez
 * do nome puro da cidade.
 *
 * Escopo deliberadamente restrito a `nome`/`cidade` — os únicos dois campos
 * onde já foi confirmado que uma frase inteira é aceita como resposta
 * válida mas o valor útil está só numa PARTE dela. Nenhum outro campo
 * (`profissao`, `objetivo`, `empresa_atual`...) é tocado: ali a resposta
 * inteira já É o valor por natureza (ex.: "Cabeleireira autônoma" não tem
 * nada pra "extrair").
 *
 * SEM fuzzy matching, SEM inferência de cidade, SEM busca de nome/cidade
 * no meio de frase arbitrária — só remove um prefixo EXPLICITAMENTE
 * reconhecido, ancorado no INÍCIO da string. Se nenhum prefixo bater, o
 * valor original volta (só com espaços colapsados) — comportamento de
 * hoje, sem regressão.
 */

const CITY_PREFIX_PATTERNS: readonly RegExp[] = [/^eu\s+moro\s+em\s+/i, /^moro\s+em\s+/i, /^eu\s+resido\s+em\s+/i, /^resido\s+em\s+/i]

// "sou <nome>" foi DELIBERADAMENTE deixado de fora (pedido explícito da
// tarefa) — "sou" é um prefixo comum demais em outros contextos (ex.:
// respostas de `profissao`, "Sou autônoma") pra tratar como prefixo de
// nome sem uma avaliação mais cuidadosa, que esta tarefa não pediu.
const NAME_PREFIX_PATTERNS: readonly RegExp[] = [
  /^meu\s+nome\s+completo\s+[eé]\s+/i,
  /^meu\s+nome\s+[eé]\s+/i,
  /^eu\s+me\s+chamo\s+/i,
  /^me\s+chamo\s+/i,
]

const PATTERNS_BY_FIELD: Partial<Record<string, readonly RegExp[]>> = {
  nome: NAME_PREFIX_PATTERNS,
  cidade: CITY_PREFIX_PATTERNS,
}

/** Colapsa espaços múltiplos e remove espaços nas pontas — nunca mexe em acento/capitalização/palavras internas. */
function collapseSpaces(texto: string): string {
  return texto.trim().replace(/\s+/g, " ")
}

/**
 * Extrai o valor limpo de uma resposta JÁ ACEITA pelo classificador. Para
 * campos fora de `nome`/`cidade`, devolve só o valor com espaços
 * colapsados — nunca remove prefixo.
 *
 * Se, depois de remover um prefixo reconhecido, sobrar uma string vazia
 * (ex.: candidata mandou só "moro em "), o prefixo NÃO é usado — devolve o
 * valor original (com espaços colapsados) em vez de gravar um campo vazio
 * silenciosamente.
 */
export function extractAcceptedAnswerValue(fieldKey: string, rawValue: string): string {
  const normalizado = collapseSpaces(rawValue)
  const padroes = PATTERNS_BY_FIELD[fieldKey]
  if (!padroes) return normalizado

  for (const padrao of padroes) {
    const resto = normalizado.replace(padrao, "")
    if (resto === normalizado) continue
    const limpo = collapseSpaces(resto)
    if (limpo.length > 0) return limpo
    break
  }

  return normalizado
}
