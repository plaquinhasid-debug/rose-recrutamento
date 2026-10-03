import { createHmac, timingSafeEqual } from 'node:crypto';

// Executado no servidor; as credenciais permanecem protegidas nas variaveis da Vercel.

export const config = {
  api: { bodyParser: false },
};

const PALAVRAS_APROVACAO = ['sim', 'aprovado', 'aprovo', 'aprovar', 'pode'];
const PALAVRAS_RECUSA = ['nao', 'recuso', 'recusa', 'recusar', 'nego', 'negar'];

const MAPA_ACENTOS = {
  a: 'áàâã',
  e: 'éê',
  i: 'í',
  o: 'óôõ',
  u: 'ú',
  c: 'ç',
};

function removerAcentos(texto) {
  let resultado = texto;
  for (const [semAcento, comAcento] of Object.entries(MAPA_ACENTOS)) {
    for (const letra of comAcento) {
      resultado = resultado.split(letra).join(semAcento);
    }
  }
  return resultado;
}

function normalizarTexto(texto) {
  return removerAcentos((texto ?? '').toLowerCase());
}

function detectarDecisaoTania(texto) {
  const palavras = normalizarTexto(texto)
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (palavras.some((palavra) => PALAVRAS_RECUSA.includes(palavra))) return 'recusou';
  if (palavras.some((palavra) => PALAVRAS_APROVACAO.includes(palavra))) return 'aprovou';
  return null;
}

function send(response, status, body) {
  response.status(status).setHeader('Content-Type', 'text/plain; charset=utf-8').send(body);
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error('Payload muito grande'));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function validSignature(rawBody, signatureHeader) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false;

  const received = signatureHeader.slice(7);
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  if (!/^[a-f0-9]{64}$/i.test(received) || received.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}

function summarize(payload) {
  const events = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const message of value.messages ?? []) {
        events.push({
          kind: 'message',
          from: message.from,
          messageId: message.id,
          type: message.type,
          text: message.text?.body,
        });
      }
      for (const status of value.statuses ?? []) {
        events.push({
          kind: 'status',
          messageId: status.id,
          recipient: status.recipient_id,
          status: status.status,
        });
      }
    }
  }
  return events;
}

function supabaseHeaders(prefer) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function supabaseRequest(path, options = {}) {
  const baseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim().replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !key) throw new Error('Supabase do webhook nÃ£o configurado');

  const result = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: { ...supabaseHeaders(options.prefer), ...options.headers },
  });
  if (!result.ok) throw new Error(`Supabase ${result.status}: ${await result.text()}`);
  return result;
}

// IMPLEMENTATION-CRM-004B — numero da Tania nao fica mais hardcoded aqui.
// `settings.tania_whatsapp_numero` (mesma linha lida pelo Admin e por
// `submit-ficha`, ver `_shared/tania-whatsapp-numero.ts`) e a fonte
// principal; `TANIA_WHATSAPP_NUMBER` so entra se a tabela settings estiver
// indisponivel. So mensagens desse numero podem decidir uma lead.
async function getTaniaWhatsappNumero() {
  try {
    const result = await supabaseRequest(
      'settings?chave=eq.tania_whatsapp_numero&select=valor&limit=1',
    );
    const rows = await result.json();
    const numero = rows[0]?.valor?.numero;
    if (typeof numero === 'string' && numero.trim()) return numero.trim();
  } catch (err) {
    console.error('[WhatsApp webhook] falha ao ler settings.tania_whatsapp_numero, tentando fallback', err);
  }
  const fallback = process.env.TANIA_WHATSAPP_NUMBER;
  return fallback && fallback.trim() ? fallback.trim() : null;
}

