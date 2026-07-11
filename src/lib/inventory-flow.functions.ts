import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Fluxo completo de conferência: criação, envio para validação,
 * revisão pelo supervisor/admin (aprovar/recontagem/ajuste),
 * reenvio pelo colaborador, aprovação final.
 * Dispara eventos ao n8n e envia e-mails aos envolvidos.
 */

// ---------- Utilidades comuns ----------
async function loadSettings() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("settings").select("*").eq("id", 1).maybeSingle();
  return data as { tolerance_pct_default?: number | null; omie_update_mode?: string } | null;
}

async function notifyEmail(templateName: string, recipients: string[], templateData: Record<string, unknown>, idempotencyKeyPrefix?: string) {
  if (recipients.length === 0) return;
  try {
    const { sendTemplateEmail } = await import("@/lib/email/notify.server");
    await sendTemplateEmail({
      templateName,
      recipients,
      templateData,
      idempotencyKeyPrefix: idempotencyKeyPrefix ?? `${templateName}-${Date.now()}`,
    });
  } catch (e) {
    console.warn("[inventory-flow] email falhou", templateName, e);
  }
}

async function fireEvent(inventoryId: string, evento: import("@/lib/n8n.server").N8nEvent, extra: Partial<import("@/lib/n8n.server").N8nPayload> = {}) {
  try {
    const { fireN8nEvent, buildInventoryPayload } = await import("@/lib/n8n.server");
    const payload = await buildInventoryPayload(inventoryId, evento, extra);
    await fireN8nEvent(payload);
  } catch (e) {
    console.warn("[inventory-flow] n8n falhou", evento, e);
  }
}

async function ensureRole(supabase: import("@supabase/supabase-js").SupabaseClient, userId: string, roles: Array<"admin" | "supervisor">) {
  for (const r of roles) {
    const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: r });
    if (data) return true;
  }
  return false;
}

async function profileEmails(ids: Array<string | null | undefined>): Promise<string[]> {
  const clean = ids.filter(Boolean) as string[];
  if (!clean.length) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("profiles").select("email").in("id", clean);
  return (data ?? []).map((p) => p.email).filter((e): e is string => !!e);
}

// ---------- 1) Criar inventário completo ----------
const createSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["geral", "familia", "produto", "personalizado"]),
  family_id: z.string().uuid().nullable().optional(),
  family_ids: z.array(z.string().uuid()).optional(),
  product_ids: z.array(z.string().uuid()).optional(),
  assigned_counter_id: z.string().uuid().nullable().optional(),
  assigned_supervisor_id: z.string().uuid().nullable().optional(),
  assigned_admin_id: z.string().uuid().nullable().optional(),
  deadline_at: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  tolerance_pct: z.number().min(0).max(100).nullable().optional(),
});

export const createInventoryTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const settings = await loadSettings();
    const { data: inv, error } = await supabase.from("inventories").insert({
      name: data.name,
      type: data.type,
      family_id: data.type === "familia" ? (data.family_id ?? null) : null,
      status: "pendente",
      started_by: userId,
      assigned_counter_id: data.assigned_counter_id ?? null,
      assigned_supervisor_id: data.assigned_supervisor_id ?? null,
      assigned_admin_id: data.assigned_admin_id ?? null,
      deadline_at: data.deadline_at ?? null,
      notes: data.notes ?? null,
      tolerance_pct: data.tolerance_pct ?? settings?.tolerance_pct_default ?? 0,
    }).select("id, name, deadline_at").single();
    if (error || !inv) throw new Error(error?.message ?? "Falha ao criar inventário");

    if (data.type === "personalizado") {
      if (data.family_ids?.length) {
        await supabase.from("inventory_families").insert(data.family_ids.map((family_id) => ({ inventory_id: inv.id, family_id })));
      }
      if (data.product_ids?.length) {
        await supabase.from("inventory_products").insert(data.product_ids.map((product_id) => ({ inventory_id: inv.id, product_id })));
      }
    }

    await supabase.from("logs").insert({ user_id: userId, action: "inventario_criado", entity: "inventory", details: { id: inv.id, tipo: data.type } });

    // Notifica colaborador
    if (data.assigned_counter_id) {
      const emails = await profileEmails([data.assigned_counter_id]);
      await notifyEmail("task-assigned", emails, {
        inventory_name: inv.name,
        deadline: inv.deadline_at ?? null,
      }, `task-assigned-${inv.id}`);
    }
    await fireEvent(inv.id, "tarefa_criada");

    return { id: inv.id as string };
  });

