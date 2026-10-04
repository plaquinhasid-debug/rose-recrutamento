import { BRAND } from "@tania-joias/shared"
import { ChatTranscript } from "@/components/sofia/ChatTranscript"
import { ErrorScreen } from "@/components/sofia/ErrorScreen"
import { LoadingScreen } from "@/components/sofia/LoadingScreen"
import { ResultScreen } from "@/components/sofia/ResultScreen"
import { SofiaAnswerInput } from "@/components/sofia/SofiaAnswerInput"
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { SOFIA_STEPS } from "@/data/sofia-script"
import type { SofiaFlow } from "@/hooks/useSofiaFlow"

interface SofiaChatPanelProps {
  flow: SofiaFlow
  onClose: () => void
}

export function SofiaChatPanel({ flow, onClose }: SofiaChatPanelProps) {
  const {
    phase,
    messages,
    currentStep,
    botTyping,
    answers,
    result,
    errorMessage,
    submitAnswer,
    retrySubmit,
  } = flow

  const stepPosition = currentStep ? SOFIA_STEPS.indexOf(currentStep) + 1 : 0
  const progress =
    phase === "result" || phase === "submitting" || phase === "closing" || phase === "abandoned"
      ? 100
      : Math.round((stepPosition / SOFIA_STEPS.length) * 100)

  const isConversationPhase =
    phase === "intro" || phase === "asking" || phase === "closing" || phase === "abandoned"

  return (
    <>
      <SheetHeader className="border-b-0 bg-[var(--wa-header)] px-4 py-3">
        <div className="flex items-center gap-3">
          <img
            src="/assets/sofia-avatar.jpg"
            alt="Sofia"
            className="size-10 shrink-0 rounded-full object-cover"
          />
          <div>
            <SheetTitle className="font-sans text-[var(--wa-header-foreground)]">Sofia</SheetTitle>
            <SheetDescription className="text-[var(--wa-header-foreground)]/80">
              Assistente virtual · {BRAND.nome}
            </SheetDescription>
          </div>
        </div>
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--wa-track)]">
          <div
            className="h-full rounded-full bg-[var(--wa-accent)] transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </SheetHeader>

      {isConversationPhase && (
        <>
          <ChatTranscript messages={messages} botTyping={botTyping} />
          <div className="border-t border-black/5 bg-[var(--wa-input-bar)] px-3 py-2.5 sm:px-4">
            {currentStep ? (
              <SofiaAnswerInput
                step={currentStep}
                disabled={botTyping}
                onAnswer={(value, displayText) => submitAnswer(currentStep, value, displayText)}
              />
            ) : (
              <div className="h-11" />
            )}
          </div>
        </>
      )}

      {phase === "submitting" && <LoadingScreen />}

      {phase === "error" && errorMessage && (
        <ErrorScreen message={errorMessage} onRetry={retrySubmit} />
      )}

      {phase === "result" && result && (
        <ResultScreen result={result} trabalha={answers.trabalha} onClose={onClose} />
      )}
    </>
  )
}
