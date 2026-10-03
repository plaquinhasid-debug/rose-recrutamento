import { BRAND } from "@tania-joias/shared"
// IMPLEMENTATION-EMBAIXADORAS-E2.8 — lógica pura do link pessoal de
// indicação no Portal da Embaixadora. Constrói a URL a partir do
// `codigo_referral` que `get-my-embaixadora` já devolve — nenhuma chamada
// de rede nova, nenhuma Edge Function nova só pra "pegar o link".
//
// Domínio deliberadamente separado de `lib/ambassadorInvite.ts`/
// `lib/myEmbaixadora.ts` (mesmo espírito de isolamento já usado no
// projeto): este arquivo nunca lida com token de convite/resgate, e vice-versa.

// Domínio canônico da Landing em produção (confirmado nas auditorias
// anteriores — apex redireciona pra "www", e é o domínio real usado nas
// campanhas). Constante fixa (não `import.meta.env`) de propósito: evita
// depender de uma env var nova no deploy do Admin só pra isso — o domínio é
// estável e já aparece como literal em outros pontos do projeto (ex.:
// EMBAIXADORAS_INVITE_BASE_URL no backend).
const LANDING_BASE_URL = "https://www.taniajoiasmaua.com.br"

/** Monta o link pessoal: domínio da Landing + `?ref=<codigo_referral>` — nunca um path novo, nunca expõe nada além do código público já existente. */
export function buildReferralUrl(codigoReferral: string): string {
  const url = new URL(LANDING_BASE_URL)
  url.searchParams.set("ref", codigoReferral)
  return url.toString()
}

/** Mensagem padrão de compartilhamento — mesma sugerida no pedido da E2.8, seção 15. */
export function buildWhatsappShareMessage(referralUrl: string): string {
  return `Oi! A ${BRAND.nome} está selecionando novas revendedoras. Se tiver interesse, você pode conhecer e fazer seu cadastro por este link: ${referralUrl}`
}

/** Link padrão de compartilhamento do WhatsApp (wa.me, sem API paga) — abre o app/web do WhatsApp com a mensagem pré-preenchida, URL-encoded. */
export function buildWhatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}

/** Mesmo padrão de copyInviteLink (lib/ambassadorInvite.ts): aguarda sucesso, nunca expõe o erro real, só true/false. */
export async function copyReferralLink(url: string, writeText: (text: string) => Promise<void>): Promise<boolean> {
  try {
    await writeText(url)
    return true
  } catch {
    return false
  }
}
