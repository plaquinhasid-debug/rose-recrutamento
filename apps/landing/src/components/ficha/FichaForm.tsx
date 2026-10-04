import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  DOCUMENTO_TIPOS,
  DOCUMENTO_TIPO_LABEL,
  fichaAprovacaoSchema,
  type DocumentoTipo,
  type FichaAprovacaoPayload,
} from "@tania-joias/shared"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** 10 MB por arquivo — foto de celular costuma ter 2 a 5 MB. */
export const MAX_DOCUMENTO_BYTES = 10 * 1024 * 1024

/**
 * Rose: nesta etapa a ficha NÃO pede documentos. Pra voltar a pedir RG/CNH e
 * comprovante, troque pra `true` (o servidor já aceita com ou sem).
 */
const PEDIR_DOCUMENTOS = false

export type DocumentosSelecionados = Partial<Record<DocumentoTipo, File>>

interface FichaFormProps {
  onSubmitValues: (values: FichaAprovacaoPayload, documentos: DocumentosSelecionados) => Promise<void>
}

interface FieldProps {
  label: string
  error?: string
}

function Field({ label, error, children }: React.PropsWithChildren<FieldProps>) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function FichaForm({ onSubmitValues }: FichaFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [documentos, setDocumentos] = useState<DocumentosSelecionados>({})
  const [documentosErro, setDocumentosErro] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FichaAprovacaoPayload>({
    resolver: zodResolver(fichaAprovacaoSchema),
    defaultValues: { tem_conjuge: false, conjuge_trabalha: false, trabalha_atualmente: true },
  })

  const temConjuge = watch("tem_conjuge")
  const conjugeTrabalha = watch("conjuge_trabalha")
  const trabalhaAtualmente = watch("trabalha_atualmente")

  function selecionarDocumento(tipo: DocumentoTipo, file: File | undefined) {
    setDocumentosErro(null)
    if (file && file.size > MAX_DOCUMENTO_BYTES) {
      setDocumentosErro("Arquivo muito grande (máximo 10 MB). Tente uma foto com menos qualidade.")
      return
    }
    setDocumentos((prev) => {
      const next = { ...prev }
      if (file) next[tipo] = file
      else delete next[tipo]
      return next
    })
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    const faltando = PEDIR_DOCUMENTOS ? DOCUMENTO_TIPOS.filter((tipo) => !documentos[tipo]) : []
    if (faltando.length > 0) {
      setDocumentosErro(`Falta enviar: ${faltando.map((t) => DOCUMENTO_TIPO_LABEL[t]).join(", ")}.`)
      return
    }
    setSubmitting(true)
    try {
      await onSubmitValues(values, documentos)
    } catch {
      setSubmitError("Não deu pra enviar agora. Confira sua internet e tente de novo.")
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Endereço</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Rua" error={errors.endereco_rua?.message}>
              <Input {...register("endereco_rua")} placeholder="Nome da rua" />
            </Field>
          </div>
          <Field label="Número" error={errors.endereco_numero?.message}>
            <Input {...register("endereco_numero")} placeholder="Nº" />
          </Field>
          <Field label="CEP" error={errors.endereco_cep?.message}>
            <Input {...register("endereco_cep")} placeholder="00000-000" inputMode="numeric" />
          </Field>
          <Field label="Bairro" error={errors.endereco_bairro?.message}>
            <Input {...register("endereco_bairro")} placeholder="Bairro" />
          </Field>
          <Field label="Cidade" error={errors.endereco_cidade?.message}>
            <Input {...register("endereco_cidade")} placeholder="Cidade" />
          </Field>
          <div className="col-span-2">
            <Field label="A casa onde você mora é" error={errors.casa_propria?.message}>
              <select className={selectClass} defaultValue="" {...register("casa_propria")}>
                <option value="" disabled>
                  Escolha...
                </option>
                <option value="propria">Própria</option>
                <option value="alugada">Alugada</option>
                <option value="familia">De familiares / cedida</option>
              </select>
            </Field>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Trabalho</h2>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" className="size-4 rounded border-input" {...register("trabalha_atualmente")} />
          Trabalho atualmente (além da revenda)
        </label>

        {trabalhaAtualmente && (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Endereço do trabalho" error={errors.trabalho_endereco?.message}>
                <Input {...register("trabalho_endereco")} placeholder="Rua, número, bairro" />
              </Field>
            </div>
            <Field label="Telefone do trabalho" error={errors.trabalho_telefone?.message}>
              <Input {...register("trabalho_telefone")} placeholder="(11) 91234-5678" />
            </Field>
            <Field label="Seu horário de trabalho" error={errors.trabalho_horario?.message}>
              <Input {...register("trabalho_horario")} placeholder="Ex.: seg a sex, 8h às 17h" />
            </Field>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Família</h2>

        <Field label="Quantos filhos você tem? (0 se não tiver)" error={errors.filhos_quantidade?.message}>
          <Input type="number" min={0} inputMode="numeric" {...register("filhos_quantidade")} placeholder="0" />
        </Field>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" className="size-4 rounded border-input" {...register("tem_conjuge")} />
          Sou casada ou tenho companheiro
        </label>

        {temConjuge && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome dele" error={errors.conjuge_nome?.message}>
                <Input {...register("conjuge_nome")} placeholder="Nome completo" />
              </Field>
              <Field label="Telefone dele" error={errors.conjuge_telefone?.message}>
                <Input {...register("conjuge_telefone")} placeholder="(11) 91234-5678" />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" className="size-4 rounded border-input" {...register("conjuge_trabalha")} />
              Ele trabalha atualmente
            </label>

            {conjugeTrabalha && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Onde ele trabalha" error={errors.conjuge_trabalho_local?.message}>
                  <Input {...register("conjuge_trabalho_local")} placeholder="Nome da empresa/local" />
                </Field>
                <Field label="Telefone do trabalho dele" error={errors.conjuge_trabalho_telefone?.message}>
                  <Input {...register("conjuge_trabalho_telefone")} placeholder="(11) 91234-5678" />
                </Field>
              </div>
            )}
          </>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Mais algumas informações</h2>
        <Field label="Instagram profissional (se tiver)" error={errors.instagram_profissional?.message}>
          <Input {...register("instagram_profissional")} placeholder="@seunegocio" />
        </Field>
        <Field label="Você tem alguma restrição no CPF (nome no SPC/Serasa)?" error={errors.restricao_cpf?.message}>
          <select className={selectClass} defaultValue="" {...register("restricao_cpf")}>
            <option value="" disabled>
              Escolha...
            </option>
            <option value="nao">Não</option>
            <option value="sim">Sim</option>
            <option value="nao_sei">Não sei</option>
          </select>
        </Field>
      </div>

      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">2 referências</h2>
        <p className="text-sm text-muted-foreground">
          Pode ser mãe, irmãos, primos ou vizinhos — nome e telefone de 2 pessoas.
        </p>
        {([1, 2] as const).map((n) => (
          <div key={n} className="grid grid-cols-2 gap-4">
            <Field label={`Nome ${n}`} error={errors[`ref${n}_nome` as const]?.message}>
              <Input {...register(`ref${n}_nome` as const)} placeholder="Nome completo" />
            </Field>
            <Field label={`Telefone ${n}`} error={errors[`ref${n}_telefone` as const]?.message}>
              <Input {...register(`ref${n}_telefone` as const)} placeholder="(11) 91234-5678" />
            </Field>
          </div>
        ))}
      </div>

      {PEDIR_DOCUMENTOS && (
      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Documentos</h2>
        <p className="text-sm text-muted-foreground">
          Tire uma foto nítida de cada um (ou envie em PDF). Seus documentos ficam guardados com segurança e só a
          equipe tem acesso.
        </p>
        {DOCUMENTO_TIPOS.map((tipo) => (
          <Field key={tipo} label={DOCUMENTO_TIPO_LABEL[tipo]}>
            <Input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => selecionarDocumento(tipo, e.target.files?.[0])}
            />
          </Field>
        ))}
        {documentosErro && <p className="text-xs text-destructive">{documentosErro}</p>}
      </div>
      )}

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <Button type="submit" variant="gold" className="w-full" disabled={submitting}>
        {submitting ? "Enviando... (pode levar alguns segundos)" : "Enviar ficha"}
      </Button>
    </form>
  )
}
