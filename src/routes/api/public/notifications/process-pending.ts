// Public endpoint invoked by pg_cron every 15 minutes to flush due,
// unsent rows from public.pending_notifications (assignment notifications
// deferred because they were triggered outside business hours). Actually
// sends only if the current time is within 10:00-22:00 America/Sao_Paulo,
// as an extra guard in case the cron run itself is delayed.
import { createFileRoute } from '@tanstack/react-router'
import { sendTemplateEmail } from '@/lib/email/notify.server'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const SP_OFFSET_HOURS = 3

function isWithinBusinessHoursNow(): boolean {
  const spNow = new Date(Date.now() - SP_OFFSET_HOURS * 60 * 60 * 1000)
  const h = spNow.getUTCHours()
  return h >= 10 && h < 22
}

async function handle(_request: Request) {
  if (!isWithinBusinessHoursNow()) {
    return Response.json({ processed: 0, reason: 'outside_business_hours' })
  }

  const admin = supabaseAdmin as any
  const { data: due, error } = await admin
    .from('pending_notifications')
    .select('id, template_name, recipients, template_data')
    .is('sent_at', null)
    .lte('send_after', new Date().toISOString())
    .limit(50)
  if (error) return new Response(`db error: ${error.message}`, { status: 500 })

  let processed = 0
  for (const row of (due ?? []) as any[]) {
    try {
      await sendTemplateEmail({
        templateName: row.template_name,
        recipients: row.recipients,
        templateData: row.template_data,
      })
      await admin.from('pending_notifications').update({ sent_at: new Date().toISOString() }).eq('id', row.id)
      processed++
    } catch (e) {
      console.error('process-pending: falha ao enviar', row.id, e)
    }
  }

  return Response.json({ processed, found: (due ?? []).length })
}

export const Route = createFileRoute('/api/public/notifications/process-pending')({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
})
