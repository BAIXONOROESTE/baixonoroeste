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

  // ---- Resumo de contagens do dia (agrupado por família) ----
  const { data: countItems, error: ciErr } = await admin
    .from('count_items')
    .select('difference, financial_diff, status, product:products(family_id)')
    .gte('created_at', startUtc)
    .lt('created_at', endUtc)
  if (ciErr) return new Response(`db error: ${ciErr.message}`, { status: 500 })

  const ciList = (countItems ?? []) as any[]
  const familyIds = Array.from(
    new Set(ciList.map((r) => r.product?.family_id).filter(Boolean) as string[]),
  )
  const { data: fams } = familyIds.length
    ? await admin.from('families').select('id, name').in('id', familyIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const famNameById = new Map<string, string>((fams ?? []).map((f: any) => [f.id as string, f.name as string]))

  const byFamily = new Map<string, { family: string; items_counted: number; divergences: number; diff_value: number }>()
  for (const it of ciList) {
    const fid = (it.product?.family_id as string | null) ?? '__none__'
    const fname = fid === '__none__' ? 'Sem família' : (famNameById.get(fid) ?? '—')
    const cur = byFamily.get(fid) ?? { family: fname, items_counted: 0, divergences: 0, diff_value: 0 }
    cur.items_counted += 1
    if (Number(it.difference ?? 0) !== 0) cur.divergences += 1
    cur.diff_value += Number(it.financial_diff ?? 0)
    byFamily.set(fid, cur)
  }
  const counts_by_family = Array.from(byFamily.values()).sort((a, b) => a.family.localeCompare(b.family))
  const counts_total_items = ciList.length
  const counts_total_divergences = ciList.filter((r) => Number(r.difference ?? 0) !== 0).length
  const counts_total_diff_value = ciList.reduce((s, r) => s + Number(r.financial_diff ?? 0), 0)

  // ---- Produtos sem código de barras reportados ----
  const { data: mbReports } = await admin
    .from('missing_barcode_reports')
    .select('product_id, reported_by, created_at')
    .gte('created_at', startUtc)
    .lt('created_at', endUtc)
  const mbList = (mbReports ?? []) as Array<{ product_id: string; reported_by: string; created_at: string }>
  const mbProductIds = Array.from(new Set(mbList.map((r) => r.product_id)))
  const mbReporterIds = Array.from(new Set(mbList.map((r) => r.reported_by)))
  const [{ data: mbProds }, { data: mbReporters }] = await Promise.all([
    mbProductIds.length ? admin.from('products').select('id, code, name').in('id', mbProductIds) : Promise.resolve({ data: [] }),
    mbReporterIds.length ? admin.from('profiles').select('id, full_name, slug').in('id', mbReporterIds) : Promise.resolve({ data: [] }),
  ])
  const mbProdMap = new Map<string, { name: string; code: string }>((mbProds ?? []).map((p: any) => [p.id as string, { name: p.name as string, code: p.code as string }]))
  const mbReporterMap = new Map<string, string>((mbReporters ?? []).map((p: any) => [p.id as string, (p.full_name || p.slug || '—') as string]))
  const missingBarcodeByProduct = new Map<string, { product: string; code: string; times: number; reporters: Set<string> }>()
  for (const r of mbList) {
    const info = mbProdMap.get(r.product_id) ?? { name: '—', code: '—' }
    const cur = missingBarcodeByProduct.get(r.product_id) ?? { product: info.name, code: info.code, times: 0, reporters: new Set<string>() }
    cur.times += 1
    cur.reporters.add(mbReporterMap.get(r.reported_by) ?? '—')
    missingBarcodeByProduct.set(r.product_id, cur)
  }
  const missing_barcodes = Array.from(missingBarcodeByProduct.values())
    .map((r) => ({ product: r.product, code: r.code, times: r.times, reporters: Array.from(r.reporters) }))
    .sort((a, b) => b.times - a.times || a.product.localeCompare(b.product))

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
    templateData: {
      date_label: label,
      rows,
      total_value,
      counts_by_family,
      counts_total_items,
      counts_total_divergences,
      counts_total_diff_value,
      missing_barcodes,
    },
    idempotencyKeyPrefix: `daily-summary-${label}`,
  })

  return new Response(JSON.stringify({ ok: true, ...result, losses: rows.length, counts: counts_total_items, missing_barcodes: missing_barcodes.length, label }), {
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