async function saveInboundMessage(message, value) {
  const telefone = message.from;
  const contact = (value.contacts ?? []).find(item => item.wa_id === telefone);
  const now = new Date().toISOString();

  await supabaseRequest('whatsapp_contacts?on_conflict=telefone', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify({
      telefone,
      nome: contact?.profile?.name ?? null,
      last_message_at: now,
      updated_at: now,
    }),
  });

  const inserted = await supabaseRequest('whatsapp_messages?on_conflict=meta_message_id', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=representation',
    body: JSON.stringify({
      meta_message_id: message.id,
      telefone,
      direction: 'inbound',
      message_type: message.type,
      body: message.text?.body ?? null,
      raw_payload: message,
    }),
  });
  const rows = await inserted.json();
  return rows.length > 0;
}

async function sendAutomaticReply(to, replyToMessageId) {
  if (process.env.WHATSAPP_AUTO_REPLY_ENABLED !== 'true') return;

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error('Credenciais de envio do WhatsApp nÃ£o configuradas');

  const text = process.env.WHATSAPP_AUTO_REPLY_TEXT
    ?? 'Olá! Recebemos sua mensagem na Rose Semi Jóias. Em breve continuaremos seu atendimento por aqui. ✨';
  const result = await fetch(`https://graph.facebook.com/v26.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      context: { message_id: replyToMessageId },
      type: 'text',
      text: { preview_url: false, body: text },
    }),
  });
  if (!result.ok) throw new Error(`WhatsApp ${result.status}: ${await result.text()}`);

  const data = await result.json();
  const sentMessageId = data.messages?.[0]?.id;
  if (sentMessageId) {
    await supabaseRequest('whatsapp_messages', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        meta_message_id: sentMessageId,
        telefone: to,
        direction: 'outbound',
        message_type: 'text',
        body: text,
        status: 'accepted',
      }),
    });
  }
}

// IMPLEMENTATION-INTELLIGENCE-015B — status real de entrega das mensagens
// outbound (ver `_shared/whatsapp-message-log.ts`, lado do envio). A Meta
// manda esses eventos aqui em `value.statuses`; antes desta mudança eram só
// logados (`summarize`) e descartados — `whatsapp_enviado_em` significava
// só "a Graph API aceitou", nunca "entregue"/"lida"/"falhou" de verdade.
const STATUS_FIELD_BY_TYPE = {
  sent: 'sent_at',
  delivered: 'delivered_at',
  read: 'read_at',
  failed: 'failed_at',
};

/** Só os campos seguros do primeiro erro de um evento `failed` — nunca inclui token/payload bruto. */
export function extractStatusError(status) {
  const err = (status.errors ?? [])[0];
  if (!err) return {};
  return {
    error_code: err.code != null ? String(err.code) : null,
    error_title: err.title ?? null,
    error_message: err.message ?? err.error_data?.details ?? null,
  };
}

/**
 * Monta o PATCH pra um evento de status — `null` se o tipo não for um dos
 * quatro reconhecidos (ignorado com segurança, nunca derruba o webhook).
 * Cada estágio é uma coluna própria (`sent_at`/`delivered_at`/`read_at`/
 * `failed_at`) — não um único campo sobrescrito — então a ordem de chegada
 * dos eventos não importa: um `read` chegando sem um `delivered` anterior
 * ainda registra `read_at` normalmente, sem depender do outro ter chegado.
 */
export function buildStatusPatch(status) {
  const field = STATUS_FIELD_BY_TYPE[status?.status];
  if (!field) return null;

  const timestampSeconds = Number(status.timestamp);
  const timestamp = Number.isFinite(timestampSeconds)
    ? new Date(timestampSeconds * 1000).toISOString()
    : new Date().toISOString();

  const patch = { [field]: timestamp, status: status.status, updated_at: new Date().toISOString() };
  if (status.status === 'failed') Object.assign(patch, extractStatusError(status));
  return { field, patch };
}

/**
 * Aplica um evento de status via PATCH idempotente: o filtro
 * `<coluna>=is.null` garante que um webhook duplicado nunca sobrescreve um
 * timestamp já registrado (0 linhas afetadas na segunda vez, sem erro). Se
 * o wamid não bater com nenhuma linha (ex.: mensagem enviada antes desta
 * funcionalidade existir), o PATCH também só afeta 0 linhas — nunca lança.
 */
export async function applyStatusUpdate(status) {
  const built = buildStatusPatch(status);
  if (!built) {
    console.info('[WhatsApp status] tipo não reconhecido, ignorado', { status: status?.status });
    return;
  }
  if (!status.id) return;

  try {
    await supabaseRequest(
      `whatsapp_messages?meta_message_id=eq.${encodeURIComponent(status.id)}&${built.field}=is.null`,
      { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(built.patch) },
    );
  } catch (err) {
    console.error('[WhatsApp status] falha ao registrar status', {
      messageId: status.id,
      statusType: status.status,
      error: String(err),
    });
  }
}

async function buscarLeadsAguardandoTania() {
  const result = await supabaseRequest(
    'leads?etapa_pos_aprovacao=eq.aguardando_tania&select=id,nome',
  );
  return result.json();
}

async function aplicarDecisaoTania(leadId, decisao) {
  const etapa = decisao === 'aprovou' ? 'ativa' : 'desistiu';
  await supabaseRequest(`leads?id=eq.${leadId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ etapa_pos_aprovacao: etapa }),
  });
  return etapa;
}

