import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Push helpers para o ciclo de aprovação de checklists.
 * Nunca lançam — falha silenciosa para não quebrar o fluxo principal.
 * Cada envio respeita `notification_preferences.approvals_enabled` do destinatário.
 */

function checklistUrl(runId: string): string {
  const origin = process.env.PUBLIC_SITE_URL || "https://baixonoroeste.lovable.app";
  return `${origin.replace(/\/$/, "")}/checklists/${runId}`;
}

/** Enviado para aprovação → notifica todos os aprovadores (admin/supervisor ativos). */
export const notifyChecklistSubmittedPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { run_id: string }) => ({ run_id: String(d.run_id) }))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendPushToUser } = await import("@/lib/push.server");

      const { data: run } = await supabaseAdmin
        .from("checklist_runs")
        .select("id, template_id, started_by")
        .eq("id", data.run_id)
        .maybeSingle();
      if (!run) return { ok: true, sent: 0, targets: 0 };

      const [{ data: template }, { data: starter }] = await Promise.all([
        supabaseAdmin
          .from("checklist_templates")
          .select("name")
          .eq("id", run.template_id)
          .maybeSingle(),
        supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", run.started_by)
          .maybeSingle(),
      ]);

      // Aprovadores = admins + supervisores ativos, exceto o próprio remetente.
      const { data: approverRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "supervisor"]);
      const approverIds = Array.from(
        new Set(
          (approverRoles ?? [])
            .map((r) => r.user_id)
            .filter((uid) => uid && uid !== context.userId),
        ),
      );
      if (approverIds.length === 0) return { ok: true, sent: 0, targets: 0 };

      const { data: activeProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .in("id", approverIds)
        .eq("active", true);
      const targets = (activeProfiles ?? []).map((p) => p.id);

      const title = "Checklist aguardando aprovação";
      const body = `${template?.name ?? "Checklist"}${starter?.full_name ? ` — enviado por ${starter.full_name}` : ""}`;

      let sent = 0;
      for (const uid of targets) {
        const r = await sendPushToUser(
          uid,
          { title, body, url: checklistUrl(run.id), tag: `chk-submit-${run.id}` },
          "approvals",
        );
        sent += r.sent;
      }
      return { ok: true, sent, targets: targets.length };
    } catch (e) {
      console.error("[notifyChecklistSubmittedPush] falhou", e);
      return { ok: false, sent: 0, targets: 0 };
    }
  });

/** Aprovado → notifica quem enviou. */
export const notifyChecklistApprovedPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { run_id: string }) => ({ run_id: String(d.run_id) }))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendPushToUser } = await import("@/lib/push.server");
      const { data: run } = await supabaseAdmin
        .from("checklist_runs")
        .select("id, template_id, started_by")
        .eq("id", data.run_id)
        .maybeSingle();
      if (!run?.started_by) return { ok: true, sent: 0, targets: 0 };
      if (run.started_by === context.userId) return { ok: true, sent: 0, targets: 0 };
      const { data: template } = await supabaseAdmin
        .from("checklist_templates")
        .select("name")
        .eq("id", run.template_id)
        .maybeSingle();
      const r = await sendPushToUser(
        run.started_by,
        {
          title: "Checklist aprovado",
          body: template?.name ?? "Checklist",
          url: checklistUrl(run.id),
          tag: `chk-approved-${run.id}`,
        },
        "approvals",
      );
      return { ok: true, sent: r.sent, targets: r.targets };
    } catch (e) {
      console.error("[notifyChecklistApprovedPush] falhou", e);
      return { ok: false, sent: 0, targets: 0 };
    }
  });

/** Rejeitado → notifica quem enviou, com o motivo se houver. */
export const notifyChecklistRejectedPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { run_id: string; reason?: string }) => ({
    run_id: String(d.run_id),
    reason: d.reason ? String(d.reason) : undefined,
  }))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendPushToUser } = await import("@/lib/push.server");
      const { data: run } = await supabaseAdmin
        .from("checklist_runs")
        .select("id, template_id, started_by")
        .eq("id", data.run_id)
        .maybeSingle();
      if (!run?.started_by) return { ok: true, sent: 0, targets: 0 };
      if (run.started_by === context.userId) return { ok: true, sent: 0, targets: 0 };
      const { data: template } = await supabaseAdmin
        .from("checklist_templates")
        .select("name")
        .eq("id", run.template_id)
        .maybeSingle();
      const base = template?.name ?? "Checklist";
      const body = data.reason ? `${base} — ${data.reason.slice(0, 160)}` : base;
      const r = await sendPushToUser(
        run.started_by,
        {
          title: "Checklist rejeitado",
          body,
          url: checklistUrl(run.id),
          tag: `chk-rejected-${run.id}`,
        },
        "approvals",
      );
      return { ok: true, sent: r.sent, targets: r.targets };
    } catch (e) {
      console.error("[notifyChecklistRejectedPush] falhou", e);
      return { ok: false, sent: 0, targets: 0 };
    }
  });
