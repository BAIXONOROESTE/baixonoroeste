import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Notifica por e-mail a pessoa designada (assigned_to) de um chamado de manutenção.
 * Não-bloqueante: falhas de envio não devem quebrar a criação do chamado.
 */
export const notifyMaintenanceTicketAssigned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendTemplateEmail } = await import("@/lib/email/notify.server");

      const { data: ticket } = await supabaseAdmin
        .from("maintenance_tickets")
        .select("id, title, description, assigned_to, reported_by, created_at")
        .eq("id", data.ticket_id)
        .maybeSingle();

      if (!ticket || !ticket.assigned_to) return { ok: true, sent: 0, targets: 0 };

      const [{ data: assignee }, { data: reporter }] = await Promise.all([
        supabaseAdmin.from("profiles").select("email, full_name").eq("id", ticket.assigned_to).maybeSingle(),
        supabaseAdmin.from("profiles").select("full_name").eq("id", ticket.reported_by).maybeSingle(),
      ]);

      const email = (assignee?.email ?? "").trim().toLowerCase();
      if (!email) return { ok: true, sent: 0, targets: 0 };

      const origin = process.env.PUBLIC_SITE_URL || "https://baixonoroeste.lovable.app";
      const actionUrl = `${origin.replace(/\/$/, "")}/manutencao`;

      const res = await sendTemplateEmail({
        templateName: "maintenance-ticket",
        recipients: [email],
        idempotencyKeyPrefix: `maintenance-ticket-${ticket.id}`,
        templateData: {
          title: ticket.title,
          description: ticket.description ?? null,
          reporter_name: reporter?.full_name ?? "—",
          reported_at: new Date(ticket.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
          action_url: actionUrl,
        },
      });

      return { ok: true, sent: res.enqueued, targets: 1 };
    } catch (e) {
      console.error("[notifyMaintenanceTicketAssigned] falhou", e);
      try {
        await supabase.from("logs").insert({
          user_id: userId,
          action: "maintenance_ticket_notify_erro",
          entity: "maintenance_ticket",
          details: { ticket_id: data.ticket_id, error: e instanceof Error ? e.message : String(e) },
        });
      } catch {
        /* ignore */
      }
      return { ok: false, sent: 0, targets: 0 };
    }
  });
