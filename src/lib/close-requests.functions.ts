import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


/**
 * Contador solicita o fechamento; grava close_request e notifica supervisor/admin
 * via WhatsApp. Supervisor/admin devem chamar diretamente `closeInventory`.
 */
export const requestCloseInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inventory_id: string; push_to_omie: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
    return { ok: true, token, sent: 0, targets: 0 };
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

      if (req.push_to_omie) {
        const { data: pending } = await supabaseAdmin
          .from("count_items")
          .select("*, product:products(omie_id, name)")
          .eq("inventory_id", req.inventory_id).eq("status", "divergencia");
        for (const item of pending ?? []) {
          const diff = Number(item.difference);
          if (diff === 0) continue;
          try {
            const resp = await ajustarEstoqueOmie({
              codigo_produto: Number((item.product as { omie_id: string }).omie_id),
              quantidade: diff,
              observacao: `Fechamento inventário ${req.inventory_id}`,
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
      }
      await supabaseAdmin.from("inventories").update({
        status: "fechado", closed_at: new Date().toISOString(),
      }).eq("id", req.inventory_id);
    }

    await supabase.from("logs").insert({
      user_id: userId, action: `close_request_${newStatus}`, entity: "inventory",
      details: { inventory_id: req.inventory_id, close_request_id: req.id },
    });
    return { ok: true, status: newStatus, inventory_id: req.inventory_id };
  });
