// Server-only helper para disparar emails transacionais do sistema.
// Duas variantes:
//  - sendTemplateEmail: usa supabaseAdmin (service_role). Depende de a chave
//    admin estar funcional no runtime.
//  - sendTemplateEmailViaRpc: recebe um SupabaseClient (ex.: context.supabase
//    do requireSupabaseAuth) e enfileira via RPC `queue_transactional_email`
//    — não depende do supabaseAdmin.
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react'
import { render } from '@react-email/render'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import type { SupabaseClient } from '@supabase/supabase-js'

const SITE_NAME = 'baixonoroeste'
const SENDER_DOMAIN = 'notify.inventario.baixonoroeste.com.br'
const FROM_DOMAIN = 'inventario.baixonoroeste.com.br'


function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function getOrCreateUnsubToken(email: string): Promise<string> {
  const admin = supabaseAdmin as any
  const { data: existing } = await admin
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', email)
    .maybeSingle()
  if (existing && !existing.used_at) return existing.token as string
  const token = generateToken()
  await admin
    .from('email_unsubscribe_tokens')
    .upsert({ token, email }, { onConflict: 'email', ignoreDuplicates: true })
  const { data: stored } = await admin
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', email)
    .maybeSingle()
  return (stored?.token as string | undefined) ?? token
}

export async function sendTemplateEmail(opts: {
  templateName: string
  recipients: string[]
  templateData: Record<string, unknown>
  idempotencyKeyPrefix?: string
  fromName?: string
}): Promise<{ enqueued: number; skipped: number }> {
  const tpl = TEMPLATES[opts.templateName]
  if (!tpl) throw new Error(`Template não registrado: ${opts.templateName}`)

  const unique = Array.from(new Set(
    opts.recipients.map((e) => (e ?? '').trim().toLowerCase()).filter(Boolean),
  ))
  let enqueued = 0
  let skipped = 0

  const element = React.createElement(tpl.component, opts.templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject = typeof tpl.subject === 'function' ? tpl.subject(opts.templateData) : tpl.subject
  const fromName = opts.fromName ?? SITE_NAME
  const admin = supabaseAdmin as any

  for (const email of unique) {
    try {
      const { data: sup } = await admin
        .from('suppressed_emails').select('id').eq('email', email).maybeSingle()
      if (sup) { skipped++; continue }

      const messageId = crypto.randomUUID()
      const idempotency = `${opts.idempotencyKeyPrefix ?? opts.templateName}-${email}-${messageId}`
      const unsubscribeToken = await getOrCreateUnsubToken(email)

      await admin.from('email_send_log').insert({
        message_id: messageId,
        template_name: opts.templateName,
        recipient_email: email,
        status: 'pending',
      })

      const { error: enqErr } = await admin.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          message_id: messageId,
          to: email,
          from: `${fromName} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text,
          purpose: 'transactional',
          label: opts.templateName,
          idempotency_key: idempotency,
          unsubscribe_token: unsubscribeToken,
          queued_at: new Date().toISOString(),
        },
      })
      if (enqErr) {
        console.error('[notify] enqueue falhou', enqErr)
        skipped++
      } else {
        enqueued++
      }
    } catch (e) {
      console.error('[notify] erro por email', email, e)
      skipped++
    }
  }

  return { enqueued, skipped }
}

/**
 * Emails de admins/supervisores ativos + lista extra.
 */
export async function loadNotificationRecipients(extraEmails: string[] = []): Promise<string[]> {
  const [{ data: roles }, { data: profs }] = await Promise.all([
    supabaseAdmin.from('user_roles').select('user_id, role').in('role', ['admin', 'supervisor']),
    supabaseAdmin.from('profiles').select('id, email, active'),
  ])
  const ids = new Set((roles ?? []).map((r) => r.user_id))
  const emails: string[] = [...extraEmails]
  for (const p of profs ?? []) {
    if (!p.active || !p.email) continue
    if (ids.has(p.id)) emails.push(p.email)
  }
  return emails
}

/**
 * Envia um e-mail transacional usando uma RPC `queue_transactional_email`
 * (security definer). Não depende de supabaseAdmin — pode ser chamada com
 * qualquer client autenticado (ex.: context.supabase do requireSupabaseAuth).
 */
export async function sendTemplateEmailViaRpc(
  supabase: SupabaseClient<any, any>,
  opts: {
    templateName: string
    recipients: string[]
    templateData: Record<string, unknown>
    idempotencyKeyPrefix?: string
    fromName?: string
  },
): Promise<{ enqueued: number; skipped: number; errors: unknown[] }> {
  const tpl = TEMPLATES[opts.templateName]
  if (!tpl) throw new Error(`Template não registrado: ${opts.templateName}`)

  const unique = Array.from(
    new Set(opts.recipients.map((e) => (e ?? '').trim().toLowerCase()).filter(Boolean)),
  )

  const element = React.createElement(tpl.component, opts.templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof tpl.subject === 'function' ? tpl.subject(opts.templateData) : tpl.subject
  const fromName = opts.fromName ?? SITE_NAME

  let enqueued = 0
  let skipped = 0
  const errors: unknown[] = []

  for (const email of unique) {
    const messageId = crypto.randomUUID()
    const idempotency = `${opts.idempotencyKeyPrefix ?? opts.templateName}-${email}-${messageId}`
    const payload = {
      message_id: messageId,
      to: email,
      from: `${fromName} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: 'transactional',
      label: opts.templateName,
      template_name: opts.templateName,
      idempotency_key: idempotency,
      queued_at: new Date().toISOString(),
    }
    const { data, error } = await (supabase as any).rpc('queue_transactional_email', {
      _payload: payload,
    })
    if (error) {
      errors.push({ email, error })
      skipped++
      continue
    }
    const status = (data as any)?.status
    if (status === 'enqueued') enqueued++
    else skipped++
  }

  return { enqueued, skipped, errors }
}

