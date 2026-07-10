// Server-only helper para disparar emails transacionais do sistema para
// múltiplos destinatários (admins/supervisores + contador). Usa supabaseAdmin
// para render + enqueue direto na fila `transactional_emails`, replicando o
// que a rota /lovable/email/transactional/send faz — porém sem exigir JWT
// (pois é chamado de dentro de server functions já autorizadas).
import * as React from 'react'
import { render } from '@react-email/render'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const SITE_NAME = 'baixonoroeste'
const SENDER_DOMAIN = 'notify.inventario.baixonoroeste.com.br'
const FROM_DOMAIN = 'inventario.baixonoroeste.com.br'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function getOrCreateUnsubToken(email: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', email)
    .maybeSingle()
  if (existing && !existing.used_at) return existing.token
  const token = generateToken()
  await supabaseAdmin
    .from('email_unsubscribe_tokens')
    .upsert({ token, email }, { onConflict: 'email', ignoreDuplicates: true })
  const { data: stored } = await supabaseAdmin
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', email)
    .maybeSingle()
  return stored?.token ?? token
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

  const unique = Array.from(new Set(opts.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean)))
  let enqueued = 0
  let skipped = 0

  const element = React.createElement(tpl.component, opts.templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject = typeof tpl.subject === 'function' ? tpl.subject(opts.templateData) : tpl.subject
  const fromName = opts.fromName ?? SITE_NAME

  for (const email of unique) {
    try {
      // suppression
      const { data: sup } = await supabaseAdmin
        .from('suppressed_emails').select('id').eq('email', email).maybeSingle()
      if (sup) { skipped++; continue }

      const messageId = crypto.randomUUID()
      const idempotency = `${opts.idempotencyKeyPrefix ?? opts.templateName}-${email}-${messageId}`
      const unsubscribeToken = await getOrCreateUnsubToken(email)

      await supabaseAdmin.from('email_send_log').insert({
        message_id: messageId, template_name: opts.templateName, recipient_email: email, status: 'pending',
      })

      const { error: enqErr } = await supabaseAdmin.rpc('enqueue_email', {
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
 * Carrega os destinatários padrão: emails de admins/supervisores ativos +
 * lista extra em settings.notification_emails (se existir).
 */
export async function loadNotificationRecipients(extraEmails: string[] = []): Promise<string[]> {
  const { data: admins } = await supabaseAdmin
    .from('profiles')
    .select('email, id, user_roles:user_roles(role)')
    .eq('active', true)

  const emails: string[] = [...extraEmails]
  for (const p of (admins ?? []) as Array<{ email: string | null; user_roles: Array<{ role: string }> }>) {
    if (!p.email) continue
    const roles = (p.user_roles ?? []).map((r) => r.role)
    if (roles.includes('admin') || roles.includes('supervisor')) emails.push(p.email)
  }
  return emails
}