// ---------- 2) Colaborador envia para validação ----------
const submitValidationSchema = z.object({ inventory_id: z.string().uuid() });
export const submitForValidation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitValidationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inv } = await supabase.from("inventories").select("id, name, tolerance_pct, assigned_supervisor_id, assigned_admin_id").eq("id", data.inventory_id).maybeSingle();
    if (!inv) throw new Error("Inventário não encontrado.");

    const { data: items } = await supabase.from("count_items")
      .select("id, product_id, quantity_before, quantity_counted, difference, financial_diff, status, product:products(name, code)")
      .eq("inventory_id", data.inventory_id);

    const tol = Number(inv.tolerance_pct ?? 0);
    const diverg = (items ?? []).filter((i) => {
      const expected = Number(i.quantity_before ?? 0);
      const diff = Number(i.difference ?? 0);
      const pct = expected === 0 ? (diff === 0 ? 0 : 100) : Math.abs((diff / expected) * 100);
      return i.status === "divergencia" && pct > tol;
    });

    const newStatus = diverg.length > 0 ? "pendente_validacao" : "concluida";
    await supabase.from("inventories").update({ status: newStatus }).eq("id", data.inventory_id);
    await supabase.from("logs").insert({ user_id: userId, action: "envio_validacao", entity: "inventory", details: { id: data.inventory_id, divergencias: diverg.length } });

    await fireEvent(data.inventory_id, "tarefa_concluida", {
      itens_divergentes: diverg.map((i) => ({
        produto: (i.product as { name: string }).name,
        sku: (i.product as { code?: string }).code ?? null,
        quantidade_esperada: Number(i.quantity_before ?? 0),
        quantidade_contada: Number(i.quantity_counted),
        diferenca: Number(i.difference ?? 0),
      })),
    });

    if (diverg.length > 0) {
      await fireEvent(data.inventory_id, "divergencia_encontrada", {
        itens_divergentes: diverg.map((i) => ({
          produto: (i.product as { name: string }).name,
          sku: (i.product as { code?: string }).code ?? null,
          quantidade_esperada: Number(i.quantity_before ?? 0),
          quantidade_contada: Number(i.quantity_counted),
          diferenca: Number(i.difference ?? 0),
        })),
      });
      // Notifica supervisor/admin
      const emails = await profileEmails([inv.assigned_supervisor_id, inv.assigned_admin_id]);
      await notifyEmail("revalidation-needed", emails, {
        inventory_name: inv.name,
        items: diverg.map((i) => ({
          product: (i.product as { name: string }).name,
          code: (i.product as { code?: string }).code,
          expected: Number(i.quantity_before ?? 0),
          counted: Number(i.quantity_counted),
          diff: Number(i.difference ?? 0),
        })),
      }, `revalidation-${data.inventory_id}`);
    }

    return { ok: true, divergencias: diverg.length };
  });

// ---------- 3) Supervisor/admin revisa decisões por item ----------
const reviewSchema = z.object({
  inventory_id: z.string().uuid(),
  decisions: z.array(z.object({
    count_item_id: z.string().uuid(),
    action: z.enum(["aprovar", "recontagem", "ajuste", "reprovar"]),
    reason: z.string().max(1000).nullable().optional(),
    deadline_at: z.string().nullable().optional(),
  })).min(1),
});

export const reviewCountItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!await ensureRole(supabase, userId, ["admin", "supervisor"])) throw new Error("Apenas admin/supervisor podem revisar.");

    const { data: inv } = await supabase.from("inventories").select("id, name, assigned_counter_id").eq("id", data.inventory_id).maybeSingle();
    if (!inv) throw new Error("Inventário não encontrado.");

    for (const dec of data.decisions) {
      await supabase.from("count_item_reviews").insert({
        count_item_id: dec.count_item_id,
        inventory_id: data.inventory_id,
        reviewer_id: userId,
        action: dec.action,
        reason: dec.reason ?? null,
        deadline_at: dec.deadline_at ?? null,
      });
      await supabase.from("count_items").update({
        needs_recount: dec.action === "recontagem",
        needs_adjust: dec.action === "ajuste",
        reviewer_note: dec.reason ?? null,
        status: dec.action === "aprovar" ? "atualizado" : "divergencia",
      }).eq("id", dec.count_item_id);
    }

    const hasRecount = data.decisions.some((d) => d.action === "recontagem");
    const hasAdjust = data.decisions.some((d) => d.action === "ajuste");
    const newStatus = hasRecount ? "recontagem_solicitada" : hasAdjust ? "ajuste_solicitado" : "pendente_validacao";
    await supabase.from("inventories").update({ status: newStatus }).eq("id", data.inventory_id);

    // Prepara itens para notificar
    const affectedIds = data.decisions.filter((d) => d.action === "recontagem" || d.action === "ajuste").map((d) => d.count_item_id);
    let itemDetails: Array<{ product: string; code?: string; expected: number; counted: number; diff: number }> = [];
    if (affectedIds.length) {
      const { data: rows } = await supabase.from("count_items")
        .select("id, quantity_before, quantity_counted, difference, product:products(name, code)")
        .in("id", affectedIds);
      itemDetails = (rows ?? []).map((r) => ({
        product: (r.product as { name: string }).name,
        code: (r.product as { code?: string }).code,
        expected: Number(r.quantity_before ?? 0),
        counted: Number(r.quantity_counted),
        diff: Number(r.difference ?? 0),
      }));
    }
    const reason = data.decisions.map((d) => d.reason).filter(Boolean).join(" | ") || null;
    const deadline = data.decisions.find((d) => d.deadline_at)?.deadline_at ?? null;

    if (hasRecount) {
      await fireEvent(data.inventory_id, "recontagem_solicitada", { motivo: reason, itens_divergentes: itemDetails.map((i) => ({
        produto: i.product, sku: i.code ?? null, quantidade_esperada: i.expected, quantidade_contada: i.counted, diferenca: i.diff,
      })) });
      const emails = await profileEmails([inv.assigned_counter_id]);
      await notifyEmail("recount-requested", emails, {
        inventory_name: inv.name, reason, deadline, items: itemDetails,
      }, `recount-${data.inventory_id}-${Date.now()}`);
    }
    if (hasAdjust) {
      await fireEvent(data.inventory_id, "ajuste_solicitado", { motivo: reason, itens_divergentes: itemDetails.map((i) => ({
        produto: i.product, sku: i.code ?? null, quantidade_esperada: i.expected, quantidade_contada: i.counted, diferenca: i.diff,
      })) });
      const emails = await profileEmails([inv.assigned_counter_id]);
      await notifyEmail("adjustment-requested", emails, {
        inventory_name: inv.name, reason, deadline, items: itemDetails,
      }, `adjust-${data.inventory_id}-${Date.now()}`);
    }

    await supabase.from("logs").insert({ user_id: userId, action: "revisao_itens", entity: "inventory", details: { id: data.inventory_id, decisoes: data.decisions.length } });
    return { ok: true, status: newStatus };
  });

