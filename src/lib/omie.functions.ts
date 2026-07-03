import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncFamiliesAndProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const isAdmin = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (isAdmin.error || !isAdmin.data) throw new Error("Apenas admin pode sincronizar.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listarTodasFamilias, listarTodosProdutosAtivos } = await import("@/lib/omie.server");

    const { data: syncRow } = await supabaseAdmin
      .from("sync_log")
      .insert({ type: "produtos+familias", status: "em_andamento", message: "Iniciando..." })
      .select("id")
      .single();

    try {
      // Famílias
      const familias = await listarTodasFamilias();
      const famRows = familias.map((f) => ({
        omie_id: String(f.codigo),
        name: f.descricao,
      }));
      if (famRows.length) {
        await supabaseAdmin.from("families").upsert(famRows, { onConflict: "omie_id" });
      }
      const { data: famMap } = await supabaseAdmin.from("families").select("id,omie_id");
      const famByOmie = new Map((famMap ?? []).map((f) => [f.omie_id!, f.id]));

      // Produtos
      const produtos = await listarTodosProdutosAtivos();
      const prodRows = produtos.map((p) => ({
        omie_id: String(p.codigo_produto),
        code: p.codigo ?? String(p.codigo_produto),
        barcode: p.codigo_barras || null,
        name: p.descricao,
        family_id: p.codigo_familia ? famByOmie.get(String(p.codigo_familia)) ?? null : null,
        family_name: p.familia ?? null,
        unit: p.unidade ?? null,
        stock_omie: Number(p.quantidade_estoque ?? p.estoque_atual ?? 0),
        cost: Number(p.valor_unitario ?? 0),
        price: p.valor_unitario ? Number(p.valor_unitario) : null,
        location: p.local_estoque ?? null,
        active: true,
        last_synced_at: new Date().toISOString(),
      }));
      // Inativa produtos que sumiram
      if (prodRows.length) {
        for (let i = 0; i < prodRows.length; i += 500) {
          await supabaseAdmin.from("products").upsert(prodRows.slice(i, i + 500), { onConflict: "omie_id" });
        }
        const activeIds = prodRows.map((p) => p.omie_id);
        await supabaseAdmin
          .from("products")
          .update({ active: false })
          .not("omie_id", "in", `(${activeIds.map((i) => `"${i}"`).join(",")})`);
      }

      await supabaseAdmin
        .from("sync_log")
        .update({
          status: "sucesso",
          items_count: prodRows.length,
          message: `${famRows.length} famílias, ${prodRows.length} produtos.`,
          finished_at: new Date().toISOString(),
        })
        .eq("id", syncRow!.id);

      await supabaseAdmin.from("logs").insert({
        user_id: userId,
        action: "sync_omie",
        entity: "products",
        details: { familias: famRows.length, produtos: prodRows.length },
      });

      return { ok: true, familias: famRows.length, produtos: prodRows.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("sync_log")
        .update({ status: "erro", message: msg, finished_at: new Date().toISOString() })
        .eq("id", syncRow!.id);
      await supabaseAdmin.from("logs").insert({ user_id: userId, action: "sync_omie_erro", details: { erro: msg } });
      throw e;
    }
  });

export const pushCountToOmie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { count_item_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ajustarEstoqueOmie } = await import("@/lib/omie.server");

    const { data: item, error } = await supabase
      .from("count_items")
      .select("*, product:products(omie_id, name)")
      .eq("id", data.count_item_id)
      .single();
    if (error || !item) throw new Error("Contagem não encontrada.");

    const diff = Number(item.difference);
    if (diff === 0) {
      await supabaseAdmin.from("count_items").update({ status: "correto" }).eq("id", item.id);
      return { ok: true, skipped: true };
    }

    const resp = await ajustarEstoqueOmie({
      codigo_produto: Number(item.product.omie_id),
      quantidade: diff,
      observacao: `Contagem Estoque App - inventário ${item.inventory_id}`,
    });

    await supabaseAdmin
      .from("count_items")
      .update({ status: "atualizado", omie_updated_at: new Date().toISOString(), omie_response: resp as object })
      .eq("id", item.id);

    await supabaseAdmin.from("logs").insert({
      user_id: userId,
      action: "omie_ajuste_estoque",
      entity: "count_item",
      details: { count_item_id: item.id, produto: item.product.name, diferenca: diff },
    });
    return { ok: true };
  });

export const closeInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inventory_id: string; push_to_omie: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ajustarEstoqueOmie } = await import("@/lib/omie.server");

    if (data.push_to_omie) {
      const { data: pending } = await supabase
        .from("count_items")
        .select("*, product:products(omie_id, name)")
        .eq("inventory_id", data.inventory_id)
        .eq("status", "divergencia");

      for (const item of pending ?? []) {
        const diff = Number(item.difference);
        if (diff === 0) continue;
        try {
          const resp = await ajustarEstoqueOmie({
            codigo_produto: Number(item.product.omie_id),
            quantidade: diff,
            observacao: `Fechamento inventário ${data.inventory_id}`,
          });
          await supabaseAdmin
            .from("count_items")
            .update({ status: "atualizado", omie_updated_at: new Date().toISOString(), omie_response: resp as object })
            .eq("id", item.id);
        } catch (e) {
          await supabaseAdmin.from("logs").insert({
            user_id: userId, action: "omie_ajuste_erro", entity: "count_item",
            details: { id: item.id, erro: e instanceof Error ? e.message : String(e) },
          });
        }
      }
    }

    await supabaseAdmin
      .from("inventories")
      .update({ status: "fechado", closed_at: new Date().toISOString() })
      .eq("id", data.inventory_id);

    await supabaseAdmin.from("logs").insert({
      user_id: userId, action: "inventario_fechado", entity: "inventory",
      details: { inventory_id: data.inventory_id, push_to_omie: data.push_to_omie },
    });
    return { ok: true };
  });
