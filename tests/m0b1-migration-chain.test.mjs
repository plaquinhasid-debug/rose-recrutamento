// M0-B.1 — invariantes ESTÁTICOS da cadeia de migrations (só lê arquivos;
// nenhum banco, nenhuma rede).
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { createHash } from "node:crypto"

const DIR = new URL("../supabase/migrations/", import.meta.url)
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()
const read = (f) => readFileSync(new URL(f, DIR), "utf8")
const stripComments = (sql) => sql.replace(/--[^\n]*/g, "")
// Os arquivos podem estar com CRLF na working copy (core.autocrlf=true); o
// conteúdo canônico (o que vai pro Git e o que está em produção) é LF.
const md5 = (f) => createHash("md5").update(read(f).replace(/\r\n/g, "\n")).digest("hex")

// md5(statements[1]) de supabase_migrations.schema_migrations em produção.
const RECOVERED = {
  "20260729144506_initial_schema.sql": "ec064d57f4124afd9fdd1781d10fbd1b",
  "20260729144524_rls_policies.sql": "ab1eccc0d16d3a99cb33d849ff3e1cc4",
  "20260729144549_security_hardening.sql": "69c7cbf1c48e76317a8fd780d42359ce",
  "20260730150040_add_meta_conversions_tracking_fields.sql": "08d925b0b3be77d976a120156df8c56d",
  "20260730190153_schedule_daily_leads_report.sql": "afcd8024ea60a19803d63703c24da8aa",
  "20260801001931_add_sofia_ia_ativa_setting_and_anon_read_policy.sql": "231049588cff0c83c7ad24eecf74eb42",
  "20260801001942_add_ai_analysis_perfil_sugerido_ia_column.sql": "0b53b5dc6070186b66b069e311042ae7",
  "20260801191540_add_sofia_ia_ativa_setting_and_expanded_analysis_columns.sql": "2d8bc4a080d88e62c9edc2653c0d37ea",
  "20260803174930_add_sofia_perguntas_ia_ativa_setting.sql": "f8aba3a3c8340bae8e56a9cbe373bcf7",
}

const HARDEN = "20260915200000_harden_authenticated_staff_authorization.sql"
const COMPAT = "20260915195959_compat_create_authenticated_select_whatsapp_messages.sql"
const RECONCILE = "20261003194618_reconcile_prod_final_state.sql"

test("as 9 migrations recuperadas continuam byte a byte iguais à produção", () => {
  for (const [f, hash] of Object.entries(RECOVERED)) assert.equal(md5(f), hash, f)
})

test("initial_schema é a primeira migration", () => {
  assert.equal(files[0], "20260729144506_initial_schema.sql")
})

test("a compat vem IMEDIATAMENTE antes do harden e cria só a policy de whatsapp_messages", () => {
  assert.equal(files.indexOf(COMPAT) + 1, files.indexOf(HARDEN))
  const sql = stripComments(read(COMPAT))
  assert.match(sql, /create policy authenticated_select_whatsapp_messages on public\.whatsapp_messages/i)
  assert.equal((sql.match(/create policy/gi) ?? []).length, 1)
  assert.doesNotMatch(sql, /\b(drop|alter table|insert|update|delete)\b/i)
})

test("toda `drop policy` sem `if exists` tem um `create policy` anterior na cadeia", () => {
  const created = new Set()
  for (const f of files) {
    const sql = stripComments(read(f))
    for (const m of sql.matchAll(/drop policy\s+(?!if exists)"?([a-z0-9_]+)"?\s+on\s+(?:public\.)?([a-z0-9_]+)/gi)) {
      assert.ok(created.has(`${m[2]}.${m[1]}`.toLowerCase()), `${f}: drop policy ${m[1]} on ${m[2]} sem criação anterior`)
    }
    for (const m of sql.matchAll(/create policy\s+"?([a-z0-9_]+)"?\s+on\s+(?:public\.)?([a-z0-9_]+)/gi)) {
      created.add(`${m[2]}.${m[1]}`.toLowerCase())
    }
  }
})

test("cron.schedule só aparece depois de create extension pg_cron/pg_net", () => {
  let cron = false
  let net = false
  for (const f of files) {
    const sql = stripComments(read(f))
    if (/create extension if not exists pg_cron/i.test(sql)) cron = true
    if (/create extension if not exists pg_net/i.test(sql)) net = true
    if (/cron\.schedule\(/i.test(sql)) assert.ok(cron && net, `${f} agenda cron antes das extensões`)
  }
})

test("reconciliação é a última migration e reproduz o estado final de produção", () => {
  assert.equal(files.at(-1), RECONCILE)
  const sql = stripComments(read(RECONCILE))
  assert.match(sql, /alter column perfil_sugerido_ia type text using perfil_sugerido_ia::text/i)
  assert.match(sql, /add constraint ai_analysis_perfil_sugerido_ia_check/i)
  assert.match(sql, /in \('baixo','medio','alto','excelente'\)/i)
  assert.match(sql, /drop policy if exists anon_select_sofia_ia_ativa on public\.settings/i)
})

test("Realtime e setting órfão capturados depois das tabelas que usam", () => {
  const cap = "20261003193541_capture_prod_only_objects.sql"
  assert.ok(files.indexOf(cap) > files.indexOf("20260813233000_add_whatsapp_conversations.sql"))
  const sql = stripComments(read(cap))
  assert.match(sql, /alter publication supabase_realtime add table public\.leads/i)
  assert.match(sql, /alter publication supabase_realtime add table public\.whatsapp_messages/i)
  assert.match(sql, /'whatsapp_notificacao_tania_ativa',\s*'\{"ativa": false\}'::jsonb/i)
})