// ---------- 4) Colaborador reenvia recontagem/ajuste ----------
const resubmitSchema = z.object({
  inventory_id: z.string().uuid(),
  items: z.array(z.object({
    count_item_id: z.string().uuid(),
    quantity_counted: z.number(),
    notes: z.string().max(500).nullable().optional(),
  })).min(1),
});
export const submitRecountOrAdjust = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resubmitSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inv } = await supabase.from("inventories").select("id, name, status, assigned_supervisor_id, assigned_admin_id").eq("id", data.inventory_id).maybeSingle();
    if (!inv) throw new Error("Inventário não encontrado.");

    for (const it of data.items) {
      const { data: cur } = await supabase.from("count_items").select("*").eq("id", it.count_item_id).maybeSingle();
      if (!cur) continue;
      const action = cur.needs_recount ? "recontagem" : cur.needs_adjust ? "ajuste" : "revisao";
      await supabase.from("count_item_history").insert({
        count_item_id: it.count_item_id,
        inventory_id: data.inventory_id,
        product_id: cur.product_id,
        actor_id: userId,
        action,
        quantity_before: cur.quantity_before,
        quantity_counted: cur.quantity_counted, // valor anterior
        difference: cur.difference,
        round: cur.round ?? 1,
        notes: it.notes ?? null,
      });
      await supabase.from("count_items").update({
        quantity_counted: it.quantity_counted,
        needs_recount: false,
        needs_adjust: false,
        round: (cur.round ?? 1) + 1,
        status: it.quantity_counted === Number(cur.quantity_before) ? "correto" : "divergencia",
      }).eq("id", it.count_item_id);
    }

    await supabase.from("inventories").update({ status: "aguardando_validacao" }).eq("id", data.inventory_id);
    await supabase.from("logs").insert({ user_id: userId, action: "recontagem_enviada", entity: "inventory", details: { id: data.inventory_id, itens: data.items.length } });

    await fireEvent(data.inventory_id, "recontagem_enviada");
    const emails = await profileEmails([inv.assigned_supervisor_id, inv.assigned_admin_id]);
    await notifyEmail("revalidation-needed", emails, {
      inventory_name: inv.name,
    }, `revalidation-${data.inventory_id}-${Date.now()}`);
    return { ok: true };
  });

// ---------- 5) Aprovação final ----------
const approveSchema = z.object({ inventory_id: z.string().uuid(), push_to_omie: z.boolean().optional() });
export const approveInventoryTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => approveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!await ensureRole(supabase, userId, ["admin", "supervisor"])) throw new Error("Apenas admin/supervisor podem aprovar.");

    // Verifica que não há itens divergentes sem revisão
    const { data: items } = await supabase.from("count_items")
      .select("id, status, needs_recount, needs_adjust")
      .eq("inventory_id", data.inventory_id);
    const pendentes = (items ?? []).filter((i) => i.needs_recount || i.needs_adjust);
    if (pendentes.length > 0) throw new Error(`Ainda há ${pendentes.length} item(ns) aguardando ação do colaborador.`);

    await supabase.from("inventories").update({ status: "aprovada", closed_at: new Date().toISOString() }).eq("id", data.inventory_id);
    await supabase.from("logs").insert({ user_id: userId, action: "inventario_aprovado", entity: "inventory", details: { id: data.inventory_id } });

    const { data: inv } = await supabase.from("inventories").select("assigned_counter_id, assigned_supervisor_id, assigned_admin_id, name").eq("id", data.inventory_id).maybeSingle();
    const emails = await profileEmails([inv?.assigned_counter_id, inv?.assigned_supervisor_id, inv?.assigned_admin_id]);
    await notifyEmail("task-approved", emails, { inventory_name: inv?.name ?? "" }, `approved-${data.inventory_id}`);
    await fireEvent(data.inventory_id, "tarefa_aprovada");
    return { ok: true };
  });
