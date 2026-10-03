/**
 * Fluxo da Sofia (versão enxuta da Rose) — wizard determinístico, sem IA na
 * conversa. Percorre `SOFIA_STEPS`, grava cada resposta em `answers`
 * (fire-and-forget) e finaliza pela Edge Function `finalize-candidate`, que
 * é quem decide aprovação/análise/reprovação.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import type { FinalizeCandidatePayload, FinalizeCandidateResponse } from "@tania-joias/shared"

import { finalizeCandidate, insertAnswer } from "@/lib/api"
import { extractAcceptedAnswerValue } from "@/lib/extractAcceptedAnswerValue"
import { getFbp, getOrBuildFbc, getOrCaptureFbclid } from "@/lib/tracking"
import type { UtmParams } from "@/lib/tracking"
import {
  SOFIA_INTRO_LINES,
  SOFIA_MENOR_IDADE_LINES,
  SOFIA_REJECTION_LINES,
  SOFIA_STEPS,
  findNextStepIndex,
  isInstagramSkipSignal,
  isMenorDeIdade,
  type SofiaStep,
} from "@/data/sofia-script"
import type { SofiaAnswerKey, SofiaAnswers, SofiaMessage, SofiaPhase } from "@/types/sofia"

const INTRO_LINE_DELAY_MS = 650
const QUESTION_DELAY_MS = 450
const CLOSING_LINE_DELAY_MS = 700
/** Um único lembrete se a candidata parar no meio da conversa. */
const IDLE_NUDGE_DELAY_MS = 90_000

