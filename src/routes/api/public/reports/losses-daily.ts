// Public endpoint invoked by pg_cron every day at 05:00 (America/Sao_Paulo)
// to send the previous day's losses & breakage report to admins.
import { createFileRoute } from '@tanstack/react-router'
import { sendTemplateEmail } from '@/lib/email/notify.server'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

function saoPauloYesterdayRange(): { startUtc: string; endUtc: string; label: string } {
  // America/Sao_Paulo is UTC-3 (no DST since 2019). Yesterday = [today-1 00:00, today 00:00) SP.
  const now = new Date()
  const spNow = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  const y = spNow.getUTCFullYear()
  const m = spNow.getUTCMonth()
  const d = spNow.getUTCDate()
  // start = yesterday 00:00 SP = day-1 03:00 UTC
  const start = new Date(Date.UTC(y, m, d - 1, 3, 0, 0))
  const end = new Date(Date.UTC(y, m, d, 3, 0, 0))
  const dd = String(d - 1).padStart(2, '0') // approximate label; corrected below
  const label = new Date(Date.UTC(y, m, d - 1)).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  void dd
  return { startUtc: start.toISOString(), endUtc: end.toISOString(), label }
}

async function handle(request: Request) {
  // Shared-secret auth: pg_cron sends the service-role key as a bearer token.
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const auth = request.headers.get('authorization') ?? '';
  const provided = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!expected || !provided || provided !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { startUtc, endUtc, label } = saoPauloYesterdayRange()
  const admin = supabaseAdmin as any

  const { data: losses, error } = await admin
    .from('losses')
    .select('id, created_at, quantity, observation, product_id, reason_id, created_by, product:products(name, code, unit, cost)')
    .gte('created_at', startUtc)
    .lt('created_at', endUtc)
    .order('created_at', { ascending: true })
  if (error) return new Response(`db error: ${error.message}`, { status: 500 })

  const list = (losses ?? []) as any[]
  const reasonIds = Array.from(new Set(list.map((l) => l.reason_id).filter(Boolean)))
  const userIds = Array.from(new Set(list.map((l) => l.created_by).filter(Boolean)))

  const [{ data: reasons }, { data: profs }] = await Promise.all([
    reasonIds.length ? admin.from('loss_reasons').select('id, name').in('id', reasonIds) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from('profiles').select('id, full_name, slug').in('id', userIds) : Promise.resolve({ data: [] }),
  ])
  const reasonMap = new Map((reasons ?? []).map((r: any) => [r.id, r.name]))
  const userMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || p.slug || '—']))

  const rows = list.map((l) => {
    const cost = Number(l.product?.cost ?? 0)
    return {
      created_at: new Date(l.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }),
      product: l.product?.name ?? '—',
      code: l.product?.code ?? undefined,
      quantity: Number(l.quantity ?? 0),
      unit: l.product?.unit ?? undefined,
      cost,
      reason: reasonMap.get(l.reason_id) ?? '—',
      observation: l.observation ?? undefined,
      registered_by: userMap.get(l.created_by) ?? '—',
    }
  })
  const total_value = rows.reduce((s, r) => s + r.quantity * r.cost, 0)

  // Only admins receive this report
  const { data: adminRoles } = await admin.from('user_roles').select('user_id').eq('role', 'admin')
  const adminIds = (adminRoles ?? []).map((r: any) => r.user_id)
  if (adminIds.length === 0) return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no admins' }))
  const { data: adminProfs } = await admin.from('profiles').select('email, active').in('id', adminIds)
  const recipients = (adminProfs ?? [])
    .filter((p: any) => p.active && p.email)
    .map((p: any) => p.email as string)
  if (recipients.length === 0) return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no admin emails' }))

  const result = await sendTemplateEmail({
    templateName: 'losses-daily',
    recipients,
    templateData: { date_label: label, rows, total_value },
    idempotencyKeyPrefix: `losses-daily-${label}`,
  })

  return new Response(JSON.stringify({ ok: true, ...result, count: rows.length, label }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/public/reports/losses-daily')({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
})
