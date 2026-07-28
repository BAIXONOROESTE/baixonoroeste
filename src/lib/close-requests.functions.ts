import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


/**
 * Contador solicita o fechamento; grava close_request e notifica supervisor/admin
 * por e-mail. Supervisor/admin devem chamar diretamente `closeInventory`.
 */
export const requestCloseInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inventory_id: string; push_to_omie: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Já existe pedido pendente para este inventário? Reaproveita.
    const { data: existing } = await supabase
      .from("close_requests")
      .select("id, approval_token")
      .eq("inventory_id", data.inventory_id)
      .eq("status", "pendente")
      .maybeSingle();

    let token: string;
    if (existing) {
      token = existing.approval_token;
    } else {
      const { data: created, error } = await supabase
        .from("close_requests")
        .insert({
          inventory_id: data.inventory_id,
          requested_by: userId,
          push_to_omie: data.push_to_omie,
          status: "pendente",
        })
        .select("id, approval_token")
        .single();
      if (error || !created) throw new Error(`Falha ao criar pedido: ${error?.message ?? ""}`);
      token = created.approval_token;
    }

    // Notifica supervisor/admin por e-mail, respeitando janela de 30 min por destinatário.
    let sent = 0;
    let targets = 0;
    let throttled = 0;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendTemplateEmail, loadNotificationRecipients } = await import(
        "@/lib/email/notify.server"
      );
      const [{ data: inv }, { data: requester }] = await Promise.all([
        supabaseAdmin.from("inventories").select("name").eq("id", data.inventory_id).maybeSingle(),
        supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      ]);
      const allRecipients = await loadNotificationRecipients();
      targets = allRecipients.length;

      // Consulta email_send_log: qualquer envio recente de "count-completed" (template
      // usado para pedido de fechamento) para estes destinatários nos últimos 30 min.
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      let recipients = allRecipients;
      if (allRecipients.length > 0) {
        const { data: recent } = await supabaseAdmin
          .from("email_send_log")
          .select("recipient_email")
          .eq("template_name", "count-completed")
          .in("status", ["pending", "enqueued", "sent"])
          .gte("created_at", since)
          .in("recipient_email", allRecipients);
        const throttledSet = new Set((recent ?? []).map((r) => (r.recipient_email as string).toLowerCase()));
        recipients = allRecipients.filter((r) => !throttledSet.has(r.toLowerCase()));
        throttled = allRecipients.length - recipients.length;
      }

      if (recipients.length > 0) {
        const origin =
          process.env.PUBLIC_SITE_URL ||
          "https://baixonoroeste.lovable.app";
        const approvalUrl = `${origin.replace(/\/$/, "")}/aprovar/${token}`;
        const res = await sendTemplateEmail({
          templateName: "count-completed",
          recipients,
          idempotencyKeyPrefix: `close-request-${token}`,
          templateData: {
            counter_name: requester?.full_name ?? "—",
            inventory_name: inv?.name ?? "",
            finished_at: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
            mode: "close_request",
            approval_url: approvalUrl,
            push_to_omie: data.push_to_omie,
            total_diff_value: 0,
            items: [],
          },
        });
        sent = res.enqueued;
      }
    } catch (e) {
      console.error("[requestCloseInventory] notify falhou", e);
    }

    return { ok: true, token, sent, targets, throttled };
  });


/**
 * Supervisor/admin aprova ou recusa um pedido de fechamento. Se aprovar,
 * dispara o closeInventory (equivalente ao fluxo já existente).
 */
export const respondCloseRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string; approve: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("current_user_is_supervisor_or_admin");
    if (!allowed) throw new Error("Somente supervisor ou administrador pode responder.");

    const { data: req, error } = await supabase
      .from("close_requests").select("*").eq("approval_token", data.token).single();
    if (error || !req) throw new Error("Pedido não encontrado.");
    if (req.status !== "pendente") throw new Error(`Pedido já ${req.status}.`);

    const newStatus = data.approve ? "aprovado" : "recusado";
    await supabase.from("close_requests").update({
      status: newStatus, approved_by: userId, responded_at: new Date().toISOString(),
    }).eq("id", req.id);

    if (data.approve) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { ajustarEstoqueOmie } = await import("@/lib/omie.server");

      // Ao aprovar o fechamento, SEMPRE empurramos as divergências pendentes
      // para o Omie — o flag `push_to_omie` do pedido é irrelevante nesse ponto:
      // se está fechando é porque o revisor aprovou os ajustes. Sem isso,
      // inventários no modo "imediato" perdem os ajustes dos itens divergentes.
      const { data: pending, error: pendingErr } = await supabaseAdmin
        .from("count_items")
        .select("*, product:products(omie_id, name)")
        .eq("inventory_id", req.inventory_id).eq("status", "divergencia");
      if (pendingErr) {
        await supabaseAdmin.from("logs").insert({
          user_id: userId, action: "omie_ajuste_erro", entity: "inventory",
          details: { inventory_id: req.inventory_id, erro: `Falha ao buscar itens divergentes: ${pendingErr.message}` },
        });
        throw new Error(`Falha ao buscar itens divergentes: ${pendingErr.message}`);
      }
      const { data: invRow, error: invRowErr } = await supabaseAdmin
        .from("inventories").select("name").eq("id", req.inventory_id).maybeSingle();
      if (invRowErr) throw new Error(`Falha ao buscar inventário: ${invRowErr.message}`);
      const invName = invRow?.name ?? `inventario ${req.inventory_id}`;
      for (const item of pending ?? []) {
        const diff = Number(item.difference);
        if (diff === 0) continue;
        try {
          const resp = await ajustarEstoqueOmie({
            codigo_produto: Number((item.product as { omie_id: string }).omie_id),
            quantidade: diff,
            observacao: `Fechamento: ${invName}`,
            valor_unitario: Number(item.unit_cost) || 0,
          });
          await supabaseAdmin.from("count_items").update({
            status: "atualizado", omie_updated_at: new Date().toISOString(), omie_response: resp as never,
          }).eq("id", item.id);
        } catch (e) {
          await supabaseAdmin.from("logs").insert({
            user_id: userId, action: "omie_ajuste_erro", entity: "count_item",
            details: { id: item.id, erro: e instanceof Error ? e.message : String(e) },
          });
        }
      }
      const { error: updErr } = await supabase.from("inventories").update({
        status: "fechado", closed_at: new Date().toISOString(),
      }).eq("id", req.inventory_id);
      if (updErr) throw new Error(`Falha ao fechar inventário: ${updErr.message}`);
    }

    await supabase.from("logs").insert({
      user_id: userId, action: `close_request_${newStatus}`, entity: "inventory",
      details: { inventory_id: req.inventory_id, close_request_id: req.id },
    });
    return { ok: true, status: newStatus, inventory_id: req.inventory_id };
  });