function newId(): string {
  return crypto.randomUUID()
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

/** Reconhecimento curto antes da próxima pergunta (deixa a conversa menos "formulário"). */
function reconhecimento(key: SofiaAnswerKey, answers: SofiaAnswers): string | null {
  if (key === "nome") {
    const primeiroNome = String(answers.nome ?? "").trim().split(/\s+/)[0]
    return primeiroNome ? `Prazer, ${primeiroNome}! 🌸` : null
  }
  if (key === "trabalha" && answers.trabalha === true) return "Que ótimo! 😊"
  if (key === "instagram" && answers.instagram) return "Anotado! ✨"
  return null
}

interface UseSofiaFlowParams {
  sessionId: string
  utm: UtmParams
  origem?: string
  campanha?: string
}

export interface SofiaFlow {
  phase: SofiaPhase
  messages: SofiaMessage[]
  currentStep: SofiaStep | null
  botTyping: boolean
  answers: SofiaAnswers
  result: FinalizeCandidateResponse | null
  errorMessage: string | null
  reachedEnd: boolean
  beginIntro: () => void
  submitAnswer: (step: SofiaStep, value: string | number | boolean, displayText: string) => void
  retrySubmit: () => void
}

export function useSofiaFlow({ sessionId, utm, origem, campanha }: UseSofiaFlowParams): SofiaFlow {
  const [phase, setPhase] = useState<SofiaPhase>("intro")
  const [messages, setMessages] = useState<SofiaMessage[]>([])
  const [stepIndex, setStepIndex] = useState<number>(0)
  const [botTyping, setBotTyping] = useState(false)
  const [answers, setAnswers] = useState<SofiaAnswers>({})
  const [result, setResult] = useState<FinalizeCandidateResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reachedEnd, setReachedEnd] = useState(false)

  const introStarted = useRef(false)
  const runToken = useRef(0)

  const phaseRef = useRef<SofiaPhase>("intro")
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  const idleNudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleNudgeShownRef = useRef(false)

  const scheduleIdleNudge = useCallback(() => {
    if (idleNudgeTimerRef.current) {
      clearTimeout(idleNudgeTimerRef.current)
      idleNudgeTimerRef.current = null
    }
    if (idleNudgeShownRef.current) return
    idleNudgeTimerRef.current = setTimeout(() => {
      idleNudgeTimerRef.current = null
      if (idleNudgeShownRef.current || phaseRef.current !== "asking") return
      idleNudgeShownRef.current = true
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "bot",
          text: "Ainda está por aí? 😊\n\nSem pressa — pode continuar quando quiser.",
          time: formatTime(new Date()),
        },
      ])
    }, IDLE_NUDGE_DELAY_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (idleNudgeTimerRef.current) clearTimeout(idleNudgeTimerRef.current)
    }
  }, [])

  const pushBotLine = useCallback(
    async (text: string, delayMs: number) => {
      setBotTyping(true)
      await wait(delayMs)
      setBotTyping(false)
      setMessages((prev) => [...prev, { id: newId(), role: "bot", text, time: formatTime(new Date()) }])
      scheduleIdleNudge()
    },
    [scheduleIdleNudge],
  )

  const pushUserMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: newId(), role: "user", text, time: formatTime(new Date()) }])
  }, [])

  const runSubmission = useCallback(
    async (finalAnswers: SofiaAnswers) => {
      const token = ++runToken.current
      setPhase("submitting")
      setErrorMessage(null)

      const payload: FinalizeCandidatePayload = {
        session_id: sessionId,
        nome: finalAnswers.nome ?? "",
        telefone: finalAnswers.telefone ?? "",
        cidade: finalAnswers.cidade,
        idade: finalAnswers.idade,
        trabalha: finalAnswers.trabalha ?? false,
        empresa_atual: finalAnswers.empresa_atual,
        profissao: finalAnswers.profissao,
        experiencia_vendas: finalAnswers.experiencia_vendas,
        instagram: finalAnswers.instagram ?? null,
        // O telefone é pedido como WhatsApp — confirmado pela própria pergunta.
        whatsapp: true,
        objetivo: finalAnswers.objetivo,
        origem,
        campanha,
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
        utm_content: utm.utm_content,
        fbp: getFbp(),
        fbc: getOrBuildFbc(getOrCaptureFbclid()),
        fbclid: getOrCaptureFbclid(),
      }

      try {
        const response = await finalizeCandidate(payload)
        if (runToken.current !== token) return
        setResult(response)
        setReachedEnd(true)
        setPhase("result")
        if (response.status === "aprovada") {
          window.fbq?.("track", "Lead", {}, { eventID: response.lead_id })
        }
      } catch (err) {
        if (runToken.current !== token) return
        console.error("[sofia] falha ao finalizar candidatura", err)
        setErrorMessage("Não conseguimos enviar suas respostas agora. Verifique sua conexão e tente novamente.")
        setPhase("error")
      }
    },
    [sessionId, origem, campanha, utm.utm_source, utm.utm_medium, utm.utm_campaign, utm.utm_content],
  )

  /** Menor de 18: encerra com carinho, sem criar lead nenhum. */
  const handleMenorDeIdade = useCallback(async () => {
    await pushBotLine(SOFIA_MENOR_IDADE_LINES.join("\n\n"), 300)
    setPhase("abandoned")
  }, [pushBotLine])

  const advanceAfterAnswer = useCallback(
    async (updatedAnswers: SofiaAnswers, fromIndex: number, answeredKey: SofiaAnswerKey) => {
      if (answeredKey === "idade" && typeof updatedAnswers.idade === "number" && isMenorDeIdade(updatedAnswers.idade)) {
        await handleMenorDeIdade()
        return
      }

      const next = findNextStepIndex(fromIndex, updatedAnswers)

      if (next < SOFIA_STEPS.length) {
        setStepIndex(next)
        setPhase("asking")
        const prefixo = reconhecimento(answeredKey, updatedAnswers)
        const pergunta = SOFIA_STEPS[next].question
        await pushBotLine(prefixo ? `${prefixo}\n\n${pergunta}` : pergunta, QUESTION_DELAY_MS)
        return
      }

      if (updatedAnswers.trabalha === false) {
        setPhase("closing")
        await pushBotLine(SOFIA_REJECTION_LINES.join("\n\n"), CLOSING_LINE_DELAY_MS)
      }

      await runSubmission(updatedAnswers)
    },
    [pushBotLine, runSubmission, handleMenorDeIdade],
  )

  const submitAnswer = useCallback(
    (step: SofiaStep, value: string | number | boolean, displayText: string) => {
      pushUserMessage(displayText)

      const provisionalAnswers = { ...answers, [step.key]: value } as SofiaAnswers

      if (step.key === "nome" && typeof value === "string") {
        provisionalAnswers.nome = extractAcceptedAnswerValue("nome", value)
      }
      if (step.key === "cidade" && typeof value === "string") {
        provisionalAnswers.cidade = extractAcceptedAnswerValue("cidade", value)
      }
      // "não tenho" no Instagram segue sem @ (a candidata fica em análise,
      // nunca é pré-aprovada automaticamente — ver finalize-candidate).
      if (step.key === "instagram" && typeof value === "string") {
        provisionalAnswers.instagram = isInstagramSkipSignal(value) ? null : value.trim()
      }

      void insertAnswer({
        sessionId,
        questionKey: step.key,
        questionLabel: step.question,
        answerValue: String(displayText),
      })

      setAnswers(provisionalAnswers)
      void advanceAfterAnswer(provisionalAnswers, stepIndex + 1, step.key)
    },
    [answers, pushUserMessage, sessionId, stepIndex, advanceAfterAnswer],
  )

  const beginIntro = useCallback(() => {
    if (introStarted.current) return
    introStarted.current = true
    void (async () => {
      await pushBotLine(SOFIA_INTRO_LINES.join("\n\n"), INTRO_LINE_DELAY_MS)
      const first = findNextStepIndex(0, {})
      setStepIndex(first)
      setPhase("asking")
      await pushBotLine(SOFIA_STEPS[first].question, 400)
    })()
  }, [pushBotLine])

  const retrySubmit = useCallback(() => {
    void runSubmission(answers)
  }, [answers, runSubmission])

  const currentStep: SofiaStep | null =
    phase === "asking" && stepIndex < SOFIA_STEPS.length ? SOFIA_STEPS[stepIndex] : null

  return {
    phase,
    messages,
    currentStep,
    botTyping,
    answers,
    result,
    errorMessage,
    reachedEnd,
    beginIntro,
    submitAnswer,
    retrySubmit,
  }
}
