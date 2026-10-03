import test from "node:test"
import assert from "node:assert/strict"
import { mensagemFalarComCandidata } from "../apps/admin/src/lib/taniaFalarComCandidata.ts"

// -----------------------------------------------------------------------
// IMPLEMENTATION-CRM-004B (item 3) — mensagem pronta do botão "Falar com a
// candidata". Nunca envia sozinha (isso é responsabilidade do
// whatsappLinkWithMessage + window.open no componente, não desta função
// pura) — aqui só testamos o TEXTO.
// -----------------------------------------------------------------------

test("usa só o primeiro nome, mensagem exata aprovada no RFC", () => {
  const mensagem = mensagemFalarComCandidata("Maria Silva Santos")
  assert.equal(
    mensagem,
    "Oi, Maria! Aqui é a Carol, da Rose Semi Jóias. Estou analisando seu cadastro para revendedora e gostaria de falar rapidinho com você.",
  )
})

test("nome com espaços extras -> ainda extrai o primeiro nome corretamente", () => {
  const mensagem = mensagemFalarComCandidata("   Joana   Pereira")
  assert.match(mensagem, /^Oi, Joana!/)
})

test("nome de uma palavra só -> usa a palavra inteira", () => {
  const mensagem = mensagemFalarComCandidata("Fernanda")
  assert.match(mensagem, /^Oi, Fernanda!/)
})
