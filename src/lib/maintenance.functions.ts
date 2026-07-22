import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Notifica por e-mail a pessoa designada (assigned_to) de um chamado de manutenção.
 * Não-bloqueante: falhas de envio não devem quebrar a criação do chamado.
 * Retorna um resultado detalhado para o cliente exibir aviso quando aplicável.
 */
export const notifyMaintenanceTicketAssigned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendTemplateEmail } = await import("@/lib/email/notify.server");

      // Authorization: caller must be reporter, assignee, or a supervisor/admin.
      const [{ data: ticket }, { data: callerRoles }] = await Promise.all([
        supabaseAdmin
          .from("maintenance_tickets")
          .select("id, title, description, assigned_to, reported_by, created_at")
          .eq("id", data.ticket_id)
          .maybeSingle(),
        supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId),
      ]);

      if (!ticket) {
        return { ok: false, sent: 0, targets: 0, reason: "ticket_not_found" as const };
      }

      const isPriv = (callerRoles ?? []).some((r) => r.role === "admin" || r.role === "supervisor");
      const isParty = ticket.reported_by === userId || ticket.assigned_to === userId;
      if (!isPriv && !isParty) {
        return { ok: false, sent: 0, targets: 0, reason: "forbidden" as const };
      }

      if (!ticket.assigned_to) {
        return { ok: true, sent: 0, targets: 0, reason: "no_assignee" as const };
      }

      const [{ data: assignee }, { data: reporter }] = await Promise.all([
        supabaseAdmin.from("profiles").select("email, full_name").eq("id", ticket.assigned_to).maybeSingle(),
        supabaseAdmin.from("profiles").select("full_name").eq("id", ticket.reported_by).maybeSingle(),
      ]);

      if (!assignee) {
        await supabaseAdmin.from("logs").insert({
          user_id: userId,
          action: "maintenance_ticket_notify_resultado",
          entity: "maintenance_ticket",
          details: { ticket_id: ticket.id, reason: "assignee_profile_not_found" },
        });
        return { ok: false, sent: 0, targets: 0, reason: "assignee_profile_not_found" as const };
      }

      const email = (assignee.email ?? "").trim().toLowerCase();
      if (!email) {
        await supabaseAdmin.from("logs").insert({
          user_id: userId,
          action: "maintenance_ticket_notify_resultado",
          entity: "maintenance_ticket",
          details: { ticket_id: ticket.id, reason: "assignee_without_email" },
        });
        return { ok: false, sent: 0, targets: 0, reason: "assignee_without_email" as const };
      }

      // Verificação explícita de supressão antes de enfileirar.
      const { data: suppressed } = await supabaseAdmin
        .from("suppressed_emails")
        .select("email")
        .eq("email", email)
        .maybeSingle();
      if (suppressed) {
        await supabaseAdmin.from("logs").insert({
          user_id: userId,
          action: "maintenance_ticket_email_suprimido",
          entity: "maintenance_ticket",
          details: { ticket_id: ticket.id, email },
        });
        return { ok: false, sent: 0, targets: 1, reason: "suppressed" as const };
      }

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

      await supabaseAdmin.from("logs").insert({
        user_id: userId,
        action: "maintenance_ticket_notify_resultado",
        entity: "maintenance_ticket",
        details: {
          ticket_id: ticket.id,
          email,
          enqueued: res.enqueued,
          skipped: res.skipped,
          assignee_found: true,
        },
      });

      return {
        ok: true,
        sent: res.enqueued,
        targets: 1,
        skipped: res.skipped,
        reason: (res.enqueued > 0 ? "enqueued" : "not_enqueued") as
          | "enqueued"
          | "not_enqueued",
      };
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
      return { ok: false, sent: 0, targets: 0, reason: "error" as const };
    }
  });
