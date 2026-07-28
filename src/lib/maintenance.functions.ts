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
      const { sendOrDeferEmail } = await import("@/lib/email/notify.server");

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

      const res = await sendOrDeferEmail({
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
          deferred: res.deferred,
          assignee_found: true,
        },
      });

      return {
        ok: true,
        sent: res.enqueued,
        targets: 1,
        skipped: res.skipped,
        reason: (res.deferred > 0
          ? "deferred_outside_business_hours"
          : res.enqueued > 0
            ? "enqueued"
            : "not_enqueued") as "enqueued" | "not_enqueued" | "deferred_outside_business_hours",
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

/**
 * Push helpers — canal adicional aos e-mails de manutenção.
 * Nunca lançam; falha silenciosa para não quebrar o fluxo principal.
 */
function ticketUrl(): string {
  const origin = process.env.PUBLIC_SITE_URL || "https://baixonoroeste.lovable.app";
  return `${origin.replace(/\/$/, "")}/manutencao`;
}

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
};

/** Push ao responsável quando um chamado é criado (mesma regra do e-mail). */
export const notifyMaintenanceTicketCreatedPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string }) => ({ ticket_id: String(d.ticket_id) }))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendPushToUser } = await import("@/lib/push.server");
      const { data: ticket } = await supabaseAdmin
        .from("maintenance_tickets")
        .select("id, title, description, assigned_to")
        .eq("id", data.ticket_id)
        .maybeSingle();
      if (!ticket?.assigned_to) return { ok: true, sent: 0, targets: 0 };
      const body = ticket.description
        ? `${ticket.title} — ${ticket.description.slice(0, 120)}`
        : ticket.title;
      const r = await sendPushToUser(ticket.assigned_to, {
        title: "Novo chamado de manutenção",
        body,
        url: ticketUrl(),
        tag: `maint-created-${ticket.id}`,
      }, "maintenance");

      return { ok: true, sent: r.sent, targets: r.targets };
    } catch (e) {
      console.error("[notifyMaintenanceTicketCreatedPush] falhou", e);
      return { ok: false, sent: 0, targets: 0 };
    }
  });

/** Push a quem abriu o chamado quando o status muda. */
export const notifyMaintenanceTicketStatusPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string; new_status: string }) => ({
    ticket_id: String(d.ticket_id),
    new_status: String(d.new_status),
  }))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendPushToUser } = await import("@/lib/push.server");
      const { data: ticket } = await supabaseAdmin
        .from("maintenance_tickets")
        .select("id, title, reported_by")
        .eq("id", data.ticket_id)
        .maybeSingle();
      if (!ticket?.reported_by) return { ok: true, sent: 0, targets: 0 };
      // Não notifica quem fez a própria ação.
      if (ticket.reported_by === context.userId) return { ok: true, sent: 0, targets: 0 };
      const { data: actor } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", context.userId)
        .maybeSingle();
      const statusLabel = STATUS_LABEL[data.new_status] ?? data.new_status;
      const body = `${ticket.title} — ${statusLabel}${actor?.full_name ? ` (por ${actor.full_name})` : ""}`;
      const r = await sendPushToUser(ticket.reported_by, {
        title: "Chamado atualizado",
        body,
        url: ticketUrl(),
        tag: `maint-status-${ticket.id}`,
      }, "maintenance");

      return { ok: true, sent: r.sent, targets: r.targets };
    } catch (e) {
      console.error("[notifyMaintenanceTicketStatusPush] falhou", e);
      return { ok: false, sent: 0, targets: 0 };
    }
  });

/** Push a quem abriu o chamado quando é concluído. */
export const notifyMaintenanceTicketResolvedPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string }) => ({ ticket_id: String(d.ticket_id) }))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendPushToUser } = await import("@/lib/push.server");
      const { data: ticket } = await supabaseAdmin
        .from("maintenance_tickets")
        .select("id, title, reported_by")
        .eq("id", data.ticket_id)
        .maybeSingle();
      if (!ticket?.reported_by) return { ok: true, sent: 0, targets: 0 };
      if (ticket.reported_by === context.userId) return { ok: true, sent: 0, targets: 0 };
      const r = await sendPushToUser(ticket.reported_by, {
        title: "Chamado concluído",
        body: ticket.title,
        url: ticketUrl(),
        tag: `maint-resolved-${ticket.id}`,
      }, "maintenance");

      return { ok: true, sent: r.sent, targets: r.targets };
    } catch (e) {
      console.error("[notifyMaintenanceTicketResolvedPush] falhou", e);
      return { ok: false, sent: 0, targets: 0 };
    }
  });
