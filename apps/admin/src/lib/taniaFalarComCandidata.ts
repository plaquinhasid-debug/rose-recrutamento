import { BRAND } from "@tania-joias/shared"
// IMPLEMENTATION-CRM-004B (item 3) — mensagem pronta pra Tania puxar
// conversa com a própria candidata (distinto de `mensagemParaTania` em
// `TaniaAprovacaoSection.tsx`, que fala COM a Tania SOBRE a candidata).
// Nunca enviada automaticamente — só abre o WhatsApp com o texto pronto, a
// Tania ainda clica "Enviar". Extraída como função pura (arquivo `.ts`, não
// `.tsx`) pra ser testável sob `node --test` sem precisar transpilar JSX.
export function mensagemFalarComCandidata(nome: string): string {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? ""
  return `Oi, ${primeiroNome}! Aqui é a ${BRAND.dona}, da ${BRAND.nome}. Estou analisando seu cadastro para revendedora e gostaria de falar rapidinho com você.`
}