// Só a Tania decide leads pelo WhatsApp, e só quando existe exatamente uma
// candidata esperando (mensagem ambígua com 0 ou 2+ candidatas não decide
// nada sozinha — fica pro clique manual no Admin).
async function processarDecisaoTania(message) {
  if (message.type !== 'text') return;

  const taniaTelefone = await getTaniaWhatsappNumero();
  if (!taniaTelefone || message.from !== taniaTelefone) return;

  const decisao = detectarDecisaoTania(message.text?.body);
  if (!decisao) return;

  const pendentes = await buscarLeadsAguardandoTania();
  if (pendentes.length !== 1) {
    console.info('[WhatsApp decisao Tania] ignorado, candidatas pendentes:', pendentes.length);
    return;
  }

  const [lead] = pendentes;
  const etapa = await aplicarDecisaoTania(lead.id, decisao);
  console.info('[WhatsApp decisao Tania] aplicado', { leadId: lead.id, nome: lead.nome, etapa });
}

async function processPayload(payload) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const message of value.messages ?? []) {
        const isNew = await saveInboundMessage(message, value);
        console.info('[WhatsApp storage]', { messageId: message.id, saved: isNew });
        if (isNew && message.type === 'text') {
          await sendAutomaticReply(message.from, message.id);
          await processarDecisaoTania(message);
        }
      }
      // IMPLEMENTATION-015B — cada evento de status é tratado isoladamente
      // (uma falha num não impede os outros), nunca deriva o webhook.
      for (const status of value.statuses ?? []) {
        await applyStatusUpdate(status);
      }
    }
  }
}

export default async function handler(request, response) {
  const url = new URL(request.url, `https://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'GET') {
    const configuredToken = process.env.WHATSAPP_VERIFY_TOKEN;
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (configuredToken && mode === 'subscribe' && token === configuredToken) {
      return send(response, 200, challenge ?? '');
    }
    return send(response, 403, 'Token de verificação inválido');
  }

  if (request.method !== 'POST') return send(response, 405, 'Método não permitido');

  try {
    const rawBody = await readRawBody(request);
    if (!validSignature(rawBody, request.headers['x-hub-signature-256'])) {
      return send(response, 401, 'Assinatura inválida');
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    console.log('[WhatsApp webhook]', JSON.stringify(summarize(payload)));
    try {
      await processPayload(payload);
    } catch (processingError) {
      // A Meta deve receber 200 para nÃ£o reenviar indefinidamente. O erro fica
      // registrado para correÃ§Ã£o sem derrubar a entrega do webhook.
      console.error('[WhatsApp processing]', processingError);
    }
    return send(response, 200, 'EVENT_RECEIVED');
  } catch (error) {
    console.error('[WhatsApp webhook]', error);
    return send(response, 400, 'Requisição inválida');
  }
}
