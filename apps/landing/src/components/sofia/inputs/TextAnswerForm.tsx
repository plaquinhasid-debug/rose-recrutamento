import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface TextAnswerFormProps {
  /** Identificador da etapa atual — usado só para resetar o form ao trocar de pergunta. */
  stepKey: string
  schema: z.ZodTypeAny
  placeholder?: string
  multiline?: boolean
  disabled?: boolean
  onSubmitValue: (value: string | number, displayText: string) => void
}

export function TextAnswerForm({
  stepKey,
  schema,
  placeholder,
  multiline = false,
  disabled = false,
  onSubmitValue,
}: TextAnswerFormProps) {
  const formSchema = z.object({ value: schema })
  type FormValues = z.infer<typeof formSchema>

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { value: "" },
  })

  useEffect(() => {
    reset({ value: "" })
    // Reseta o campo sempre que a etapa (pergunta) muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey])

  const onSubmit = handleSubmit((data) => {
    onSubmitValue(data.value, String(data.value))
  })

  const errorMessage = errors.value?.message

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-1.5">
      <div className="flex items-end gap-2">
        {multiline ? (
          <Textarea
            {...register("value")}
            placeholder={placeholder}
            disabled={disabled}
            rows={3}
            aria-invalid={Boolean(errorMessage)}
            className="flex-1 rounded-2xl border-none bg-white focus-visible:ring-[var(--wa-accent)]/40"
            autoFocus
          />
        ) : (
          <Input
            {...register("value")}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={Boolean(errorMessage)}
            className="flex-1 rounded-full border-none bg-white focus-visible:ring-[var(--wa-accent)]/40"
            autoFocus
          />
        )}
        <Button
          type="submit"
          size="icon"
          disabled={disabled}
          aria-label="Enviar resposta"
          className={cn(
            "bg-foil rounded-full text-[var(--wa-accent-foreground)] hover:brightness-110",
            multiline && "mb-0",
          )}
        >
          <Send className="size-4" />
        </Button>
      </div>
      {errorMessage && <p className="text-xs text-destructive">{String(errorMessage)}</p>}
    </form>
  )
}
